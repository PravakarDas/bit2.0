import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAttendanceInstant,
  resolveBusinessDateKey,
  resolveLocalDatePartsFromRecordDateKey,
  aggregateDailyPunches,
  calculateActiveTime,
  calculateOvertimeUndertime,
  addTimeStrings,
  computeDailyTimeRecordAttendanceUpdate,
  type ZktAttendanceRow,
} from "./zkt-attendance-sync.service";

const DHAKA = "Asia/Dhaka";

// A raw zkt_attendance.attendance_time value straight from Postgres: its
// UTC-getters already equal the local Dhaka wall-clock time verbatim (a
// "timestamp without time zone" column storing local time — see the
// service's own doc comments). Built the same way a real row would arrive.
function rawLocal(year: number, month: number, day: number, hour: number, minute: number, second = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function row(attendanceId: string, raw: Date, punch: number): ZktAttendanceRow {
  return { attendanceId, attendanceTime: raw, punch };
}

describe("resolveAttendanceInstant", () => {
  it("converts a Dhaka (+6) local wall-clock value into the correct real UTC instant", () => {
    const raw = rawLocal(2026, 2, 27, 11, 2, 45); // 11:02:45 local Dhaka
    const instant = resolveAttendanceInstant(raw, DHAKA);
    assert.equal(instant.toISOString(), "2026-02-27T05:02:45.000Z");
  });

  it("is a no-op for UTC itself (offset 0)", () => {
    const raw = rawLocal(2026, 2, 27, 11, 2, 45);
    const instant = resolveAttendanceInstant(raw, "UTC");
    assert.equal(instant.getTime(), raw.getTime());
  });
});

describe("resolveBusinessDateKey", () => {
  it("matches timeline.actions.ts's normalizeToStartOfDay convention exactly (local midnight expressed as shifted-UTC)", () => {
    // Local Dhaka Feb 27, any time of day -> DailyTimeRecord.date key of
    // 2026-02-26T18:00:00.000Z (documented in zkteco.service.ts as exactly
    // what "Feb 27 in Bangladesh" is stored as).
    const raw = rawLocal(2026, 2, 27, 0, 30, 0);
    const key = resolveBusinessDateKey(raw, DHAKA);
    assert.equal(key.toISOString(), "2026-02-26T18:00:00.000Z");
  });

  it("gives the same date key for any two times on the same local calendar day", () => {
    const morning = resolveBusinessDateKey(rawLocal(2026, 2, 27, 9, 0, 0), DHAKA);
    const evening = resolveBusinessDateKey(rawLocal(2026, 2, 27, 23, 59, 0), DHAKA);
    assert.equal(morning.toISOString(), evening.toISOString());
  });

  it("rolls over to the next day's key just after local midnight", () => {
    const key = resolveBusinessDateKey(rawLocal(2026, 2, 28, 0, 0, 1), DHAKA);
    assert.equal(key.toISOString(), "2026-02-27T18:00:00.000Z");
  });
});

describe("resolveLocalDatePartsFromRecordDateKey — inverse of resolveBusinessDateKey", () => {
  it("recovers the local Dhaka calendar day from a stored DailyTimeRecord.date value", () => {
    const parts = resolveLocalDatePartsFromRecordDateKey(new Date("2026-02-26T18:00:00.000Z"), DHAKA);
    assert.deepEqual(parts, { year: 2026, month: 1, day: 27 }); // month is 0-indexed: 1 = February
  });

  it("round-trips through resolveBusinessDateKey for an arbitrary raw punch", () => {
    const raw = rawLocal(2026, 3, 15, 14, 30, 0);
    const key = resolveBusinessDateKey(raw, DHAKA);
    const parts = resolveLocalDatePartsFromRecordDateKey(key, DHAKA);
    assert.deepEqual(parts, { year: 2026, month: 2, day: 15 }); // month is 0-indexed: 2 = March
  });
});

describe("aggregateDailyPunches", () => {
  it("returns all-null for an empty punch list", () => {
    const result = aggregateDailyPunches([], DHAKA);
    assert.deepEqual(result, { actualCheckIn: null, actualCheckOut: null, actualBreakTime: null, hasOpenBreak: false });
  });

  it("takes the first check-in and the last check-out when there are multiple of each", () => {
    const rows = [
      row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0),
      row("56", rawLocal(2026, 2, 27, 9, 5, 0), 0), // duplicate check-in, ignored
      row("56", rawLocal(2026, 2, 27, 17, 55, 0), 1), // early check-out
      row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1), // later check-out wins
    ];
    const result = aggregateDailyPunches(rows, DHAKA);
    assert.equal(result.actualCheckIn?.toISOString(), "2026-02-27T03:00:00.000Z");
    assert.equal(result.actualCheckOut?.toISOString(), "2026-02-27T12:00:00.000Z");
  });

  it("pairs a break-out/break-in into one break session and computes total minutes", () => {
    const rows = [
      row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0),
      row("56", rawLocal(2026, 2, 27, 13, 0, 0), 2), // break out
      row("56", rawLocal(2026, 2, 27, 14, 0, 0), 3), // break in (1 hour break)
      row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1),
    ];
    const result = aggregateDailyPunches(rows, DHAKA);
    assert.equal(result.actualBreakTime, "01:00");
    assert.equal(result.hasOpenBreak, false);
  });

  it("sums multiple break sessions in the same day", () => {
    const rows = [
      row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0),
      row("56", rawLocal(2026, 2, 27, 11, 0, 0), 2),
      row("56", rawLocal(2026, 2, 27, 11, 15, 0), 3), // 15 min break
      row("56", rawLocal(2026, 2, 27, 13, 0, 0), 2),
      row("56", rawLocal(2026, 2, 27, 13, 45, 0), 3), // 45 min break
      row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1),
    ];
    const result = aggregateDailyPunches(rows, DHAKA);
    assert.equal(result.actualBreakTime, "01:00");
    assert.equal(result.hasOpenBreak, false);
  });

  it("leaves an unclosed trailing Break Out open — no auto-close at check-out", () => {
    const rows = [
      row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0),
      row("56", rawLocal(2026, 2, 27, 17, 0, 0), 2), // break out, never returned
      row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1), // check-out does NOT close the break
    ];
    const result = aggregateDailyPunches(rows, DHAKA);
    assert.equal(result.actualBreakTime, null);
    assert.equal(result.hasOpenBreak, true);
  });

  it("returns null actualBreakTime when there is no break at all", () => {
    const rows = [row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0), row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1)];
    const result = aggregateDailyPunches(rows, DHAKA);
    assert.equal(result.actualBreakTime, null);
    assert.equal(result.hasOpenBreak, false);
  });

  it("a duplicate Break Out while one is already open resets the open time to the newer punch", () => {
    const rows = [
      row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0),
      row("56", rawLocal(2026, 2, 27, 13, 0, 0), 2), // break out (duplicate, discarded)
      row("56", rawLocal(2026, 2, 27, 13, 0, 5), 2), // break out again 5s later — this is the real open time
      row("56", rawLocal(2026, 2, 27, 13, 10, 5), 3), // break in — 10 min break from the RESET open time
      row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1),
    ];
    const result = aggregateDailyPunches(rows, DHAKA);
    assert.equal(result.actualBreakTime, "00:10");
    assert.equal(result.hasOpenBreak, false);
  });

  it("an orphan Break In with no open Break Out is not paired and flags the day", () => {
    const rows = [
      row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0),
      row("56", rawLocal(2026, 2, 27, 13, 0, 0), 3), // break in with nothing to close
      row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1),
    ];
    const result = aggregateDailyPunches(rows, DHAKA);
    assert.equal(result.actualBreakTime, null);
    assert.equal(result.hasOpenBreak, true);
  });

  it("still counts a valid closed break pair even when a later orphan Break In flags the day", () => {
    const rows = [
      row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0),
      row("56", rawLocal(2026, 2, 27, 11, 0, 0), 2), // break out
      row("56", rawLocal(2026, 2, 27, 11, 30, 0), 3), // break in — valid 30 min pair
      row("56", rawLocal(2026, 2, 27, 15, 0, 0), 3), // later orphan break in
      row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1),
    ];
    const result = aggregateDailyPunches(rows, DHAKA);
    assert.equal(result.actualBreakTime, "00:30");
    assert.equal(result.hasOpenBreak, true);
  });

  it("sorts out-of-order input rows chronologically before processing", () => {
    const rows = [
      row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1), // check-out listed first in the array
      row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0), // check-in listed second
    ];
    const result = aggregateDailyPunches(rows, DHAKA);
    assert.equal(result.actualCheckIn?.toISOString(), "2026-02-27T03:00:00.000Z");
    assert.equal(result.actualCheckOut?.toISOString(), "2026-02-27T12:00:00.000Z");
  });

  it("returns null actualCheckOut when the employee never checked out (still working / forgot to punch out)", () => {
    const rows = [row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0)];
    const result = aggregateDailyPunches(rows, DHAKA);
    assert.equal(result.actualCheckIn?.toISOString(), "2026-02-27T03:00:00.000Z");
    assert.equal(result.actualCheckOut, null);
  });
});

