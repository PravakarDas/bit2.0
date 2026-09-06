"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getDbUser } from "./user.actions";
import type { ZktAttendanceLogRecord, ZktAttendanceLogSortField } from "@/components/admin/zkt-attendance-log-types";

/**
 * Read-only admin/manager view of the externally-populated `public.zkt_attendance`
 * table (see `zkt-attendance-poller.service.ts` for why it's never modeled in
 * Prisma). Left-joins to `"User"` on `attendanceId = zkt_attendance.user_id`
 * so each row can show the resolved employee profile when one matches,
 * falling back to the device's own raw `user_name` when it doesn't (a
 * mismatch is worth surfacing, not hiding — see the ZKT_ATTENDANCE_TABLE
 * calculation method work, which found a real attendanceId/device mismatch).
 */

interface RawZktAttendanceLogRow {
  id: bigint;
  attendance_time: Date;
  punch: number | null;
  punch_type: string | null;
  device_user_id: string;
  device_user_name: string | null;
  branch_name: string | null;
  device_name: string | null;
  device_ip: string | null;
  serial_number: string | null;
  app_user_id: string | null;
  app_first_name: string | null;
  app_last_name: string | null;
  app_email: string | null;
}

export interface GetZktAttendanceLogOptions {
  search?: string;
  /** App User.id list — resolved to their attendanceId(s) before querying. */
  employeeIds?: string[];
  /** Raw punch codes: 0-5, 255. */
  punchCodes?: number[];
  branchNames?: string[];
  /** "YYYY-MM-DD", inclusive, compared against the raw local wall-clock attendance_time. */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: ZktAttendanceLogSortField;
  sortOrder?: "asc" | "desc";
}

async function canAccessAttendanceLog(): Promise<boolean> {
  const actor = await getDbUser();
  if (!actor) return false;
  return actor.role === "SUPERADMIN" || actor.role === "HR" || (actor.role === "EMPLOYEE" && actor.isManager);
}

