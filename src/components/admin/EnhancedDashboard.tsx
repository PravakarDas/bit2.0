"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CalendarIcon, Filter, TrendingUp, Users, Building, Gift, UserCheck, ClipboardList, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from "recharts";

interface Branch {
    id: string;
    name: string;
}

interface DashboardData {
    totalEmployees: number;
    pendingEmployees: number;
    activeLoanAmount: number;
    activeLoanCount: number;
    activeBranches: number;
    activeBonuses: number;
    monthlyPayrollAmount: number;
    monthlyPayrollCount: number;
    totalMedicalClaimsAmount: number;
    totalMedicalClaimsCount: number;
    departmentDistribution: { department: string; count: number }[];
    monthlyPayrollTrends: { month: string; amount: number; count: number }[];
    medicalClaimsVsEntitlements: any;
    loanRepaymentData: any[];
    leaveUtilization: any[];
    weeklyAttendanceData: any[];
    lateCheckInPenalties: any[];
    branchComparison: any[];
}

interface EnhancedDashboardProps {
    initialData: DashboardData;
    branches: Branch[];
}

const COLORS = ['#1f2937', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb'];

export function EnhancedDashboard({ initialData, branches }: EnhancedDashboardProps) {
    const [selectedBranch, setSelectedBranch] = useState<string>('all');
    const [fromDate, setFromDate] = useState<string>(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [toDate, setToDate] = useState<string>(new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]);
    const [data] = useState(initialData);
    const [loading, setLoading] = useState(false);
    const [attendanceView, setAttendanceView] = useState<'current' | 'trends'>('current');

    const handleFilterChange = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                branch: selectedBranch,
                from: fromDate,
                to: toDate
            });
            
            window.location.href = `/admin?${params}`;
        } catch (error) {
            console.error('Filter change failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const stats = [
        { 
            title: "Total Employees", 
            value: data.totalEmployees.toString(), 
            icon: Users, 
            description: data.pendingEmployees > 0 ? `${data.pendingEmployees} pending approval` : "All employees active",
            change: "+12%",
            trend: "up" as const
        },
        { 
            title: "Active Loans", 
            value: `৳${data.activeLoanAmount.toLocaleString("en-BD")}`, 
            icon: Banknote, 
            description: `${data.activeLoanCount} loans active`,
            change: "-8%",
            trend: "down" as const
        },
        { 
            title: "Active Branches", 
            value: data.activeBranches.toString(), 
            icon: Building, 
            description: "All operational",
            change: "0%",
            trend: "neutral" as const
        },
        { 
            title: "Active Bonuses", 
            value: data.activeBonuses.toString(), 
            icon: Gift, 
            description: "Performance bonuses",
            change: "+5%",
            trend: "up" as const
        },
        { 
            title: "Monthly Payroll", 
            value: `৳${data.monthlyPayrollAmount.toLocaleString("en-BD")}`, 
            icon: UserCheck, 
            description: `${data.monthlyPayrollCount} employees paid this month`,
            change: "+15%",
            trend: "up" as const
        },
        { 
            title: "Medical Claims", 
            value: `৳${data.totalMedicalClaimsAmount.toLocaleString("en-BD")}`, 
            icon: ClipboardList, 
            description: `${data.totalMedicalClaimsCount} claims this year`,
            change: "+3%",
            trend: "up" as const
        },
    ];

    // Process weekly attendance data
    const processWeeklyAttendance = () => {
        const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        return daysOfWeek.map(day => {
            const dayRecords = data.weeklyAttendanceData?.filter(record => {
                const recordDate = new Date(record.date);
                return daysOfWeek[recordDate.getDay() - 1] === day;
            }) || [];

            const totalHours = dayRecords.reduce((sum, record) => {
                if (record.actualActiveTime) {
                    const [hours, minutes] = record.actualActiveTime.split(':').map(Number);
                    return sum + hours + (minutes / 60);
                }
                return sum;
            }, 0);

            const overtimeHours = dayRecords.reduce((sum, record) => {
                if (record.overtimeUndertime && record.overtimeUndertime.startsWith('+')) {
                    const timeStr = record.overtimeUndertime.slice(1);
                    const [hours, minutes] = timeStr.split(':').map(Number);
                    return sum + hours + (minutes / 60);
                }
                return sum;
            }, 0);

            const undertimeHours = dayRecords.reduce((sum, record) => {
                if (record.overtimeUndertime && record.overtimeUndertime.startsWith('-')) {
                    const timeStr = record.overtimeUndertime.slice(1);
                    const [hours, minutes] = timeStr.split(':').map(Number);
                    return sum + hours + (minutes / 60);
                }
                return sum;
            }, 0);

            return {
                day,
                totalHours: Math.round(totalHours * 100) / 100,
                overtimeHours: Math.round(overtimeHours * 100) / 100,
                undertimeHours: Math.round(undertimeHours * 100) / 100,
                employees: dayRecords.length
            };
        });
    };

    const weeklyData = processWeeklyAttendance();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col space-y-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight"> Admin Dashboard</h1>
                    <p className="text-muted-foreground">Comprehensive analytics and insights for your organization</p>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-700">Filters:</span>
                    </div>
                    
                    {/* Branch Filter */}
                    <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select Branch" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Branches</SelectItem>
                            {branches.map((branch) => (
                                <SelectItem key={branch.id} value={branch.id}>
                                    {branch.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Date Range Filter */}
                    <div className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-gray-600" />
                        <Input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="w-auto"
                        />
                        <span className="text-gray-600">to</span>
                        <Input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="w-auto"
                        />
                    </div>

                    <Button onClick={handleFilterChange} disabled={loading}>
                        {loading ? "Applying..." : "Apply Filters"}
                    </Button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {stats.map((stat) => (
                    <Card key={stat.title} className="hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-700">{stat.title}</CardTitle>
                            <stat.icon className="h-4 w-4 text-gray-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                            <div className="flex items-center justify-between mt-1">
                                <p className="text-xs text-gray-600">{stat.description}</p>
                                <span className={cn(
                                    "text-xs font-medium",
                                    stat.trend === 'up' && "text-green-600",
                                    stat.trend === 'down' && "text-red-600",
                                    stat.trend === 'neutral' && "text-gray-600"
                                )}>
                                    {stat.change}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Department Distribution */}
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Department Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={data.departmentDistribution}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={(props) => {
                                        const { payload } = props;
                                        return `${payload.department}: ${payload.count}`;
                                    }}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="count"
                                    >

                                    {data.departmentDistribution?.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Monthly Payroll Trends */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5" />
                            Monthly Payroll Trends
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={data.monthlyPayrollTrends}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="month" stroke="#6b7280" />
                                <YAxis stroke="#6b7280" />
                                <Tooltip 
                                    formatter={(value: number | undefined) => [`৳${(value || 0).toLocaleString()}`, 'Amount']}
                                    labelStyle={{ color: '#1f2937' }}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="amount" 
                                    stroke="#1f2937" 
                                    strokeWidth={3}
                                    dot={{ fill: '#1f2937', strokeWidth: 2, r: 4 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Weekly Attendance Analysis */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <UserCheck className="h-5 w-5" />
                            Weekly Attendance Analysis
                        </CardTitle>
                        <div className="flex gap-2">
                            <Button 
                                variant={attendanceView === 'current' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setAttendanceView('current')}
                            >
                                Current Week
                            </Button>
                            <Button 
                                variant={attendanceView === 'trends' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setAttendanceView('trends')}
                            >
                                Trends
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="h-80 w-full">
                        {attendanceView === 'current' ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={weeklyData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                    <XAxis dataKey="day" stroke="#6b7280" />
                                    <YAxis stroke="#6b7280" />
                                    <Tooltip 
                                        formatter={(value: number | undefined, name: string | undefined) => [
                                            `${value || 0} hours`,
                                            name === 'totalHours' ? 'Total Hours' : 
                                            name === 'overtimeHours' ? 'Overtime' : 'Undertime'
                                        ]}
                                        labelStyle={{ color: '#1f2937' }}
                                    />
                                    <Legend />
                                    <Bar dataKey="totalHours" fill="#1f2937" name="Total Hours" />
                                    <Bar dataKey="overtimeHours" fill="#16a34a" name="Overtime" />
                                    <Bar dataKey="undertimeHours" fill="#dc2626" name="Undertime" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data.monthlyPayrollTrends}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                    <XAxis dataKey="month" stroke="#6b7280" />
                                    <YAxis stroke="#6b7280" />
                                    <Tooltip />
                                    <Line 
                                        type="monotone" 
                                        dataKey="count" 
                                        stroke="#1f2937" 
                                        strokeWidth={2}
                                        name="Attendance Rate"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Branch Comparison */}
            {data.branchComparison && data.branchComparison.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building className="h-5 w-5" />
                            Branch Comparison
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={400}>
                            <BarChart data={data.branchComparison}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="branch" stroke="#6b7280" />
                                <YAxis yAxisId="left" stroke="#6b7280" />
                                <YAxis yAxisId="right" orientation="right" stroke="#6b7280" />
                                <Tooltip />
                                <Legend />
                                <Bar 
                                    yAxisId="left" 
                                    dataKey="employees" 
                                    fill="#1f2937" 
                                    name="Employees"
                                />
                                <Bar 
                                    yAxisId="right" 
                                    dataKey="monthlyPayroll" 
                                    fill="#6b7280" 
                                    name="Monthly Payroll (৳)"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}

            {/* Loan Progress */}
            {data.loanRepaymentData && data.loanRepaymentData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Banknote className="h-5 w-5" />
                            Loan Repayment Progress
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {data.loanRepaymentData.slice(0, 5).map((loan) => (
                                <div key={loan.id} className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="font-medium">{loan.employee}</span>
                                        <span className="text-gray-600">
                                            ৳{(loan.totalAmount - loan.remaining).toLocaleString()} / ৳{loan.totalAmount.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                            className="bg-gray-800 h-2 rounded-full transition-all duration-300" 
                                            style={{ width: `${loan.progressPercent}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500">
                                        <span>{loan.progressPercent}% completed</span>
                                        <span>{loan.monthsPassed} / {loan.totalMonths} months</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Late Check-ins */}
            {data.lateCheckInPenalties && data.lateCheckInPenalties.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Late Check-in Penalties</CardTitle> 
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={data.lateCheckInPenalties.slice(0, 5)}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis 
                                    dataKey="employee" 
                                    stroke="#6b7280" 
                                    angle={-45}
                                    textAnchor="end"
                                    height={80}
                                />
                                <YAxis stroke="#6b7280" />
                                <Tooltip 
                                    formatter={(value: number | undefined) => [`৳${value || 0}`, 'Penalty']}
                                />
                                <Bar dataKey="totalPenalty" fill="#dc2626" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}