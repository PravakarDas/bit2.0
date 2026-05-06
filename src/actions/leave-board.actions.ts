"use server";

import { DailyRecordStatus, Prisma } from "@prisma/client";
import { getDbUser } from "@/actions/user.actions";
import { prisma } from "@/lib/prisma";

export interface LeaveBoardFilters {
  search?: string;
  branchId?: string;
}

export interface LeaveBoardMetric {
  total: number;
  used: number;
  remaining: number;
}

export interface LeaveBoardLeaveType {
  id: string;
  name: string;
}

export interface LeaveBoardRow {
  userId: string;
  employeeName: string;
  employeeEmail: string;
  branchName: string;
  assignedLeaveTypeIds: string[];
  leaveByType: Record<string, LeaveBoardMetric>;
  totals: LeaveBoardMetric;
  absent: number;
}

export interface LeaveBoardData {
  currentYear: number;
  leaveTypes: LeaveBoardLeaveType[];
  branches: Array<{ id: string; name: string }>;
  rows: LeaveBoardRow[];
  filters: {
    search: string;
    branchId: string;
  };
}

function assertCanAccessLeaveBoard(user: Awaited<ReturnType<typeof getDbUser>>) {
  if (!user) {
    throw new Error("Unauthorized");
  }

  const isAdmin = user.role === "SUPERADMIN";
  const isManager = user.role === "EMPLOYEE" && user.isManager;

  if (!isAdmin && !isManager) {
    throw new Error("Unauthorized");
  }
}

function toMetric(total: number, used: number): LeaveBoardMetric {
  return {
    total,
    used,
    remaining: total - used,
  };
}

export async function getLeaveBoardData(filters: LeaveBoardFilters = {}): Promise<LeaveBoardData> {
  const user = await getDbUser();
  assertCanAccessLeaveBoard(user);

  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const today = new Date();

  const search = filters.search?.trim() ?? "";
  const branchId = filters.branchId && filters.branchId !== "all" ? filters.branchId : "all";

  const [leaveTypes, branches] = await Promise.all([
    prisma.leaveType.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const employeeWhere: Prisma.UserWhereInput = {
    status: "APPROVED",
    isArchived: false,
    role: { not: "SUPERADMIN" },
    ...(branchId !== "all" ? { branchId } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const employees = await prisma.user.findMany({
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

  if (employees.length === 0) {
    return {
      currentYear,
      leaveTypes,
      branches,
      rows: [],
      filters: {
        search,
        branchId,
      },
    };
  }

  const employeeIds = employees.map((employee) => employee.id);
  const leaveTypeIds = leaveTypes.map((leaveType) => leaveType.id);

  const [entitlements, absentGroups] = await Promise.all([
    prisma.userLeaveEntitlement.findMany({
      where: {
        userId: { in: employeeIds },
        year: currentYear,
        ...(leaveTypeIds.length > 0 ? { leaveTypeId: { in: leaveTypeIds } } : {}),
      },
      select: {
        userId: true,
        leaveTypeId: true,
        allocatedDays: true,
        usedDays: true,
      },
    }),
    prisma.dailyTimeRecord.groupBy({
      by: ["userId"],
      where: {
        userId: { in: employeeIds },
        status: DailyRecordStatus.ABSENT,
        date: {
          gte: yearStart,
          lte: today,
        },
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const entitlementMap = new Map<string, { allocatedDays: number; usedDays: number }>();
  const assignedLeaveTypeMap = new Map<string, Set<string>>();
  for (const entitlement of entitlements) {
    entitlementMap.set(`${entitlement.userId}:${entitlement.leaveTypeId}`, {
      allocatedDays: entitlement.allocatedDays,
      usedDays: entitlement.usedDays,
    });

    if (!assignedLeaveTypeMap.has(entitlement.userId)) {
      assignedLeaveTypeMap.set(entitlement.userId, new Set());
    }
    assignedLeaveTypeMap.get(entitlement.userId)?.add(entitlement.leaveTypeId);
  }

  const absentMap = new Map<string, number>();
  for (const group of absentGroups) {
    absentMap.set(group.userId, group._count._all);
  }

  const rows: LeaveBoardRow[] = employees.map((employee) => {
    const leaveByType: Record<string, LeaveBoardMetric> = {};
    let totalAllocated = 0;
    let totalUsed = 0;

    for (const leaveType of leaveTypes) {
      const entitlement = entitlementMap.get(`${employee.id}:${leaveType.id}`);
      const allocatedDays = entitlement?.allocatedDays ?? 0;
      const usedDays = entitlement?.usedDays ?? 0;

      totalAllocated += allocatedDays;
      totalUsed += usedDays;

      leaveByType[leaveType.id] = toMetric(allocatedDays, usedDays);
    }

    const employeeName = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || employee.email;

    return {
      userId: employee.id,
      employeeName,
      employeeEmail: employee.email,
      branchName: employee.branch?.name ?? "No Branch",
      assignedLeaveTypeIds: Array.from(assignedLeaveTypeMap.get(employee.id) ?? []),
      leaveByType,
      totals: toMetric(totalAllocated, totalUsed),
      absent: absentMap.get(employee.id) ?? 0,
    };
  });

  return {
    currentYear,
    leaveTypes,
    branches,
    rows,
    filters: {
      search,
      branchId,
    },
  };
}