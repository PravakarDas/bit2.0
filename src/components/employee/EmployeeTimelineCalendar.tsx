"use client";

import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface EmployeeTimelineCalendarProps {
  records: TimeRecord[];
  year: number;
  month?: number;
}

export default function EmployeeTimelineCalendar({ 
  records, 
  year, 
  month: selectedMonth 
}: EmployeeTimelineCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(
    selectedMonth !== undefined ? 
    new Date(year, selectedMonth) : 
    new Date(year, new Date().getMonth())
  );
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const previousMonth = () => {
    const newMonth = subMonths(currentMonth, 1);
    // Don't go outside the year range if specific year/month is selected
    if (selectedMonth !== undefined && newMonth.getFullYear() === year) {
      setCurrentMonth(newMonth);
    } else if (selectedMonth === undefined) {
      setCurrentMonth(newMonth);
    }
  };

  const nextMonth = () => {
    const newMonth = addMonths(currentMonth, 1);
    // Don't go outside the year range if specific year/month is selected
    if (selectedMonth !== undefined && newMonth.getFullYear() === year) {
      setCurrentMonth(newMonth);
    } else if (selectedMonth === undefined) {
      setCurrentMonth(newMonth);
    }
  };

  // Group records by date
  const recordsByDate = records.reduce((acc, record) => {
    const dateKey = format(new Date(record.date), 'yyyy-MM-dd');
    acc[dateKey] = record;
    return acc;
  }, {} as { [key: string]: TimeRecord });

  const getDateRecord = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return recordsByDate[dateKey];
  };

  const getStatusBadge = (record: TimeRecord) => {
    if (!record.requiredCheckIn && !record.requiredCheckOut) {
      return <Badge variant="secondary" className="text-xs">Off</Badge>;
    }
    
    if (record.actualCheckIn && record.actualCheckOut) {
      return <Badge variant="default" className="text-xs">Present</Badge>;
    }
    
    if (record.actualCheckIn) {
      return <Badge variant="outline" className="text-xs">Partial</Badge>;
    }
    
    return <Badge variant="destructive" className="text-xs">Absent</Badge>;
  };

  const getOvertimeBadge = (record: TimeRecord) => {
    if (!record.overtimeUndertime) return null;
    
    const isPositive = !record.overtimeUndertime.startsWith('-');
    return (
      <Badge variant={isPositive ? "default" : "destructive"} className="text-xs">
        {isPositive ? '+' : ''}{record.overtimeUndertime}
      </Badge>
    );
  };

  const selectedDayRecord = selectedDay ? getDateRecord(selectedDay) : null;

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
          <Button 
            variant="outline" 
            size="sm" 
            onClick={previousMonth}
            disabled={selectedMonth !== undefined && 
              (currentMonth.getMonth() === 0 && currentMonth.getFullYear() <= year)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCurrentMonth(new Date())}
            disabled={selectedMonth !== undefined}
          >
            Today
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={nextMonth}
            disabled={selectedMonth !== undefined && 
              (currentMonth.getMonth() === 11 && currentMonth.getFullYear() >= year)}
          >
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
                {calendarDays.map((day) => {
                  const record = getDateRecord(day);
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "min-h-[100px] p-2 text-left border rounded-lg hover:bg-gray-50 transition-colors",
                        isSelected && "border-primary bg-primary/5",
                        isToday && "border-blue-500 bg-blue-50"
                      )}
                    >
                      <div className="text-sm font-medium mb-2">
                        {format(day, 'd')}
                      </div>
                      
                      {record && (
                        <div className="space-y-1">
                          {getStatusBadge(record)}
                          {getOvertimeBadge(record)}
                          
                          {record.actualCheckIn && (
                            <div className="text-xs text-muted-foreground">
                              In: {format(new Date(record.actualCheckIn), 'HH:mm')}
                            </div>
                          )}
                          
                          {record.actualCheckOut && (
                            <div className="text-xs text-muted-foreground">
                              Out: {format(new Date(record.actualCheckOut), 'HH:mm')}
                            </div>
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
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {format(selectedDay, 'MMMM dd, yyyy')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedDayRecord ? (
                    <div className="space-y-4">
                      {/* Status */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status:</span>
                        {getStatusBadge(selectedDayRecord)}
                      </div>

                      {/* Required Times */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Required Times</h4>
                        {selectedDayRecord.requiredCheckIn ? (
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Check In:</span>
                              <span>{format(new Date(selectedDayRecord.requiredCheckIn), 'HH:mm')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Check Out:</span>
                              <span>
                                {selectedDayRecord.requiredCheckOut ? 
                                  format(new Date(selectedDayRecord.requiredCheckOut), 'HH:mm') : '--'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Break:</span>
                              <span>{selectedDayRecord.requiredBreakTime || '--'}</span>
                            </div>
                            <div className="flex justify-between border-t pt-1">
                              <span>Active Time:</span>
                              <span className="font-medium">{selectedDayRecord.requiredActiveTime || '--'}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Off Day</p>
                        )}
                      </div>

                      {/* Actual Times */}
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Actual Times</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span>Check In:</span>
                            <span>
                              {selectedDayRecord.actualCheckIn ? 
                                format(new Date(selectedDayRecord.actualCheckIn), 'HH:mm') : '--'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Check Out:</span>
                            <span>
                              {selectedDayRecord.actualCheckOut ? 
                                format(new Date(selectedDayRecord.actualCheckOut), 'HH:mm') : '--'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Break:</span>
                            <span>{selectedDayRecord.actualBreakTime || '--'}</span>
                          </div>
                          <div className="flex justify-between border-t pt-1">
                            <span>Active Time:</span>
                            <span className="font-medium">{selectedDayRecord.actualActiveTime || '--'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Overtime/Undertime */}
                      {selectedDayRecord.overtimeUndertime && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-muted-foreground">Summary</h4>
                          <div className="flex justify-between items-center">
                            <span className="text-sm">Overtime/Undertime:</span>
                            {getOvertimeBadge(selectedDayRecord)}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4">
                      No record for this date
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Click on a date to view details
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const monthRecords = records.filter(r => {
                  const recordDate = new Date(r.date);
                  return recordDate.getMonth() === currentMonth.getMonth() && 
                         recordDate.getFullYear() === currentMonth.getFullYear();
                });
                
                const totalWorkingDays = monthRecords.filter(r => r.requiredCheckIn || r.requiredCheckOut).length;
                const presentDays = monthRecords.filter(r => r.actualCheckIn).length;
                const offDays = monthRecords.filter(r => !r.requiredCheckIn && !r.requiredCheckOut).length;
                
                return (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Working Days:</span>
                      <span className="font-medium">{totalWorkingDays}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Present:</span>
                      <span className="font-medium text-green-600">{presentDays}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Absent:</span>
                      <span className="font-medium text-red-600">{totalWorkingDays - presentDays}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Off Days:</span>
                      <span className="font-medium text-gray-600">{offDays}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span>Attendance:</span>
                      <Badge variant="secondary">
                        {totalWorkingDays > 0 ? ((presentDays / totalWorkingDays) * 100).toFixed(1) : '0'}%
                      </Badge>
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