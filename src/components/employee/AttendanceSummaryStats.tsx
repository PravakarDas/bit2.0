"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  Timer,
} from "lucide-react";

export interface AttendanceSummaryStatsData {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  onLeaveDays: number;
  lateDays: number;
  totalOvertime: string;
  /** Optional: sum of late-check-in minutes for the period, as "HH:MM". Only the Dashboard's Work Summary widget provides this, adding a 7th chip. */
  totalLateTime?: string;
}

function formatOvertimeDisplay(overtime: string): string {
  if (!overtime) return "0h:00m";

  const isNegative = overtime.startsWith("-");
  const cleanTime = overtime.replace("-", "").replace("+", "");
  const [hours, minutes] = cleanTime.split(":").map(Number);

  const sign = isNegative ? "-" : "+";
  return `${sign}${hours || 0}h:${(minutes || 0).toString().padStart(2, "0")}m`;
}

function formatDurationDisplay(duration: string): string {
  if (!duration) return "0h:00m";

  const cleanTime = duration.replace("-", "").replace("+", "");
  const [hours, minutes] = cleanTime.split(":").map(Number);

  return `${hours || 0}h:${(minutes || 0).toString().padStart(2, "0")}m`;
}

interface AttendanceSummaryStatsProps {
  data: AttendanceSummaryStatsData | null;
  /** Hides the "Total Workdays" chip. Used by the Dashboard's Work Summary widget; the Timeline page keeps it. */
  hideTotalDays?: boolean;
  /** Caps the grid at 3 columns on large screens (wraps into more rows) instead of one column per stat — for narrower embeddings like the Dashboard. */
  compact?: boolean;
}

export default function AttendanceSummaryStats({
  data,
  hideTotalDays = false,
  compact = false,
}: AttendanceSummaryStatsProps) {
  if (!data) {
    return null;
  }

  const stats = [
    ...(hideTotalDays
      ? []
      : [
          {
            label: "Total Workdays",
            value: data.totalDays,
            icon: Calendar,
            color: "bg-blue-50",
            textColor: "text-blue-600",
            borderColor: "border-blue-200",
          },
        ]),
    {
      label: "Present Days",
      value: data.presentDays,
      icon: CheckCircle2,
      color: "bg-green-50",
      textColor: "text-green-600",
      borderColor: "border-green-200",
    },
    {
      label: "Absent Days",
      value: data.absentDays,
      icon: XCircle,
      color: "bg-red-50",
      textColor: "text-red-600",
      borderColor: "border-red-200",
    },
    {
      label: "Leave Days",
      value: data.onLeaveDays,
      icon: Clock,
      color: "bg-amber-50",
      textColor: "text-amber-600",
      borderColor: "border-amber-200",
    },
    {
      label: "Late Days",
      value: data.lateDays,
      icon: AlertCircle,
      color: "bg-orange-50",
      textColor: "text-orange-600",
      borderColor: "border-orange-200",
    },
    {
      label: "Net OT/UT",
      value: data.totalOvertime,
      icon: TrendingUp,
      color: "bg-purple-50",
      textColor: "text-purple-600",
      borderColor: "border-purple-200",
    },
    ...(data.totalLateTime !== undefined
      ? [
          {
            label: "Total Late Time",
            value: data.totalLateTime,
            icon: Timer,
            color: "bg-rose-50",
            textColor: "text-rose-600",
            borderColor: "border-rose-200",
          },
        ]
      : []),
  ];

  const lgCols = compact ? "lg:grid-cols-3" : stats.length === 7 ? "lg:grid-cols-7" : "lg:grid-cols-6";

  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${lgCols}`}>
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <Card key={idx} className={`border ${stat.borderColor}`}>
            <CardContent className={`p-4 ${stat.color}`}>
              <div className="flex items-start justify-between mb-3">
                <Icon className={`h-5 w-5 ${stat.textColor}`} />
              </div>
              <div className={`text-2xl font-bold ${stat.textColor} mb-1`}>
                {stat.label === "Net OT/UT"
                  ? formatOvertimeDisplay(String(stat.value))
                  : stat.label === "Total Late Time"
                  ? formatDurationDisplay(String(stat.value))
                  : stat.value}
              </div>
              <div className="text-xs font-medium text-gray-600">
                {stat.label}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
