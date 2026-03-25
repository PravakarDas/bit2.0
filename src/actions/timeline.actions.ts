"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createAdminNotification } from "./notification.actions";
import { Prisma } from "@prisma/client";
import { getDbUser } from "./user.actions";

/**
 * Convert time string (HH:MM) to minutes
 */
function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const isNegative = timeStr.startsWith('-');
  const cleanStr = timeStr.replace('-', '');
  const [hours, minutes] = cleanStr.split(':').map(Number);
  const totalMinutes = (hours * 60) + minutes;
  return isNegative ? -totalMinutes : totalMinutes;
}

/**
 * Convert minutes to time string (HH:MM)
 */
function minutesToTimeString(minutes: number): string {
  if (minutes === 0) return '00:00';
  
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Calculate active time between two dates, subtracting break time
 */
function calculateActiveTime(checkIn: Date, checkOut: Date, breakTime: string): string {
  if (!checkIn || !checkOut) return '00:00';
  
  const diffMs = checkOut.getTime() - checkIn.getTime();
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const breakMinutes = timeStringToMinutes(breakTime || '00:00');
  const activeMinutes = totalMinutes - breakMinutes;
  
  return minutesToTimeString(Math.max(0, activeMinutes));
}

/**
 * Calculate overtime/undertime difference
 */
function calculateOvertimeUndertime(actualActiveTime: string, requiredActiveTime: string): string {
  if (!actualActiveTime || !requiredActiveTime) return '00:00';
  
  const actualMinutes = timeStringToMinutes(actualActiveTime);
  const requiredMinutes = timeStringToMinutes(requiredActiveTime);
  const diffMinutes = actualMinutes - requiredMinutes;
  
  return minutesToTimeString(diffMinutes);
}

/**
 * Add two time strings together (handles positive and negative times)
 */
function addTimeStrings(time1?: string | null, time2?: string | null): string {
  if (!time1 && !time2) return '00:00';
  if (!time1) return time2 || '00:00';
  if (!time2) return time1 || '00:00';
  
  const minutes1 = timeStringToMinutes(time1);
  const minutes2 = timeStringToMinutes(time2);
  return minutesToTimeString(minutes1 + minutes2);
}

interface TimelineGenerationResult {
  success: boolean;
  recordsCreated?: number;
  message?: string;
  error?: string;
}

interface BackfillResult {
  success: boolean;
  totalRecordsCreated: number;
  missingDates: string[];
  message: string;
}

/**
 * Check if a date is weekend for a specific employee based on their branch
 */
async function isWeekendForEmployee(userId: string, date: Date): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { branch: true }
    });

    if (!user || !user.branch) {
      return false; // If no branch info, assume it's a working day
    }

    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const currentDayName = dayNames[dayOfWeek];
    
    // Check if current day is in the weeklyOffDays array
    const isWeekend = user.branch.weeklyOffDays.includes(currentDayName);
    
    return isWeekend;
  } catch (error) {
    console.error('Error checking weekend for employee:', error);
    return false;
  }
}

/**
 * Check if employee has approved leave for a specific date
 */
async function hasApprovedLeaveForDate(userId: string, date: Date): Promise<boolean> {
  try {
    const leaveCount = await prisma.leaveApplication.count({
      where: {
        userId,
        status: 'APPROVED',
        leaveDate: date
      }
    });

    return leaveCount > 0;
  } catch (error) {
    console.error('Error checking leave for employee:', error);
    return false;
  }
}

async function isPublicHolidayForBranch(date: Date, branchId?: string | null): Promise<boolean> {
  try {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

    const whereCondition: Prisma.PublicHolidayWhereInput = {
      date: {
        gte: startOfDay,
        lt: endOfDay
      },
      isActive: true
    };

    if (branchId) {
      whereCondition.OR = [
        { appliesToAllBranches: true },
        { applicableBranchIds: { has: branchId } }
      ];
    }

    const holidayCount = await prisma.publicHoliday.count({
      where: whereCondition
    });

    return holidayCount > 0;
  } catch (error) {
    console.error('Error checking public holiday for branch:', error);
    return false;
  }
}

/**
 * Generate daily timeline records for all active employees for a specific date
 */
