"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AttendanceSummaryStats, { type AttendanceSummaryStatsData } from "./AttendanceSummaryStats";
import { AttendanceChart } from "./charts/AttendanceChart";
import { NetOvertimeBarChart } from "./charts/NetOvertimeBarChart";
import { LateTimeLineChart } from "./charts/LateTimeLineChart";
import { getMyWorkSummaryPeriods, getMyWorkSummary } from "@/actions/timeline.actions";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type PeriodMode = "month" | "year";

type WorkSummaryData = AttendanceSummaryStatsData & { weeklyOffDays: number };
type WorkSeriesPoint = { label: string; overtimeMinutes: number; lateMinutes: number };

function monthLabel(key: string): string {
    const [year, month] = key.split("-").map(Number);
    return `${MONTH_NAMES[month - 1]} ${String(year).slice(2)}`;
}

export function WorkSummary({ sideContent }: { sideContent?: ReactNode }) {
    const [mode, setMode] = useState<PeriodMode>("month");
    const [months, setMonths] = useState<string[]>([]);
    const [years, setYears] = useState<number[]>([]);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [data, setData] = useState<WorkSummaryData | null>(null);
    const [series, setSeries] = useState<WorkSeriesPoint[]>([]);
    const [loadingPeriods, setLoadingPeriods] = useState(true);
    const [loadingSummary, setLoadingSummary] = useState(false);

    useEffect(() => {
        (async () => {
            const res = await getMyWorkSummaryPeriods();
            if (res.success) {
                setMonths(res.months ?? []);
                setYears(res.years ?? []);
                setSelectedMonth(res.months?.[0] ?? null);
                setSelectedYear(res.years?.[0] ?? null);
            }
            setLoadingPeriods(false);
        })();
    }, []);

    useEffect(() => {
        if (mode === "month" && !selectedMonth) return;
        if (mode === "year" && !selectedYear) return;

        (async () => {
            setLoadingSummary(true);
            const period = mode === "month"
                ? {
                    type: "month" as const,
                    year: Number(selectedMonth!.split("-")[0]),
                    month: Number(selectedMonth!.split("-")[1]),
                }
                : { type: "year" as const, year: selectedYear! };

            const res = await getMyWorkSummary(period);
            setData(res.success ? (res.data as WorkSummaryData) : null);
            setSeries(res.success ? (res.series as WorkSeriesPoint[]) : []);
            setLoadingSummary(false);
        })();
    }, [mode, selectedMonth, selectedYear]);

    const hasAnyData = months.length > 0 || years.length > 0;
    const overtimeSeries = series.map((s) => ({ label: s.label, overtimeMinutes: s.overtimeMinutes }));
    const lateSeries = series.map((s) => ({ label: s.label, lateMinutes: s.lateMinutes }));

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Card className="lg:col-span-2 border-0 shadow-sm">
                    <CardHeader className="flex flex-col gap-2 pb-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <CardTitle className="text-sm font-semibold">Work Summary</CardTitle>
                        {hasAnyData && (
                            <div className="flex items-center gap-2">
                                <div className="flex rounded-md border p-0.5">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={mode === "month" ? "default" : "ghost"}
                                        className="h-7 px-3 text-xs"
                                        onClick={() => setMode("month")}
                                    >
                                        Monthly
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={mode === "year" ? "default" : "ghost"}
                                        className="h-7 px-3 text-xs"
                                        onClick={() => setMode("year")}
                                    >
                                        Yearly
                                    </Button>
                                </div>

                                {mode === "month" ? (
                                    <Select value={selectedMonth ?? undefined} onValueChange={setSelectedMonth}>
                                        <SelectTrigger className="h-7 w-28 text-xs">
                                            <SelectValue placeholder="Select month" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {months.map((m) => (
                                                <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Select value={selectedYear ? String(selectedYear) : undefined} onValueChange={(v) => setSelectedYear(Number(v))}>
                                        <SelectTrigger className="h-7 w-20 text-xs">
                                            <SelectValue placeholder="Select year" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {years.map((y) => (
                                                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className="pt-1">
                        {!loadingPeriods && !hasAnyData ? (
                            <p className="py-4 text-sm text-muted-foreground">No processed attendance data yet.</p>
                        ) : (
                            <div className={loadingSummary ? "opacity-50 transition-opacity" : "transition-opacity"}>
                                <AttendanceSummaryStats data={data} hideTotalDays compact />
                            </div>
                        )}
                    </CardContent>
                </Card>

                {sideContent}
            </div>

            {hasAnyData && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <Card className="border-0 shadow-sm">
                        <CardHeader className="pb-2 pt-3">
                            <CardTitle className="text-xs font-semibold">Attendance Rate</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 pb-2">
                            <AttendanceChart
                                present={data?.presentDays ?? 0}
                                absent={data?.absentDays ?? 0}
                                onLeave={data?.onLeaveDays ?? 0}
                                weeklyOff={data?.weeklyOffDays ?? 0}
                            />
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                        <CardHeader className="pb-2 pt-3">
                            <CardTitle className="text-xs font-semibold">Net OT/UT {mode === "month" ? "by Date" : "by Month"}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 pb-2">
                            <NetOvertimeBarChart data={overtimeSeries} />
                        </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                        <CardHeader className="pb-2 pt-3">
                            <CardTitle className="text-xs font-semibold">Late Time {mode === "month" ? "by Date" : "by Month"}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 pb-2">
                            <LateTimeLineChart data={lateSeries} />
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
