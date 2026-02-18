"use server";

import { prisma } from "@/lib/prisma";
import { zkTecoService } from "@/lib/services/zkteco.service";
import { subDays, format } from "date-fns";
import { revalidatePath } from "next/cache";

export interface SyncResult {
  success: boolean;
  message: string;
  syncedRecords: number;
  skippedRecords: number;
  errors: string[];
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
    // Check if ZKTeco service is configured
    if (!zkTecoService.isConfigured()) {
      result.message = "ZKTeco service is not properly configured";
      result.errors.push("Missing environment variables: ZKTECO_BASE_URL, ZKTECO_USERNAME, or ZKTECO_PASSWORD");
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
      return result;
    }

    if (!user.attendanceId) {
      result.message = `Employee ${user.firstName} ${user.lastName} has no attendance ID`;
      result.errors.push("AttendanceId is required for ZKTeco sync");
      return result;
    }

    // Get or create daily time record for the date
    let timeRecord = await prisma.dailyTimeRecord.findUnique({
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
      return result;
    }

    // Check if the record already has all the data (skip if all fields are filled)
    const hasAllData = timeRecord.actualCheckIn && timeRecord.actualCheckOut && timeRecord.actualBreakTime;
    if (hasAllData) {
      result.message = `Time record for ${user.firstName} ${user.lastName} on ${format(date, "yyyy-MM-dd")} already has complete data`;
      result.skippedRecords = 1;
      return result;
    }

    // Fetch data from ZKTeco API
    const timeData = await zkTecoService.getEmployeeTimeData(user.attendanceId, date);

    // Prepare update data (only update empty fields)
    const updateData: any = {};
    let hasUpdates = false;

    if (!timeRecord.actualCheckIn && timeData.actualCheckIn) {
      updateData.actualCheckIn = timeData.actualCheckIn;
      hasUpdates = true;
    }

    if (!timeRecord.actualCheckOut && timeData.actualCheckOut) {
      updateData.actualCheckOut = timeData.actualCheckOut;
      hasUpdates = true;
    }

    if (!timeRecord.actualBreakTime && timeData.actualBreakTime) {
      updateData.actualBreakTime = timeData.actualBreakTime;
      hasUpdates = true;
    }

    if (!hasUpdates) {
      result.message = `No new data available for ${user.firstName} ${user.lastName} on ${format(date, "yyyy-MM-dd")}`;
      result.skippedRecords = 1;
      return result;
    }

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
  } catch (error) {
    console.error("Error syncing employee time data:", error);
    result.message = "An error occurred while syncing time data";
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
  }

  return result;
}

/**
 * Sync ZKTeco data for a specific employee for the last N days
 */
export async function syncEmployeeTimeDataRange(userId: string, days: number = 4): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    message: "",
    syncedRecords: 0,
    skippedRecords: 0,
    errors: [],
  };

  try {
    const today = new Date();
    const dates = Array.from({ length: days }, (_, i) => subDays(today, i));

    for (const date of dates) {
      const dayResult = await syncEmployeeTimeData(userId, date);
      
      result.syncedRecords += dayResult.syncedRecords;
      result.skippedRecords += dayResult.skippedRecords;
      result.errors.push(...dayResult.errors);

      if (!dayResult.success && dayResult.errors.length > 0) {
        result.success = false;
      }
    }

    if (result.syncedRecords === 0 && result.skippedRecords === 0) {
      result.message = "No records processed";
    } else if (result.syncedRecords > 0) {
      result.message = `Successfully synced ${result.syncedRecords} record(s), skipped ${result.skippedRecords} record(s)`;
    } else {
      result.message = `Skipped ${result.skippedRecords} record(s) (already complete or no data available)`;
    }
  } catch (error) {
    console.error("Error syncing employee time data range:", error);
    result.success = false;
    result.message = "An error occurred while syncing time data range";
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
  }

  return result;
}

/**
 * Sync ZKTeco data for all employees with attendance IDs for the last N days
 */
export async function syncAllEmployeesTimeData(days: number = 4): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    message: "",
    syncedRecords: 0,
    skippedRecords: 0,
    errors: [],
  };

  try {
    // Check if ZKTeco service is configured
    if (!zkTecoService.isConfigured()) {
      result.success = false;
      result.message = "ZKTeco service is not properly configured";
      result.errors.push("Missing environment variables: ZKTECO_BASE_URL, ZKTECO_USERNAME, or ZKTECO_PASSWORD");
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

    console.log(`Starting ZKTeco sync for ${users.length} employees for last ${days} days`);

    // Process each employee
    for (const user of users) {
      try {
        const userResult = await syncEmployeeTimeDataRange(user.id!, days);
        
        result.syncedRecords += userResult.syncedRecords;
        result.skippedRecords += userResult.skippedRecords;
        result.errors.push(...userResult.errors);

        if (!userResult.success && userResult.errors.length > 0) {
          console.log(`Error syncing data for ${user.firstName} ${user.lastName}:`, userResult.errors);
        }
      } catch (error) {
        console.error(`Error processing user ${user.firstName} ${user.lastName}:`, error);
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

/**
 * Manual sync function for UI - syncs specific user for today and past 3 days
 */
export async function manualSyncEmployee(userId: string): Promise<SyncResult> {
  const result = await syncEmployeeTimeDataRange(userId, 4); // Today + 3 days back
  
  // Revalidate the timeline page to show updated data
  revalidatePath("/admin/timeline");
  
  return result;
}