"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart3, TrendingUp, Clock, Calendar } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";

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

interface EmployeeTimelineChartsProps {
  records: TimeRecord[];
  summary: TimelineSummary | null;
  year: number;
}

// Helper function to convert time string to minutes
const timeToMinutes = (timeStr: string): number => {
  if (!timeStr || timeStr === '00:00') return 0;
  const isNegative = timeStr.startsWith('-');
  const cleanTime = timeStr.replace('-', '');
  const [hours, minutes] = cleanTime.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  return isNegative ? -totalMinutes : totalMinutes;
};

// Helper function to convert minutes to hours for display
const minutesToHours = (minutes: number): string => {
  const hours = Math.abs(minutes) / 60;
  return `${minutes < 0 ? '-' : ''}${hours.toFixed(1)}h`;
};

export default function EmployeeTimelineCharts({ 
  records, 
  summary, 
  year 
}: EmployeeTimelineChartsProps) {
  // Group records by month for yearly view
  const getMonthlyData = () => {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const months = eachMonthOfInterval({ start: yearStart, end: yearEnd });

    return months.map(month => {
      const monthRecords = records.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate.getMonth() === month.getMonth() && 
               recordDate.getFullYear() === month.getFullYear();
      });

      const workingDays = monthRecords.filter(r => r.requiredCheckIn || r.requiredCheckOut).length;
      const presentDays = monthRecords.filter(r => r.actualCheckIn && r.actualCheckOut).length;
      const attendanceRate = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;

      // Calculate total overtime for the month
      const totalOvertimeMinutes = monthRecords.reduce((sum, record) => {
        if (record.overtimeUndertime) {
          return sum + timeToMinutes(record.overtimeUndertime);
        }
        return sum;
      }, 0);

      return {
        month: format(month, 'MMM'),
        fullMonth: format(month, 'MMMM yyyy'),
        workingDays,
        presentDays,
        attendanceRate,
        totalOvertimeMinutes
      };
    });
  };

  const monthlyData = getMonthlyData();

  // Calculate weekly patterns
  const getWeeklyPattern = () => {
    const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    return weekDays.map((day, index) => {
      const dayRecords = records.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate.getDay() === index;
      });

      const workingDays = dayRecords.filter(r => r.requiredCheckIn || r.requiredCheckOut).length;
      const presentDays = dayRecords.filter(r => r.actualCheckIn && r.actualCheckOut).length;
      const attendanceRate = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;

      return {
        day,
        workingDays,
        presentDays,
        attendanceRate
      };
    });
  };

  const weeklyPattern = getWeeklyPattern();

  // Get attendance trend (last 30 days)
  const getRecentTrend = () => {
    const sortedRecords = [...records]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 30)
      .reverse();

    return sortedRecords.map(record => ({
      date: format(new Date(record.date), 'MMM dd'),
      present: (record.actualCheckIn && record.actualCheckOut) ? 1 : 0,
      required: (record.requiredCheckIn || record.requiredCheckOut) ? 1 : 0
    }));
  };

  const recentTrend = getRecentTrend();

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attendance Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.attendancePercentage}%</div>
            <Progress value={parseFloat(summary?.attendancePercentage || '0')} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Working Days</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.workingDays}</div>
            <p className="text-xs text-muted-foreground">
              Present: {summary?.presentDays}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Active Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalActualTime}</div>
            <p className="text-xs text-muted-foreground">
              Required: {summary?.totalRequiredTime}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Overtime</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalOvertime}</div>
            <Badge 
              variant={summary?.totalOvertime?.startsWith('-') ? "destructive" : "default"}
              className="mt-1"
            >
              {summary?.totalOvertime?.startsWith('-') ? 'Undertime' : 'Overtime'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Attendance Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Attendance - {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {monthlyData.map((month, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{month.fullMonth}</span>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Working: {month.workingDays}</span>
                    <span>Present: {month.presentDays}</span>
                    <span>{month.attendanceRate.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Progress 
                    value={month.attendanceRate} 
                    className="flex-1" 
                  />
                  <Badge 
                    variant={month.totalOvertimeMinutes >= 0 ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {minutesToHours(month.totalOvertimeMinutes)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Weekly Pattern */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Attendance Pattern</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {weeklyPattern.map((day, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium w-20">{day.day}</span>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>Working: {day.workingDays}</span>
                    <span>Present: {day.presentDays}</span>
                    <span>{day.attendanceRate.toFixed(1)}%</span>
                  </div>
                </div>
                <Progress value={day.attendanceRate} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Attendance Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Attendance Trend (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-32">
            {recentTrend.map((item, index) => {
              const height = item.required > 0 ? (item.present > 0 ? 100 : 20) : 10;
              const color = item.required === 0 ? 'bg-gray-200' : 
                          item.present > 0 ? 'bg-green-500' : 'bg-red-500';
              
              return (
                <div
                  key={index}
                  className="flex flex-col items-center flex-1"
                  title={`${item.date}: ${item.required === 0 ? 'Off Day' : 
                    item.present > 0 ? 'Present' : 'Absent'}`}
                >
                  <div
                    className={`${color} w-full rounded-t transition-all hover:opacity-80`}
                    style={{ height: `${height}%` }}
                  />
                  <div className="text-xs text-muted-foreground mt-1 transform -rotate-45 origin-left">
                    {item.date}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-center gap-4 mt-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span>Present</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span>Absent</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-gray-200 rounded"></div>
              <span>Off Day</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm">Punctuality Score</span>
              <div className="text-right">
                <div className="font-medium">
                  {(() => {
                    const onTimeRecords = records.filter(r => {
                      if (!r.requiredCheckIn || !r.actualCheckIn) return false;
                      const requiredTime = new Date(r.requiredCheckIn).getTime();
                      const actualTime = new Date(r.actualCheckIn).getTime();
                      return actualTime <= requiredTime;
                    });
                    const workingRecords = records.filter(r => r.requiredCheckIn && r.actualCheckIn);
                    const score = workingRecords.length > 0 ? 
                      (onTimeRecords.length / workingRecords.length * 100) : 0;
                    return `${score.toFixed(1)}%`;
                  })()}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm">Full Day Completion</span>
              <div className="text-right">
                <div className="font-medium">
                  {(() => {
                    const fullDayRecords = records.filter(r => 
                      r.actualCheckIn && r.actualCheckOut
                    );
                    const workingRecords = records.filter(r => 
                      r.requiredCheckIn || r.requiredCheckOut
                    );
                    const rate = workingRecords.length > 0 ? 
                      (fullDayRecords.length / workingRecords.length * 100) : 0;
                    return `${rate.toFixed(1)}%`;
                  })()}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm">Average Daily Hours</span>
              <div className="text-right">
                <div className="font-medium">
                  {(() => {
                    const recordsWithTime = records.filter(r => r.actualActiveTime);
                    if (recordsWithTime.length === 0) return '0h';
                    
                    const totalMinutes = recordsWithTime.reduce((sum, record) => {
                      return sum + timeToMinutes(record.actualActiveTime!);
                    }, 0);
                    
                    const avgHours = totalMinutes / recordsWithTime.length / 60;
                    return `${avgHours.toFixed(1)}h`;
                  })()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm">Regular Hours</span>
              <div className="text-right">
                <div className="font-medium">{summary?.totalRequiredTime}</div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm">Actual Hours</span>
              <div className="text-right">
                <div className="font-medium">{summary?.totalActualTime}</div>
              </div>
            </div>

            <div className="flex justify-between items-center border-t pt-2">
              <span className="text-sm">Extra/Missing Hours</span>
              <div className="text-right">
                <Badge 
                  variant={summary?.totalOvertime?.startsWith('-') ? "destructive" : "default"}
                >
                  {summary?.totalOvertime}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}