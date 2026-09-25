"use client";

import { useState, useEffect, useCallback } from "react";
import {
  startOfMonth,
  endOfMonth,
  format,
  formatDate,
} from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import EmployeeTimelineTable from "@/components/employee/EmployeeTimelineTable";
import AttendanceSummaryStats, {
  type AttendanceSummaryStatsData,
} from "@/components/employee/AttendanceSummaryStats";
import TimelineCalendarOverview from "@/components/employee/TimelineCalendarOverview";
import { getTimelineRecords, getLatestProcessedTimelineDate, type TimelineSortField } from "@/actions/timeline.actions";
import type { TimelineStatus } from "@/lib/timeline-status";

export interface EmployeeSortState {
  field: TimelineSortField | null;
  order: "asc" | "desc";
}

function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const isNegative = timeStr.startsWith("-");
  const cleanTime = timeStr.replace("-", "").replace("+", "");
  const [hours, minutes] = cleanTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes;
  return isNegative ? -totalMinutes : totalMinutes;
}

function minutesToTimeString(minutes: number): string {
  if (minutes === 0) return "00:00";

  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;

  const sign = minutes < 0 ? "-" : "+";
  return `${sign}${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}`;
}

function calculateTimelineSummary(
  records: TimeRecord[]
): AttendanceSummaryStatsData {
  let presentDays = 0;
  let absentDays = 0;
  let onLeaveDays = 0;
  let lateDays = 0;
  let totalOvertimeMinutes = 0;

  records.forEach((record) => {
    if (!record.isProcessed) return;

    if (record.status === "PRESENT") {
      presentDays++;
    } else if (record.status === "ABSENT") {
      absentDays++;
    } else if (record.status === "ON_LEAVE") {
      onLeaveDays++;
    }

    // Count late days (lateCheckInMinutes > 0)
    if (record.lateCheckInMinutes && record.lateCheckInMinutes > 0) {
      lateDays++;
    }

    // Calculate total overtime/undertime
    if (record.officialOvertimeundertime) {
      totalOvertimeMinutes += timeStringToMinutes(record.officialOvertimeundertime);
    }
  });

  const totalDays = presentDays + absentDays + onLeaveDays;
  const totalOvertime = minutesToTimeString(totalOvertimeMinutes);

  return {
    totalDays,
    presentDays,
    absentDays,
    onLeaveDays,
    lateDays,
    totalOvertime,
  };
}

interface TimeRecord {
  id: string;
  date: Date;
  status?: TimelineStatus | null;
  isProcessed: boolean;
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
  lateCheckInMinutes?: number | null;
}

interface EmployeeTimelineClientProps {
  userId: string;
  baseSalary: number;
}

export default function EmployeeTimelineClient({
  userId,
  baseSalary,
}: EmployeeTimelineClientProps) {
  void baseSalary;
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
  const [summaryStats, setSummaryStats] = useState<AttendanceSummaryStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [latestProcessedDate, setLatestProcessedDate] = useState<Date | null>(null);

  // Date range state - default to current month
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [startDate, setStartDate] = useState<Date>(monthStart);
  const [endDate, setEndDate] = useState<Date>(monthEnd);
  const [displayMonth, setDisplayMonth] = useState<Date>(now);
  const [sort, setSort] = useState<EmployeeSortState>({ field: null, order: "asc" });

  const handleSortChange = (field: TimelineSortField) => {
    setSort((prev) => {
      if (prev.field !== field) return { field, order: "asc" };
      if (prev.order === "asc") return { field, order: "desc" };
      return { field: null, order: "asc" };
    });
  };

  const loadTimelineData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getTimelineRecords(userId, startDate, endDate, {
        sortBy: sort.field || undefined,
        sortOrder: sort.order,
      });

      if (result.success) {
        const records = result.records || [];
        setTimeRecords(records);

        // Calculate summary from the loaded records
        const stats = calculateTimelineSummary(records);
        setSummaryStats(stats);
      } else {
        console.error("Failed to load timeline data:", result.error);
      }
    } catch (error) {
      console.error("Error loading timeline data:", error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, userId, sort]);

  // Load timeline data when date range changes
  useEffect(() => {
    void loadTimelineData();
  }, [loadTimelineData]);

  // Get latest processed date
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getLatestProcessedTimelineDate(userId);
        if (!cancelled && result.success) {
          setLatestProcessedDate(result.date ? new Date(result.date) : null);
        }
      } catch (error) {
        console.error("Error loading latest processed date:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handlePreviousMonth = () => {
    const newMonth = new Date(
      displayMonth.getFullYear(),
      displayMonth.getMonth() - 1,
      1
    );
    setDisplayMonth(newMonth);
    setStartDate(startOfMonth(newMonth));
    setEndDate(endOfMonth(newMonth));
  };

  const handleNextMonth = () => {
    const newMonth = new Date(
      displayMonth.getFullYear(),
      displayMonth.getMonth() + 1,
      1
    );
    setDisplayMonth(newMonth);
    setStartDate(startOfMonth(newMonth));
    setEndDate(endOfMonth(newMonth));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Attendance Timeline</h1>
          <p className="text-gray-600 mt-1">
            View and analyze daily attendance and working hours
          </p>
        </div>
      </div>

      {/* Date Range Navigation */}
      <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreviousMonth}
            className="h-9 w-9 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const now = new Date();
              setDisplayMonth(now);
              setStartDate(startOfMonth(now));
              setEndDate(endOfMonth(now));
            }}
          >
            This Month
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextMonth}
            className="h-9 w-9 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="text-sm font-semibold text-gray-900">
          {format(startDate, "MMM dd")} - {format(endDate, "MMM dd, yyyy")}
        </div>

        <div />
      </div>

      {/* Summary Stats - 6 Cards */}
      {!loading && (
        <AttendanceSummaryStats data={summaryStats} />
      )}

      {/* Calendar Overview */}
      {!loading && (
        <TimelineCalendarOverview
          records={timeRecords}
          month={displayMonth}
        />
      )}

      {/* Detailed Records Table */}
      {loading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse bg-gray-200 h-20 rounded"
                ></div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmployeeTimelineTable
          records={timeRecords}
          summary={null}
          latestProcessedDate={latestProcessedDate}
          sort={sort}
          onSortChange={handleSortChange}
        />
      )}
    </div>
  );
}