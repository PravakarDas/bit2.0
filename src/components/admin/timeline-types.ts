export type TimelineStatusValue = "PRESENT" | "ABSENT" | "ON_LEAVE" | "WEEKLY_OFF";

/** "BLANK" is a synthetic filter-only value meaning isProcessed === false (no status badge shown). */
export type TimelineStatusFilterValue = TimelineStatusValue | "BLANK";

export interface TimeRecord {
  id: string;
  date: Date;
  isProcessed: boolean;
  status: TimelineStatusValue;
  lateCheckInMinutes: number | null;
  lateCheckInPenalty: number | null;
  latePenaltyReversible: boolean;
  latePenaltyReversed: boolean;
  requiredCheckIn: Date | null;
  requiredCheckOut: Date | null;
  requiredBreakTime: string | null;
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  actualBreakTime: string | null;
  requiredActiveTime: string | null;
  actualActiveTime: string | null;
  overtimeUndertime: string | null;
  officialOvertimeundertime: string | null;
  requestedOvertime: string | null;
  autoDeductedLeaveType: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    leaveEntitlements?: Array<{
      id: string;
      allocatedDays: number;
      usedDays: number;
      leaveType: {
        id: string;
        name: string;
      };
    }>;
    branch: {
      name: string;
      weeklyOffDays: string[];
      checkInTime: string;
      checkOutTime: string;
    } | null;
  };
}

export interface BranchOption {
  id: string;
  name: string;
}

export interface EmployeeOption {
  id: string;
  name: string;
}

export type TimelineSortField =
  | "employee"
  | "branch"
  | "date"
  | "status"
  | "checkIn"
  | "checkOut"
  | "lateMinutes"
  | "activeTime"
  | "otUt";

export interface SortState {
  field: TimelineSortField | null;
  order: "asc" | "desc";
}

export interface ColumnFilters {
  employeeIds: string[];
  branchIds: string[];
  statuses: TimelineStatusFilterValue[];
  dateFrom: string;
  dateTo: string;
  lateMin: string;
  lateMax: string;
  checkInFrom: string;
  checkInTo: string;
  checkOutFrom: string;
  checkOutTo: string;
  activeTimeMin: string;
  activeTimeMax: string;
  otUtMin: string;
  otUtMax: string;
}

export const EMPTY_COLUMN_FILTERS: ColumnFilters = {
  employeeIds: [],
  branchIds: [],
  statuses: [],
  dateFrom: "",
  dateTo: "",
  lateMin: "",
  lateMax: "",
  checkInFrom: "",
  checkInTo: "",
  checkOutFrom: "",
  checkOutTo: "",
  activeTimeMin: "",
  activeTimeMax: "",
  otUtMin: "",
  otUtMax: "",
};

export const STATUS_OPTIONS: { value: TimelineStatusFilterValue; label: string }[] = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "ON_LEAVE", label: "On Leave" },
  { value: "WEEKLY_OFF", label: "Weekly Off" },
  { value: "BLANK", label: "Blank (Unprocessed)" },
];
