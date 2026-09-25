/**
 * Row shape shown on the Attendance Log page — sourced ENTIRELY from
 * `public.zkt_attendance`. Deliberately no join/cross-reference to the
 * app's own `User` model: this page is a read-only window onto exactly
 * what the device sync bridge wrote, nothing resolved or enriched.
 */
export interface ZktAttendanceLogRecord {
  id: string;
  attendanceTime: Date;
  punch: number | null;
  punchType: string | null;
  userId: string;
  userName: string | null;
  branchName: string | null;
}

export type ZktAttendanceLogSortField = "time" | "employee" | "punch" | "branch";

export interface ZktAttendanceLogFilters {
  search: string;
  /** Raw zkt_attendance.user_id values. */
  userIds: string[];
  /** Punch codes as strings ("0".."5", "255") — matches the string-keyed checkbox filter body. */
  punchCodes: string[];
  branchNames: string[];
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_ZKT_ATTENDANCE_LOG_FILTERS: ZktAttendanceLogFilters = {
  search: "",
  userIds: [],
  punchCodes: [],
  branchNames: [],
  dateFrom: "",
  dateTo: "",
};

export const PUNCH_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "Check In" },
  { value: "1", label: "Check Out" },
  { value: "2", label: "Break Out" },
  { value: "3", label: "Break In" },
  { value: "4", label: "Overtime In" },
  { value: "5", label: "Overtime Out" },
  { value: "255", label: "Unknown" },
];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Formats a raw `zkt_attendance.attendance_time` value EXACTLY as it's
 * stored in the database — no timezone conversion at all. The column is
 * "timestamp without time zone" and the sync bridge writes local wall-clock
 * values into it verbatim (see zkt-attendance-sync.service.ts's doc
 * comments), so `Date`'s UTC-getters already equal what's in the DB row.
 * Deliberately NOT using `date-fns`'s `format()` here — it reads the
 * Date's LOCAL (browser/server) time getters, which silently shifts the
 * displayed value by whatever timezone the viewer happens to be in (e.g.
 * 08:45:28 in the DB rendering as 2:45:28 PM for a GMT+6 viewer). This page
 * shows the raw stored value as-is, by explicit request.
 */
export function formatRawAttendanceTime(date: Date): string {
  const year = date.getUTCFullYear();
  const month = MONTH_NAMES[date.getUTCMonth()];
  const day = date.getUTCDate().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  const rawHours = date.getUTCHours();
  const ampm = rawHours >= 12 ? "PM" : "AM";
  const hours = rawHours % 12 === 0 ? 12 : rawHours % 12;
  return `${month} ${day}, ${year} ${hours}:${minutes}:${seconds} ${ampm}`;
}

export function punchBadgeClass(punch: number | null): string {
  switch (punch) {
    case 0:
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case 1:
      return "bg-red-50 text-red-700 border-red-200";
    case 2:
    case 3:
      return "bg-orange-50 text-orange-700 border-orange-200";
    case 4:
    case 5:
      return "bg-blue-50 text-blue-700 border-blue-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}
