/**
 * Pure logic for the "Local DB Table" (public.zkt_attendance) attendance
 * calculation method — no Prisma import here, so it's testable by the
 * dependency-free `node --test` harness (mirrors the existing split between
 * `zkteco.service.ts` (pure-ish, HTTP-based) and `zkteco-sync.actions.ts`
 * (Prisma-touching orchestration); the Prisma-touching counterpart for this
 * new path lives in `zkt-attendance-poller.service.ts`).
 *
 * `public.zkt_attendance` is an EXTERNALLY populated table (a device-sync
 * bridge writes to it independently of this app) and is deliberately never
 * added as a Prisma model — see `zkt-attendance-poller.service.ts` for why
 * it's queried via `$queryRaw` instead.
 */

export interface ZktAttendanceRow {
  /** zkt_attendance.user_id — matches User.attendanceId (both small numeric strings, e.g. "56"). */
  attendanceId: string;
  /**
   * zkt_attendance.attendance_time, straight from Postgres. The column is
   * "timestamp without time zone" and the sync bridge writes LOCAL wall-clock
   * values into it — Prisma/node-postgres has no timezone info to convert
   * with, so this Date's UTC-getters (`getUTCFullYear`, `getUTCHours`, ...)
   * already equal the local wall-clock date/time verbatim. Never treat this
   * as a real UTC instant directly — always go through
   * `resolveAttendanceInstant`/`resolveBusinessDateKey` first.
   */
  attendanceTime: Date;
  /** 0 = check in, 1 = check out, 2 = break out, 3 = break in. */
  punch: number;
}

export interface ProcessedAttendanceTimeData {
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  actualBreakTime: string | null; // HH:MM format
}

/**
 * Computes the UTC offset (in minutes, positive = ahead of UTC) that
 * `timeZone` observes around `date`. A single-pass lookup — exactly correct
 * for a fixed-offset zone with no DST (Asia/Dhaka, this app's only real
 * deployment target), and correct outside of a DST transition instant for
 * zones that do observe it.
 */
function getTimezoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(lookup("year"), lookup("month") - 1, lookup("day"), lookup("hour"), lookup("minute"), lookup("second"));
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/**
 * Converts a raw `zkt_attendance.attendance_time` value (local wall-clock
 * components mislabeled as UTC — see `ZktAttendanceRow.attendanceTime`'s doc)
 * into the actual UTC instant it represents, for storing into
 * `DailyTimeRecord.actualCheckIn`/`actualCheckOut` (which expect real UTC
 * instants, same as the existing live-API path via `parseZKTecoPunchTime`).
 */
export function resolveAttendanceInstant(rawAttendanceTime: Date, timeZone: string): Date {
  const offsetMinutes = getTimezoneOffsetMinutes(rawAttendanceTime, timeZone);
  return new Date(rawAttendanceTime.getTime() - offsetMinutes * 60_000);
}

/**
 * Resolves the `DailyTimeRecord.date` key for a raw punch — matches
 * `timeline.actions.ts`'s `normalizeToStartOfDay`/`getBangladeshDateParts`
 * convention exactly (local midnight, expressed as the equivalent
 * "shifted UTC" instant, e.g. Bangladesh midnight Feb 27 stored as
 * `2026-02-26T18:00:00.000Z`). Reads the raw value's own UTC-getter
 * Y/M/D directly — that's already the correct local calendar day, since
 * `zkt_attendance.attendance_time` stores local wall-clock values verbatim
 * (see `ZktAttendanceRow.attendanceTime`'s doc) — no offset conversion is
 * needed for the date part, only for constructing the shifted-UTC key.
 */
export function resolveBusinessDateKey(rawAttendanceTime: Date, timeZone: string): Date {
  const year = rawAttendanceTime.getUTCFullYear();
  const month = rawAttendanceTime.getUTCMonth();
  const day = rawAttendanceTime.getUTCDate();
  const offsetMinutes = getTimezoneOffsetMinutes(rawAttendanceTime, timeZone);
  return new Date(Date.UTC(year, month, day, 0, 0, 0) - offsetMinutes * 60_000);
}

/**
 * Inverse of `resolveBusinessDateKey`'s shift: given an EXISTING
 * `DailyTimeRecord.date` value (a real, valid UTC instant already using the
 * "shifted-UTC local midnight" convention, e.g. `2026-02-26T18:00:00.000Z`
 * for local Dhaka Feb 27), recovers the local calendar (year, month, day) —
 * `month` is 0-indexed, matching `Date.UTC`'s convention. Used by the
 * startup reconciliation path, which starts from an existing record rather
 * than a raw punch.
 */
