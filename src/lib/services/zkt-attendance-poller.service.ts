import { prisma } from "@/lib/prisma";
import { getRuntimeSystemControlConfig } from "@/lib/system-control";
import {
  computeDailyTimeRecordAttendanceUpdate,
  resolveBusinessDateKey,
  resolveLocalDatePartsFromRecordDateKey,
  type ZktAttendanceRow,
} from "./zkt-attendance-sync.service";

/**
 * Prisma-touching orchestration for the "Local DB Table" attendance
 * calculation method — reads the externally-populated `public.zkt_attendance`
 * table (never modeled in `prisma/schema.prisma`, since this app doesn't own
 * it — an outside device-sync bridge writes to it independently) via
 * parameterized `$queryRaw`, and writes into the existing, Prisma-modeled
 * `DailyTimeRecord` table. Pure calc/aggregation logic lives in
 * `zkt-attendance-sync.service.ts`; this file only does I/O + orchestration.
 */

interface RawZktAttendanceRow {
  id: bigint;
  user_id: string;
  attendance_time: Date;
  punch: number | null;
}

async function fetchNewZktAttendanceRows(afterId: bigint, limit: number): Promise<RawZktAttendanceRow[]> {
  return prisma.$queryRaw<RawZktAttendanceRow[]>`
    SELECT id, user_id, attendance_time, punch
    FROM public.zkt_attendance
    WHERE id > ${afterId}
    ORDER BY id ASC
    LIMIT ${limit}
  `;
}

async function fetchDayPunchesForAttendanceId(attendanceId: string, dayStart: Date, dayEnd: Date): Promise<RawZktAttendanceRow[]> {
  return prisma.$queryRaw<RawZktAttendanceRow[]>`
    SELECT id, user_id, attendance_time, punch
    FROM public.zkt_attendance
    WHERE user_id = ${attendanceId}
      AND attendance_time >= ${dayStart}
      AND attendance_time < ${dayEnd}
    ORDER BY id ASC
  `;
}

/**
 * Recomputes and writes one (user, local calendar day)'s actual attendance
 * fields from every zkt_attendance row on that day. Never creates a
 * `DailyTimeRecord` shell (mirrors `syncEmployeeTimeData`'s existing
 * behavior — a shell is expected to already exist from the daily timeline
 * generation cron) and never touches a row once `isProcessed` is true
 * (leave-automation or a manual edit has already finalized it). Returns
 * `true` only when an update was actually written.
 */
async function recomputeDayForAttendanceId(attendanceId: string, year: number, month: number, day: number, timeZone: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { attendanceId, isArchived: false, employeeStatus: "ACTIVE" },
    select: { id: true },
  });
  if (!user) {
    return false;
  }

  const dayStart = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(year, month, day + 1, 0, 0, 0));
  // dayStart's own UTC-getters are exactly (year, month, day, 0, 0, 0), the
  // same shape resolveBusinessDateKey expects as input, so it's reused
  // as-is to derive the record's date key (the "shifted UTC local midnight"
  // convention — see zkt-attendance-sync.service.ts's doc comments).
  const dateKey = resolveBusinessDateKey(dayStart, timeZone);

  const record = await prisma.dailyTimeRecord.findUnique({
    where: { userId_date: { userId: user.id, date: dateKey } },
    select: { id: true, isProcessed: true, requiredActiveTime: true, requestedOvertime: true },
  });
  if (!record || record.isProcessed) {
    return false;
  }

  const punchRows = await fetchDayPunchesForAttendanceId(attendanceId, dayStart, dayEnd);
  if (punchRows.length === 0) {
    return false;
  }

  const punches: ZktAttendanceRow[] = punchRows
    .filter((r) => r.punch !== null)
    .map((r) => ({ attendanceId: r.user_id, attendanceTime: r.attendance_time, punch: r.punch as number }));

  const update = computeDailyTimeRecordAttendanceUpdate(punches, { requiredActiveTime: record.requiredActiveTime, requestedOvertime: record.requestedOvertime }, timeZone);

  await prisma.dailyTimeRecord.update({
    where: { id: record.id },
    data: {
      actualCheckIn: update.actualCheckIn,
      actualCheckOut: update.actualCheckOut,
      actualBreakTime: update.actualBreakTime,
      actualActiveTime: update.actualActiveTime,
      overtimeUndertime: update.overtimeUndertime,
      officialOvertimeundertime: update.officialOvertimeundertime,
      hasOpenBreak: update.hasOpenBreak,
    },
  });

  return true;
}

export interface PollResult {
  processedDays: number;
  skippedDays: number;
  cursorAdvancedTo: string;
}

/**
 * One poll tick: reads every zkt_attendance row newer than the stored
 * cursor, groups them by (attendanceId, local day) so a burst of punches
 * for the same person/day only triggers one recompute, then advances the
 * cursor past every row seen — including rows for an unmatched/inactive
 * user or an already-`isProcessed` day — so the poller always makes forward
 * progress and never reprocesses the same rows on the next tick.
 */