/** Parses a "YYYY-MM-DD" string into a Date whose UTC-getters are that calendar day at 00:00 — matching zkt_attendance.attendance_time's own "naive local wall-clock" storage convention (see zkt-attendance-sync.service.ts's doc comments). Never go through server-local-timezone parsing here, since the server's own TZ has no bearing on what's stored. */
function parseYmdToUtcMidnight(value: string): Date | undefined {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return undefined;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

export async function getZktAttendanceLogRecords(options?: GetZktAttendanceLogOptions) {
  try {
    if (!(await canAccessAttendanceLog())) {
      return { success: false, error: "Unauthorized" };
    }

    const page = options?.page && options.page > 0 ? options.page : 1;
    const limit = options?.limit && options.limit > 0 ? options.limit : 10;
    const offset = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [];

    if (options?.employeeIds && options.employeeIds.length > 0) {
      const matchedUsers = await prisma.user.findMany({
        where: { id: { in: options.employeeIds } },
        select: { attendanceId: true },
      });
      const attendanceIds = matchedUsers.map((u) => u.attendanceId).filter((v): v is string => !!v);
      if (attendanceIds.length === 0) {
        return { success: true, records: [] as ZktAttendanceLogRecord[], pagination: { page, limit, total: 0, totalPages: 0 } };
      }
      conditions.push(Prisma.sql`za.user_id IN (${Prisma.join(attendanceIds)})`);
    }

    if (options?.punchCodes && options.punchCodes.length > 0) {
      conditions.push(Prisma.sql`za.punch IN (${Prisma.join(options.punchCodes)})`);
    }

    if (options?.branchNames && options.branchNames.length > 0) {
      conditions.push(Prisma.sql`za.branch_name IN (${Prisma.join(options.branchNames)})`);
    }

    const from = options?.dateFrom ? parseYmdToUtcMidnight(options.dateFrom) : undefined;
    const to = options?.dateTo ? parseYmdToUtcMidnight(options.dateTo) : undefined;
    if (from) {
      conditions.push(Prisma.sql`za.attendance_time >= ${from}`);
    }
    if (to) {
      const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);
      conditions.push(Prisma.sql`za.attendance_time < ${toExclusive}`);
    }

    const search = options?.search?.trim();
    if (search) {
      const term = `%${search}%`;
      conditions.push(Prisma.sql`(
        za.user_name ILIKE ${term} OR
        za.serial_number ILIKE ${term} OR
        za.device_name ILIKE ${term} OR
        za.branch_name ILIKE ${term} OR
        za.user_id ILIKE ${term} OR
        u."firstName" ILIKE ${term} OR
        u."lastName" ILIKE ${term} OR
        u.email ILIKE ${term}
      )`);
    }

    const whereSql = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;

    const sortColumnMap: Record<ZktAttendanceLogSortField, Prisma.Sql> = {
      time: Prisma.sql`za.attendance_time`,
      employee: Prisma.sql`COALESCE(u."firstName", za.user_name, za.user_id)`,
      punch: Prisma.sql`za.punch`,
      branch: Prisma.sql`za.branch_name`,
      device: Prisma.sql`za.device_name`,
      serial: Prisma.sql`za.serial_number`,
    };
    const sortColumn = sortColumnMap[options?.sortBy ?? "time"] ?? sortColumnMap.time;
    const sortDirection = options?.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<RawZktAttendanceLogRow[]>(Prisma.sql`
        SELECT
          za.id, za.attendance_time, za.punch, za.punch_type,
          za.user_id AS device_user_id, za.user_name AS device_user_name,
          za.branch_name, za.device_name, za.device_ip, za.serial_number,
          u.id AS app_user_id, u."firstName" AS app_first_name, u."lastName" AS app_last_name, u.email AS app_email
        FROM public.zkt_attendance za
        LEFT JOIN public."User" u ON u."attendanceId" = za.user_id
        ${whereSql}
        ORDER BY ${sortColumn} ${sortDirection}, za.id DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint as count
        FROM public.zkt_attendance za
        LEFT JOIN public."User" u ON u."attendanceId" = za.user_id
        ${whereSql}
      `),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    const records: ZktAttendanceLogRecord[] = rows.map((r) => ({
      id: r.id.toString(),
      attendanceTime: r.attendance_time,
      punch: r.punch,
      punchType: r.punch_type,
      deviceUserId: r.device_user_id,
      deviceUserName: r.device_user_name,
      branchName: r.branch_name,
      deviceName: r.device_name,
      deviceIp: r.device_ip,
      serialNumber: r.serial_number,
      appUserId: r.app_user_id,
      appFirstName: r.app_first_name,
      appLastName: r.app_last_name,
      appEmail: r.app_email,
    }));

    return {
      success: true,
      records,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  } catch (error) {
    console.error("Error fetching zkt_attendance log:", error);
    return { success: false, error: "Failed to fetch attendance log" };
  }
}

/** Distinct `branch_name` values currently present in `zkt_attendance`, for the Branch filter — a free-text field on the device side, not linked to the app's own Branch model. */
export async function getZktAttendanceBranchNames() {
  try {
    if (!(await canAccessAttendanceLog())) {
      return { success: false, error: "Unauthorized", branchNames: [] as string[] };
    }

    const rows = await prisma.$queryRaw<{ branch_name: string | null }[]>(Prisma.sql`
      SELECT DISTINCT branch_name FROM public.zkt_attendance WHERE branch_name IS NOT NULL ORDER BY branch_name ASC
    `);
    return { success: true, branchNames: rows.map((r) => r.branch_name).filter((v): v is string => !!v) };
  } catch (error) {
    console.error("Error fetching zkt_attendance branch names:", error);
    return { success: false, error: "Failed to fetch branch names", branchNames: [] as string[] };
  }
}
