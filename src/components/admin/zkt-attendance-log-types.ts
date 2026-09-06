export interface ZktAttendanceLogRecord {
  id: string;
  attendanceTime: Date;
  punch: number | null;
  punchType: string | null;
  deviceUserId: string;
  deviceUserName: string | null;
  branchName: string | null;
  deviceName: string | null;
  deviceIp: string | null;
  serialNumber: string | null;
  appUserId: string | null;
  appFirstName: string | null;
  appLastName: string | null;
  appEmail: string | null;
}

export type ZktAttendanceLogSortField = "time" | "employee" | "punch" | "branch" | "device" | "serial";

export interface ZktAttendanceLogFilters {
  search: string;
  employeeIds: string[];
  /** Punch codes as strings ("0".."5", "255") — matches the string-keyed checkbox filter body. */
  punchCodes: string[];
  branchNames: string[];
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_ZKT_ATTENDANCE_LOG_FILTERS: ZktAttendanceLogFilters = {
  search: "",
  employeeIds: [],
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
