"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createAdminNotification } from "./notification.actions";
import { Prisma } from "@prisma/client";
import { getDbUser } from "./user.actions";
import { buildDateRangeFilter } from "@/lib/utils";

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

type PenaltyAdjustmentResult = {
  applied: boolean;
  adjustedAmount: number;
  direction: "DEBIT" | "CREDIT";
};

type LeaveAdjustmentResult = {
  applied: boolean;
  leaveTypeName?: string;
};

function getRequiredActiveMinutesForPenalty(
  requiredCheckIn: Date | null,
  requiredCheckOut: Date | null,
  requiredBreakTime: string | null | undefined,
  requiredActiveTime: string | null | undefined,
) {
  const fromStored = timeStringToMinutes(requiredActiveTime || "00:00");
  if (fromStored > 0) return fromStored;

  if (!requiredCheckIn || !requiredCheckOut) return 0;

  const totalMinutes = Math.max(
    0,
    Math.floor((requiredCheckOut.getTime() - requiredCheckIn.getTime()) / (1000 * 60)),
  );
  const breakMinutes = timeStringToMinutes(requiredBreakTime || "00:00");
  return Math.max(0, totalMinutes - breakMinutes);
}

async function reconcileLatePenaltyWalletOnTimelineEdit(
  tx: Prisma.TransactionClient,
  userId: string,
  date: Date,
  lateMinutes: number,
  penaltyAmount: number,
): Promise<PenaltyAdjustmentResult> {
  const dateKey = getDateKey(date);
  const penaltyTag = `Late check-in penalty for ${dateKey}`;

  const priorPenaltyTransactions = await tx.walletTransaction.findMany({
    where: {
      userId,
      type: "ADJUSTMENT",
      description: {
        contains: penaltyTag,
      },
    },
    select: {
      amount: true,
    },
  });

  const alreadyDeducted = priorPenaltyTransactions.reduce((sum, transaction) => {
    if (transaction.amount >= 0) {
      return sum;
    }
    return sum + Math.abs(transaction.amount);
  }, 0);

  const diff = Number((penaltyAmount - alreadyDeducted).toFixed(2));
  if (Math.abs(diff) < 0.01) {
    return { applied: false, adjustedAmount: 0, direction: "DEBIT" };
  }

  const direction: "DEBIT" | "CREDIT" = diff > 0 ? "DEBIT" : "CREDIT";
  const adjustmentAmount = Number(Math.abs(diff).toFixed(2));
  const walletAmount = direction === "DEBIT" ? -adjustmentAmount : adjustmentAmount;
  const description = direction === "DEBIT"
    ? `${penaltyTag} (${lateMinutes} min)`
    : `Late check-in penalty correction for ${dateKey}`;

  await tx.user.update({
    where: { id: userId },
    data: { walletBalance: { increment: walletAmount } },
  });

  await tx.walletTransaction.create({
    data: {
      userId,
      amount: walletAmount,
      type: "ADJUSTMENT",
      description,
    },
  });

  return {
    applied: true,
    adjustedAmount: adjustmentAmount,
    direction,
  };
}

