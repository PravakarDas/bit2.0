"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import EmployeeTimelineCalendar from "@/components/employee/EmployeeTimelineCalendar";
import EmployeeTimelineTable from "@/components/employee/EmployeeTimelineTable";
import { getTimelineRecords, getLatestProcessedTimelineDate } from "@/actions/timeline.actions";
import type { TimelineStatus } from "@/lib/timeline-status";

/**
 * Convert time string (HH:MM) to minutes
 */
function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const isNegative = timeStr.startsWith('-');
  const cleanTime = timeStr.replace('-', '').replace('+', '');
  const [hours, minutes] = cleanTime.split(':').map(Number);
  const totalMinutes = (hours * 60) + minutes;
  return isNegative ? -totalMinutes : totalMinutes;
}

/**
 * Convert minutes to time string (HH:MM)
 */
function minutesToTimeString(minutes: number): string {
  if (minutes === 0) return '00:00';
  
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Calculate summary statistics from timeline records
 */
function calculateTimelineSummary(records: TimeRecord[]): TimelineSummary {
  let presentDays = 0;
  let absentDays = 0;
  let onLeaveDays = 0;
  let totalRequiredMinutes = 0;
  let totalRequiredBreakMinutes = 0;
  let totalActualMinutes = 0;
  let totalOvertimeMinutes = 0;

  records.forEach(record => {
    // Only include days that have been settled by the automation pipeline.
    // Unprocessed days (today / within the grace window) are excluded from every total.
    if (!record.isProcessed) return;

    // Day-type counts by status. Weekly-offs (and holidays, which have no
    // record) are intentionally excluded from the attendance breakdown.
    if (record.status === 'PRESENT') {
      presentDays++;
    } else if (record.status === 'ABSENT') {
      absentDays++;
    } else if (record.status === 'ON_LEAVE') {
      onLeaveDays++;
    }

    // Time totals (only meaningful for days that had required working hours)
    if (record.requiredCheckIn && record.requiredCheckOut) {
      if (record.requiredActiveTime) {
        totalRequiredMinutes += timeStringToMinutes(record.requiredActiveTime);
      }

      if (record.requiredBreakTime) {
        totalRequiredBreakMinutes += timeStringToMinutes(record.requiredBreakTime);
      }

      if (record.actualCheckIn) {
        if (record.actualActiveTime) {
          totalActualMinutes += timeStringToMinutes(record.actualActiveTime);
        }

        // Use the grand total (office + work-from-home) for the net OT/UT summary.
        if (record.officialOvertimeundertime) {
          totalOvertimeMinutes += timeStringToMinutes(record.officialOvertimeundertime);
        }
      }
    }
  });

  // Total Days = Present + Absent + On Leave (all settled, schedulable days).
  const totalDays = presentDays + absentDays + onLeaveDays;
  const attendancePercentage = totalDays > 0
    ? ((presentDays / totalDays) * 100).toFixed(1)
    : '0.0';

  return {
    workingDays: totalDays,
    totalDays,
    presentDays,
    absentDays,
    onLeaveDays,
    totalRequiredTime: minutesToTimeString(totalRequiredMinutes),
    totalRequiredBreakTime: minutesToTimeString(totalRequiredBreakMinutes),
    totalActualTime: minutesToTimeString(totalActualMinutes),
    totalOvertime: minutesToTimeString(totalOvertimeMinutes),
    attendancePercentage
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
}

interface TimelineSummary {
  workingDays: number;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  onLeaveDays: number;
  totalRequiredTime: string;
  totalRequiredBreakTime: string;
  totalActualTime: string;
  totalOvertime: string;
  attendancePercentage: string;
}

interface EmployeeTimelineClientProps {
  userId: string;
  baseSalary: number;
}

export default function EmployeeTimelineClient({ userId, baseSalary }: EmployeeTimelineClientProps) {
  void baseSalary;
  const [activeView, setActiveView] = useState<"calendar" | "table">("calendar");
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
  const [summary, setSummary] = useState<TimelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined);
  const [latestProcessedDate, setLatestProcessedDate] = useState<Date | null>(null);

  // Generate years (2026-2030)
  const years = Array.from({ length: 5 }, (_, i) => 2026 + i);
  const months = [
    { value: undefined, label: "All Months" },
    { value: 0, label: "January" },
    { value: 1, label: "February" },
    { value: 2, label: "March" },
    { value: 3, label: "April" },
    { value: 4, label: "May" },
    { value: 5, label: "June" },
    { value: 6, label: "July" },
    { value: 7, label: "August" },
    { value: 8, label: "September" },
    { value: 9, label: "October" },
    { value: 10, label: "November" },
    { value: 11, label: "December" }
  ];

  // Recalculate summary when records change
  useEffect(() => {
    if (timeRecords.length > 0) {
      const calculatedSummary = calculateTimelineSummary(timeRecords);
      setSummary(calculatedSummary);
    } else {
      setSummary({
        workingDays: 0,
        totalDays: 0,
        presentDays: 0,
        absentDays: 0,
        onLeaveDays: 0,
        totalRequiredTime: '00:00',
        totalActualTime: '00:00',
        totalOvertime: '00:00',
        totalRequiredBreakTime: '00:00',
        attendancePercentage: '0.0'
      });
    }
  }, [timeRecords]);

  const loadTimelineData = useCallback(async () => {
    setLoading(true);
    try {
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      
      if (selectedMonth !== undefined) {
        // Specific month selected
        startDate = new Date(selectedYear, selectedMonth, 1);
        endDate = new Date(selectedYear, selectedMonth + 1, 0);
      } else {
        // Whole year selected
        startDate = new Date(selectedYear, 0, 1);
        endDate = new Date(selectedYear, 11, 31);
      }
      
      const result = await getTimelineRecords(userId, startDate, endDate);
      
      if (result.success) {
        const records = result.records || [];
        setTimeRecords(records);
        
        // Calculate dynamic summary from the loaded records
        const calculatedSummary = calculateTimelineSummary(records);
        setSummary(calculatedSummary);
      } else {
        console.error('Failed to load timeline data:', result.error);
      }
    } catch (error) {
      console.error('Error loading timeline data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, userId]);

  // Load timeline data
  useEffect(() => {
    void loadTimelineData();
  }, [loadTimelineData]);

  // Absolute latest processed date (ignores the period filter) so the employee
  // always knows how current the attendance data is.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getLatestProcessedTimelineDate(userId);
        if (!cancelled && result.success) {
          setLatestProcessedDate(result.date ? new Date(result.date) : null);
        }
      } catch (error) {
        console.error('Error loading latest processed date:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const getPeriodLabel = () => {
    if (selectedMonth !== undefined) {
      return `${months.find(m => m.value === selectedMonth)?.label} ${selectedYear}`;
    }
    return `Year ${selectedYear}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Timeline</h1>
          <p className="text-muted-foreground">
            Track your attendance and working hours
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Period Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Period Selection</CardTitle>
            <div className="flex gap-2">
              <Select
                value={selectedYear.toString()}
                onValueChange={(value) => setSelectedYear(parseInt(value))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select
                value={selectedMonth?.toString() || "all"}
                onValueChange={(value) => setSelectedMonth(value === "all" ? undefined : parseInt(value))}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem 
                      key={month.value?.toString() || "all"} 
                      value={month.value?.toString() || "all"}
                    >
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <CardDescription>
            Viewing data for {getPeriodLabel()}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Attendance Records</CardTitle>
              <CardDescription>
                {getPeriodLabel()} timeline view
              </CardDescription>
            </div>
            <Tabs
              value={activeView}
              onValueChange={(value) => setActiveView(value as "calendar" | "table")}
            >
              <TabsList>
                <TabsTrigger value="calendar">Calendar</TabsTrigger>
                <TabsTrigger value="table">Table</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-200 h-20 rounded"></div>
              ))}
            </div>
          ) : (
            <>
              {activeView === "calendar" && (
                <EmployeeTimelineCalendar
                  records={timeRecords}
                  year={selectedYear}
                  month={selectedMonth}
                  summary={summary}
                  latestProcessedDate={latestProcessedDate}
                />
              )}

              {activeView === "table" && (
                <EmployeeTimelineTable
                  records={timeRecords}
                  summary={summary}
                  latestProcessedDate={latestProcessedDate}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}