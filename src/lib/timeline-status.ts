export type TimelineStatus = "PRESENT" | "ABSENT" | "ON_LEAVE" | "WEEKLY_OFF";

export interface TimelineStatusRecord {
  status?: TimelineStatus | null;
  isProcessed?: boolean | null;
  autoDeductedLeaveType?: string | null;
}

export interface TimelineStatusDisplay {
  label: string;
  variant: "default" | "destructive" | "outline" | "secondary";
  className?: string;
}

export function getTimelineStatusDisplay(
  record: TimelineStatusRecord,
): TimelineStatusDisplay | null {
  if (!record.isProcessed) {
    return null;
  }

  switch (record.status) {
    case "PRESENT":
      return {
        label: "Present",
        variant: "outline",
        className: "border-black text-black",
      };
    case "ABSENT":
      return {
        label: "Absent",
        variant: "destructive",
      };
    case "ON_LEAVE":
      return {
        label: record.autoDeductedLeaveType || "On Leave",
        variant: "outline",
        className: "border-red-200 bg-red-50 text-red-600",
      };
    case "WEEKLY_OFF":
      return {
        label: "Weekly Off",
        variant: "secondary",
      };
    default:
      return null;
  }
}
