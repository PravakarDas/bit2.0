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

export async function getOvertimePayoutSummary(userId: string, year: number) {
  const admin = await getDbUser();
  if (!admin || admin.role !== 'SUPERADMIN') {
    throw new Error("Unauthorized");
  }

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
  let totalOvertimeMinutes = 0;
  let totalActualActiveMinutes = 0;

  records.forEach(record => {
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
      
      // Count present days and overtime (only if employee checked in)
      if (record.actualCheckIn) {
        if (record.actualActiveTime) {
          totalActualActiveMinutes += timeStringToMinutes(record.actualActiveTime);
        }

        // Add overtime/undertime
        if (record.overtimeUndertime) {
          totalOvertimeMinutes += timeStringToMinutes(record.overtimeUndertime);
        }
      }
    }
  });

  const totalRenewableLeaveRemainingDays = user.leaveEntitlements.reduce((sum, entitlement) => {
    return sum + Math.max(0, entitlement.allocatedDays - entitlement.usedDays);
  }, 0);

  // Calculate total required minutes without leave deduction
  const totalRequiredMinutes = totalRequiredActiveMinutes + totalRequiredBreakMinutes;

  // Calculate per-minute salary: baseSalary / workingDaysInMonth / 480 minutes (8 hours)
  const workingDaysInMonth = user.workingDaysInMonth || 22;
  const perMinuteSalary = workingDaysInMonth > 0 
    ? (user.baseSalary / workingDaysInMonth / 480)
    : 0;

  // Convert remaining leave days to minutes (1 day = 8 hours = 480 minutes)
  const renewableLeaveMinutes = totalRenewableLeaveRemainingDays * 480;

  // Calculate payable minutes = OT/UT + unused leave days
  const payableMinutes = totalOvertimeMinutes + renewableLeaveMinutes;

  // Calculate final amount
  const amount = Math.ceil(payableMinutes * perMinuteSalary);

  const totalRequiredActiveTime = minutesToTimeString(totalRequiredActiveMinutes);
  const totalActualActiveTime = minutesToTimeString(totalActualActiveMinutes);
  const totalRequiredBreakTime = minutesToTimeString(totalRequiredBreakMinutes);
  const totalOvertimeUndertime = minutesToTimeString(totalOvertimeMinutes);

  const existingPayout = await prisma.overtimePayout.findUnique({
    where: { userId_year: { userId, year } }
  });

  return {
    user,
    year,
    totalRequiredActiveTime,
    totalActualActiveTime,
    totalRequiredBreakTime,
    totalOvertimeUndertime,
    totalRequiredMinutes,
    totalOvertimeMinutes,
    totalActualActiveMinutes,
    totalRenewableLeaveRemainingDays,
    renewableLeaveMinutes,
    payableMinutes,
    perMinuteSalary,
    workingDaysInMonth,
    calculatedAmount: amount,
    isPaid: existingPayout?.isPaid ?? false,
    paidAt: existingPayout?.paidAt ?? null,
  };
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