export async function processNewZktAttendanceRows(batchSize = 2000): Promise<PollResult> {
  const settings = await getRuntimeSystemControlConfig();
  const cursor = BigInt(settings.zktAttendanceLastProcessedId ?? 0);
  const timeZone = settings.appTimezone || "Asia/Dhaka";

  const rows = await fetchNewZktAttendanceRows(cursor, batchSize);
  if (rows.length === 0) {
    return { processedDays: 0, skippedDays: 0, cursorAdvancedTo: cursor.toString() };
  }

  const affected = new Map<string, { attendanceId: string; year: number; month: number; day: number }>();
  let maxId = cursor;
  for (const row of rows) {
    if (row.id > maxId) {
      maxId = row.id;
    }
    const year = row.attendance_time.getUTCFullYear();
    const month = row.attendance_time.getUTCMonth();
    const day = row.attendance_time.getUTCDate();
    const key = `${row.user_id}|${year}-${month}-${day}`;
    if (!affected.has(key)) {
      affected.set(key, { attendanceId: row.user_id, year, month, day });
    }
  }

  let processedDays = 0;
  let skippedDays = 0;
  for (const { attendanceId, year, month, day } of affected.values()) {
    const updated = await recomputeDayForAttendanceId(attendanceId, year, month, day, timeZone);
    if (updated) {
      processedDays++;
    } else {
      skippedDays++;
    }
  }

  await prisma.systemControlSettings.update({ where: { id: "global" }, data: { zktAttendanceLastProcessedId: maxId } });

  return { processedDays, skippedDays, cursorAdvancedTo: maxId.toString() };
}

export interface OnDemandRecomputeResult {
  /** Whether any zkt_attendance punch rows exist for this (user, day) at all. */
  found: boolean;
  /** Whether the DailyTimeRecord was actually written to. */
  updated: boolean;
  reason?: string;
}

/**
 * On-demand counterpart to the periodic poll/startup reconciliation, for a
 * single (user, day) — used when an admin explicitly asks the system to
 * check `zkt_attendance` right now: the "Sync" button, or immediately after
 * "Mark as Unprocessed & Re-fetch". The periodic poll (`processNewZktAttendanceRows`)
 * only looks at rows newer than its stored cursor, so an already-seen day's
 * punches are otherwise invisible to it again until a full server restart
 * runs `reconcileUnprocessedDailyTimeRecords` — an admin shouldn't have to
 * wait for that, or restart the server, just to re-check one day.
 */
export async function recomputeAttendanceForUserOnDemand(userId: string, recordDate: Date): Promise<OnDemandRecomputeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { attendanceId: true, isArchived: true, employeeStatus: true },
  });

  if (!user?.attendanceId) {
    return { found: false, updated: false, reason: "This employee has no attendance device ID configured." };
  }
  if (user.isArchived || user.employeeStatus !== "ACTIVE") {
    return { found: false, updated: false, reason: "This employee is not active." };
  }

  const settings = await getRuntimeSystemControlConfig();
  const timeZone = settings.appTimezone || "Asia/Dhaka";
  const { year, month, day } = resolveLocalDatePartsFromRecordDateKey(recordDate, timeZone);

  const dayStart = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(year, month, day + 1, 0, 0, 0));
  const punchRows = await fetchDayPunchesForAttendanceId(user.attendanceId, dayStart, dayEnd);
  if (punchRows.length === 0) {
    return { found: false, updated: false, reason: "No attendance data found yet in zkt_attendance for this day." };
  }

  const updated = await recomputeDayForAttendanceId(user.attendanceId, year, month, day, timeZone);
  return {
    found: true,
    updated,
    reason: updated ? undefined : "Attendance data exists but this day is already finalized or has no matching record to update.",
  };
}

export interface ReconcileResult {
  scanned: number;
  updated: number;
}

/**
 * Startup reconciliation: finds every `DailyTimeRecord` that's `PRESENT`,
 * not yet `isProcessed`, and still missing at least one actual field, then
 * checks `zkt_attendance` for that (user, day) — filling it in if punch data
 * already exists there. Unbounded (scans all history, not just recent days)
 * per explicit instruction; safe because the query is a normal indexed
 * `WHERE` filter, not a full-table scan, regardless of date range.
 */
export async function reconcileUnprocessedDailyTimeRecords(): Promise<ReconcileResult> {
  const settings = await getRuntimeSystemControlConfig();
  const timeZone = settings.appTimezone || "Asia/Dhaka";

  const candidates = await prisma.dailyTimeRecord.findMany({
    where: {
      status: "PRESENT",
      isProcessed: false,
      OR: [{ actualCheckIn: null }, { actualCheckOut: null }, { actualBreakTime: null }],
    },
    select: {
      date: true,
      user: { select: { attendanceId: true, isArchived: true, employeeStatus: true } },
    },
  });

  let updated = 0;
  for (const record of candidates) {
    const attendanceId = record.user.attendanceId;
    if (!attendanceId || record.user.isArchived || record.user.employeeStatus !== "ACTIVE") {
      continue;
    }

    const { year, month, day } = resolveLocalDatePartsFromRecordDateKey(record.date, timeZone);
    const wasUpdated = await recomputeDayForAttendanceId(attendanceId, year, month, day, timeZone);
    if (wasUpdated) {
      updated++;
    }
  }

  return { scanned: candidates.length, updated };
}