export async function generateDailyTimeRecords(targetDate: Date = new Date()): Promise<TimelineGenerationResult> {
  try {
    // Normalize the date to start of day
    const normalizedDate = new Date(targetDate);
    normalizedDate.setHours(0, 0, 0, 0);

    console.log(`Generating timeline records for date: ${normalizedDate.toISOString()}`);

    // Get all active employees
    const activeEmployees = await prisma.user.findMany({
      where: {
        status: 'APPROVED',
        role: 'EMPLOYEE'
      },
      include: {
        branch: true
      }
    });

    if (activeEmployees.length === 0) {
      return {
        success: true,
        recordsCreated: 0,
        message: 'No active employees found'
      };
    }

    let recordsCreated = 0;
    const errors: string[] = [];

    for (const employee of activeEmployees) {
      try {
        // Check if record already exists
        const existingRecord = await prisma.dailyTimeRecord.findFirst({
          where: {
            userId: employee.id,
            date: normalizedDate
          }
        });

        if (existingRecord) {
          console.log(`Record already exists for ${employee.firstName} ${employee.lastName} on ${normalizedDate.toDateString()}`);
          continue;
        }

        // Check if it's weekend for this employee
        const isWeekend = await isWeekendForEmployee(employee.id, normalizedDate);
        if (isWeekend) {
          console.log(`Skipping ${employee.firstName} ${employee.lastName} - weekend`);
          continue;
        }

        const isBranchHoliday = await isPublicHolidayForBranch(normalizedDate, employee.branchId);
        if (isBranchHoliday) {
          console.log(`Skipping ${employee.firstName} ${employee.lastName} - public holiday`);
          continue;
        }

        // Check if employee has approved leave
        const hasLeave = await hasApprovedLeaveForDate(employee.id, normalizedDate);
        if (hasLeave) {
          console.log(`Skipping ${employee.firstName} ${employee.lastName} - on approved leave`);
          continue;
        }

        // Create timeline record
        const checkInTime = new Date(normalizedDate);
        const checkOutTime = new Date(normalizedDate);
        
        // Set the check-in and check-out times
        const [checkInHour, checkInMin] = (employee.branch?.checkInTime || "09:00").split(':').map(Number);
        const [checkOutHour, checkOutMin] = (employee.branch?.checkOutTime || "18:00").split(':').map(Number);
        
        checkInTime.setHours(checkInHour, checkInMin, 0, 0);
        checkOutTime.setHours(checkOutHour, checkOutMin, 0, 0);

        const requiredBreakTime = employee.branch?.breakDuration || "01:00";
        const requiredActiveTime = calculateActiveTime(checkInTime, checkOutTime, requiredBreakTime);

        await prisma.dailyTimeRecord.create({
          data: {
            userId: employee.id,
            date: normalizedDate,
            requiredCheckIn: checkInTime,
            requiredCheckOut: checkOutTime,
            requiredBreakTime: requiredBreakTime,
            requiredActiveTime: requiredActiveTime
          }
        });

        recordsCreated++;
        console.log(`Created record for ${employee.firstName} ${employee.lastName}`);

      } catch (error) {
        const errorMsg = `Failed to create record for ${employee.firstName} ${employee.lastName}: ${error}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    if (errors.length > 0) {
      // Create notification for admin about partial failures
      await createAdminNotification({
        type: 'TIMELINE_GENERATION_FAILED',
        title: 'Timeline Generation Partial Success',
        message: `Generated ${recordsCreated} records with ${errors.length} errors. Errors: ${errors.join('; ')}`
      });

      return {
        success: true,
        recordsCreated,
        message: `Generated ${recordsCreated} records with ${errors.length} errors`
      };
    }

    console.log(`Successfully generated ${recordsCreated} timeline records`);

    return {
      success: true,
      recordsCreated,
      message: `Successfully generated ${recordsCreated} timeline records`
    };

  } catch (error) {
    const errorMsg = `Failed to generate daily timeline records: ${error}`;
    console.error(errorMsg);

    // Create notification for admin about complete failure
    await createAdminNotification({
      type: 'TIMELINE_GENERATION_FAILED',
      title: 'Daily Timeline Generation Failed',
      message: errorMsg
    });

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Backfill missing timeline records from the last generated date to current date
 */
export async function backfillMissingTimeRecords(): Promise<BackfillResult> {
  try {
    console.log('Starting timeline backfill process...');

    // Find the latest timeline record date
    const latestRecord = await prisma.dailyTimeRecord.findFirst({
      orderBy: { date: 'desc' },
      select: { date: true }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate: Date;
    
    if (!latestRecord) {
      // If no records exist, start from yesterday
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1);
    } else {
      // Start from the day after the latest record
      startDate = new Date(latestRecord.date);
      startDate.setDate(startDate.getDate() + 1);
    }

    const missingDates: string[] = [];
    let totalRecordsCreated = 0;

    // Generate records for each missing day
    const currentDate = new Date(startDate);
    while (currentDate < today) {
      console.log(`Backfilling for date: ${currentDate.toDateString()}`);
      
      const result = await generateDailyTimeRecords(new Date(currentDate));
      if (result.success) {
        totalRecordsCreated += result.recordsCreated || 0;
        if ((result.recordsCreated || 0) > 0) {
          missingDates.push(currentDate.toDateString());
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Notify admin if we had to backfill missing dates
    if (missingDates.length > 0) {
      await createAdminNotification({
        type: 'TIMELINE_BACKFILL_COMPLETED',
        title: 'Timeline Backfill Completed',
        message: `Backfilled ${totalRecordsCreated} timeline records for ${missingDates.length} missing dates: ${missingDates.join(', ')}`
      });
    }

    const message = missingDates.length > 0 
      ? `Backfilled ${totalRecordsCreated} records for ${missingDates.length} missing dates`
      : 'No missing dates found - timeline is up to date';

    console.log(`Backfill completed: ${message}`);

    return {
      success: true,
      totalRecordsCreated,
      missingDates,
      message
    };

  } catch (error) {
    const errorMsg = `Timeline backfill failed: ${error}`;
    console.error(errorMsg);

    // Notify admin about backfill failure
    await createAdminNotification({
      type: 'TIMELINE_GENERATION_FAILED',
      title: 'Timeline Backfill Failed',
      message: errorMsg
    });

    return {
      success: false,
      totalRecordsCreated: 0,
      missingDates: [],
      message: errorMsg
    };
  }
}

/**
 * Check if timeline generation is needed and perform it
 */
export async function checkAndGenerateToday(): Promise<TimelineGenerationResult> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if records already exist for today
    const todayRecordsCount = await prisma.dailyTimeRecord.count({
      where: {
        date: today
      }
    });

    if (todayRecordsCount > 0) {
      return {
        success: true,
        recordsCreated: 0,
        message: 'Timeline records already exist for today'
      };
    }

    // First try to backfill any missing dates
    const backfillResult = await backfillMissingTimeRecords();
    
    if (!backfillResult.success) {
      return {
        success: false,
        error: backfillResult.message
      };
    }

    // Generate today's records if backfill didn't already do it
    const todayRecordsCountAfterBackfill = await prisma.dailyTimeRecord.count({
      where: { date: today }
    });

    if (todayRecordsCountAfterBackfill > 0) {
      return {
        success: true,
        recordsCreated: backfillResult.totalRecordsCreated,
        message: `Backfill created today's records. Total created: ${backfillResult.totalRecordsCreated}`
      };
    }

    // Generate today's records
    return await generateDailyTimeRecords(today);

  } catch (error) {
    const errorMsg = `Failed to check and generate today's timeline: ${error}`;
    console.error(errorMsg);
    
    await createAdminNotification({
      type: 'TIMELINE_GENERATION_FAILED',
      title: 'Daily Timeline Check Failed',
      message: errorMsg
    });

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Get timeline records for a specific user and date range
 */
export async function getTimelineRecords(userId?: string, startDate?: Date, endDate?: Date) {
  try {
    const actor = await getDbUser();
    if (!actor) {
      return { success: false, error: "Unauthorized" };
    }

    const canAccessTimeline = actor.role === "SUPERADMIN" || actor.role === "HR" || (actor.role === "EMPLOYEE" && actor.isManager);
    if (!canAccessTimeline) {
      return { success: false, error: "Unauthorized" };
    }

    const where: Prisma.DailyTimeRecordWhereInput = {};
    
    if (userId) {
      where.userId = userId;
    }
    
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const records = await prisma.dailyTimeRecord.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            branch: {
              select: {
                name: true,
                weeklyOffDays: true,
                checkInTime: true,
                checkOutTime: true
              }
            }
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { user: { firstName: 'asc' } }
      ]
    });

    return { success: true, records };

  } catch (error) {
    console.error('Error fetching timeline records:', error);
    return { success: false, error: 'Failed to fetch timeline records' };
  }
}

