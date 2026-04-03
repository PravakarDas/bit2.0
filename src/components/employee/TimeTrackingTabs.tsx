"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActiveTimeChart } from "@/components/employee/charts/ActiveTimeChart";

interface TimeSummary {
  activeHours: number;
  requiredHours: number;
  presentDays: number;
  workingDays: number;
}

interface TimeTrackingTabsProps {
  last7WorkingDays: TimeSummary;
  thisWeek: TimeSummary;
  thisMonth: TimeSummary;
  lastMonth: TimeSummary;
  quarterSummaries: Array<{
    quarter: string;
    activeHours: number;
    requiredHours: number;
    presentDays: number;
    workingDays: number;
  }>;
  dailyRequiredHours: number;
}

export function TimeTrackingTabs({
  last7WorkingDays,
  thisWeek,
  thisMonth,
  lastMonth,
  quarterSummaries,
  dailyRequiredHours,
}: TimeTrackingTabsProps) {
  const [activeTab, setActiveTab] = useState<"last7workingdays" | "thisweek" | "thismonth" | "lastmonth" | "quarterview">("last7workingdays");

  const tabs = [
    { id: "last7workingdays", label: "Last 7 Working Days", data: last7WorkingDays },
    { id: "thisweek", label: "This Week", data: thisWeek },
    { id: "thismonth", label: "This Month", data: thisMonth },
    { id: "lastmonth", label: "Last Month", data: lastMonth },
    { id: "quarterview", label: "Quarter View", data: null },
  ];

  const currentData = tabs.find((tab) => tab.id === activeTab)?.data as TimeSummary | null;

  return (
    <Card className="border-0 shadow-sm sm:col-span-2 lg:col-span-2">
      <CardHeader className="pb-3 pt-3">
        <div className="flex flex-col gap-2">
          <CardTitle className="text-xs font-semibold">Time Tracking</CardTitle>
          <div className="flex flex-wrap gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as "last7workingdays" | "thisweek" | "thismonth" | "lastmonth" | "quarterview")}
                className={`px-2 py-1 text-xs rounded transition ${
                  activeTab === tab.id
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {activeTab !== "quarterview" && currentData && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded-lg p-2 border border-indigo-100">
                <p className="text-xs text-muted-foreground font-medium">Working Days</p>
                <p className="text-sm font-bold text-indigo-600">{currentData.workingDays}</p>
              </div>
              <div className="bg-white rounded-lg p-2 border border-blue-100">
                <p className="text-xs text-muted-foreground font-medium">Present Days</p>
                <p className="text-sm font-bold text-blue-600">{currentData.presentDays}</p>
              </div>
              <div className="bg-white rounded-lg p-2 border border-green-100">
                <p className="text-xs text-muted-foreground font-medium">Daily Target</p>
                <p className="text-sm font-bold text-green-600">{dailyRequiredHours.toFixed(1)}h</p>
              </div>
            </div>

            <ActiveTimeChart
              activeHours={currentData.activeHours}
              requiredHours={currentData.requiredHours}
              period={tabs.find((tab) => tab.id === activeTab)?.label || ""}
            />
          </>
        )}

        {activeTab === "quarterview" && (
          <div className="space-y-2">
            {quarterSummaries.map((quarter) => (
              <div key={quarter.quarter} className="rounded-lg border bg-white p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{quarter.quarter}</p>
                  <p className="text-xs text-muted-foreground">
                    {quarter.activeHours.toFixed(1)}h / {quarter.requiredHours.toFixed(1)}h
                  </p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Working: {quarter.workingDays} days • Present: {quarter.presentDays} days
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