async function reverseAbsentPenaltyOnTimelineEdit(
  tx: Prisma.TransactionClient,
  userId: string,
  date: Date,
): Promise<PenaltyAdjustmentResult> {
  const dateKey = getDateKey(date);
  const penaltyTag = `Absent without leave penalty for ${dateKey}`;

  const priorPenaltyTransactions = await tx.walletTransaction.findMany({
    where: {
      userId,
      type: "ADJUSTMENT",
      description: {
        contains: penaltyTag,
      },
    },
    select: {
      amount: true,
    },
  });

  const alreadyReversed = await tx.walletTransaction.findMany({
    where: {
      userId,
      type: "ADJUSTMENT",
      description: {
        contains: `Manual timeline absence correction for ${dateKey}`,
      },
    },
    select: {
      amount: true,
    },
  });

  const originalPenalty = priorPenaltyTransactions.reduce((sum, transaction) => {
    if (transaction.amount >= 0) {
      return sum;
    }
    return sum + Math.abs(transaction.amount);
  }, 0);

  const reversedAmount = alreadyReversed.reduce((sum, transaction) => {
    if (transaction.amount <= 0) {
      return sum;
    }
    return sum + transaction.amount;
  }, 0);

  const diff = Number((originalPenalty - reversedAmount).toFixed(2));
  if (Math.abs(diff) < 0.01) {
    return { applied: false, adjustedAmount: 0, direction: "DEBIT" };
  }

  const adjustmentAmount = Number(Math.abs(diff).toFixed(2));
  await tx.user.update({
    where: { id: userId },
    data: { walletBalance: { increment: adjustmentAmount } },
  });

  await tx.walletTransaction.create({
    data: {
      userId,
      amount: adjustmentAmount,
      type: "ADJUSTMENT",
      description: `Manual timeline absence correction for ${dateKey}`,
    },
  });

  return {
    applied: true,
    adjustedAmount: adjustmentAmount,
    direction: "CREDIT",
  };
}

async function reverseAutoLeaveDeductionOnTimelineEdit(
  tx: Prisma.TransactionClient,
  currentRecord: Prisma.DailyTimeRecord,
): Promise<LeaveAdjustmentResult> {
  if (!currentRecord.autoDeductedLeaveType) {
    return { applied: false };
  }

  const dateKey = getDateKey(currentRecord.date);
  const dateYear = currentRecord.date.getFullYear();

  const auditLog = await tx.leaveAuditLog.findFirst({
    where: {
      userId: currentRecord.userId,
      action: "AUTO_LEAVE_DEDUCTION",
      affectedDate: currentRecord.date,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      leaveTypeId: true,
      leaveType: {
        select: {
          name: true,
        },
      },
      deductedDays: true,
      previousBalance: true,
      newBalance: true,
    },
  });

  const leaveTypeId = auditLog?.leaveTypeId
    ?? (await tx.leaveType.findFirst({
      where: {
        name: currentRecord.autoDeductedLeaveType,
      },
      select: {
        id: true,
      },
    }))?.id;

  if (!leaveTypeId) {
    return { applied: false, leaveTypeName: currentRecord.autoDeductedLeaveType };
  }

  const entitlement = await tx.userLeaveEntitlement.findFirst({
    where: {
      userId: currentRecord.userId,
      leaveTypeId,
      year: dateYear,
    },
  });

  if (!entitlement) {
    return { applied: false, leaveTypeName: currentRecord.autoDeductedLeaveType };
  }

  const restoreDays = Math.max(1, auditLog?.deductedDays || 1);
  const restoredUsedDays = Math.max(0, entitlement.usedDays - restoreDays);

  await tx.userLeaveEntitlement.update({
    where: { id: entitlement.id },
    data: { usedDays: restoredUsedDays },
  });

  await tx.leaveAuditLog.create({
    data: {
      userId: currentRecord.userId,
      action: "MANUAL_LEAVE_ADJUSTMENT",
      description: `Manual timeline correction reversed ${currentRecord.autoDeductedLeaveType} for ${dateKey}`,
      affectedDate: currentRecord.date,
      leaveTypeId,
      previousBalance: auditLog?.newBalance ?? entitlement.usedDays,
      newBalance: auditLog?.previousBalance ?? restoredUsedDays,
      deductedDays: -restoreDays,
      processingSource: "MANUAL",
      metadata: {
        timelineRecordId: currentRecord.id,
        originalAction: "AUTO_LEAVE_DEDUCTION",
        originalLeaveTypeName: currentRecord.autoDeductedLeaveType,
      },
    },
  });

  return {
    applied: true,
    leaveTypeName: currentRecord.autoDeductedLeaveType,
  };
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

const BANGLADESH_OFFSET_MS = 6 * 60 * 60 * 1000;

function getBangladeshDateParts(date: Date) {
  const shifted = new Date(date.getTime() + BANGLADESH_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
  };
}

function createBangladeshDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  return new Date(Date.UTC(year, month, day, hour, minute, second, millisecond) - BANGLADESH_OFFSET_MS);
}

