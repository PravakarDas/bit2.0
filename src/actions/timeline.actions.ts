"use server";

import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { createAdminNotification } from "./notification.actions";
import { Prisma, type DailyTimeRecord, type DailyRecordStatus } from "@prisma/client";
import { getDbUser } from "./user.actions";
import { buildDateRangeFilter } from "@/lib/utils";
import { isArchivedStatus } from "@/lib/employee-status";
import { parseDurationToMinutes } from "@/lib/duration";

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
  const legacyDateKey = getUtcDateKey(date);
  const penaltyTag = `Late check-in penalty for ${dateKey}`;
  const legacyPenaltyTag = `Late check-in penalty for ${legacyDateKey}`;

  const priorPenaltyTransactions = await tx.walletTransaction.findMany({
    where: {
      userId,
      type: "ADJUSTMENT",
      OR: [
        {
          description: {
            contains: penaltyTag,
          },
        },
        {
          description: {
            contains: legacyPenaltyTag,
          },
        },
      ],
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

async function reverseLatePenaltyOnTimeline(
  tx: Prisma.TransactionClient,
  userId: string,
  date: Date,
): Promise<PenaltyAdjustmentResult> {
  const dateKey = getDateKey(date);
  const legacyDateKey = getUtcDateKey(date);
  const penaltyTag = `Late check-in penalty for ${dateKey}`;
  const legacyPenaltyTag = `Late check-in penalty for ${legacyDateKey}`;
  const reversalTag = `Manual late check-in penalty reversal for ${dateKey}`;

  const priorPenaltyTransactions = await tx.walletTransaction.findMany({
    where: {
      userId,
      type: "ADJUSTMENT",
      OR: [
        { description: { contains: penaltyTag } },
        { description: { contains: legacyPenaltyTag } },
      ],
    },
    select: { amount: true },
  });

  const alreadyReversed = await tx.walletTransaction.findMany({
    where: {
      userId,
      type: "ADJUSTMENT",
      description: { contains: reversalTag },
    },
    select: { amount: true },
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

  const outstanding = Number((originalPenalty - reversedAmount).toFixed(2));
  if (outstanding <= 0.01) {
    return { applied: false, adjustedAmount: 0, direction: "CREDIT" };
  }

  await tx.user.update({
    where: { id: userId },
    data: { walletBalance: { increment: outstanding } },
  });

  await tx.walletTransaction.create({
    data: {
      userId,
      amount: outstanding,
      type: "ADJUSTMENT",
      description: reversalTag,
    },
  });

  return {
    applied: true,
    adjustedAmount: outstanding,
    direction: "CREDIT",
  };
}

async function reverseAbsentPenaltyOnTimelineEdit(
  tx: Prisma.TransactionClient,
  userId: string,
  date: Date,
): Promise<PenaltyAdjustmentResult> {
  const dateKey = getDateKey(date);
  const legacyDateKey = getUtcDateKey(date);
  const penaltyTag = `Absent without leave penalty for ${dateKey}`;
  const legacyPenaltyTag = `Absent without leave penalty for ${legacyDateKey}`;

  const priorPenaltyTransactions = await tx.walletTransaction.findMany({
    where: {
      userId,
      type: "ADJUSTMENT",
      OR: [
        {
          description: {
            contains: penaltyTag,
          },
        },
        {
          description: {
            contains: legacyPenaltyTag,
          },
        },
      ],
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

async function applyAbsentPenaltyOnTimelineEdit(
  tx: Prisma.TransactionClient,
  userId: string,
  date: Date,
  penaltyAmount: number,
): Promise<PenaltyAdjustmentResult> {
  const dateKey = getDateKey(date);
  const legacyDateKey = getUtcDateKey(date);
  const penaltyTag = `Absent without leave penalty for ${dateKey}`;
  const legacyPenaltyTag = `Absent without leave penalty for ${legacyDateKey}`;

  const priorPenaltyTransactions = await tx.walletTransaction.findMany({
    where: {
      userId,
      type: "ADJUSTMENT",
      OR: [
        {
          description: {
            contains: penaltyTag,
          },
        },
        {
          description: {
            contains: legacyPenaltyTag,
          },
        },
      ],
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

  const activePenaltyAmount = Number((originalPenalty - reversedAmount).toFixed(2));
  if (activePenaltyAmount > 0.01) {
    return { applied: false, adjustedAmount: 0, direction: "DEBIT" };
  }

  const adjustmentAmount = Number(Math.max(0, penaltyAmount).toFixed(2));
  if (adjustmentAmount <= 0) {
    return { applied: false, adjustedAmount: 0, direction: "DEBIT" };
  }

  await tx.user.update({
    where: { id: userId },
    data: { walletBalance: { decrement: adjustmentAmount } },
  });

  await tx.walletTransaction.create({
    data: {
      userId,
      amount: -adjustmentAmount,
      type: "ADJUSTMENT",
      description: penaltyTag,
    },
  });

  return {
    applied: true,
    adjustedAmount: adjustmentAmount,
    direction: "DEBIT",
  };
}

async function reverseAutoLeaveDeductionOnTimelineEdit(
  tx: Prisma.TransactionClient,
  currentRecord: DailyTimeRecord,
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

export async function adjustLeaveType(
  recordId: string,
  newLeaveTypeName: string,
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

    const currentRecord = await prisma.dailyTimeRecord.findUnique({
      where: { id: recordId },
    });

    if (!currentRecord) {
      return { success: false, error: 'Timeline record not found' };
    }

    if (currentRecord.status !== 'ON_LEAVE') {
      return { success: false, error: 'Only on-leave records can be switched' };
    }

    const currentLeaveTypeName = currentRecord.autoDeductedLeaveType;

    if (!currentLeaveTypeName) {
      return { success: false, error: 'Current leave type is missing' };
    }

    if (currentLeaveTypeName === newLeaveTypeName) {
      return { success: true, message: 'Leave type unchanged' };
    }

    const result = await prisma.$transaction(async (tx) => {
      const currentLeaveType = await tx.leaveType.findFirst({
        where: { name: currentLeaveTypeName },
        select: { id: true, name: true },
      });

      const targetLeaveType = await tx.leaveType.findFirst({
        where: { name: newLeaveTypeName },
        select: { id: true, name: true },
      });

      if (!currentLeaveType) {
        throw new Error(`Leave type not found: ${currentLeaveTypeName}`);
      }

      if (!targetLeaveType) {
        throw new Error(`Leave type not found: ${newLeaveTypeName}`);
      }

      const currentEntitlement = await tx.userLeaveEntitlement.findFirst({
        where: {
          userId: currentRecord.userId,
          leaveTypeId: currentLeaveType.id,
          year: currentRecord.date.getFullYear(),
        },
      });

      if (!currentEntitlement) {
        throw new Error(`No entitlement found for ${currentLeaveType.name}`);
      }

      const targetEntitlement = await tx.userLeaveEntitlement.findFirst({
        where: {
          userId: currentRecord.userId,
          leaveTypeId: targetLeaveType.id,
          year: currentRecord.date.getFullYear(),
        },
      });

      if (!targetEntitlement || targetEntitlement.usedDays >= targetEntitlement.allocatedDays) {
        throw new Error(`No leave balance available for ${newLeaveTypeName}`);
      }

      const restoredCurrentUsedDays = Math.max(0, currentEntitlement.usedDays - 1);
      const targetUsedDays = targetEntitlement.usedDays + 1;

      await tx.userLeaveEntitlement.update({
        where: { id: currentEntitlement.id },
        data: { usedDays: restoredCurrentUsedDays },
      });

      await tx.userLeaveEntitlement.update({
        where: { id: targetEntitlement.id },
        data: { usedDays: targetUsedDays },
      });

      await tx.leaveAuditLog.create({
        data: {
          userId: currentRecord.userId,
          action: "MANUAL_LEAVE_ADJUSTMENT",
          description: `Manual timeline correction restored ${currentLeaveType.name} and applied ${targetLeaveType.name} for ${getDateKey(currentRecord.date)}`,
          affectedDate: currentRecord.date,
          leaveTypeId: currentLeaveType.id,
          previousBalance: currentEntitlement.allocatedDays - currentEntitlement.usedDays,
          newBalance: currentEntitlement.allocatedDays - restoredCurrentUsedDays,
          deductedDays: -1,
          processingSource: "MANUAL",
          metadata: {
            timelineRecordId: currentRecord.id,
            originalLeaveTypeName: currentLeaveType.name,
            switchedToLeaveTypeName: targetLeaveType.name,
            action: "RESTORE_CURRENT_AND_APPLY_NEW",
          },
        },
      });

      await tx.leaveAuditLog.create({
        data: {
          userId: currentRecord.userId,
          action: "MANUAL_LEAVE_ADJUSTMENT",
          description: `Manual timeline correction applied ${targetLeaveType.name} for ${getDateKey(currentRecord.date)}`,
          affectedDate: currentRecord.date,
          leaveTypeId: targetLeaveType.id,
          previousBalance: targetEntitlement.allocatedDays - targetEntitlement.usedDays,
          newBalance: targetEntitlement.allocatedDays - targetUsedDays,
          deductedDays: 1,
          processingSource: "MANUAL",
          metadata: {
            timelineRecordId: currentRecord.id,
            originalLeaveTypeName: currentLeaveType.name,
            switchedToLeaveTypeName: targetLeaveType.name,
            action: "RESTORE_CURRENT_AND_APPLY_NEW",
          },
        },
      });

      await tx.dailyTimeRecord.update({
        where: { id: recordId },
        data: {
          autoDeductedLeaveType: newLeaveTypeName,
        },
      });

      await tx.employeeNotification.create({
        data: {
          userId: currentRecord.userId,
          type: "MANUAL_LEAVE_ADJUSTMENT",
          title: "Leave Type Updated",
          message: `Your leave was changed from ${currentLeaveType.name} to ${targetLeaveType.name} for ${new Date(currentRecord.date).toLocaleDateString()}.`,
          relatedDate: currentRecord.date,
        },
      });

      return {
        success: true,
        message: `Leave type changed from ${currentLeaveType.name} to ${targetLeaveType.name}`,
      };
    }, {
      timeout: 15000,
    });

    revalidatePath('/admin/timeline');
    revalidatePath('/manager/timeline');
    revalidatePath('/dashboard');

    return result;
  } catch (error) {
    console.error('Error adjusting leave type:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to adjust leave type' };
  }
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

function getUtcDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Batch-annotates timeline records with their late-penalty wallet reversal
 * state, using the same tag-diff bookkeeping as reverseLatePenaltyOnTimeline,
 * so the Timeline UI can show/hide/disable the "Reverse Late Penalty" action
 * without an extra DB column.
 */
async function attachLatePenaltyReversalStatus<
  T extends { userId: string; date: Date; lateCheckInPenalty: number | null }
>(records: T[]): Promise<(T & { latePenaltyReversible: boolean; latePenaltyReversed: boolean })[]> {
  const userIds = [...new Set(records.filter((r) => (r.lateCheckInPenalty ?? 0) > 0).map((r) => r.userId))];

  if (userIds.length === 0) {
    return records.map((record) => ({ ...record, latePenaltyReversible: false, latePenaltyReversed: false }));
  }

  const walletTransactions = await prisma.walletTransaction.findMany({
    where: {
      userId: { in: userIds },
      type: "ADJUSTMENT",
      description: { contains: "Late check-in penalty" },
    },
    select: { userId: true, amount: true, description: true },
  });

  return records.map((record) => {
    if ((record.lateCheckInPenalty ?? 0) <= 0) {
      return { ...record, latePenaltyReversible: false, latePenaltyReversed: false };
    }

    const dateKey = getDateKey(record.date);
    const legacyDateKey = getUtcDateKey(record.date);
    const penaltyTag = `Late check-in penalty for ${dateKey}`;
    const legacyPenaltyTag = `Late check-in penalty for ${legacyDateKey}`;
    const reversalTag = `Manual late check-in penalty reversal for ${dateKey}`;

    let originalPenalty = 0;
    let reversedAmount = 0;
    for (const txn of walletTransactions) {
      if (txn.userId !== record.userId) continue;
      if (txn.description.includes(reversalTag)) {
        if (txn.amount > 0) reversedAmount += txn.amount;
      } else if (txn.description.includes(penaltyTag) || txn.description.includes(legacyPenaltyTag)) {
        if (txn.amount < 0) originalPenalty += Math.abs(txn.amount);
      }
    }

    if (originalPenalty <= 0.01) {
      return { ...record, latePenaltyReversible: false, latePenaltyReversed: false };
    }

    const outstanding = Number((originalPenalty - reversedAmount).toFixed(2));
    return {
      ...record,
      latePenaltyReversible: outstanding > 0.01,
      latePenaltyReversed: outstanding <= 0.01,
    };
  });
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

    const isWeeklyOff = await isWeekendForEmployee(employee.id, normalizedDate);
    if (isWeeklyOff) {
      const recordData = {
        userId: employee.id,
        date: normalizedDate,
        status: "WEEKLY_OFF" as const,
        requiredCheckIn: null,
        requiredCheckOut: null,
        requiredBreakTime: "00:00",
        actualCheckIn: null,
        actualCheckOut: null,
        actualBreakTime: "00:00",
        requiredActiveTime: "00:00",
        actualActiveTime: "00:00",
        officialOvertimeundertime: "00:00",
        requestedOvertime: "00:00",
        overtimeUndertime: "00:00",
        isProcessed: true,
      };

      await prisma.dailyTimeRecord.create({
        data: recordData,
      });

      await prisma.leaveAuditLog.create({
        data: {
          userId: employee.id,
          action: "WEEKLY_OFF_SET",
          description: `Weekly off day automatically set for ${format(normalizedDate, 'EEEE, MMMM d, yyyy')}`,
          affectedDate: normalizedDate,
          processingSource: "SYSTEM",
        },
      });

      await prisma.employeeNotification.create({
        data: {
          userId: employee.id,
          type: "WEEKLY_OFF_SET",
          title: "Weekly Off Day",
          message: `${format(normalizedDate, 'EEEE, MMMM d, yyyy')} has been set as your weekly off day.`,
          relatedDate: normalizedDate,
        },
      });

      console.log(`Created weekly off record for ${employeeName} on ${normalizedDate.toDateString()}`);
      return { created: true };
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

    // Get all active employees (exclude archived employees)
    const activeEmployees = await prisma.user.findMany({
      where: {
        status: 'APPROVED',
        role: 'EMPLOYEE',
        isArchived: false  // Only generate timeline for active employees
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
        role: 'EMPLOYEE',
        isArchived: false  // Only backfill for active employees
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
        role: 'EMPLOYEE',
        isArchived: false  // Only check for active employees
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

export type TimelineSortField =
  | "employee"
  | "branch"
  | "date"
  | "status"
  | "checkIn"
  | "checkOut"
  | "lateMinutes"
  | "activeTime"
  | "otUt";

const DB_NATIVE_SORT_FIELDS: readonly TimelineSortField[] = [
  "employee",
  "branch",
  "date",
  "status",
  "lateMinutes",
];

function timeOfDayMinutes(date: Date | null): number | null {
  if (!date) return null;
  return date.getHours() * 60 + date.getMinutes();
}

function parseTimeOfDay(value: string | undefined): number | null {
  if (!value) return null;
  const [hoursStr, minutesStr] = value.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Get timeline records for a specific user and date range.
 *
 * Sorting/filtering runs in two tiers:
 *  - DB-native tier (branch/employee/date/status/lateMinutes): applied via
 *    Prisma where/orderBy with DB-level pagination — same performance as before.
 *  - In-memory tier (checkIn/checkOut time-of-day, activeTime/otUt ranges,
 *    and sorting by any of those): engaged only when actually requested,
 *    since those values aren't stored as directly comparable DB columns
 *    (durations are "HH:MM" strings; check-in/out time-of-day ignores the
 *    date part). This fetches the DB-filtered set without skip/take and
 *    paginates in Node. Acceptable for this tool's realistic data volumes
 *    (a filtered branch/date range), not intended for unbounded datasets.
 */
export async function getTimelineRecords(
  userId?: string,
  startDate?: string | Date,
  endDate?: string | Date,
  options?: {
    branchId?: string;
    branchIds?: string[];
    employeeName?: string;
    employeeIds?: string[];
    statuses?: (DailyRecordStatus | "BLANK")[];
    page?: number;
    limit?: number;
    sortBy?: TimelineSortField;
    sortOrder?: "asc" | "desc";
    lateMinutesMin?: number;
    lateMinutesMax?: number;
    checkInFrom?: string;
    checkInTo?: string;
    checkOutFrom?: string;
    checkOutTo?: string;
    activeTimeMin?: number;
    activeTimeMax?: number;
    otUtMin?: number;
    otUtMax?: number;
  }
) {
  try {
    const actor = await getDbUser();
    if (!actor) {
      return { success: false, error: "Unauthorized" };
    }

    const isSelfTimelineView = actor.role === "EMPLOYEE" && !actor.isManager;
    const canAccessTimeline = actor.role === "SUPERADMIN" || actor.role === "HR" || actor.isManager || isSelfTimelineView;
    if (!canAccessTimeline) {
      return { success: false, error: "Unauthorized" };
    }

    const where: Prisma.DailyTimeRecordWhereInput = {};

    if (isSelfTimelineView) {
      where.userId = actor.id;
    } else if (options?.employeeIds && options.employeeIds.length > 0) {
      where.userId = { in: options.employeeIds };
    } else if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      const dateFilter = buildDateRangeFilter(startDate, endDate);
      if (dateFilter) {
        where.date = dateFilter;
      }
    }

    const branchIds = options?.branchIds && options.branchIds.length > 0
      ? options.branchIds
      : (options?.branchId ? [options.branchId] : undefined);

    if (branchIds || options?.employeeName) {
      where.user = {};
      if (branchIds) {
        where.user.branchId = { in: branchIds };
      }

      if (options?.employeeName) {
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

    if (options?.statuses && options.statuses.length > 0) {
      const includeBlank = options.statuses.includes("BLANK");
      const realStatuses = options.statuses.filter((s): s is DailyRecordStatus => s !== "BLANK");

      if (includeBlank && realStatuses.length > 0) {
        where.OR = [
          { status: { in: realStatuses } },
          { isProcessed: false },
        ];
      } else if (includeBlank) {
        where.isProcessed = false;
      } else {
        where.status = { in: realStatuses };
      }
    }

    if (options?.lateMinutesMin !== undefined || options?.lateMinutesMax !== undefined) {
      where.lateCheckInMinutes = {
        ...(options.lateMinutesMin !== undefined ? { gte: options.lateMinutesMin } : {}),
        ...(options.lateMinutesMax !== undefined ? { lte: options.lateMinutesMax } : {}),
      };
    }

    const page = Math.max(options?.page || 1, 1);
    const limit = Math.max(options?.limit || 0, 0);
    const usePagination = limit > 0;
    const sortBy = options?.sortBy;
    const sortOrder = options?.sortOrder || "asc";

    const needsInMemoryTier = Boolean(
      (sortBy && !DB_NATIVE_SORT_FIELDS.includes(sortBy)) ||
      options?.checkInFrom || options?.checkInTo ||
      options?.checkOutFrom || options?.checkOutTo ||
      options?.activeTimeMin !== undefined || options?.activeTimeMax !== undefined ||
      options?.otUtMin !== undefined || options?.otUtMax !== undefined
    );

    const include = {
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
    } satisfies Prisma.DailyTimeRecordInclude;

    const dbOrderBy: Prisma.DailyTimeRecordOrderByWithRelationInput[] = (() => {
      if (!sortBy || !DB_NATIVE_SORT_FIELDS.includes(sortBy)) {
        return [{ date: 'desc' }, { user: { firstName: 'asc' } }];
      }
      switch (sortBy) {
        case "employee":
          return [{ user: { firstName: sortOrder } }, { user: { lastName: sortOrder } }];
        case "branch":
          return [{ user: { branch: { name: sortOrder } } }];
        case "status":
          return [{ status: sortOrder }, { date: 'desc' }];
        case "lateMinutes":
          return [{ lateCheckInMinutes: sortOrder }, { date: 'desc' }];
        case "date":
        default:
          return [{ date: sortOrder }, { user: { firstName: 'asc' } }];
      }
    })();

    const total = await prisma.dailyTimeRecord.count({ where });

    if (!needsInMemoryTier) {
      const records = await prisma.dailyTimeRecord.findMany({
        where,
        include,
        orderBy: dbOrderBy,
        ...(usePagination
          ? {
              skip: (page - 1) * limit,
              take: limit
            }
          : {})
      });

      const totalPages = usePagination ? Math.max(Math.ceil(total / limit), 1) : (total > 0 ? 1 : 0);
      const annotatedRecords = await attachLatePenaltyReversalStatus(records);

      return {
        success: true,
        records: annotatedRecords,
        pagination: {
          page: usePagination ? page : 1,
          limit: usePagination ? limit : total,
          total,
          totalPages
        }
      };
    }

    // In-memory tier: fetch the full DB-filtered set, then filter/sort/paginate in Node.
    const allRecords = await prisma.dailyTimeRecord.findMany({
      where,
      include,
      orderBy: [{ date: 'desc' }, { user: { firstName: 'asc' } }]
    });

    const checkInFromMin = parseTimeOfDay(options?.checkInFrom);
    const checkInToMin = parseTimeOfDay(options?.checkInTo);
    const checkOutFromMin = parseTimeOfDay(options?.checkOutFrom);
    const checkOutToMin = parseTimeOfDay(options?.checkOutTo);

    let filtered = allRecords.filter((record) => {
      if (checkInFromMin !== null || checkInToMin !== null) {
        const minutes = timeOfDayMinutes(record.actualCheckIn);
        if (minutes === null) return false;
        if (checkInFromMin !== null && minutes < checkInFromMin) return false;
        if (checkInToMin !== null && minutes > checkInToMin) return false;
      }
      if (checkOutFromMin !== null || checkOutToMin !== null) {
        const minutes = timeOfDayMinutes(record.actualCheckOut);
        if (minutes === null) return false;
        if (checkOutFromMin !== null && minutes < checkOutFromMin) return false;
        if (checkOutToMin !== null && minutes > checkOutToMin) return false;
      }
      if (options?.activeTimeMin !== undefined || options?.activeTimeMax !== undefined) {
        const minutes = parseDurationToMinutes(record.actualActiveTime);
        if (minutes === null) return false;
        if (options.activeTimeMin !== undefined && minutes < options.activeTimeMin) return false;
        if (options.activeTimeMax !== undefined && minutes > options.activeTimeMax) return false;
      }
      if (options?.otUtMin !== undefined || options?.otUtMax !== undefined) {
        const minutes = parseDurationToMinutes(record.overtimeUndertime);
        if (minutes === null) return false;
        if (options.otUtMin !== undefined && minutes < options.otUtMin) return false;
        if (options.otUtMax !== undefined && minutes > options.otUtMax) return false;
      }
      return true;
    });

    if (sortBy && !DB_NATIVE_SORT_FIELDS.includes(sortBy)) {
      const direction = sortOrder === "desc" ? -1 : 1;
      const key = (record: DailyTimeRecord): number => {
        switch (sortBy) {
          case "checkIn":
            return timeOfDayMinutes(record.actualCheckIn) ?? -Infinity;
          case "checkOut":
            return timeOfDayMinutes(record.actualCheckOut) ?? -Infinity;
          case "activeTime":
            return parseDurationToMinutes(record.actualActiveTime) ?? -Infinity;
          case "otUt":
            return parseDurationToMinutes(record.overtimeUndertime) ?? -Infinity;
          default:
            return 0;
        }
      };
      filtered = [...filtered].sort((a, b) => (key(a) - key(b)) * direction);
    }

    const filteredTotal = filtered.length;
    const pagedRecords = usePagination
      ? filtered.slice((page - 1) * limit, (page - 1) * limit + limit)
      : filtered;
    const totalPages = usePagination ? Math.max(Math.ceil(filteredTotal / limit), 1) : (filteredTotal > 0 ? 1 : 0);
    const annotatedRecords = await attachLatePenaltyReversalStatus(pagedRecords);

    return {
      success: true,
      records: annotatedRecords,
      pagination: {
        page: usePagination ? page : 1,
        limit: usePagination ? limit : filteredTotal,
        total: filteredTotal,
        totalPages
      }
    };

  } catch (error) {
    console.error('Error fetching timeline records:', error);
    return { success: false, error: 'Failed to fetch timeline records' };
  }
}

/**
 * Get the most recent date that has been processed (isProcessed = true) for a
 * user, ignoring any period filter. Used on the employee timeline to show
 * "data processed up to" so the employee knows how current the data is.
 */
export async function getLatestProcessedTimelineDate(userId?: string) {
  try {
    const actor = await getDbUser();
    if (!actor) {
      return { success: false, error: "Unauthorized", date: null as Date | null };
    }

    const isSelfTimelineView = actor.role === "EMPLOYEE" && !actor.isManager;
    const canAccess =
      actor.role === "SUPERADMIN" || actor.role === "HR" || actor.isManager || isSelfTimelineView;
    if (!canAccess) {
      return { success: false, error: "Unauthorized", date: null as Date | null };
    }

    // Employees can only ever read their own latest processed date.
    const targetUserId = isSelfTimelineView ? actor.id : userId;
    if (!targetUserId) {
      return { success: false, error: "User not specified", date: null as Date | null };
    }

    // Weekly-off days are also marked isProcessed, but a processed weekly-off
    // doesn't reflect how current the actual attendance data is. Exclude them so
    // the reported date is the latest processed *attendance* day.
    const latest = await prisma.dailyTimeRecord.findFirst({
      where: { userId: targetUserId, isProcessed: true, status: { not: "WEEKLY_OFF" } },
      orderBy: { date: "desc" },
      select: { date: true },
    });

    return { success: true, date: latest?.date ?? null };
  } catch (error) {
    console.error("Error fetching latest processed timeline date:", error);
    return { success: false, error: "Failed to fetch latest processed date", date: null as Date | null };
  }
}

/**
 * Update a specific timeline record
 */
type TimelineRecordTransactionInput = {
  requiredCheckIn?: Date | null;
  requiredCheckOut?: Date | null;
  requiredBreakTime?: string | null;
  actualCheckIn?: Date | null;
  actualCheckOut?: Date | null;
  actualBreakTime?: string | null;
  status?: "PRESENT" | "ABSENT" | "ON_LEAVE" | "WEEKLY_OFF";
  autoDeductedLeaveType?: string | null;
  notes?: string | null;
  isProcessed?: boolean;
};

export async function updateTimelineRecordInTransaction(
  tx: Prisma.TransactionClient,
  recordId: string,
  data: TimelineRecordTransactionInput,
) {
  const currentRecord = await tx.dailyTimeRecord.findUnique({
    where: { id: recordId },
  });

  if (!currentRecord) {
    return { success: false, error: 'Timeline record not found' };
  }

  const employeeForPenalty = await tx.user.findUnique({
    where: { id: currentRecord.userId },
    select: {
      id: true,
      baseSalary: true,
      workingDaysInMonth: true,
      branch: {
        select: { isLatePenaltyEnabled: true },
      },
    },
  });

  if (!employeeForPenalty) {
    return { success: false, error: 'Employee not found' };
  }

  const latePenaltyEnabled = employeeForPenalty.branch?.isLatePenaltyEnabled ?? true;
  const workingDaysInMonth = employeeForPenalty.workingDaysInMonth || 22;
  const dailySalary = workingDaysInMonth > 0 ? (employeeForPenalty.baseSalary / workingDaysInMonth) : 0;
  const absentPenaltyAmount = Number(dailySalary.toFixed(2));

  const updateData: Prisma.DailyTimeRecordUpdateInput = {
    updatedAt: new Date(),
  };

  const recordMidnight = new Date(currentRecord.date);
  recordMidnight.setHours(0, 0, 0, 0);

  if (data.requiredCheckIn !== undefined) updateData.requiredCheckIn = data.requiredCheckIn;
  if (data.requiredCheckOut !== undefined) updateData.requiredCheckOut = data.requiredCheckOut;
  if (data.requiredBreakTime !== undefined) updateData.requiredBreakTime = data.requiredBreakTime;
  if (data.actualCheckIn !== undefined) updateData.actualCheckIn = data.actualCheckIn;
  if (data.actualCheckOut !== undefined) updateData.actualCheckOut = data.actualCheckOut;
  if (data.actualBreakTime !== undefined) updateData.actualBreakTime = data.actualBreakTime;
  if (data.isProcessed !== undefined) updateData.isProcessed = data.isProcessed;

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

  if (finalRequiredCheckIn && finalRequiredCheckOut) {
    updateData.requiredActiveTime = calculateActiveTime(
      finalRequiredCheckIn,
      finalRequiredCheckOut,
      finalRequiredBreakTime || '00:00'
    );
  }

  if (finalActualCheckIn && finalActualCheckOut) {
    updateData.actualActiveTime = calculateActiveTime(
      finalActualCheckIn,
      finalActualCheckOut,
      finalActualBreakTime || '00:00'
    );

    const requiredActiveTime = updateData.requiredActiveTime || currentRecord.requiredActiveTime;
    const actualActiveTime = updateData.actualActiveTime;
    if (typeof requiredActiveTime === 'string' && typeof actualActiveTime === 'string') {
      // overtimeUndertime = actualActiveTime - requiredActiveTime (office/clock-based)
      updateData.overtimeUndertime = calculateOvertimeUndertime(
        actualActiveTime,
        requiredActiveTime
      );

      // officialOvertimeundertime = overtimeUndertime + requestedOvertime (grand total)
      const requestedOvertime = currentRecord.requestedOvertime || '00:00';
      updateData.officialOvertimeundertime = addTimeStrings(
        updateData.overtimeUndertime,
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

    const perMinuteRate = requiredActiveMinutes > 0 ? (dailySalary / requiredActiveMinutes) : 0;
    recalculatedPenaltyAmount = recalculatedLateMinutes > 0
      ? Number((perMinuteRate * recalculatedLateMinutes).toFixed(2))
      : 0;

    updateData.lateCheckInMinutes = recalculatedLateMinutes;
    updateData.lateCheckInPenalty = recalculatedPenaltyAmount;
  }

  let leaveAdjustment: LeaveAdjustmentResult = { applied: false };
  const shouldReconcilePenalties = affectsLatePenalty &&
    finalStatus !== "ON_LEAVE";
  const shouldApplyAbsentPenalty = currentRecord.status !== "ABSENT" && finalStatus === "ABSENT";
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

  if (shouldApplyAbsentPenalty) {
    absenceAdjustment = await applyAbsentPenaltyOnTimelineEdit(
      tx,
      currentRecord.userId,
      currentRecord.date,
      absentPenaltyAmount,
    );

    if (absenceAdjustment.applied) {
      await tx.employeeNotification.create({
        data: {
          userId: currentRecord.userId,
          type: "MANUAL_ABSENCE_ADJUSTMENT",
          title: "Absence Penalty Applied",
          message: `Your timeline was updated to Absent on ${new Date(currentRecord.date).toLocaleDateString()}. ৳${absenceAdjustment.adjustedAmount.toFixed(2)} was deducted from your wallet.`,
          relatedDate: currentRecord.date,
        },
      });
    }
  }

  if (finalStatus === "ON_LEAVE" && !currentRecord.autoDeductedLeaveType) {
    const leaveTypeName = finalAutoDeductedLeaveType;
    if (!leaveTypeName) {
      return { success: false, error: 'Leave type is required for On Leave status' };
    }

    const leaveType = await tx.leaveType.findFirst({
      where: { name: leaveTypeName },
      select: { id: true },
    });

    if (!leaveType) {
      return { success: false, error: `Leave type not found: ${leaveTypeName}` };
    }

    const entitlement = await tx.userLeaveEntitlement.findFirst({
      where: {
        userId: currentRecord.userId,
        leaveTypeId: leaveType.id,
        year: currentRecord.date.getFullYear(),
      },
    });

    if (!entitlement || entitlement.usedDays >= entitlement.allocatedDays) {
      return { success: false, error: `No leave balance available for ${leaveTypeName}` };
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

  if (shouldReconcilePenalties && recalculatedLateMinutes > 0 && latePenaltyEnabled) {
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

  return { success: true, record: updatedRecord, penaltyAdjustment: adjustment };
}

/**
 * Admin/manager toggle of a record's processed status.
 *
 * - Marking PROCESSED simply flags the day as handled.
 * - Marking UNPROCESSED performs a full reset so the server can re-fetch the day:
 *   it nulls the actual check-in/out (+break) and their derived values, resets the
 *   status to PRESENT with the branch's required times restored, clears any late
 *   penalty, and reverses any wallet/leave effect that was applied for that day
 *   (late penalty, absent penalty, or auto leave deduction). The ZKTeco sync /
 *   leave automation then re-evaluates the day from scratch.
 */
export async function setTimelineRecordProcessed(recordId: string, isProcessed: boolean) {
  try {
    const actor = await getDbUser();
    if (!actor) {
      return { success: false, error: 'Unauthorized' };
    }

    const canUpdateTimeline = actor.role === "SUPERADMIN" || actor.role === "HR" || (actor.role === "EMPLOYEE" && actor.isManager);
    if (!canUpdateTimeline) {
      return { success: false, error: 'Unauthorized' };
    }

    const record = await prisma.dailyTimeRecord.findUnique({ where: { id: recordId } });
    if (!record) {
      return { success: false, error: 'Timeline record not found' };
    }

    if (record.isProcessed === isProcessed) {
      return { success: true };
    }

    if (isProcessed) {
      // Mark as processed (admin/manager asserts the day is handled).
      await prisma.dailyTimeRecord.update({
        where: { id: recordId },
        data: { isProcessed: true, updatedAt: new Date() },
      });
    } else {
      // Un-process → full reset to a re-fetchable PRESENT day.
      const employee = await prisma.user.findUnique({
        where: { id: record.userId },
        select: { branch: { select: { checkInTime: true, checkOutTime: true, breakDuration: true } } },
      });

      const { year, month, day } = getBangladeshDateParts(record.date);
      const [checkInHour, checkInMin] = (employee?.branch?.checkInTime || '09:00').split(':').map(Number);
      const [checkOutHour, checkOutMin] = (employee?.branch?.checkOutTime || '18:00').split(':').map(Number);
      const requiredCheckIn = createBangladeshDateTime(year, month, day, checkInHour, checkInMin);
      const requiredCheckOut = createBangladeshDateTime(year, month, day, checkOutHour, checkOutMin);
      const requiredBreakTime = employee?.branch?.breakDuration || '01:00';
      const requiredActiveTime = calculateActiveTime(requiredCheckIn, requiredCheckOut, requiredBreakTime);

      await prisma.$transaction(async (tx) => {
        // Reverse any wallet/leave effect applied when this day was processed.
        await reconcileLatePenaltyWalletOnTimelineEdit(tx, record.userId, record.date, 0, 0);
        if (record.status === "ABSENT") {
          await reverseAbsentPenaltyOnTimelineEdit(tx, record.userId, record.date);
        }
        if (record.status === "ON_LEAVE") {
          await reverseAutoLeaveDeductionOnTimelineEdit(tx, record);
        }

        await tx.dailyTimeRecord.update({
          where: { id: recordId },
          data: {
            isProcessed: false,
            status: "PRESENT",
            requiredCheckIn,
            requiredCheckOut,
            requiredBreakTime,
            requiredActiveTime,
            // Clear actuals + derived values so the server can re-fetch this day.
            actualCheckIn: null,
            actualCheckOut: null,
            actualBreakTime: null,
            actualActiveTime: null,
            overtimeUndertime: null,
            officialOvertimeundertime: null,
            lateCheckInMinutes: 0,
            lateCheckInPenalty: 0,
            autoDeductedLeaveType: null,
            updatedAt: new Date(),
          },
        });
      });
    }

    revalidatePath('/admin/timeline');
    revalidatePath('/manager/timeline');
    revalidatePath('/timeline');
    return { success: true };
  } catch (error) {
    console.error('Error setting timeline processed status:', error);
    return { success: false, error: 'Failed to update processing status' };
  }
}

/**
 * Admin/manager manual reversal of an already-deducted late check-in penalty
 * for a single day. Idempotent: reverses only the outstanding (not yet
 * reversed) amount, so it can safely only ever apply once per day/employee.
 */
export async function reverseLatePenalty(recordId: string) {
  try {
    const actor = await getDbUser();
    if (!actor) {
      return { success: false, error: 'Unauthorized' };
    }

    const canUpdateTimeline = actor.role === "SUPERADMIN" || actor.role === "HR" || (actor.role === "EMPLOYEE" && actor.isManager);
    if (!canUpdateTimeline) {
      return { success: false, error: 'Unauthorized' };
    }

    const record = await prisma.dailyTimeRecord.findUnique({ where: { id: recordId } });
    if (!record) {
      return { success: false, error: 'Timeline record not found' };
    }

    const result = await prisma.$transaction(async (tx) => {
      return reverseLatePenaltyOnTimeline(tx, record.userId, record.date);
    });

    if (!result.applied) {
      return { success: false, error: 'No outstanding late penalty to reverse for this day.' };
    }

    await prisma.employeeNotification.create({
      data: {
        userId: record.userId,
        type: "LATE_CHECKIN_PENALTY",
        title: "Late Check-in Penalty Reversed",
        message: `Your late check-in penalty of ৳${result.adjustedAmount.toFixed(2)} for ${new Date(record.date).toLocaleDateString()} was manually reversed.`,
        relatedDate: record.date,
      },
    });

    revalidatePath('/admin/timeline');
    revalidatePath('/manager/timeline');
    revalidatePath('/timeline');
    return { success: true, adjustedAmount: result.adjustedAmount };
  } catch (error) {
    console.error('Error reversing late penalty:', error);
    return { success: false, error: 'Failed to reverse late penalty' };
  }
}

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
        branch: {
          select: { isLatePenaltyEnabled: true },
        },
      },
    });

    if (!employeeForPenalty) {
      return { success: false, error: 'Employee not found' };
    }

    const latePenaltyEnabled = employeeForPenalty.branch?.isLatePenaltyEnabled ?? true;
    const workingDaysInMonth = employeeForPenalty.workingDaysInMonth || 22;
    const dailySalary = workingDaysInMonth > 0 ? (employeeForPenalty.baseSalary / workingDaysInMonth) : 0;
    const absentPenaltyAmount = Number(dailySalary.toFixed(2));

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
        // overtimeUndertime = actualActiveTime - requiredActiveTime (office/clock-based)
        updateData.overtimeUndertime = calculateOvertimeUndertime(
          actualActiveTime,
          requiredActiveTime
        );

        // officialOvertimeundertime = overtimeUndertime + requestedOvertime (grand total)
        const requestedOvertime = currentRecord.requestedOvertime || '00:00';
        updateData.officialOvertimeundertime = addTimeStrings(
          updateData.overtimeUndertime,
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

      const perMinuteRate = requiredActiveMinutes > 0 ? (dailySalary / requiredActiveMinutes) : 0;
      recalculatedPenaltyAmount = recalculatedLateMinutes > 0
        ? Number((perMinuteRate * recalculatedLateMinutes).toFixed(2))
        : 0;

      updateData.lateCheckInMinutes = recalculatedLateMinutes;
      updateData.lateCheckInPenalty = recalculatedPenaltyAmount;
    }
    const { record } = await prisma.$transaction(async (tx) => {
      let leaveAdjustment: LeaveAdjustmentResult = { applied: false };
      
        // ✅ KEY FIX: Skip penalty reconciliation for ON_LEAVE transitions
        // Leave status has NO penalties, so ON_LEAVE→PRESENT doesn't need wallet adjustments
        const shouldReconcilePenalties = affectsLatePenalty && 
          finalStatus !== "ON_LEAVE" && 
          currentRecord.status !== "ON_LEAVE";
      const shouldApplyAbsentPenalty = currentRecord.status !== "ABSENT" && finalStatus === "ABSENT";
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

      if (shouldApplyAbsentPenalty) {
        absenceAdjustment = await applyAbsentPenaltyOnTimelineEdit(
          tx,
          currentRecord.userId,
          currentRecord.date,
          absentPenaltyAmount,
        );

        if (absenceAdjustment.applied) {
          await tx.employeeNotification.create({
            data: {
              userId: currentRecord.userId,
              type: "MANUAL_ABSENCE_ADJUSTMENT",
              title: "Absence Penalty Applied",
              message: `Your timeline was updated to Absent on ${new Date(currentRecord.date).toLocaleDateString()}. ৳${absenceAdjustment.adjustedAmount.toFixed(2)} was deducted from your wallet.`,
              relatedDate: currentRecord.date,
            },
          });
        }
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

        if (shouldReconcilePenalties && recalculatedLateMinutes > 0 && latePenaltyEnabled) {
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
      }, {
        timeout: 15000,  // ✅ Increased from default 5s to 15s for complex operations
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
          { overtimeUndertime: null }
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
      
      if (typeof finalRequiredActiveTime === 'string' && typeof finalActualActiveTime === 'string' && !record.overtimeUndertime) {
        // overtimeUndertime = actualActiveTime - requiredActiveTime (office/clock-based)
        updateData.overtimeUndertime = calculateOvertimeUndertime(
          finalActualActiveTime,
          finalRequiredActiveTime
        );

        // officialOvertimeundertime = overtimeUndertime + requestedOvertime (grand total)
        const requestedOvertime = record.requestedOvertime || '00:00';
        updateData.officialOvertimeundertime = addTimeStrings(
          updateData.overtimeUndertime,
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