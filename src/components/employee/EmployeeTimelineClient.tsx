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
import { getEmployeeTimeRecords } from "@/actions/timeline.actions";

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

  const loadTimelineData = async () => {
    setLoading(true);
    try {
      const result = await getEmployeeTimeRecords(userId, selectedYear, selectedMonth);
      
      if (result.success) {
        setTimeRecords(result.records || []);
        setSummary(result.summary || null);
      } else {
        console.error('Failed to load timeline data:', result.error);
      }
    } catch (error) {
      console.error('Error loading timeline data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSummaryCards = () => [
    {
      title: "Working Days",
      value: summary?.workingDays || 0,
      icon: CalendarDays,
      description: "Total working days"
    },
    {
      title: "Present Days",
      value: summary?.presentDays || 0,
      icon: Clock,
      description: "Days attended"
    },
    {
      title: "Attendance Rate",
      value: `${summary?.attendancePercentage || 0}%`,
      icon: TrendingUp,
      description: "Overall attendance"
    },
    {
      title: "Total Overtime",
      value: summary?.totalOvertime || "00:00",
      icon: BarChart3,
      description: "Extra hours worked",
      variant: summary?.totalOvertime?.startsWith('-') ? "destructive" : "default"
    }
  ];

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
      {summary && (
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
                <Badge variant={summary.totalOvertime.startsWith('-') ? "destructive" : "default"}>
                  {summary.totalOvertime.startsWith('-') ? '' : '+'}
                  {summary.totalOvertime}
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
    </div>
  );
}