const TIMELINE_BASELINE_START = createBangladeshDateTime(2026, 0, 1);

function normalizeToStartOfDay(date: Date): Date {
  const { year, month, day } = getBangladeshDateParts(date);
  return createBangladeshDateTime(year, month, day);
}

function getDateKey(date: Date): string {
  const { year, month, day } = getBangladeshDateParts(date);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDisplayName(employee: { firstName: string | null; lastName: string | null; email: string }): string {
  const fullName = `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim();
  return fullName || employee.email;
}

function getEmployeeTimelineStartDate(
  employee: { dateOfJoining: Date | null },
): Date {
  if (!employee.dateOfJoining) {
    return TIMELINE_BASELINE_START;
  }

  const joiningDate = normalizeToStartOfDay(employee.dateOfJoining);
  return joiningDate > TIMELINE_BASELINE_START ? joiningDate : TIMELINE_BASELINE_START;
}

async function createTimelineRecordForEmployee(
  employee: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    branchId: string | null;
    dateOfJoining: Date | null;
    branch: {
      checkInTime: string;
      checkOutTime: string;
      breakDuration: string;
      weeklyOffDays: string[];
    } | null;
  },
  targetDate: Date,
  skipExistingCheck = false
): Promise<{ created: boolean; skippedReason?: string; error?: string }> {
  const normalizedDate = normalizeToStartOfDay(targetDate);
  const employeeName = getDisplayName(employee);

  try {
    const employeeStartDate = getEmployeeTimelineStartDate(employee);
    if (normalizedDate < employeeStartDate) {
      return { created: false, skippedReason: 'before employment start' };
    }

    if (!skipExistingCheck) {
      const existingRecord = await prisma.dailyTimeRecord.findFirst({
        where: {
          userId: employee.id,
          date: normalizedDate
        }
      });

      if (existingRecord) {
        return { created: false, skippedReason: 'already exists' };
      }
    }

    const isWeekend = await isWeekendForEmployee(employee.id, normalizedDate);
    if (isWeekend) {
      return { created: false, skippedReason: 'weekend' };
    }

    const isBranchHoliday = await isPublicHolidayForBranch(normalizedDate, employee.branchId);
    if (isBranchHoliday) {
      return { created: false, skippedReason: 'public holiday' };
    }

    const hasLeave = await hasApprovedLeaveForDate(employee.id, normalizedDate);
    if (hasLeave) {
      return { created: false, skippedReason: 'on approved leave' };
    }

    const { year, month, day } = getBangladeshDateParts(normalizedDate);

    const [checkInHour, checkInMin] = (employee.branch?.checkInTime || '09:00').split(':').map(Number);
    const [checkOutHour, checkOutMin] = (employee.branch?.checkOutTime || '18:00').split(':').map(Number);

    const checkInTime = createBangladeshDateTime(year, month, day, checkInHour, checkInMin);
    const checkOutTime = createBangladeshDateTime(year, month, day, checkOutHour, checkOutMin);

    const requiredBreakTime = employee.branch?.breakDuration || '01:00';
    const requiredActiveTime = calculateActiveTime(checkInTime, checkOutTime, requiredBreakTime);

    await prisma.dailyTimeRecord.create({
      data: {
        userId: employee.id,
        date: normalizedDate,
        requiredCheckIn: checkInTime,
        requiredCheckOut: checkOutTime,
        requiredBreakTime,
        requiredActiveTime
      }
    });

    console.log(`Created record for ${employeeName} on ${normalizedDate.toDateString()}`);
    return { created: true };
  } catch (error) {
    const errorMsg = `Failed to create record for ${employeeName} on ${normalizedDate.toDateString()}: ${error}`;
    console.error(errorMsg);
    return { created: false, error: errorMsg };
  }
}

async function restoreTimelineRecordsFromTemporary(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const archivedRecords = await prisma.dailyTimeRecordTemporary.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: 'asc' },
  });

  let restoredCount = 0;

  for (const record of archivedRecords) {
    await prisma.dailyTimeRecord.upsert({
      where: {
        userId_date: {
          userId,
          date: record.date,
        },
      },
      create: {
        userId,
        date: record.date,
        status: record.status,
        requiredCheckIn: record.requiredCheckIn,
        requiredCheckOut: record.requiredCheckOut,
        requiredBreakTime: record.requiredBreakTime,
        actualCheckIn: record.actualCheckIn,
        actualCheckOut: record.actualCheckOut,
        actualBreakTime: record.actualBreakTime,
        requiredActiveTime: record.requiredActiveTime,
        actualActiveTime: record.actualActiveTime,
        officialOvertimeundertime: record.officialOvertimeundertime,
        requestedOvertime: record.requestedOvertime,
        requestedOTstart: record.requestedOTstart,
        requestedOTend: record.requestedOTend,
        overtimeUndertime: record.overtimeUndertime,
        lateCheckInMinutes: record.lateCheckInMinutes,
        lateCheckInPenalty: record.lateCheckInPenalty,
        autoDeductedLeaveType: record.autoDeductedLeaveType,
        isProcessed: record.isProcessed,
      },
      update: {
        status: record.status,
        requiredCheckIn: record.requiredCheckIn,
        requiredCheckOut: record.requiredCheckOut,
        requiredBreakTime: record.requiredBreakTime,
        actualCheckIn: record.actualCheckIn,
        actualCheckOut: record.actualCheckOut,
        actualBreakTime: record.actualBreakTime,
        requiredActiveTime: record.requiredActiveTime,
        actualActiveTime: record.actualActiveTime,
        officialOvertimeundertime: record.officialOvertimeundertime,
        requestedOvertime: record.requestedOvertime,
        requestedOTstart: record.requestedOTstart,
        requestedOTend: record.requestedOTend,
        overtimeUndertime: record.overtimeUndertime,
        lateCheckInMinutes: record.lateCheckInMinutes,
        lateCheckInPenalty: record.lateCheckInPenalty,
        autoDeductedLeaveType: record.autoDeductedLeaveType,
        isProcessed: record.isProcessed,
      },
    });

    restoredCount++;
  }

  return restoredCount;
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

    const { dayOfWeek } = getBangladeshDateParts(date); // 0 = Sunday, 6 = Saturday
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
    const startOfDay = normalizeToStartOfDay(date);
    const endOfDay = new Date(startOfDay.getTime() + (24 * 60 * 60 * 1000));

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
    const normalizedDate = normalizeToStartOfDay(targetDate);

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
      const result = await createTimelineRecordForEmployee(employee, normalizedDate);
      if (result.error) {
        errors.push(result.error);
        continue;
      }

      if (result.created) {
        recordsCreated++;
      } else if (result.skippedReason && result.skippedReason !== 'already exists') {
        console.log(`Skipping ${getDisplayName(employee)} - ${result.skippedReason}`);
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
    console.log('Starting timeline backfill process from baseline date...');

    const today = normalizeToStartOfDay(new Date());

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
        totalRecordsCreated: 0,
        missingDates: [],
        message: 'No active employees found'
      };
    }

    const missingDates: string[] = [];
    const createdDateSet = new Set<string>();
    let totalRecordsCreated = 0;
    const errors: string[] = [];

    for (const employee of activeEmployees) {
      // If joining date is missing, do not backfill historical dates for this employee.
      if (!employee.dateOfJoining) {
        continue;
      }

      const startDate = getEmployeeTimelineStartDate(employee);

      if (startDate >= today) {
        continue;
      }

      const restored = await restoreTimelineRecordsFromTemporary(employee.id, startDate, today);
      if (restored > 0) {
        totalRecordsCreated += restored;
      }

      const existingRecords = await prisma.dailyTimeRecord.findMany({
        where: {
          userId: employee.id,
          date: {
            gte: startDate,
            lt: today
          }
        },
        select: { date: true }
      });

      const existingDateKeys = new Set(existingRecords.map((record) => getDateKey(record.date)));

      const currentDate = new Date(startDate);
      while (currentDate < today) {
        const dateKey = getDateKey(currentDate);
        if (!existingDateKeys.has(dateKey)) {
          const result = await createTimelineRecordForEmployee(employee, currentDate, true);
          if (result.error) {
            errors.push(result.error);
          } else if (result.created) {
            totalRecordsCreated++;
            createdDateSet.add(dateKey);
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    missingDates.push(...Array.from(createdDateSet).sort());

    // Notify admin if we had to backfill missing dates
    if (missingDates.length > 0) {
      await createAdminNotification({
        type: 'TIMELINE_BACKFILL_COMPLETED',
        title: 'Timeline Backfill Completed',
        message: `Backfilled ${totalRecordsCreated} timeline records for ${missingDates.length} missing dates: ${missingDates.join(', ')}`
      });
    }

    if (errors.length > 0) {
      await createAdminNotification({
        type: 'TIMELINE_GENERATION_FAILED',
        title: 'Timeline Backfill Partial Failure',
        message: `Backfill created ${totalRecordsCreated} records with ${errors.length} errors. Errors: ${errors.join('; ')}`
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
    const today = normalizeToStartOfDay(new Date());
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

    let totalCreated = 0;
    const errors: string[] = [];

    for (const employee of activeEmployees) {
      // Missing joining date: only maintain today's timeline record.
      if (!employee.dateOfJoining) {
        const todayOnlyResult = await createTimelineRecordForEmployee(employee, today);
        if (todayOnlyResult.error) {
          errors.push(todayOnlyResult.error);
        } else if (todayOnlyResult.created) {
          totalCreated++;
        }
        continue;
      }

      // Joining date exists: restore archived rows first, then create missing rows.
      const startDate = getEmployeeTimelineStartDate(employee);

      if (startDate > today) {
        continue;
      }

      const restored = await restoreTimelineRecordsFromTemporary(employee.id, startDate, today);
      if (restored > 0) {
        totalCreated += restored;
      }

      const existingRecords = await prisma.dailyTimeRecord.findMany({
        where: {
          userId: employee.id,
          date: {
            gte: startDate,
            lte: today
          }
        },
        select: { date: true }
      });

      const existingDateKeys = new Set(existingRecords.map((record) => getDateKey(record.date)));

      const currentDate = new Date(startDate);
      while (currentDate <= today) {
        const dateKey = getDateKey(currentDate);
        if (!existingDateKeys.has(dateKey)) {
          const result = await createTimelineRecordForEmployee(employee, currentDate, true);
          if (result.error) {
            errors.push(result.error);
          } else if (result.created) {
            totalCreated++;
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    if (errors.length > 0) {
      await createAdminNotification({
        type: 'TIMELINE_GENERATION_FAILED',
        title: 'Timeline Generation Partial Failure',
        message: `Timeline maintenance created ${totalCreated} records with ${errors.length} errors. Errors: ${errors.join('; ')}`
      });
    }

    return {
      success: true,
      recordsCreated: totalCreated,
      message: `Timeline maintenance completed. Created ${totalCreated} records${errors.length > 0 ? ` with ${errors.length} errors` : ''}`
    };

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
export async function getTimelineRecords(
  userId?: string,
  startDate?: Date,
  endDate?: Date,
  options?: {
    branchId?: string;
    employeeName?: string;
    page?: number;
    limit?: number;
  }
) {
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
      const dateFilter = buildDateRangeFilter(startDate, endDate);
      if (dateFilter) {
        where.date = dateFilter;
      }
    }

    if (options?.branchId || options?.employeeName) {
      where.user = {};
      if (options.branchId) {
        where.user.branchId = options.branchId;
      }

      if (options.employeeName) {
        const searchTerm = options.employeeName.trim();
        if (searchTerm) {
          where.user.OR = [
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } }
          ];
        }
      }
    }

    const page = Math.max(options?.page || 1, 1);
    const limit = Math.max(options?.limit || 0, 0);
    const usePagination = limit > 0;

    const total = await prisma.dailyTimeRecord.count({ where });

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
            },
            leaveEntitlements: {
              where: {
                year: new Date().getFullYear()
              },
              select: {
                id: true,
                allocatedDays: true,
                usedDays: true,
                leaveType: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { user: { firstName: 'asc' } }
      ],
      ...(usePagination
        ? {
            skip: (page - 1) * limit,
            take: limit
          }
        : {})
    });

    const totalPages = usePagination ? Math.max(Math.ceil(total / limit), 1) : (total > 0 ? 1 : 0);

    return {
      success: true,
      records,
      pagination: {
        page: usePagination ? page : 1,
        limit: usePagination ? limit : total,
        total,
        totalPages
      }
    };

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
    status?: "PRESENT" | "ABSENT" | "ON_LEAVE" | "WEEKLY_OFF";
    autoDeductedLeaveType?: string | null;
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

    const employeeForPenalty = await prisma.user.findUnique({
      where: { id: currentRecord.userId },
      select: {
        id: true,
        baseSalary: true,
        workingDaysInMonth: true,
      },
    });

    if (!employeeForPenalty) {
      return { success: false, error: 'Employee not found' };
    }

    const updateData: Prisma.DailyTimeRecordUpdateInput = {
      updatedAt: new Date()
    };

    const recordMidnight = new Date(currentRecord.date);
    recordMidnight.setHours(0, 0, 0, 0);

    // Update the provided fields
    if (data.requiredCheckIn !== undefined) updateData.requiredCheckIn = data.requiredCheckIn;
    if (data.requiredCheckOut !== undefined) updateData.requiredCheckOut = data.requiredCheckOut;
    if (data.requiredBreakTime !== undefined) updateData.requiredBreakTime = data.requiredBreakTime;
    if (data.actualCheckIn !== undefined) updateData.actualCheckIn = data.actualCheckIn;
    if (data.actualCheckOut !== undefined) updateData.actualCheckOut = data.actualCheckOut;
    if (data.actualBreakTime !== undefined) updateData.actualBreakTime = data.actualBreakTime;

    const finalStatus = data.status ?? currentRecord.status;
    const finalAutoDeductedLeaveType = finalStatus === "ON_LEAVE"
      ? (data.autoDeductedLeaveType !== undefined ? data.autoDeductedLeaveType : currentRecord.autoDeductedLeaveType)
      : null;

    if (data.status !== undefined) updateData.status = data.status;
    if (finalStatus === "ON_LEAVE") {
      updateData.autoDeductedLeaveType = finalAutoDeductedLeaveType;
    } else if (data.autoDeductedLeaveType !== undefined || currentRecord.autoDeductedLeaveType) {
      updateData.autoDeductedLeaveType = null;
    }

    const zeroedStatus = finalStatus === "ABSENT" || finalStatus === "ON_LEAVE" || finalStatus === "WEEKLY_OFF";

    if (zeroedStatus) {
      updateData.requiredCheckIn = recordMidnight;
      updateData.requiredCheckOut = recordMidnight;
      updateData.requiredBreakTime = "00:00";
      updateData.actualCheckIn = recordMidnight;
      updateData.actualCheckOut = recordMidnight;
      updateData.actualBreakTime = "00:00";
      updateData.requiredActiveTime = "00:00";
      updateData.actualActiveTime = "00:00";
      updateData.officialOvertimeundertime = "00:00";
      updateData.requestedOvertime = "00:00";
      updateData.overtimeUndertime = "00:00";
      updateData.lateCheckInMinutes = 0;
      updateData.lateCheckInPenalty = 0;
    }

    if (finalStatus === "ON_LEAVE" && !finalAutoDeductedLeaveType) {
      return { success: false, error: 'Leave type is required for On Leave status' };
    }

    // Determine final values for calculations (new values or existing ones)
    const finalRequiredCheckIn = zeroedStatus
      ? recordMidnight
      : (data.requiredCheckIn !== undefined ? data.requiredCheckIn : currentRecord.requiredCheckIn);
    const finalRequiredCheckOut = zeroedStatus
      ? recordMidnight
      : (data.requiredCheckOut !== undefined ? data.requiredCheckOut : currentRecord.requiredCheckOut);
    const finalRequiredBreakTime = zeroedStatus
      ? "00:00"
      : (data.requiredBreakTime !== undefined ? data.requiredBreakTime : currentRecord.requiredBreakTime);
    const finalActualCheckIn = zeroedStatus
      ? recordMidnight
      : (data.actualCheckIn !== undefined ? data.actualCheckIn : currentRecord.actualCheckIn);
    const finalActualCheckOut = zeroedStatus
      ? recordMidnight
      : (data.actualCheckOut !== undefined ? data.actualCheckOut : currentRecord.actualCheckOut);
    const finalActualBreakTime = zeroedStatus
      ? "00:00"
      : (data.actualBreakTime !== undefined ? data.actualBreakTime : currentRecord.actualBreakTime);

    const affectsLatePenalty =
      data.requiredCheckIn !== undefined ||
      data.requiredCheckOut !== undefined ||
      data.requiredBreakTime !== undefined ||
      data.actualCheckIn !== undefined;

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

    let recalculatedLateMinutes = 0;
    let recalculatedPenaltyAmount = 0;

    if (affectsLatePenalty && finalRequiredCheckIn && finalActualCheckIn) {
      recalculatedLateMinutes = Math.max(
        0,
        Math.floor((finalActualCheckIn.getTime() - finalRequiredCheckIn.getTime()) / (1000 * 60)),
      );

      const requiredActiveMinutes = getRequiredActiveMinutesForPenalty(
        finalRequiredCheckIn,
        finalRequiredCheckOut,
        finalRequiredBreakTime,
        (updateData.requiredActiveTime as string | undefined) ?? currentRecord.requiredActiveTime,
      );

      const workingDaysInMonth = employeeForPenalty.workingDaysInMonth || 22;
      const dailySalary = workingDaysInMonth > 0 ? (employeeForPenalty.baseSalary / workingDaysInMonth) : 0;
      const perMinuteRate = requiredActiveMinutes > 0 ? (dailySalary / requiredActiveMinutes) : 0;
      recalculatedPenaltyAmount = recalculatedLateMinutes > 0
        ? Number((perMinuteRate * recalculatedLateMinutes).toFixed(2))
        : 0;

      updateData.lateCheckInMinutes = recalculatedLateMinutes;
      updateData.lateCheckInPenalty = recalculatedPenaltyAmount;
    }
    const { record } = await prisma.$transaction(async (tx) => {
      let leaveAdjustment: LeaveAdjustmentResult = { applied: false };
      let absenceAdjustment: PenaltyAdjustmentResult = {
        applied: false,
        adjustedAmount: 0,
        direction: "DEBIT",
      };

      if (currentRecord.status === "ON_LEAVE" && finalStatus !== "ON_LEAVE") {
        leaveAdjustment = await reverseAutoLeaveDeductionOnTimelineEdit(tx, currentRecord);
      }

      if (currentRecord.status === "ABSENT" && finalStatus !== "ABSENT") {
        absenceAdjustment = await reverseAbsentPenaltyOnTimelineEdit(
          tx,
          currentRecord.userId,
          currentRecord.date,
        );
      }

      if (finalStatus === "ON_LEAVE" && !currentRecord.autoDeductedLeaveType) {
        const leaveTypeName = finalAutoDeductedLeaveType;
        if (!leaveTypeName) {
          throw new Error('Leave type is required for On Leave status');
        }

        const leaveType = await tx.leaveType.findFirst({
          where: { name: leaveTypeName },
          select: { id: true },
        });

        if (!leaveType) {
          throw new Error(`Leave type not found: ${leaveTypeName}`);
        }

        const entitlement = await tx.userLeaveEntitlement.findFirst({
          where: {
            userId: currentRecord.userId,
            leaveTypeId: leaveType.id,
            year: currentRecord.date.getFullYear(),
          },
        });

        if (!entitlement || entitlement.usedDays >= entitlement.allocatedDays) {
          throw new Error(`No leave balance available for ${leaveTypeName}`);
        }

        await tx.userLeaveEntitlement.update({
          where: { id: entitlement.id },
          data: { usedDays: entitlement.usedDays + 1 },
        });

        await tx.leaveAuditLog.create({
          data: {
            userId: currentRecord.userId,
            action: "MANUAL_LEAVE_DEDUCTION",
            description: `Manual on-leave status applied for ${getDateKey(currentRecord.date)} using ${leaveTypeName}`,
            affectedDate: currentRecord.date,
            leaveTypeId: leaveType.id,
            previousBalance: entitlement.allocatedDays - entitlement.usedDays,
            newBalance: entitlement.allocatedDays - (entitlement.usedDays + 1),
            deductedDays: 1,
            processingSource: "MANUAL",
            metadata: {
              timelineRecordId: currentRecord.id,
              status: "ON_LEAVE",
            },
          },
        });

        await tx.employeeNotification.create({
          data: {
            userId: currentRecord.userId,
            type: "MANUAL_LEAVE_DEDUCTION",
            title: "Leave Deducted",
            message: `1 day was deducted from ${leaveTypeName} for ${new Date(currentRecord.date).toLocaleDateString()}.`,
            relatedDate: currentRecord.date,
          },
        });
      }

      const updatedRecord = await tx.dailyTimeRecord.update({
        where: { id: recordId },
        data: updateData,
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      let adjustment: PenaltyAdjustmentResult = {
        applied: false,
        adjustedAmount: 0,
        direction: "DEBIT",
      };

      if (affectsLatePenalty) {
        adjustment = await reconcileLatePenaltyWalletOnTimelineEdit(
          tx,
          currentRecord.userId,
          currentRecord.date,
          recalculatedLateMinutes,
          recalculatedPenaltyAmount,
        );

        if (adjustment.applied) {

      if (leaveAdjustment.applied) {
        await tx.employeeNotification.create({
          data: {
            userId: currentRecord.userId,
            type: "MANUAL_LEAVE_ADJUSTMENT",
            title: "Leave Adjustment Applied",
            message: `Your manually corrected timeline on ${new Date(currentRecord.date).toLocaleDateString()} reversed the previously deducted ${leaveAdjustment.leaveTypeName || "leave"}.`,
            relatedDate: currentRecord.date,
          },
        });
      }

      if (absenceAdjustment.applied) {
        await tx.employeeNotification.create({
          data: {
            userId: currentRecord.userId,
            type: "MANUAL_ABSENCE_ADJUSTMENT",
            title: "Absence Penalty Reversed",
            message: `Your manually corrected timeline on ${new Date(currentRecord.date).toLocaleDateString()} reversed the absence penalty adjustment.`,
            relatedDate: currentRecord.date,
          },
        });
      }
          const message = adjustment.direction === "DEBIT"
            ? `A penalty of ৳${adjustment.adjustedAmount.toFixed(2)} was applied after timeline update (${recalculatedLateMinutes} minutes late on ${new Date(currentRecord.date).toLocaleDateString()}).`
            : `A penalty correction of ৳${adjustment.adjustedAmount.toFixed(2)} was credited after timeline update for ${new Date(currentRecord.date).toLocaleDateString()}.`;

          await tx.employeeNotification.create({
            data: {
              userId: currentRecord.userId,
              type: "LATE_CHECKIN_PENALTY",
              title: "Late Check-in Penalty Updated",
              message,
              relatedDate: currentRecord.date,
            },
          });
        }
      }

      return { record: updatedRecord, penaltyAdjustment: adjustment };
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