/**
 * Update a specific timeline record
 */
export async function updateTimelineRecord(
  recordId: string,
  data: {
    requiredCheckIn?: Date | null;
    requiredCheckOut?: Date | null;
    requiredBreakTime?: string | null;
    actualCheckIn?: Date | null;
    actualCheckOut?: Date | null;
    actualBreakTime?: string | null;
    notes?: string | null;
  }
) {
  try {
    const actor = await getDbUser();
    if (!actor) {
      return { success: false, error: 'Unauthorized' };
    }

    const canUpdateTimeline = actor.role === "SUPERADMIN" || actor.role === "HR" || (actor.role === "EMPLOYEE" && actor.isManager);
    if (!canUpdateTimeline) {
      return { success: false, error: 'Unauthorized' };
    }

    // First, get the current record to have all fields for calculations
    const currentRecord = await prisma.dailyTimeRecord.findUnique({
      where: { id: recordId }
    });

    if (!currentRecord) {
      return { success: false, error: 'Timeline record not found' };
    }

    const updateData: Prisma.DailyTimeRecordUpdateInput = {
      updatedAt: new Date()
    };

    // Update the provided fields
    if (data.requiredCheckIn !== undefined) updateData.requiredCheckIn = data.requiredCheckIn;
    if (data.requiredCheckOut !== undefined) updateData.requiredCheckOut = data.requiredCheckOut;
    if (data.requiredBreakTime !== undefined) updateData.requiredBreakTime = data.requiredBreakTime;
    if (data.actualCheckIn !== undefined) updateData.actualCheckIn = data.actualCheckIn;
    if (data.actualCheckOut !== undefined) updateData.actualCheckOut = data.actualCheckOut;
    if (data.actualBreakTime !== undefined) updateData.actualBreakTime = data.actualBreakTime;

    // Determine final values for calculations (new values or existing ones)
    const finalRequiredCheckIn = data.requiredCheckIn !== undefined ? data.requiredCheckIn : currentRecord.requiredCheckIn;
    const finalRequiredCheckOut = data.requiredCheckOut !== undefined ? data.requiredCheckOut : currentRecord.requiredCheckOut;
    const finalRequiredBreakTime = data.requiredBreakTime !== undefined ? data.requiredBreakTime : currentRecord.requiredBreakTime;
    const finalActualCheckIn = data.actualCheckIn !== undefined ? data.actualCheckIn : currentRecord.actualCheckIn;
    const finalActualCheckOut = data.actualCheckOut !== undefined ? data.actualCheckOut : currentRecord.actualCheckOut;
    const finalActualBreakTime = data.actualBreakTime !== undefined ? data.actualBreakTime : currentRecord.actualBreakTime;

    // Calculate required active time if we have required check-in and check-out
    if (finalRequiredCheckIn && finalRequiredCheckOut) {
      updateData.requiredActiveTime = calculateActiveTime(
        finalRequiredCheckIn, 
        finalRequiredCheckOut, 
        finalRequiredBreakTime || '00:00'
      );
    }

    // Calculate actual active time if we have actual check-in and check-out
    if (finalActualCheckIn && finalActualCheckOut) {
      updateData.actualActiveTime = calculateActiveTime(
        finalActualCheckIn, 
        finalActualCheckOut, 
        finalActualBreakTime || '00:00'
      );

      // Calculate official overtime/undertime (auto-calculated) if we have both required and actual active times
      const requiredActiveTime = updateData.requiredActiveTime || currentRecord.requiredActiveTime;
      const actualActiveTime = updateData.actualActiveTime;
      if (typeof requiredActiveTime === 'string' && typeof actualActiveTime === 'string') {
        updateData.officialOvertimeundertime = calculateOvertimeUndertime(
          actualActiveTime,
          requiredActiveTime
        );
        
        // Calculate total overtimeUndertime (official + requested)
        const requestedOvertime = currentRecord.requestedOvertime || '00:00';
        updateData.overtimeUndertime = addTimeStrings(
          updateData.officialOvertimeundertime,
          requestedOvertime
        );
      }
    }

    const record = await prisma.dailyTimeRecord.update({
      where: { id: recordId },
      data: updateData,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (actor.role === "EMPLOYEE" && actor.isManager) {
      await createAdminNotification({
        type: 'SYSTEM_ALERT',
        title: 'Manager Updated Timeline Record',
        message: `Manager ${actor.firstName || ""} ${actor.lastName || ""} updated timeline for ${record.user.firstName || "Employee"} ${record.user.lastName || ""} on ${new Date(record.date).toLocaleDateString()}.`,
        metadata: {
          actorId: actor.id,
          targetUserId: record.userId,
          recordId: record.id,
          action: 'TIMELINE_RECORD_UPDATED'
        }
      });

      await prisma.timelineModificationActionLog.create({
        data: {
          actionType: "MANAGER_TIMELINE_EDIT",
          actionDetails: `Manager updated timeline record on ${new Date(record.date).toDateString()}`,
          actorId: actor.id,
          targetUserId: record.userId,
          dailyTimeRecordId: record.id,
          metadata: {
            updatedFields: {
              requiredCheckIn: data.requiredCheckIn !== undefined,
              requiredCheckOut: data.requiredCheckOut !== undefined,
              requiredBreakTime: data.requiredBreakTime !== undefined,
              actualCheckIn: data.actualCheckIn !== undefined,
              actualCheckOut: data.actualCheckOut !== undefined,
              actualBreakTime: data.actualBreakTime !== undefined,
            }
          }
        }
      });
    }

    revalidatePath('/admin/timeline');
    revalidatePath('/manager/timeline');
    revalidatePath('/dashboard');

    return { 
      success: true, 
      record,
      message: `Updated timeline record for ${record.user.firstName} ${record.user.lastName}` 
    };

  } catch (error) {
    console.error('Error updating timeline record:', error);
    return { success: false, error: 'Failed to update timeline record' };
  }
}

/**
 * Delete timeline records (admin only)
 */
export async function deleteTimelineRecords(recordIds: string[]) {
  try {
    const actor = await getDbUser();
    if (!actor) {
      return { success: false, error: 'Unauthorized' };
    }

    const canDeleteTimeline = actor.role === "SUPERADMIN" || actor.role === "HR" || (actor.role === "EMPLOYEE" && actor.isManager);
    if (!canDeleteTimeline) {
      return { success: false, error: 'Unauthorized' };
    }

    const deletedCount = await prisma.dailyTimeRecord.deleteMany({
      where: {
        id: { in: recordIds }
      }
    });

    revalidatePath('/admin/timeline');
    revalidatePath('/manager/timeline');

    return {
      success: true,
      message: `Deleted ${deletedCount.count} timeline records`
    };

  } catch (error) {
    console.error('Error deleting timeline records:', error);
    return { success: false, error: 'Failed to delete timeline records' };
  }
}

/**
 * Backfill calculations for existing timeline records that don't have calculated fields
 */
export async function backfillTimelineCalculations() {
  try {
    console.log('🔄 Starting timeline calculations backfill...');
    
    // Get records that need calculations
    const records = await prisma.dailyTimeRecord.findMany({
      where: {
        OR: [
          { requiredActiveTime: null },
          { actualActiveTime: null },
          { officialOvertimeundertime: null }
        ]
      }
    });

    console.log(`📊 Found ${records.length} records needing calculations`);
    
    let updatedCount = 0;
    
    for (const record of records) {
      const updateData: Prisma.DailyTimeRecordUpdateInput = {};
      
      // Calculate required active time if we have required check-in and check-out
      if (record.requiredCheckIn && record.requiredCheckOut && !record.requiredActiveTime) {
        updateData.requiredActiveTime = calculateActiveTime(
          record.requiredCheckIn, 
          record.requiredCheckOut, 
          record.requiredBreakTime || '00:00'
        );
      }
      
      // Calculate actual active time if we have actual check-in and check-out
      if (record.actualCheckIn && record.actualCheckOut && !record.actualActiveTime) {
        updateData.actualActiveTime = calculateActiveTime(
          record.actualCheckIn, 
          record.actualCheckOut, 
          record.actualBreakTime || '00:00'
        );
      }
      
      // Calculate overtime/undertime if we have both active times
      const finalRequiredActiveTime = updateData.requiredActiveTime || record.requiredActiveTime;
      const finalActualActiveTime = updateData.actualActiveTime || record.actualActiveTime;
      
      if (typeof finalRequiredActiveTime === 'string' && typeof finalActualActiveTime === 'string' && !record.officialOvertimeundertime) {
        updateData.officialOvertimeundertime = calculateOvertimeUndertime(
          finalActualActiveTime,
          finalRequiredActiveTime
        );
        
        // Calculate total overtimeUndertime (official + requested)
        const requestedOvertime = record.requestedOvertime || '00:00';
        updateData.overtimeUndertime = addTimeStrings(
          updateData.officialOvertimeundertime,
          requestedOvertime
        );
      }
      
      // Update record if we have calculations to apply
      if (Object.keys(updateData).length > 0) {
        await prisma.dailyTimeRecord.update({
          where: { id: record.id },
          data: updateData
        });
        updatedCount++;
      }
    }
    
    console.log(`✅ Updated ${updatedCount} records with calculations`);
    
    revalidatePath('/admin/timeline');
    
    return { 
      success: true, 
      message: `Backfilled calculations for ${updatedCount} timeline records`,
      updatedCount 
    };
    
  } catch (error) {
    console.error('Error backfilling timeline calculations:', error);
    return { success: false, error: 'Failed to backfill timeline calculations' };
  }
}