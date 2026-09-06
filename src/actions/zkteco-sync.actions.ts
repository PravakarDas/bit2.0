"use server";

import { prisma } from "@/lib/prisma";
import { zkTecoService } from "@/lib/services/zkteco.service";
import { format } from "date-fns";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { getDbUser } from "./user.actions";
import { createAdminNotification } from "./notification.actions";
import { getRuntimeSystemControlConfig } from "@/lib/system-control";
import { recomputeAttendanceForUserOnDemand } from "@/lib/services/zkt-attendance-poller.service";

export interface SyncResult {
  success: boolean;
  message: string;
  syncedRecords: number;
  skippedRecords: number;
  errors: string[];
}

async function isZKTecoServerReachable(baseUrl: string): Promise<boolean> {
  const trimmedBaseUrl = baseUrl.trim();
  if (!trimmedBaseUrl) {
    return false;
  }

  const normalizedBaseUrl = trimmedBaseUrl.endsWith("/")
    ? trimmedBaseUrl.slice(0, -1)
    : trimmedBaseUrl;
  const healthCheckUrl = `${normalizedBaseUrl}/api-token-auth/`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(healthCheckUrl, {
      method: "OPTIONS",
      signal: controller.signal,
      cache: "no-store",
    });

    return response.status < 500;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`ZKTeco availability check timed out after 8s: ${healthCheckUrl}`);
      return false;
    }

    console.warn(`ZKTeco availability check failed for ${healthCheckUrl}:`, error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function applyRuntimeZktecoConfig() {
  try {
    const runtime = await getRuntimeSystemControlConfig();
    zkTecoService.setRuntimeConfig({
      baseUrl: runtime.zktecoBaseUrl || "",
      username: runtime.zktecoUsername || "",
      password: runtime.zktecoPassword || "",
    });
  } catch (error) {
    console.warn("Failed loading runtime ZKTeco config from DB. Using empty fallback.", error);
    zkTecoService.setRuntimeConfig({
      baseUrl: "",
      username: "",
      password: "",
    });
  }
}

function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const isNegative = timeStr.startsWith('-');
  const cleanStr = timeStr.replace('-', '');
  const [hours, minutes] = cleanStr.split(':').map(Number);
  const totalMinutes = (hours * 60) + minutes;
  return isNegative ? -totalMinutes : totalMinutes;
}

