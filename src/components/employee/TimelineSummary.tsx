"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface TimelinePeriod {
  label: string;
  activeHours: number;
  requiredHours: number;
  presentDays: number;
}

interface TimelineSummaryProps {
  periods: TimelinePeriod[];
}

export function TimelineSummary({ periods }: TimelineSummaryProps) {
  const [visibleIndex, setVisibleIndex] = useState(0);

  const handlePrev = () => {
    setVisibleIndex(Math.max(0, visibleIndex - 1));
  };

  const handleNext = () => {
    setVisibleIndex(Math.min(periods.length - 1, visibleIndex + 1));
  };

  if (periods.length === 0) {
    return (
      <Card className="border-0 bg-slate-50">
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          No timeline data available
        </CardContent>
      </Card>
    );
  }

  const current = periods[visibleIndex];

  return (
    <Card className="border-0 bg-gradient-to-r from-indigo-50 to-blue-50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">{current.label} Summary</h4>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrev}
              disabled={visibleIndex === 0}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2 py-1">
              {visibleIndex + 1}/{periods.length}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleNext}
              disabled={visibleIndex === periods.length - 1}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-lg p-2 border border-indigo-100">
            <p className="text-xs text-muted-foreground font-medium">Active Hours</p>
            <p className="text-sm font-bold text-indigo-600">{current.activeHours.toFixed(1)}h</p>
          </div>
          <div className="bg-white rounded-lg p-2 border border-blue-100">
            <p className="text-xs text-muted-foreground font-medium">Required Hours</p>
            <p className="text-sm font-bold text-blue-600">{current.requiredHours}h</p>
          </div>
          <div className="bg-white rounded-lg p-2 border border-green-100">
            <p className="text-xs text-muted-foreground font-medium">Present Days</p>
            <p className="text-sm font-bold text-green-600">{current.presentDays}</p>
          </div>
        </div>

        <div className="text-xs text-slate-600 bg-white/60 rounded px-2 py-1">
          {current.activeHours >= current.requiredHours
            ? "✓ Hours completed"
            : `Pending: ${(current.requiredHours - current.activeHours).toFixed(1)}h`}
        </div>
      </CardContent>
    </Card>
  );
}