export function resolveLocalDatePartsFromRecordDateKey(recordDateKey: Date, timeZone: string): { year: number; month: number; day: number } {
  const offsetMinutes = getTimezoneOffsetMinutes(recordDateKey, timeZone);
  const shifted = new Date(recordDateKey.getTime() + offsetMinutes * 60_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/**
 * Processes one (user, business day)'s full set of raw punch rows into
 * actual check-in/check-out/break-time — same algorithm as
 * `zkteco.service.ts`'s `processTransactions()` (first check-in, last
 * check-out, break sessions from paired punch=2/3 toggle events, an
 * unclosed trailing break closed at the last check-out), adapted for
 * `punch` as a number (0/1/2/3) instead of a `punch_state` string.
 */
export function aggregateDailyPunches(rows: ZktAttendanceRow[], timeZone: string): ProcessedAttendanceTimeData {
  if (!rows || rows.length === 0) {
    return { actualCheckIn: null, actualCheckOut: null, actualBreakTime: null };
  }

  const sorted = [...rows].sort((a, b) => a.attendanceTime.getTime() - b.attendanceTime.getTime());

  let actualCheckIn: Date | null = null;
  let actualCheckOut: Date | null = null;
  let activeBreakStart: Date | null = null;
  const breakSessions: { breakIn: Date; breakOut: Date }[] = [];

  for (const row of sorted) {
    const instant = resolveAttendanceInstant(row.attendanceTime, timeZone);

    switch (row.punch) {
      case 0: // Check In
        if (!actualCheckIn) {
          actualCheckIn = instant;
        }
        break;

      case 1: // Check Out
        actualCheckOut = instant;
        break;

      case 2: // Break Out
      case 3: // Break In
        if (activeBreakStart) {
          breakSessions.push({ breakIn: activeBreakStart, breakOut: instant });
          activeBreakStart = null;
        } else {
          activeBreakStart = instant;
        }
        break;
    }
  }

  // Policy: an unclosed trailing break is closed at the last check-out — matches zkteco.service.ts.
  if (activeBreakStart && actualCheckOut && actualCheckOut.getTime() > activeBreakStart.getTime()) {
    breakSessions.push({ breakIn: activeBreakStart, breakOut: actualCheckOut });
  }

  let totalBreakMinutes = 0;
  for (const session of breakSessions) {
    const duration = session.breakOut.getTime() - session.breakIn.getTime();
    if (duration > 0) {
      totalBreakMinutes += Math.floor(duration / (1000 * 60));
    }
  }
  totalBreakMinutes = Math.max(0, totalBreakMinutes);

  const actualBreakTime =
    totalBreakMinutes > 0 ? `${Math.floor(totalBreakMinutes / 60).toString().padStart(2, "0")}:${(totalBreakMinutes % 60).toString().padStart(2, "0")}` : null;

  return { actualCheckIn, actualCheckOut, actualBreakTime };
}

// --- Derived-time math: a deliberate, standalone copy of the same formulas
// already duplicated in zkteco-sync.actions.ts/timeline.actions.ts — NOT
// extracted into a shared module (explicit decision: avoid touching the 3
// existing, already-working call sites for this change). ---

function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const isNegative = timeStr.startsWith("-");
  const cleanStr = timeStr.replace("-", "");
  const [hours, minutes] = cleanStr.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes;
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

export function calculateActiveTime(checkIn: Date, checkOut: Date, breakTime: string): string {
  const diffMs = checkOut.getTime() - checkIn.getTime();
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const breakMinutes = timeStringToMinutes(breakTime || "00:00");
  const activeMinutes = totalMinutes - breakMinutes;
  return minutesToTimeString(Math.max(0, activeMinutes));
}

export function calculateOvertimeUndertime(actualActiveTime: string, requiredActiveTime: string): string {
  const actualMinutes = timeStringToMinutes(actualActiveTime);
  const requiredMinutes = timeStringToMinutes(requiredActiveTime);
  return minutesToTimeString(actualMinutes - requiredMinutes);
}

export function addTimeStrings(time1?: string | null, time2?: string | null): string {
  if (!time1 && !time2) return "00:00";
  if (!time1) return time2 || "00:00";
  if (!time2) return time1 || "00:00";
  return minutesToTimeString(timeStringToMinutes(time1) + timeStringToMinutes(time2));
}

export interface ExistingDailyTimeRecordSnapshot {
  requiredActiveTime: string | null;
  requestedOvertime: string | null;
}

export interface DailyTimeRecordAttendanceUpdate {
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  actualBreakTime: string | null;
  actualActiveTime: string | null;
  overtimeUndertime: string | null;
  officialOvertimeundertime: string | null;
}

/**
 * Builds the full `DailyTimeRecord` update payload for one (user, day) —
 * always a full recompute from every punch row available for that day
 * (never a partial "only fill nulls" patch, unlike `syncEmployeeTimeData`'s
 * live-API path), since the caller always has the day's complete punch set
 * on hand. Field-naming matches `zkteco-sync.actions.ts` exactly:
 * `overtimeUndertime` = raw actual-vs-required diff, `officialOvertimeundertime`
 * = that diff plus any admin-approved `requestedOvertime` — yes, this is the
 * reverse of what the two fields' own schema doc-comments describe, but it's
 * the existing, already-relied-upon behavior and this function deliberately
 * matches it rather than "fixing" a naming mismatch that's out of scope here.
 */
export function computeDailyTimeRecordAttendanceUpdate(
  punches: ZktAttendanceRow[],
  existing: ExistingDailyTimeRecordSnapshot,
  timeZone: string,
): DailyTimeRecordAttendanceUpdate {
  const { actualCheckIn, actualCheckOut, actualBreakTime } = aggregateDailyPunches(punches, timeZone);
  const effectiveBreakTime = actualBreakTime ?? "00:00";

  let actualActiveTime: string | null = null;
  let overtimeUndertime: string | null = null;
  let officialOvertimeundertime: string | null = null;

  if (actualCheckIn && actualCheckOut) {
    actualActiveTime = calculateActiveTime(actualCheckIn, actualCheckOut, effectiveBreakTime);

    if (existing.requiredActiveTime) {
      overtimeUndertime = calculateOvertimeUndertime(actualActiveTime, existing.requiredActiveTime);
      officialOvertimeundertime = addTimeStrings(overtimeUndertime, existing.requestedOvertime || "00:00");
    }
  }

  return {
    actualCheckIn,
    actualCheckOut,
    actualBreakTime,
    actualActiveTime,
    overtimeUndertime,
    officialOvertimeundertime,
  };
}