describe("calculateActiveTime / calculateOvertimeUndertime / addTimeStrings", () => {
  it("calculateActiveTime subtracts the break time from the checkin-checkout span", () => {
    const checkIn = new Date("2026-02-27T03:00:00.000Z");
    const checkOut = new Date("2026-02-27T12:00:00.000Z"); // 9 hours span
    assert.equal(calculateActiveTime(checkIn, checkOut, "01:00"), "08:00");
  });

  it("calculateActiveTime never goes negative even if break exceeds the span", () => {
    const checkIn = new Date("2026-02-27T03:00:00.000Z");
    const checkOut = new Date("2026-02-27T04:00:00.000Z"); // 1 hour span
    assert.equal(calculateActiveTime(checkIn, checkOut, "02:00"), "00:00");
  });

  it("calculateOvertimeUndertime is positive for overtime, negative for undertime", () => {
    assert.equal(calculateOvertimeUndertime("09:00", "08:00"), "01:00");
    assert.equal(calculateOvertimeUndertime("07:00", "08:00"), "-01:00");
    assert.equal(calculateOvertimeUndertime("08:00", "08:00"), "00:00");
  });

  it("addTimeStrings adds two HH:MM values, handling missing operands", () => {
    assert.equal(addTimeStrings("01:00", "00:30"), "01:30");
    assert.equal(addTimeStrings(null, "00:30"), "00:30");
    assert.equal(addTimeStrings("01:00", null), "01:00");
    assert.equal(addTimeStrings(null, null), "00:00");
    assert.equal(addTimeStrings("-01:00", "00:30"), "-00:30");
  });
});

