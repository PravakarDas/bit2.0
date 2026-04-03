"use client";

import { Progress } from "@/components/ui/progress";

interface ActiveTimeChartProps {
  activeHours: number;
  requiredHours: number;
  period?: string;
}

export function ActiveTimeChart({ activeHours, requiredHours, period = "Today" }: ActiveTimeChartProps) {
  const percentage = Math.min((activeHours / requiredHours) * 100, 100);
  const isCompleted = activeHours >= requiredHours;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{period} Time Tracking</span>
        <span className={`text-sm font-bold ${isCompleted ? "text-green-600" : "text-amber-600"}`}>
          {activeHours.toFixed(1)}h / {requiredHours}h
        </span>
      </div>
      <Progress value={percentage} className="h-2" />
      <p className="text-xs text-muted-foreground">
        {isCompleted 
          ? "✓ Target completed" 
          : `${(requiredHours - activeHours).toFixed(1)}h remaining`}
      </p>
    </div>
  );
}
