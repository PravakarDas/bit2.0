"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";

function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const isNegative = timeStr.startsWith("-");
  const clean = timeStr.replace("-", "").replace("+", "");
  const [hours, minutes] = clean.split(":").map(Number);
  const totalMinutes = (hours * 60) + minutes;
  return isNegative ? -totalMinutes : totalMinutes;
}

function minutesToTimeString(minutes: number): string {
  if (minutes === 0) return "00:00";
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  const sign = minutes < 0 ? "-" : "";
  return `${sign}${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

function calculateBranchDailyActiveMinutes(
  checkInTime: string,
  checkOutTime: string,
  breakDuration: string,
) {
  const checkInMinutes = timeStringToMinutes(checkInTime || "00:00");
  const checkOutMinutes = timeStringToMinutes(checkOutTime || "00:00");
  const breakMinutes = Math.max(0, timeStringToMinutes(breakDuration || "00:00"));

  if (checkOutMinutes <= checkInMinutes) {
    return 0;
  }

  return Math.max(0, (checkOutMinutes - checkInMinutes) - breakMinutes);
}

async function buildOvertimePayoutSummary(userId: string, year: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      baseSalary: true,
      workingDaysInMonth: true,
      firstName: true,
      lastName: true,
      email: true,
      branchId: true,
      branch: {
        select: {
          checkInTime: true,
          checkOutTime: true,
          breakDuration: true,
        },
      },
      leaveEntitlements: {
        where: {
          year,
          leaveType: {
            leaveResetPolicy: "ROSTER_EVERY_YEAR",
          },
        },
        select: {
          allocatedDays: true,
          usedDays: true,
        },
      },
    }
  });

  if (!user) {
    throw new Error("Employee not found");
  }

  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  endDate.setHours(23, 59, 59, 999);

  const records = await prisma.dailyTimeRecord.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
        lte: endDate,
      }
    },
    orderBy: { date: "asc" }
  });

  let totalRequiredActiveMinutes = 0;
  let totalRequiredBreakMinutes = 0;
  let totalActualActiveMinutes = 0;
  let totalOfficeOvertimeMinutes = 0;     // Σ overtimeUndertime (office / clock-based)
  let totalWorkFromHomeMinutes = 0;       // Σ requestedOvertime (work-from-home)
  let totalCombinedOvertimeMinutes = 0;   // Σ officialOvertimeundertime (office + WFH)

  records.forEach(record => {
    // Only include days that have been settled by the automation pipeline.
    // Unprocessed days (today / within the grace window) are excluded from every total.
    if (!record.isProcessed) return;

    // Count working days (records with required times - not weekends/holidays)
    if (record.requiredCheckIn && record.requiredCheckOut) {
      // Add required active time
      if (record.requiredActiveTime) {
        totalRequiredActiveMinutes += timeStringToMinutes(record.requiredActiveTime);
      }

      // Add required break time
      if (record.requiredBreakTime) {
        totalRequiredBreakMinutes += timeStringToMinutes(record.requiredBreakTime);
      }

      // Overtime sums are counted for every processed working day (including
      // work-from-home days that have no office check-in). Office + WFH = Combined.
      if (record.overtimeUndertime) {
        totalOfficeOvertimeMinutes += timeStringToMinutes(record.overtimeUndertime);
      }
      if (record.requestedOvertime) {
        totalWorkFromHomeMinutes += timeStringToMinutes(record.requestedOvertime);
      }
      if (record.officialOvertimeundertime) {
        totalCombinedOvertimeMinutes += timeStringToMinutes(record.officialOvertimeundertime);
      }

      // Actual active time only applies to days the employee actually checked in.
      if (record.actualCheckIn && record.actualActiveTime) {
        totalActualActiveMinutes += timeStringToMinutes(record.actualActiveTime);
      }
    }
  });

  const totalRenewableLeaveRemainingDays = user.leaveEntitlements.reduce((sum, entitlement) => {
    return sum + Math.max(0, entitlement.allocatedDays - entitlement.usedDays);
  }, 0);

  // Calculate total required minutes without leave deduction
  const totalRequiredMinutes = totalRequiredActiveMinutes + totalRequiredBreakMinutes;

  // Daily working minutes come from the employee's branch settings
  // (required check-out - required check-in - break duration), so the per-minute
  // salary tracks the branch's actual required working hours instead of a fixed 8h.
  // Falls back to 480 (8h) when no branch is set or the settings are invalid.
  const branchDailyWorkingMinutes = user.branch
    ? calculateBranchDailyActiveMinutes(
        user.branch.checkInTime,
        user.branch.checkOutTime,
        user.branch.breakDuration,
      )
    : 0;
  const dailyWorkingMinutes = branchDailyWorkingMinutes > 0 ? branchDailyWorkingMinutes : 480;

  // Calculate per-minute salary: baseSalary / workingDaysInMonth / dailyWorkingMinutes
  const workingDaysInMonth = user.workingDaysInMonth || 22;
  const perMinuteSalary = workingDaysInMonth > 0
    ? (user.baseSalary / workingDaysInMonth / dailyWorkingMinutes)
    : 0;

  // Convert remaining leave days to minutes using the same dynamic daily working
  // minutes as the per-minute salary, so 1 leave day equals one full working day
  // for this branch (check-out - check-in - break) instead of a fixed 8h.
  const renewableLeaveMinutes = totalRenewableLeaveRemainingDays * dailyWorkingMinutes;

  // Payable minutes = combined OT/UT (office + WFH) + unused renewable leave days
  const payableMinutes = totalCombinedOvertimeMinutes + renewableLeaveMinutes;

  // Calculate final amount
  const amount = Math.ceil(payableMinutes * perMinuteSalary);

  const totalRequiredActiveTime = minutesToTimeString(totalRequiredActiveMinutes);
  const totalActualActiveTime = minutesToTimeString(totalActualActiveMinutes);
  const totalRequiredBreakTime = minutesToTimeString(totalRequiredBreakMinutes);
  const totalOfficeOvertimeUndertime = minutesToTimeString(totalOfficeOvertimeMinutes);
  const totalWorkFromHomeOvertime = minutesToTimeString(totalWorkFromHomeMinutes);
  const totalOvertimeUndertime = minutesToTimeString(totalCombinedOvertimeMinutes);

  const existingPayout = await prisma.overtimePayout.findUnique({
    where: { userId_year: { userId, year } }
  });

  return {
    user,
    year,
    totalRequiredActiveTime,
    totalActualActiveTime,
    totalRequiredBreakTime,
    totalOfficeOvertimeUndertime,
    totalOfficeOvertimeMinutes,
    totalWorkFromHomeOvertime,
    totalWorkFromHomeMinutes,
    totalOvertimeUndertime,
    totalRequiredMinutes,
    totalOvertimeMinutes: totalCombinedOvertimeMinutes,
    totalActualActiveMinutes,
    totalRenewableLeaveRemainingDays,
    renewableLeaveMinutes,
    payableMinutes,
    perMinuteSalary,
    workingDaysInMonth,
    dailyWorkingMinutes,
    calculatedAmount: amount,
    isPaid: existingPayout?.isPaid ?? false,
    paidAt: existingPayout?.paidAt ?? null,
  };
}

export async function getOvertimePayoutSummary(userId: string, year: number) {
  const admin = await getDbUser();
  if (!admin || admin.role !== 'SUPERADMIN') {
    throw new Error("Unauthorized");
  }
  return buildOvertimePayoutSummary(userId, year);
}

// Self-scoped: an employee can only ever read their own payout summary.
export async function getMyOvertimePayoutSummary(year: number) {
  const user = await getDbUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return buildOvertimePayoutSummary(user.id, year);
}

export async function getEligibleEmployeesForOvertime(branchId?: string) {
  const admin = await getDbUser();
  if (!admin || admin.role !== 'SUPERADMIN') {
    throw new Error("Unauthorized");
  }

  return await prisma.user.findMany({
    where: {
      status: "APPROVED",
      role: "EMPLOYEE",
      isArchived: false,
      ...(branchId ? { branchId } : {})
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      branchId: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }]
  });
}

export async function getOvertimePayoutHistory(userId: string) {
  const admin = await getDbUser();
  if (!admin || admin.role !== 'SUPERADMIN') {
    throw new Error("Unauthorized");
  }

  return await prisma.overtimePayout.findMany({
    where: { userId },
    select: {
      id: true,
      year: true,
      totalRequiredActiveTime: true,
      totalRequiredBreakTime: true,
      totalOvertimeUndertime: true,
      totalRequiredMinutes: true,
      totalOvertimeMinutes: true,
      calculatedAmount: true,
      isPaid: true,
      paidAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { year: 'desc' },
  });
}

export async function getLeaveEntitlementHistory(userId: string) {
  const admin = await getDbUser();
  if (!admin || admin.role !== 'SUPERADMIN') {
    throw new Error("Unauthorized");
  }

  const entitlements = await prisma.userLeaveEntitlement.findMany({
    where: { userId },
    select: {
      id: true,
      year: true,
      allocatedDays: true,
      usedDays: true,
      leaveType: {
        select: {
          name: true,
          leaveResetPolicy: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [
      { year: 'desc' },
      { leaveType: { name: 'asc' } },
    ],
  });

  return entitlements.map((entitlement) => ({
    ...entitlement,
    remainingDays: Math.max(0, entitlement.allocatedDays - entitlement.usedDays),
  }));
}

export async function applyOvertimePayout(userId: string, year: number) {
  const admin = await getDbUser();
  if (!admin || admin.role !== 'SUPERADMIN') {
    throw new Error("Unauthorized");
  }

  const summary = await getOvertimePayoutSummary(userId, year);
  if (summary.isPaid) {
    return { success: false, error: "This year has already been paid for this employee." };
  }

  if (!summary.user.baseSalary || summary.user.baseSalary <= 0) {
    return { success: false, error: "Base salary is missing for this employee." };
  }

  const amount = summary.calculatedAmount;
  const totalRequiredTime = minutesToTimeString(summary.totalRequiredMinutes);
  const payableTime = minutesToTimeString(summary.payableMinutes);
  const payableTimeHours = (summary.payableMinutes / 60).toFixed(2);

  const result = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: amount } },
    });

    await tx.walletTransaction.create({
      data: {
        userId,
        amount,
        type: "YEARLY_OT_UT_ADJUSTMENT",
        description: `Yearly OT/UT adjustment for ${year}`,
      }
    });

    await tx.employeeNotification.create({
      data: {
        userId,
        type: "YEARLY_OT_UT_PROCESSED",
        title: `Yearly OT/UT Processed (${year})`,
        message: `Your yearly OT/UT for ${year} has been processed. Wallet adjusted by ৳${amount}. Calculation: Per-minute salary = ৳${summary.perMinuteSalary.toFixed(2)}, OT/UT = ${summary.totalOvertimeUndertime}, Unused renewable leaves = ${summary.totalRenewableLeaveRemainingDays} day(s) (${minutesToTimeString(summary.renewableLeaveMinutes)}), Total payable = ${payableTime}`,
      },
    });

    const payout = await tx.overtimePayout.upsert({
      where: { userId_year: { userId, year } },
      update: {
        baseSalary: summary.user.baseSalary,
        totalRequiredActiveTime: summary.totalRequiredActiveTime,
        totalRequiredBreakTime: summary.totalRequiredBreakTime,
        totalOvertimeUndertime: summary.totalOvertimeUndertime,
        totalRequiredMinutes: summary.totalRequiredMinutes,
        totalOvertimeMinutes: summary.totalOvertimeMinutes,
        calculatedAmount: amount,
        isPaid: true,
        paidAt: new Date(),
        paidBy: admin.id,
      },
      create: {
        userId,
        year,
        baseSalary: summary.user.baseSalary,
        totalRequiredActiveTime: summary.totalRequiredActiveTime,
        totalRequiredBreakTime: summary.totalRequiredBreakTime,
        totalOvertimeUndertime: summary.totalOvertimeUndertime,
        totalRequiredMinutes: summary.totalRequiredMinutes,
        totalOvertimeMinutes: summary.totalOvertimeMinutes,
        calculatedAmount: amount,
        isPaid: true,
        paidAt: new Date(),
        paidBy: admin.id,
      }
    });

    return payout;
  });

  revalidatePath("/admin/overtime-payouts");
  revalidatePath("/admin/wallet");
  revalidatePath("/wallet");

  return { success: true, payout: result };
}
