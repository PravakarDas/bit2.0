"use server";

import { getDbUser } from "@/actions/user.actions";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { buildDateRangeFilter } from "@/lib/utils";

export interface LateCheckinDashboardFilters {
  branchId?: string;
  fromDate?: string;
  toDate?: string;
  employeeSearch?: string;
}

export interface LateCheckinDashboardData {
  summary: {
    totalLateMinutes: number;
    totalPenaltyAmount: number;
    totalLateCheckins: number;
  };
  monthlyLateByBranch: Array<Record<string, string | number>>;
  penaltyByBranch: Array<{
    branch: string;
    totalPenaltyAmount: number;
  }>;
  employeeRows: Array<{
    userId: string;
    employeeName: string;
    branch: string;
    totalLateMinutes: number;
    totalPenaltyAmount: number;
    lateCheckinCount: number;
  }>;
}

export interface EmployeeLateCheckinData {
  employee: {
    id: string;
    name: string;
    email: string;
    branch: string;
  };
  summary: {
    totalLateMinutes: number;
    totalPenaltyAmount: number;
    totalLateDays: number;
  };
  chartData: Array<{
    date: string;
    lateMinutes: number;
  }>;
  records: Array<{
    id: string;
    workDate: string;
    requiredCheckInTime: string;
    actualCheckInTime: string;
    lateMinutes: number;
    penaltyAmount: number;
  }>;
}


function formatClock(value: Date | null) {
  if (!value) {
    return "--";
  }

  return format(value, "h:mm a");
}

function buildLateRecordDateFilter(fromDate?: string, toDate?: string) {
  return buildDateRangeFilter(fromDate, toDate);
}

function assertCanAccessAllEmployees(user: Awaited<ReturnType<typeof getDbUser>>) {
  if (!user) {
    throw new Error("Unauthorized");
  }

  const isAdmin = user.role === "SUPERADMIN";
  const isManager = user.role === "EMPLOYEE" && user.isManager;

  if (!isAdmin && !isManager) {
    throw new Error("Unauthorized");
  }

  return { isAdmin, isManager };
}

