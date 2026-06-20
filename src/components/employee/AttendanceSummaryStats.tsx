"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

export interface AttendanceSummaryStatsData {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  onLeaveDays: number;
  lateDays: number;
  totalOvertime: string;
}

interface AttendanceSummaryStatsProps {
  data: AttendanceSummaryStatsData | null;
}

export default function AttendanceSummaryStats({
  data,
}: AttendanceSummaryStatsProps) {
  if (!data) {
    return null;
  }

  const stats = [
    {
      label: "Total Workdays",
      value: data.totalDays,
      icon: Calendar,
      color: "bg-blue-50",
      textColor: "text-blue-600",
      borderColor: "border-blue-200",
    },
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
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <Card key={idx} className={`border ${stat.borderColor}`}>
            <CardContent className={`p-4 ${stat.color}`}>
              <div className="flex items-start justify-between mb-3">
                <Icon className={`h-5 w-5 ${stat.textColor}`} />
              </div>
              <div className={`text-2xl font-bold ${stat.textColor} mb-1`}>
                {stat.value}
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