describe("computeDailyTimeRecordAttendanceUpdate", () => {
  it("computes actual times and derived fields for a complete day", () => {
    const rows = [row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0), row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1)];
    const result = computeDailyTimeRecordAttendanceUpdate(rows, { requiredActiveTime: "08:00", requestedOvertime: null }, DHAKA);

    assert.equal(result.actualCheckIn?.toISOString(), "2026-02-27T03:00:00.000Z");
    assert.equal(result.actualCheckOut?.toISOString(), "2026-02-27T12:00:00.000Z");
    // Coalesced from aggregateDailyPunches's null to "00:00" — matches what
    // zkteco-sync.actions.ts persists for a no-break day, so isFilledString
    // (leave-automation.actions.ts) sees it as filled and can finalize.
    assert.equal(result.actualBreakTime, "00:00");
    assert.equal(result.actualActiveTime, "09:00");
    // overtimeUndertime = actualActiveTime - requiredActiveTime
    assert.equal(result.overtimeUndertime, "01:00");
    // officialOvertimeundertime = overtimeUndertime + requestedOvertime (matches
    // zkteco-sync.actions.ts's exact, doc-comment-reversed field mapping)
    assert.equal(result.officialOvertimeundertime, "01:00");
    assert.equal(result.hasOpenBreak, false);
  });

  it("adds requestedOvertime into officialOvertimeundertime but not into overtimeUndertime", () => {
    const rows = [row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0), row("56", rawLocal(2026, 2, 27, 17, 0, 0), 1)];
    const result = computeDailyTimeRecordAttendanceUpdate(rows, { requiredActiveTime: "08:00", requestedOvertime: "00:30" }, DHAKA);

    assert.equal(result.overtimeUndertime, "00:00");
    assert.equal(result.officialOvertimeundertime, "00:30");
  });

  it("leaves derived fields null when checkout hasn't happened yet", () => {
    const rows = [row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0)];
    const result = computeDailyTimeRecordAttendanceUpdate(rows, { requiredActiveTime: "08:00", requestedOvertime: null }, DHAKA);

    assert.equal(result.actualCheckOut, null);
    assert.equal(result.actualActiveTime, null);
    assert.equal(result.overtimeUndertime, null);
    assert.equal(result.officialOvertimeundertime, null);
  });

  it("leaves overtime fields null when requiredActiveTime isn't set on the existing record yet", () => {
    const rows = [row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0), row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1)];
    const result = computeDailyTimeRecordAttendanceUpdate(rows, { requiredActiveTime: null, requestedOvertime: null }, DHAKA);

    assert.equal(result.actualActiveTime, "09:00");
    assert.equal(result.overtimeUndertime, null);
    assert.equal(result.officialOvertimeundertime, null);
  });

  it("propagates hasOpenBreak so the caller can block isProcessed even though check-in/out are complete", () => {
    const rows = [
      row("56", rawLocal(2026, 2, 27, 9, 0, 0), 0),
      row("56", rawLocal(2026, 2, 27, 13, 0, 0), 2), // break out, never returned
      row("56", rawLocal(2026, 2, 27, 18, 0, 0), 1),
    ];
    const result = computeDailyTimeRecordAttendanceUpdate(rows, { requiredActiveTime: "08:00", requestedOvertime: null }, DHAKA);

    assert.equal(result.actualCheckIn !== null, true);
    assert.equal(result.actualCheckOut !== null, true);
    assert.equal(result.hasOpenBreak, true);
  });
});
