"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getDbUser } from "./user.actions";
import type { ZktAttendanceLogRecord, ZktAttendanceLogSortField } from "@/components/admin/zkt-attendance-log-types";

/**
 * Read-only admin/manager view of the externally-populated `public.zkt_attendance`
 * table (see `zkt-attendance-poller.service.ts` for why it's never modeled in
 * Prisma). Deliberately shows ONLY what's in that table — no join or
 * cross-reference to the app's own `User` model, by explicit instruction.
 * `getDbUser()` below is for authorizing the VIEWER of this page, unrelated
 * to the data displayed on it.
 */

interface RawZktAttendanceLogRow {
  id: bigint;
  attendance_time: Date;
  punch: number | null;
  punch_type: string | null;
  user_id: string;
  user_name: string | null;
  branch_name: string | null;
}

export interface GetZktAttendanceLogOptions {
  /** A pure-digit term matches user_id EXACTLY; any other term is a substring match against user_name. */
  search?: string;
  userIds?: string[];
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

    if (options?.userIds && options.userIds.length > 0) {
      conditions.push(Prisma.sql`user_id IN (${Prisma.join(options.userIds)})`);
    }

    if (options?.punchCodes && options.punchCodes.length > 0) {
      conditions.push(Prisma.sql`punch IN (${Prisma.join(options.punchCodes)})`);
    }

    if (options?.branchNames && options.branchNames.length > 0) {
      conditions.push(Prisma.sql`branch_name IN (${Prisma.join(options.branchNames)})`);
    }

    const from = options?.dateFrom ? parseYmdToUtcMidnight(options.dateFrom) : undefined;
    const to = options?.dateTo ? parseYmdToUtcMidnight(options.dateTo) : undefined;
    if (from) {
      conditions.push(Prisma.sql`attendance_time >= ${from}`);
    }
    if (to) {
      const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);
      conditions.push(Prisma.sql`attendance_time < ${toExclusive}`);
    }

    const search = options?.search?.trim();
    if (search) {
      if (/^\d+$/.test(search)) {
        // A pure-digit search term means "find this exact device ID" —
        // NOT "any ID containing these digits" (e.g. typing "60" must not
        // also pull in IDs like 160 or 260).
        conditions.push(Prisma.sql`user_id = ${search}`);
      } else {
        conditions.push(Prisma.sql`user_name ILIKE ${`%${search}%`}`);
      }
    }

    const whereSql = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;

    const sortColumnMap: Record<ZktAttendanceLogSortField, Prisma.Sql> = {
      time: Prisma.sql`attendance_time`,
      employee: Prisma.sql`user_name`,
      punch: Prisma.sql`punch`,
      branch: Prisma.sql`branch_name`,
    };
    const sortColumn = sortColumnMap[options?.sortBy ?? "time"] ?? sortColumnMap.time;
    const sortDirection = options?.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<RawZktAttendanceLogRow[]>(Prisma.sql`
        SELECT id, attendance_time, punch, punch_type, user_id, user_name, branch_name
        FROM public.zkt_attendance
        ${whereSql}
        ORDER BY ${sortColumn} ${sortDirection}, id DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint as count
        FROM public.zkt_attendance
        ${whereSql}
      `),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    const records: ZktAttendanceLogRecord[] = rows.map((r) => ({
      id: r.id.toString(),
      attendanceTime: r.attendance_time,
      punch: r.punch,
      punchType: r.punch_type,
      userId: r.user_id,
      userName: r.user_name,
      branchName: r.branch_name,
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

export interface ZktAttendanceFilterOptions {
  branchNames: string[];
  users: { id: string; name: string }[];
}

/** Filter option lists for the Attendance Log page — both sourced purely from `zkt_attendance` itself (distinct branch_name values, and distinct user_id/user_name pairs), never from the app's own Branch/User models. */
export async function getZktAttendanceFilterOptions(): Promise<ZktAttendanceFilterOptions & { success: boolean; error?: string }> {
  try {
    if (!(await canAccessAttendanceLog())) {
      return { success: false, error: "Unauthorized", branchNames: [], users: [] };
    }

    const [branchRows, userRows] = await Promise.all([
      prisma.$queryRaw<{ branch_name: string | null }[]>(Prisma.sql`
        SELECT DISTINCT branch_name FROM public.zkt_attendance WHERE branch_name IS NOT NULL ORDER BY branch_name ASC
      `),
      prisma.$queryRaw<{ user_id: string; user_name: string | null }[]>(Prisma.sql`
        SELECT user_id, MAX(user_name) as user_name
        FROM public.zkt_attendance
        GROUP BY user_id
        ORDER BY LENGTH(user_id), user_id
      `),
    ]);

    return {
      success: true,
      branchNames: branchRows.map((r) => r.branch_name).filter((v): v is string => !!v),
      users: userRows.map((r) => ({ id: r.user_id, name: r.user_name ? `${r.user_name} (ID ${r.user_id})` : `ID ${r.user_id}` })),
    };
  } catch (error) {
    console.error("Error fetching zkt_attendance filter options:", error);
    return { success: false, error: "Failed to fetch filter options", branchNames: [], users: [] };
  }
}
