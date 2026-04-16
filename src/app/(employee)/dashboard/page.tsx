import { getEmployeeDashboardData } from "@/actions/dashboard.actions";
import { getEmployeeActiveBreakingNotices } from "@/actions/breaking-notice.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BlurAmount } from "@/components/employee/BlurAmount";
import { LeaveRemaining } from "@/components/employee/LeaveRemaining";
import { BreakingNoticeBanner } from "@/components/employee/BreakingNoticeBanner";
import { AttendanceChart } from "@/components/employee/charts/AttendanceChart";
import { MonthComparisonChart } from "@/components/employee/charts/MonthComparisonChart";
import { OvertimeTrendChart } from "@/components/employee/charts/OvertimeTrendChart";
import { TimeTrackingTabs } from "@/components/employee/TimeTrackingTabs";
import {
    Wallet,
    Banknote,
    Stethoscope,
    Clock,
} from "lucide-react";

interface DashboardData {
    walletBalance: number;
    remainingLoan: number;
    remainingMedical: number;
    attendanceData: {
        present: number;
        absent: number;
        onLeave: number;
        weeklyOff: number;
    };
    leaveArray: Array<{
        name: string;
        remaining: number;
        total: number;
        used: number;
    }>;
    activeTimeData: {
        last7WorkingDays: { activeHours: number; requiredHours: number; presentDays: number; workingDays: number };
        thisWeek: { activeHours: number; requiredHours: number; presentDays: number; workingDays: number };
        thisMonth: { activeHours: number; requiredHours: number; presentDays: number; workingDays: number };
        lastMonth: { activeHours: number; requiredHours: number; presentDays: number; workingDays: number };
        quarterSummaries: Array<{ quarter: string; activeHours: number; requiredHours: number; presentDays: number; workingDays: number }>;
        dailyRequiredHours: number;
    };
    monthComparisonData: Array<{ name: string; thisMonth: number; lastMonth: number }>;
    overtimeTrendData: Array<{ name: string; hours: number }>;
}

export default async function EmployeeDashboardPage() {
    const [data, notices]: [DashboardData, Awaited<ReturnType<typeof getEmployeeActiveBreakingNotices>>] = await Promise.all([
        getEmployeeDashboardData(),
        getEmployeeActiveBreakingNotices(),
    ]);

    return (
        <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100">
            <div className="space-y-4 p-3 sm:p-4 md:p-6">
                {/* Header */}
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
                    <p className="text-xs sm:text-sm text-muted-foreground">Welcome back! Overview of your financial and attendance status.</p>
                </div>

                <BreakingNoticeBanner notices={notices} />

                {/* Main Grid - Enhanced to fit single viewport */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                    {/* Quick Financial Stats */}
                    <Card className="col-span-1 sm:col-span-2 lg:col-span-1 border-0 shadow-sm hover:shadow-md transition-shadow bg-linear-to-br from-green-50 to-green-100/50">
                        <CardHeader className="pb-2 pt-3 px-3">
                            <CardTitle className="text-xs font-medium text-green-900 uppercase">Wallet Balance</CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 space-y-1">
                            <BlurAmount
                                amount={data.walletBalance}
                                amountClassName="text-lg font-bold text-green-700"
                                blurred={true}
                            />
                            <Wallet className="h-3 w-3 text-green-600 opacity-60" />
                        </CardContent>
                    </Card>

                    <Card className="col-span-1 sm:col-span-2 lg:col-span-1 border-0 shadow-sm hover:shadow-md transition-shadow bg-linear-to-br from-blue-50 to-blue-100/50">
                        <CardHeader className="pb-2 pt-3 px-3">
                            <CardTitle className="text-xs font-medium text-blue-900 uppercase">Remaining Loan</CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 space-y-1">
                            <BlurAmount
                                amount={data.remainingLoan}
                                amountClassName="text-lg font-bold text-blue-700"
                                blurred={true}
                            />
                            <Banknote className="h-3 w-3 text-blue-600 opacity-60" />
                        </CardContent>
                    </Card>

                    <Card className="col-span-1 sm:col-span-2 lg:col-span-1 border-0 shadow-sm hover:shadow-md transition-shadow bg-linear-to-br from-indigo-50 to-indigo-100/50">
                        <CardHeader className="pb-2 pt-3 px-3">
                            <CardTitle className="text-xs font-medium text-indigo-900 uppercase">Medical</CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 space-y-1">
                            <BlurAmount
                                amount={data.remainingMedical}
                                amountClassName="text-lg font-bold text-indigo-700"
                                blurred={true}
                            />
                            <Stethoscope className="h-3 w-3 text-indigo-600 opacity-60" />
                        </CardContent>
                    </Card>

                    <Card className="col-span-1 sm:col-span-2 lg:col-span-1 border-0 shadow-sm hover:shadow-md transition-shadow bg-linear-to-br from-amber-50 to-amber-100/50">
                        <CardHeader className="pb-2 pt-3 px-3">
                            <CardTitle className="text-xs font-medium text-amber-900 uppercase">Active Leaves</CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 space-y-1">
                            <span className="text-lg font-bold text-amber-700">
                                {data.attendanceData.onLeave}
                            </span>
                            <Clock className="h-3 w-3 text-amber-600 opacity-60" />
                        </CardContent>
                    </Card>
                </div>

                {/* Time Tracking + Leave Balance */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="lg:col-span-2">
                        <TimeTrackingTabs
                            last7WorkingDays={data.activeTimeData.last7WorkingDays}
                            thisWeek={data.activeTimeData.thisWeek}
                            thisMonth={data.activeTimeData.thisMonth}
                            lastMonth={data.activeTimeData.lastMonth}
                            quarterSummaries={data.activeTimeData.quarterSummaries}
                            dailyRequiredHours={data.activeTimeData.dailyRequiredHours}
                        />
                    </div>
                    <div>
                        <LeaveRemaining leaves={data.leaveArray} />
                    </div>
                </div>

                {/* Charts Grid - Compact & Responsive */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Attendance Chart */}
                    <Card className="border-0 shadow-sm">
                        <CardHeader className="pb-2 pt-3">
                            <CardTitle className="text-xs font-semibold">Attendance Rate</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 pb-2">
                            <AttendanceChart {...data.attendanceData} />
                        </CardContent>
                    </Card>

                    {/* Month Comparison Chart */}
                    <Card className="border-0 shadow-sm">
                        <CardHeader className="pb-2 pt-3">
                            <CardTitle className="text-xs font-semibold">Month Comparison</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 pb-2">
                            <MonthComparisonChart data={data.monthComparisonData} />
                        </CardContent>
                    </Card>

                    {/* Overtime Trend */}
                    <Card className="border-0 shadow-sm">
                        <CardHeader className="pb-2 pt-3">
                            <CardTitle className="text-xs font-semibold">Overtime Trend</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 pb-2">
                            <OvertimeTrendChart data={data.overtimeTrendData} />
                        </CardContent>
                    </Card>

                </div>
            </div>
        </div>
    );
}