function minutesToTimeString(minutes: number): string {
  if (minutes === 0) return '00:00';

  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;

  const sign = minutes < 0 ? '-' : '';
  return `${sign}${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function calculateActiveTime(checkIn: Date, checkOut: Date, breakTime: string): string {
  const diffMs = checkOut.getTime() - checkIn.getTime();
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const breakMinutes = timeStringToMinutes(breakTime || '00:00');
  const activeMinutes = totalMinutes - breakMinutes;

  return minutesToTimeString(Math.max(0, activeMinutes));
}

function calculateOvertimeUndertime(actualActiveTime: string, requiredActiveTime: string): string {
  const actualMinutes = timeStringToMinutes(actualActiveTime);
  const requiredMinutes = timeStringToMinutes(requiredActiveTime);
  const diffMinutes = actualMinutes - requiredMinutes;

  return minutesToTimeString(diffMinutes);
}

function addTimeStrings(time1?: string | null, time2?: string | null): string {
  if (!time1 && !time2) return '00:00';
  if (!time1) return time2 || '00:00';
  if (!time2) return time1 || '00:00';

  const minutes1 = timeStringToMinutes(time1);
  const minutes2 = timeStringToMinutes(time2);
  return minutesToTimeString(minutes1 + minutes2);
}

/**
 * Sync ZKTeco data for a specific employee on a specific date
 */
export async function syncEmployeeTimeData(userId: string, date: Date): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    message: "",
    syncedRecords: 0,
    skippedRecords: 0,
    errors: [],
  };

  try {
    await applyRuntimeZktecoConfig();
    console.log(`Syncing employee ${userId} for date ${date.toISOString().split('T')[0]}`);
    
    // Check if ZKTeco service is configured
    if (!zkTecoService.isConfigured()) {
      result.message = "ZKTeco service is not properly configured";
      result.errors.push("Missing environment variables: ZKTECO_BASE_URL, ZKTECO_USERNAME, or ZKTECO_PASSWORD");
      console.log(`Sync failed for ${userId}: ZKTeco not configured`);
      return result;
    }

    // Get user with attendanceId
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        attendanceId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      result.message = "User not found";
      result.errors.push(`User with ID ${userId} not found`);
      console.log(`Sync failed: User ${userId} not found`);
      return result;
    }

    if (!user.attendanceId) {
      result.message = `Employee ${user.firstName} ${user.lastName} has no attendance ID`;
      result.errors.push("AttendanceId is required for ZKTeco sync");
      console.log(`Sync failed: ${user.firstName} ${user.lastName} has no attendanceId`);
      return result;
    }

    console.log(`Found employee: ${user.firstName} ${user.lastName} with attendanceId: ${user.attendanceId}`);

    // Get or create daily time record for the date
    const timeRecord = await prisma.dailyTimeRecord.findUnique({
      where: {
        userId_date: {
          userId: userId,
          date: date,
        },
      },
    });

    // If no time record exists for this date, skip (since we only want to fill existing records)
    if (!timeRecord) {
      result.message = `No time record found for ${user.firstName} ${user.lastName} on ${format(date, "yyyy-MM-dd")}`;
      result.skippedRecords = 1;
      console.log(`Sync skipped: No time record for ${user.firstName} ${user.lastName} on ${format(date, "yyyy-MM-dd")}`);
      return result;
    }

    console.log(`Found time record for ${format(date, "yyyy-MM-dd")}:`, {
      status: timeRecord.status,
      hasCheckIn: !!timeRecord.actualCheckIn,
      hasCheckOut: !!timeRecord.actualCheckOut,
      hasBreakTime: !!timeRecord.actualBreakTime
    });

    // Check if the record already has all the data (skip if all fields are filled)
    const hasAllData = timeRecord.actualCheckIn && timeRecord.actualCheckOut && timeRecord.actualBreakTime;
    if (hasAllData) {
      result.message = `Time record for ${user.firstName} ${user.lastName} on ${format(date, "yyyy-MM-dd")} already has complete data`;
      result.skippedRecords = 1;
      console.log(`Sync skipped: Record already complete for ${user.firstName} ${user.lastName} on ${format(date, "yyyy-MM-dd")}`);
      return result;
    }

    console.log(`Fetching ZKTeco data for employee code: ${user.attendanceId} on ${format(date, "yyyy-MM-dd")}`);
    console.log(`Database date being passed to ZKTeco service: ${date.toISOString()}`);

    // Fetch data from ZKTeco API
    const timeData = await zkTecoService.getEmployeeTimeData(user.attendanceId, date);
    
    console.log(`ZKTeco response for ${user.attendanceId}:`, {
      hasCheckIn: !!timeData.actualCheckIn,
      hasCheckOut: !!timeData.actualCheckOut,  
      hasBreakTime: !!timeData.actualBreakTime,
      checkIn: timeData.actualCheckIn?.toISOString(),
      checkOut: timeData.actualCheckOut?.toISOString(),
      breakTime: timeData.actualBreakTime
    });

    // Prepare update data (only update empty fields)
    const updateData: Prisma.DailyTimeRecordUpdateInput = {};
    let hasUpdates = false;

    if (!timeRecord.actualCheckIn && timeData.actualCheckIn) {
      updateData.actualCheckIn = timeData.actualCheckIn;
      hasUpdates = true;
      console.log(`Will update checkIn: ${timeData.actualCheckIn.toISOString()}`);
    }

    if (!timeRecord.actualCheckOut && timeData.actualCheckOut) {
      updateData.actualCheckOut = timeData.actualCheckOut;
      hasUpdates = true;
      console.log(`Will update checkOut: ${timeData.actualCheckOut.toISOString()}`);
    }

    if (!timeRecord.actualBreakTime) {
      updateData.actualBreakTime = timeData.actualBreakTime || "00:00";
      hasUpdates = true;
      console.log(`Will update breakTime: ${updateData.actualBreakTime}`);
    }

    const finalActualCheckIn =
      (updateData.actualCheckIn as Date | undefined) ??
      timeRecord.actualCheckIn;
    const finalActualCheckOut =
      (updateData.actualCheckOut as Date | undefined) ??
      timeRecord.actualCheckOut;
    const finalActualBreakTime =
      (updateData.actualBreakTime as string | undefined) ??
      timeRecord.actualBreakTime ??
      "00:00";

    if (
      finalActualCheckIn &&
      finalActualCheckOut &&
      (
        !timeRecord.actualActiveTime ||
        !timeRecord.officialOvertimeundertime ||
        !timeRecord.overtimeUndertime ||
        !timeRecord.actualBreakTime ||
        updateData.actualCheckIn !== undefined ||
        updateData.actualCheckOut !== undefined ||
        updateData.actualBreakTime !== undefined
      )
    ) {
      const actualActiveTime = calculateActiveTime(
        finalActualCheckIn,
        finalActualCheckOut,
        finalActualBreakTime,
      );

      updateData.actualActiveTime = actualActiveTime;
      hasUpdates = true;

      if (timeRecord.requiredActiveTime) {
        // overtimeUndertime = actualActiveTime - requiredActiveTime (office/clock-based)
        const officeOvertimeUndertime = calculateOvertimeUndertime(
          actualActiveTime,
          timeRecord.requiredActiveTime,
        );

        updateData.overtimeUndertime = officeOvertimeUndertime;
        // officialOvertimeundertime = overtimeUndertime + requestedOvertime (grand total)
        updateData.officialOvertimeundertime = addTimeStrings(
          officeOvertimeUndertime,
          timeRecord.requestedOvertime || '00:00',
        );
      }
    }

    if (!hasUpdates) {
      result.message = `No new data available for ${user.firstName} ${user.lastName} on ${format(date, "yyyy-MM-dd")}`;
      result.skippedRecords = 1;
      console.log(`Sync skipped: No new data available for ${user.firstName} ${user.lastName} on ${format(date, "yyyy-MM-dd")}`);
      return result;
    }

    console.log(`Updating database for ${user.firstName} ${user.lastName} with:`, updateData);

    // Update the time record
    await prisma.dailyTimeRecord.update({
      where: {
        userId_date: {
          userId: userId,
          date: date,
        },
      },
      data: updateData,
    });

    result.success = true;
    result.syncedRecords = 1;
    result.message = `Successfully synced time data for ${user.firstName} ${user.lastName} on ${format(date, "yyyy-MM-dd")}`;
    console.log(`Sync successful: Updated ${user.firstName} ${user.lastName} for ${format(date, "yyyy-MM-dd")}`);
  } catch (error) {
    console.error("Error syncing employee time data:", error);
    result.message = "An error occurred while syncing time data";
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
  }

  return result;
}

/**
 * Sync ZKTeco data for a specific employee for all timeline dates that still have missing actual fields
 * Dates are processed in descending order (newest -> oldest).
 */
export async function syncEmployeeTimeDataRange(userId: string): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    message: "",
    syncedRecords: 0,
    skippedRecords: 0,
    errors: [],
  };

  try {
    console.log(`Starting full missing-data sync for user ${userId}`);

    const pendingRecords = await prisma.dailyTimeRecord.findMany({
      where: {
        userId,
        OR: [
          { actualCheckIn: null },
          { actualCheckOut: null },
          { actualBreakTime: null },
        ],
      },
      select: { date: true },
      orderBy: { date: "desc" },
    });

    const dates = pendingRecords.map((record) => record.date);
    console.log(`Found ${dates.length} pending date(s) for user ${userId}`);

    for (const date of dates) {
      console.log(`\n=== Processing date: ${date.toISOString()} ===`);
      const dayResult = await syncEmployeeTimeData(userId, date);

      result.syncedRecords += dayResult.syncedRecords;
      result.skippedRecords += dayResult.skippedRecords;
      result.errors.push(...dayResult.errors);

      if (!dayResult.success && dayResult.errors.length > 0) {
        result.success = false;
      }

      console.log(`Date ${date.toISOString().split('T')[0]} result:`, {
        success: dayResult.success,
        synced: dayResult.syncedRecords,
        skipped: dayResult.skippedRecords,
        message: dayResult.message,
      });
    }

    if (result.syncedRecords === 0 && result.skippedRecords === 0) {
      result.message = "No timeline records with missing actual data found";
    } else if (result.syncedRecords > 0) {
      result.message = `Successfully synced ${result.syncedRecords} record(s), skipped ${result.skippedRecords} record(s)`;
    } else {
      result.message = `Skipped ${result.skippedRecords} record(s) (already complete or no data available)`;
    }
    
    console.log(`\nSync Range Summary:`, {
      totalSynced: result.syncedRecords,
      totalSkipped: result.skippedRecords,
      success: result.success,
      message: result.message
    });
    
  } catch (error) {
    console.error("Error syncing employee time data range:", error);
    result.success = false;
    result.message = "An error occurred while syncing time data range";
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
  }

  return result;
}

/**
 * Sync ZKTeco data for all employees with attendance IDs.
 * For each employee, process all dates that still have null actual fields, newest first.
 */
export async function syncAllEmployeesTimeData(): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    message: "",
    syncedRecords: 0,
    skippedRecords: 0,
    errors: [],
  };

  try {
    await applyRuntimeZktecoConfig();
    // Check if ZKTeco service is configured
    if (!zkTecoService.isConfigured()) {
      result.success = false;
      result.message = "ZKTeco service is not properly configured";
      result.errors.push("Missing environment variables: ZKTECO_BASE_URL, ZKTECO_USERNAME, or ZKTECO_PASSWORD");
      return result;
    }

    const zkTecoBaseUrl = zkTecoService.getBaseUrl();
    const isServerReachable = await isZKTecoServerReachable(zkTecoBaseUrl);
    if (!isServerReachable) {
      result.success = false;
      result.message = "ZKTeco server is down or unreachable. Sync aborted.";
      result.errors.push("ZKTeco server is down or unreachable");
      return result;
    }

    // Get all users with attendance IDs
    const users = await prisma.user.findMany({
      where: {
        attendanceId: {
          not: null,
        },
        isArchived: false,
        employeeStatus: "ACTIVE",
      },
      select: {
        id: true,
        attendanceId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (users.length === 0) {
      result.message = "No active employees with attendance IDs found";
      result.skippedRecords = 0;
      return result;
    }

    console.log(`Starting full ZKTeco missing-data sync for ${users.length} employees`);

    // Process each employee
    for (const user of users) {
      try {
        const userResult = await syncEmployeeTimeDataRange(user.id!);
        
        result.syncedRecords += userResult.syncedRecords;
        result.skippedRecords += userResult.skippedRecords;
        result.errors.push(...userResult.errors);

        if (!userResult.success && userResult.errors.length > 0) {
          result.success = false;
          console.log(`Error syncing data for ${user.firstName} ${user.lastName}:`, userResult.errors);
        }
      } catch (error) {
        console.error(`Error processing user ${user.firstName} ${user.lastName}:`, error);
        result.success = false;
        result.errors.push(`${user.firstName} ${user.lastName}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    result.message = `Processed ${users.length} employee(s): synced ${result.syncedRecords} record(s), skipped ${result.skippedRecords} record(s)`;
    
    if (result.errors.length > 0) {
      console.log(`ZKTeco sync completed with ${result.errors.length} error(s)`);
    } else {
      console.log("ZKTeco sync completed successfully");
    }
  } catch (error) {
    console.error("Error in bulk sync:", error);
    result.success = false;
    result.message = "An error occurred during bulk sync";
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
  }

  return result;
}