export async function getLateCheckinBranches() {
  const user = await getDbUser();
  assertCanAccessAllEmployees(user);

  return prisma.branch.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getLateCheckinDashboardData(filters: LateCheckinDashboardFilters = {}): Promise<LateCheckinDashboardData> {
  const user = await getDbUser();
  assertCanAccessAllEmployees(user);

  const branchId = filters.branchId && filters.branchId !== "all" ? filters.branchId : undefined;
  const employeeSearch = filters.employeeSearch?.trim();

  const employeeWhere = {
    status: "APPROVED" as const,
    isArchived: false,
    role: { not: "SUPERADMIN" as const },
    ...(branchId ? { branchId } : {}),
    ...(employeeSearch
      ? {
          OR: [
            { firstName: { contains: employeeSearch, mode: "insensitive" as const } },
            { lastName: { contains: employeeSearch, mode: "insensitive" as const } },
            { email: { contains: employeeSearch, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const users = await prisma.user.findMany({
    where: employeeWhere,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      branch: { select: { name: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
  });

  if (users.length === 0) {
    return {
      summary: {
        totalLateMinutes: 0,
        totalPenaltyAmount: 0,
        totalLateCheckins: 0,
      },
      monthlyLateByBranch: [],
      penaltyByBranch: [],
      employeeRows: [],
    };
  }

  const userIds = users.map((employee) => employee.id);
  const dateFilter = buildLateRecordDateFilter(filters.fromDate, filters.toDate);

  const lateRecords = await prisma.dailyTimeRecord.findMany({
    where: {
      userId: { in: userIds },
      ...(dateFilter ? { date: dateFilter } : {}),
      OR: [{ lateCheckInMinutes: { gt: 0 } }, { lateCheckInPenalty: { gt: 0 } }],
    },
    select: {
      id: true,
      date: true,
      lateCheckInMinutes: true,
      lateCheckInPenalty: true,
      user: {
        select: {
          id: true,
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { date: "asc" },
  });

  const userStats = new Map<
    string,
    { totalLateMinutes: number; totalPenaltyAmount: number; lateCheckinCount: number }
  >();

  const monthlyByBranch = new Map<string, Record<string, string | number>>();
  const penaltyByBranch = new Map<string, number>();

  let totalLateMinutes = 0;
  let totalPenaltyAmount = 0;

  for (const record of lateRecords) {
    const minutes = record.lateCheckInMinutes ?? 0;
    const penalty = record.lateCheckInPenalty ?? 0;
    const branchName = record.user.branch?.name ?? "No Branch";

    totalLateMinutes += minutes;
    totalPenaltyAmount += penalty;

    const currentUserStat = userStats.get(record.user.id) ?? {
      totalLateMinutes: 0,
      totalPenaltyAmount: 0,
      lateCheckinCount: 0,
    };

    currentUserStat.totalLateMinutes += minutes;
    currentUserStat.totalPenaltyAmount += penalty;
    currentUserStat.lateCheckinCount += 1;
    userStats.set(record.user.id, currentUserStat);

    const monthKey = format(record.date, "MMM yyyy");
    const monthEntry = monthlyByBranch.get(monthKey) ?? { month: monthKey };
    const branchMonthValue = Number(monthEntry[branchName] ?? 0);
    monthEntry[branchName] = branchMonthValue + minutes;
    monthlyByBranch.set(monthKey, monthEntry);

    penaltyByBranch.set(branchName, (penaltyByBranch.get(branchName) ?? 0) + penalty);
  }

  const employeeRows = users.map((employee) => {
    const stats = userStats.get(employee.id) ?? {
      totalLateMinutes: 0,
      totalPenaltyAmount: 0,
      lateCheckinCount: 0,
    };

    const name = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || employee.email;

    return {
      userId: employee.id,
      employeeName: name,
      branch: employee.branch?.name ?? "No Branch",
      totalLateMinutes: stats.totalLateMinutes,
      totalPenaltyAmount: Number(stats.totalPenaltyAmount.toFixed(2)),
      lateCheckinCount: stats.lateCheckinCount,
    };
  });

  employeeRows.sort((first, second) => {
    if (second.totalPenaltyAmount !== first.totalPenaltyAmount) {
      return second.totalPenaltyAmount - first.totalPenaltyAmount;
    }

    return second.totalLateMinutes - first.totalLateMinutes;
  });

  const monthlyLateByBranch = Array.from(monthlyByBranch.values());
  const penaltyByBranchRows = Array.from(penaltyByBranch.entries())
    .map(([branch, amount]) => ({
      branch,
      totalPenaltyAmount: Number(amount.toFixed(2)),
    }))
    .sort((first, second) => second.totalPenaltyAmount - first.totalPenaltyAmount);

  return {
    summary: {
      totalLateMinutes,
      totalPenaltyAmount: Number(totalPenaltyAmount.toFixed(2)),
      totalLateCheckins: lateRecords.length,
    },
    monthlyLateByBranch,
    penaltyByBranch: penaltyByBranchRows,
    employeeRows,
  };
}

export async function getEmployeeLateCheckinData(
  targetEmployeeId: string,
  filters: Pick<LateCheckinDashboardFilters, "fromDate" | "toDate"> = {}
): Promise<EmployeeLateCheckinData> {
  const user = await getDbUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const isAdmin = user.role === "SUPERADMIN";
  const isManager = user.role === "EMPLOYEE" && user.isManager;
  const isSelf = user.id === targetEmployeeId;

  if (!isAdmin && !isManager && !isSelf) {
    throw new Error("Unauthorized");
  }

  const employee = await prisma.user.findFirst({
    where: {
      id: targetEmployeeId,
      role: { not: "SUPERADMIN" },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      branch: { select: { name: true } },
    },
  });

  if (!employee) {
    throw new Error("Employee not found");
  }

  const dateFilter = buildLateRecordDateFilter(filters.fromDate, filters.toDate);

  const records = await prisma.dailyTimeRecord.findMany({
    where: {
      userId: employee.id,
      ...(dateFilter ? { date: dateFilter } : {}),
      OR: [{ lateCheckInMinutes: { gt: 0 } }, { lateCheckInPenalty: { gt: 0 } }],
    },
    select: {
      id: true,
      date: true,
      requiredCheckIn: true,
      actualCheckIn: true,
      lateCheckInMinutes: true,
      lateCheckInPenalty: true,
    },
    orderBy: { date: "desc" },
  });

  const totalLateMinutes = records.reduce((sum, record) => sum + (record.lateCheckInMinutes ?? 0), 0);
  const totalPenaltyAmount = records.reduce((sum, record) => sum + (record.lateCheckInPenalty ?? 0), 0);

  const chartData = [...records]
    .reverse()
    .map((record) => ({
      date: format(record.date, "MMM d"),
      lateMinutes: record.lateCheckInMinutes ?? 0,
    }));

  const tableRows = records.map((record) => ({
    id: record.id,
    workDate: format(record.date, "yyyy-MM-dd"),
    requiredCheckInTime: formatClock(record.requiredCheckIn),
    actualCheckInTime: formatClock(record.actualCheckIn),
    lateMinutes: record.lateCheckInMinutes ?? 0,
    penaltyAmount: Number((record.lateCheckInPenalty ?? 0).toFixed(2)),
  }));

  const employeeName = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || employee.email;

  return {
    employee: {
      id: employee.id,
      name: employeeName,
      email: employee.email,
      branch: employee.branch?.name ?? "No Branch",
    },
    summary: {
      totalLateMinutes,
      totalPenaltyAmount: Number(totalPenaltyAmount.toFixed(2)),
      totalLateDays: records.length,
    },
    chartData,
    records: tableRows,
  };
}

export async function getCurrentUserLateCheckinData(filters: Pick<LateCheckinDashboardFilters, "fromDate" | "toDate"> = {}) {
  const user = await getDbUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  return getEmployeeLateCheckinData(user.id, filters);
}