"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "lucide-react";

interface LeaveRemaining {
  name: string;
  remaining: number;
  total: number;
  used: number;
}

interface LeaveRemainingProps {
  leaves: LeaveRemaining[];
}

export function LeaveRemaining({ leaves }: LeaveRemainingProps) {
  // If no leaves, show empty state
  if (!leaves || leaves.length === 0) {
    return (
      <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-slate-100">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4 text-indigo-600" />
            Leave Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No leave types configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-slate-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4 text-indigo-600" />
          Leave Balance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {leaves.map((leave) => (
          <div key={leave.name} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">{leave.name}</span>
              <span className="text-xs font-bold text-slate-900">
                {leave.remaining} / {leave.total}
              </span>
            </div>
            <Progress
              value={leave.total > 0 ? (leave.used / leave.total) * 100 : 0}
              className="h-1.5"
            />
            <p className="text-xs text-muted-foreground">
              {leave.used} used • {leave.remaining} remaining
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