export async function syncAllEmployeesTimeDataForDate(date: Date, employeeIds?: string[]): Promise<SyncResult> {
  const targetDate = new Date(date);
  const result: SyncResult = {
    success: true,
    message: "",
    syncedRecords: 0,
    skippedRecords: 0,
    errors: [],
  };

  try {
    await applyRuntimeZktecoConfig();
    if (!zkTecoService.isConfigured()) {
      result.success = false;
      result.message = "ZKTeco service is not properly configured";
      result.errors.push("Missing environment variables: ZKTECO_BASE_URL, ZKTECO_USERNAME, or ZKTECO_PASSWORD");
      return result;
    }

    const zkTecoBaseUrl = zkTecoService.getBaseUrl();
    const isServerReachable = await isZKTecoServerReachable(zkTecoBaseUrl);
    if (!isServerReachable) {
      result.success = false;
      result.message = "ZKTeco server is down or unreachable. Sync aborted.";
      result.errors.push("ZKTeco server is down or unreachable");
      return result;
    }

    const users = await prisma.user.findMany({
      where: {
        attendanceId: {
          not: null,
        },
        isArchived: false,
        employeeStatus: "ACTIVE",
        ...(employeeIds && employeeIds.length > 0 ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        attendanceId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (users.length === 0) {
      result.message = "No active employees with attendance IDs found";
      return result;
    }

    console.log(`Starting ZKTeco date sync for ${users.length} employee(s) on ${format(targetDate, 'yyyy-MM-dd')}`);

    for (const user of users) {
      try {
        const userResult = await syncEmployeeTimeData(user.id!, targetDate);
        result.syncedRecords += userResult.syncedRecords;
        result.skippedRecords += userResult.skippedRecords;
        result.errors.push(...userResult.errors);

        if (!userResult.success && userResult.errors.length > 0) {
          result.success = false;
        }
      } catch (error) {
        result.success = false;
        result.errors.push(`${user.firstName} ${user.lastName}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    result.message = `Date ${format(targetDate, 'yyyy-MM-dd')}: synced ${result.syncedRecords} record(s), skipped ${result.skippedRecords} record(s)`;
    return result;
  } catch (error) {
    console.error("Error syncing all employees for date:", error);
    result.success = false;
    result.message = "An error occurred during date-wise sync";
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
    return result;
  }
}

/**
 * Manual sync function for UI.
 * If a date is provided, sync only that day for the employee.
 * Otherwise fall back to the historical missing-data range sync.
 */
export async function manualSyncEmployee(userId: string, date?: Date): Promise<SyncResult> {
  console.log(`Starting manual sync for user: ${userId}${date ? ` on ${format(date, "yyyy-MM-dd")}` : ""}`);
  
  try {
    const actor = await getDbUser();
    if (!actor) {
      return {
        success: false,
        message: "Unauthorized",
        syncedRecords: 0,
        skippedRecords: 0,
        errors: ["Unauthorized"]
      };
    }

    const canSync = actor.role === "SUPERADMIN" || actor.role === "HR" || (actor.role === "EMPLOYEE" && actor.isManager);
    if (!canSync) {
      return {
        success: false,
        message: "Unauthorized",
        syncedRecords: 0,
        skippedRecords: 0,
        errors: ["Unauthorized"]
      };
    }

    const runtimeConfig = await getRuntimeSystemControlConfig();

    const result =
      runtimeConfig.attendanceCalculationMethod === "ZKT_ATTENDANCE_TABLE" && date
        ? await (async (): Promise<SyncResult> => {
            const outcome = await recomputeAttendanceForUserOnDemand(userId, date);
            if (outcome.updated) {
              return { success: true, message: "Attendance data found and applied.", syncedRecords: 1, skippedRecords: 0, errors: [] };
            }
            return {
              success: outcome.found,
              message: outcome.reason || "No new attendance data available.",
              syncedRecords: 0,
              skippedRecords: outcome.found ? 1 : 0,
              errors: outcome.found ? [] : [outcome.reason || "No attendance data found."],
            };
          })()
        : date
          ? await syncEmployeeTimeData(userId, date)
          : await syncEmployeeTimeDataRange(userId);

    console.log(`Manual sync completed for user: ${userId}`, {
      success: result.success,
      syncedRecords: result.syncedRecords,
      skippedRecords: result.skippedRecords,
      message: result.message,
      errors: result.errors
    });
    
    // Revalidate the timeline page to show updated data
    revalidatePath("/admin/timeline");
    revalidatePath("/manager/timeline");

    if (actor.role === "EMPLOYEE" && actor.isManager) {
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      });

      await createAdminNotification({
        type: "SYSTEM_ALERT",
        title: "Manager Triggered Manual Timeline Sync",
        message: `Manager ${actor.firstName || ""} ${actor.lastName || ""} triggered manual timeline sync for ${targetUser?.firstName || "Employee"} ${targetUser?.lastName || ""}.`,
        metadata: {
          actorId: actor.id,
          targetUserId: userId,
          syncedRecords: result.syncedRecords,
          skippedRecords: result.skippedRecords,
        },
      });

      await prisma.timelineModificationActionLog.create({
        data: {
          actionType: "MANAGER_TIMELINE_SYNC",
          actionDetails: `Manager triggered manual timeline sync for employee ${userId}`,
          actorId: actor.id,
          targetUserId: userId,
          metadata: {
            syncedRecords: result.syncedRecords,
            skippedRecords: result.skippedRecords,
            errors: result.errors,
          },
        },
      });
    }
    
    return result;
  } catch (error) {
    console.error(`Manual sync failed for user: ${userId}`, error);
    return {
      success: false,
      message: `Manual sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      syncedRecords: 0,
      skippedRecords: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}