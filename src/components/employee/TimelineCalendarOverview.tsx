"use client";

import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
} from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TimelineStatus } from "@/lib/timeline-status";

interface TimeRecord {
  id: string;
  date: Date;
  status?: TimelineStatus | null;
  isProcessed: boolean;
  lateCheckInMinutes?: number | null;
}

interface TimelineCalendarOverviewProps {
  records: TimeRecord[];
  month: Date;
}

export default function TimelineCalendarOverview({
  records,
  month,
}: TimelineCalendarOverviewProps) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  // Get only the days in the current month (not surrounding days)
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Group records by date
  const recordsByDate = records.reduce(
    (acc, record) => {
      const dateKey = format(new Date(record.date), "yyyy-MM-dd");
      acc[dateKey] = record;
      return acc;
    },
    {} as { [key: string]: TimeRecord }
  );

  const getDateRecord = (date: Date) => {
    const dateKey = format(date, "yyyy-MM-dd");
    return recordsByDate[dateKey];
  };

  const getStatusColor = (record: TimeRecord | undefined): string => {
    if (!record || !record.isProcessed) {
      return "bg-gray-100";
    }

    switch (record.status) {
      case "PRESENT":
        return "bg-green-500";
      case "ABSENT":
        return "bg-red-500";
      case "ON_LEAVE":
        return "bg-orange-500";
      case "WEEKLY_OFF":
        return "bg-gray-400";
      default:
        return "bg-gray-100";
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900 px-1">
        {format(month, "MMMM yyyy")} Overview
      </h3>
      <Card className="border border-gray-200">
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Legend - compact */}
            <div className="flex flex-wrap gap-4 text-xs pb-3 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-green-600">✓</span>
                <span className="text-gray-600">Processed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-gray-600">Present</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-gray-600">Absent</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                <span className="text-gray-600">Leave</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                <span className="text-gray-600">Weekly Off</span>
              </div>
            </div>

            {/* Horizontal Calendar Row - Responsive */}
            <div className="w-full overflow-x-auto md:overflow-x-visible pb-2">
              <div
                className="flex gap-0.5 md:gap-1"
                style={{
                  minWidth: "fit-content",
                  justifyContent: "space-around",
                  paddingLeft: "2px",
                  paddingRight: "2px",
                }}
              >
                {monthDays.map((date) => {
                  const record = getDateRecord(date);
                  const statusColor = getStatusColor(record);
                  const dayOfWeek = format(date, "EEE");
                  const isProcessed = record?.isProcessed ?? false;

                  return (
                    <div
                      key={date.toISOString()}
                      className="flex flex-col items-center gap-0.5 md:gap-1 flex-1"
                      style={{ minWidth: "45px", maxWidth: "60px" }}
                    >
                      {/* Green Tick for Processed */}
                      <div className="h-3 md:h-4 flex items-center">
                        {isProcessed && (
                          <div className="text-xs font-bold text-green-600">
                            ✓
                          </div>
                        )}
                      </div>

                      {/* Day of Week - Hidden on Mobile */}
                      <div className="hidden sm:block text-xs font-medium text-gray-600">
                        {dayOfWeek.charAt(0)}
                      </div>

                      {/* Date Box with Color Inside */}
                      <div
                        className={cn(
                          "w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded border text-xs md:text-sm font-semibold relative",
                          "bg-white border-gray-200 text-gray-900"
                        )}
                      >
                        {/* Colored indicator bar inside */}
                        {record && record.isProcessed && (
                          <div
                            className={cn(
                              "absolute bottom-0.5 left-0.5 right-0.5 h-0.5 md:h-1 rounded-full",
                              statusColor
                            )}
                          />
                        )}
                        {format(date, "d")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
