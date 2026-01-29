"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Clock, TrendingUp, BarChart3, Calendar, Download } from "lucide-react";
import { format } from "date-fns";
import EmployeeTimelineCalendar from "@/components/employee/EmployeeTimelineCalendar";
import EmployeeTimelineTable from "@/components/employee/EmployeeTimelineTable";
import EmployeeTimelineCharts from "@/components/employee/EmployeeTimelineCharts";
import { getTimelineRecords } from "@/actions/timeline.actions";

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
  let workingDays = 0;
  let presentDays = 0;
  let totalRequiredMinutes = 0;
  let totalActualMinutes = 0;
  let totalOvertimeMinutes = 0;

  records.forEach(record => {
    // Count working days (records with required times - not weekends/holidays)
    if (record.requiredCheckIn && record.requiredCheckOut) {
      workingDays++;
      
      // Add required time
      if (record.requiredActiveTime) {
        totalRequiredMinutes += timeStringToMinutes(record.requiredActiveTime);
      }
      
      // Count present days (records with actual check-in)
      if (record.actualCheckIn) {
        presentDays++;
        
        // Add actual time
        if (record.actualActiveTime) {
          totalActualMinutes += timeStringToMinutes(record.actualActiveTime);
        }
        
        // Add overtime/undertime
        if (record.overtimeUndertime) {
          totalOvertimeMinutes += timeStringToMinutes(record.overtimeUndertime);
        }
      }
    }
  });

  const attendancePercentage = workingDays > 0 
    ? ((presentDays / workingDays) * 100).toFixed(1)
    : '0.0';

  return {
    workingDays,
    presentDays,
    totalRequiredTime: minutesToTimeString(totalRequiredMinutes),
    totalActualTime: minutesToTimeString(totalActualMinutes),
    totalOvertime: minutesToTimeString(totalOvertimeMinutes),
    attendancePercentage
  };
}

interface TimeRecord {
  id: string;
  date: Date;
  requiredCheckIn: Date | null;
  requiredCheckOut: Date | null;
  requiredBreakTime: string | null;
  actualCheckIn: Date | null;
  actualCheckOut: Date | null;
  actualBreakTime: string | null;
  requiredActiveTime: string | null;
  actualActiveTime: string | null;
  overtimeUndertime: string | null;
}

interface TimelineSummary {
  workingDays: number;
  presentDays: number;
  totalRequiredTime: string;
  totalActualTime: string;
  totalOvertime: string;
  attendancePercentage: string;
}

interface EmployeeTimelineClientProps {
  userId: string;
}

export default function EmployeeTimelineClient({ userId }: EmployeeTimelineClientProps) {
  const [activeView, setActiveView] = useState<"calendar" | "table" | "charts">("calendar");
  const [timeRecords, setTimeRecords] = useState<TimeRecord[]>([]);
  const [summary, setSummary] = useState<TimelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined);

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

  // Load timeline data
  useEffect(() => {
    loadTimelineData();
  }, [selectedYear, selectedMonth]);

  // Recalculate summary when records change
  useEffect(() => {
    if (timeRecords.length > 0) {
      const calculatedSummary = calculateTimelineSummary(timeRecords);
      setSummary(calculatedSummary);
    } else {
      setSummary({
        workingDays: 0,
        presentDays: 0,
        totalRequiredTime: '00:00',
        totalActualTime: '00:00',
        totalOvertime: '00:00',
        attendancePercentage: '0.0'
      });
    }
  }, [timeRecords]);

  const loadTimelineData = async () => {
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
  };

  const getSummaryCards = () => {
    const isLoading = loading || !summary;
    const safeValue = (value: any, fallback: any = 0) => isLoading ? fallback : value;
    
    return [
      {
        title: "Working Days",
        value: isLoading ? "--" : summary?.workingDays || 0,
        icon: CalendarDays,
        description: "Total working days"
      },
      {
        title: "Present Days",
        value: isLoading ? "--" : summary?.presentDays || 0,
        icon: Clock,
        description: "Days attended"
      },
      {
        title: "Attendance Rate",
        value: isLoading ? "--" : `${summary?.attendancePercentage || 0}%`,
        icon: TrendingUp,
        description: "Overall attendance"
      },
      {
        title: "Total Overtime",
        value: isLoading ? "--" : (() => {
          const overtime = summary?.totalOvertime || "00:00";
          if (overtime === '00:00') return 'On Time';
          return overtime.startsWith('-') ? overtime : `+${overtime}`;
        })(),
        icon: BarChart3,
        description: "Extra hours worked",
        variant: (() => {
          const overtime = summary?.totalOvertime || "00:00";
          if (overtime === '00:00') return 'secondary';
          return overtime.startsWith('-') ? 'destructive' : 'default';
        })()
      }
    ];
  };

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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {getSummaryCards().map((card, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
              onValueChange={(value) => setActiveView(value as "calendar" | "table" | "charts")}
            >
              <TabsList>
                <TabsTrigger value="calendar">Calendar</TabsTrigger>
                <TabsTrigger value="table">Table</TabsTrigger>
                <TabsTrigger value="charts">Charts</TabsTrigger>
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
                />
              )}
              
              {activeView === "table" && (
                <EmployeeTimelineTable
                  records={timeRecords}
                />
              )}
              
              {activeView === "charts" && (
                <EmployeeTimelineCharts
                  records={timeRecords}
                  summary={summary}
                  year={selectedYear}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Additional Summary Details */}
      {!loading && summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Time Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Total Required Time:</span>
                <span className="font-medium">{summary.totalRequiredTime}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total Actual Time:</span>
                <span className="font-medium">{summary.totalActualTime}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2">
                <span>Net Overtime/Undertime:</span>
                <Badge variant={
                  summary.totalOvertime === '00:00' ? 'secondary' : 
                  summary.totalOvertime.startsWith('-') ? 'destructive' : 'default'
                }>
                  {summary.totalOvertime === '00:00' ? 'On Time' :
                   summary.totalOvertime.startsWith('-') ? summary.totalOvertime : 
                   `+${summary.totalOvertime}`}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Attendance Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Working Days:</span>
                <span className="font-medium">{summary.workingDays}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Present Days:</span>
                <span className="font-medium text-green-600">{summary.presentDays}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Absent Days:</span>
                <span className="font-medium text-red-600">{summary.workingDays - summary.presentDays}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2">
                <span>Attendance Rate:</span>
                <Badge variant="secondary">
                  {summary.attendancePercentage}%
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Show loading state for summary details */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="animate-pulse bg-gray-200 h-6 w-32 rounded"></div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="flex justify-between">
                    <div className="animate-pulse bg-gray-200 h-4 w-24 rounded"></div>
                    <div className="animate-pulse bg-gray-200 h-4 w-16 rounded"></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}