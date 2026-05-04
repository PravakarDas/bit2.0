"use client";

import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, addDays, isSameMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import EmployeeProfileLink from "@/components/admin/EmployeeProfileLink";
import { getTimelineStatusDisplay, type TimelineStatus } from "@/lib/timeline-status";

interface TimeRecord {
  id: string;
  date: Date;
  status: TimelineStatus | null;
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
  autoDeductedLeaveType: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    branch: {
      name: string;
      weeklyOffDays: string[];
      checkInTime: string;
      checkOutTime: string;
    } | null;
  };
}

interface TimelineCalendarViewProps {
  records: TimeRecord[];
  loading: boolean;
  onRecordUpdate: () => void;
}

export default function TimelineCalendarView({
  records,
  loading
}: Omit<TimelineCalendarViewProps, "onRecordUpdate">) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarGridDays: Date[] = [];

  let day = calendarStart;
  while (day <= calendarEnd) {
    calendarGridDays.push(day);
    day = addDays(day, 1);
  }

  const previousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  // Group records by date
  const recordsByDate = records.reduce((acc, record) => {
    const dateKey = format(new Date(record.date), 'yyyy-MM-dd');
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(record);
    return acc;
  }, {} as { [key: string]: TimeRecord[] });

  const getDateSummary = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayRecords = recordsByDate[dateKey] || [];
    const processedRecords = dayRecords.filter(record => record.isProcessed);
    
    const total = processedRecords.length;
    const present = processedRecords.filter(r => r.status === "PRESENT").length;
    const onLeave = processedRecords.filter(r => r.status === "ON_LEAVE").length;
    const weeklyOff = processedRecords.filter(r => r.status === "WEEKLY_OFF").length;
    const absent = processedRecords.filter(r => r.status === "ABSENT").length;
    
    return { total, present, onLeave, weeklyOff, absent, records: processedRecords };
  };

  const selectedDayRecords = selectedDay ? getDateSummary(selectedDay).records : [];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-gray-200 h-64 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {format(currentMonth, 'MMMM yyyy')}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={previousMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCurrentMonth(new Date())}
          >
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-4">
              {/* Days of Week Header */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1">
                {calendarGridDays.map((day) => {
                  const isInCurrentMonth = isSameMonth(day, currentMonth);
                  const summary = getDateSummary(day);
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "min-h-20 p-2 text-left border rounded-lg transition-colors",
                        isInCurrentMonth ? "hover:bg-gray-50" : "bg-muted/40 text-muted-foreground/60",
                        isSelected && "border-primary bg-primary/5",
                        isToday && "border-blue-500 bg-blue-50"
                      )}
                    >
                      <div className="text-sm font-medium mb-1">
                        {isInCurrentMonth ? format(day, 'd') : ''}
                      </div>
                      
                      {isInCurrentMonth && summary.total > 0 && (
                        <div className="space-y-1">
                          {summary.present > 0 && (
                            <Badge variant="default" className="text-xs">
                              Present: {summary.present}
                            </Badge>
                          )}
                          {summary.onLeave > 0 && (
                            <Badge variant="outline" className="text-xs">
                              On Leave: {summary.onLeave}
                            </Badge>
                          )}
                          {summary.absent > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              Absent: {summary.absent}
                            </Badge>
                          )}
                          {summary.weeklyOff > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              Weekly Off: {summary.weeklyOff}
                            </Badge>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Selected Day Details */}
        <div className="space-y-4">
          {selectedDay ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {format(selectedDay, 'MMMM dd, yyyy')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedDayRecords.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No records for this date
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedDayRecords.map((record) => (
                      <div key={record.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm">
                            <EmployeeProfileLink
                              employeeId={record.user.id}
                              name={record.user.firstName && record.user.lastName
                                ? `${record.user.firstName} ${record.user.lastName}`
                                : undefined}
                              email={record.user.email}
                            />
                          </div>
                          {(() => {
                            const display = getTimelineStatusDisplay(record);

                            if (!display) {
                              return null;
                            }

                            return (
                              <Badge variant={display.variant} className={display.className}>
                                {display.label}
                              </Badge>
                            );
                          })()}
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                          {record.user.branch?.name || 'No Branch'}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="font-medium">Required:</span>
                            <div className="mt-1 space-y-1">
                              {record.requiredCheckIn ? (
                                <>
                                  <div>In: {format(new Date(record.requiredCheckIn), 'HH:mm')}</div>
                                  <div>Out: {record.requiredCheckOut ? format(new Date(record.requiredCheckOut), 'HH:mm') : '--'}</div>
                                  <div>Break: {record.requiredBreakTime || '--'}</div>
                                </>
                              ) : (
                                <div className="text-muted-foreground">Off Day</div>
                              )}
                            </div>
                          </div>
                          
                          <div>
                            <span className="font-medium">Actual:</span>
                            <div className="mt-1 space-y-1">
                              <div>In: {record.actualCheckIn ? format(new Date(record.actualCheckIn), 'HH:mm') : '--'}</div>
                              <div>Out: {record.actualCheckOut ? format(new Date(record.actualCheckOut), 'HH:mm') : '--'}</div>
                              <div>Break: {record.actualBreakTime || '--'}</div>
                            </div>
                          </div>
                        </div>

                        {record.overtimeUndertime && (
                          <div className="pt-2 border-t">
                            <div className="flex items-center justify-between text-xs">
                              <span>Overtime/Undertime:</span>
                              <Badge 
                                variant={record.overtimeUndertime.startsWith('-') ? "destructive" : "default"}
                              >
                                {record.overtimeUndertime.startsWith('-') ? '' : '+'}
                                {record.overtimeUndertime}
                              </Badge>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Click on a date to view details
              </CardContent>
            </Card>
          )}

          {/* Monthly Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const monthRecords = records.filter(r => {
                  const recordDate = new Date(r.date);
                  return recordDate.getMonth() === currentMonth.getMonth() && 
                         recordDate.getFullYear() === currentMonth.getFullYear();
                });
                
                const totalRecords = monthRecords.length;
                const presentCount = monthRecords.filter(r => r.actualCheckIn).length;
                const offDayCount = monthRecords.filter(r => !r.requiredCheckIn && !r.requiredCheckOut).length;
                const absentCount = totalRecords - presentCount - offDayCount;
                
                return (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Records:</span>
                      <span className="font-medium">{totalRecords}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Present:</span>
                      <span className="font-medium text-green-600">{presentCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Absent:</span>
                      <span className="font-medium text-red-600">{absentCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Off Days:</span>
                      <span className="font-medium text-gray-600">{offDayCount}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span>Attendance Rate:</span>
                      <span className="font-medium">
                        {totalRecords - offDayCount > 0 ? 
                          ((presentCount / (totalRecords - offDayCount)) * 100).toFixed(1) : '0'}%
                      </span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}