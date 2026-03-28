"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CalendarIcon, Filter, TrendingUp, Users, Building, UserCheck, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
    Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from "recharts";

interface Branch {
    id: string;
    name: string;
    location: string;
}

interface ManagerDashboardData {
    overview: {
        totalEmployees: number;
        activeEmployees: number;
        totalBranches: number;
        pendingRequests: number;
    };
    requests: {
        pendingProfileRequests: number;
        pendingLeaveRequests: number;
    };
    attendance: {
        presentDays: number;
        absentDays: number;
        leaveDays: number;
        totalDays: number;
        attendanceRate: number;
    };
    recentActivity: Array<{
        id: string;
        employeeName: string;
        date: Date;
        status: string;
        checkIn: Date | null;
        checkOut: Date | null;
    }>;
}

interface ManagerDashboardProps {
    initialData: ManagerDashboardData;
    branches: Branch[];
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6b7280'];

export function ManagerDashboard({ initialData, branches }: ManagerDashboardProps) {
    const [selectedBranch, setSelectedBranch] = useState<string>('all');
    const [fromDate, setFromDate] = useState<string>(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
    const [toDate, setToDate] = useState<string>(new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0]);
    const [data] = useState(initialData);
    const [loading, setLoading] = useState(false);

    const handleFilterChange = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                branch: selectedBranch,
                from: fromDate,
                to: toDate
            });
            
            window.location.href = `/employee/manager?${params}`;
        } catch (error) {
            console.error('Filter change failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const stats = [
        { 
            title: "Total Employees", 
            value: data.overview.totalEmployees.toString(), 
            icon: Users, 
            description: `${data.overview.activeEmployees} active employees`,
            change: "+5%",
            trend: "up" as const
        },
        { 
            title: "Pending Requests", 
            value: data.overview.pendingRequests.toString(), 
            icon: ClipboardList, 
            description: `${data.requests.pendingProfileRequests} profile, ${data.requests.pendingLeaveRequests} leave`,
            change: "-2%",
            trend: "down" as const
        },
        { 
            title: "Active Branches", 
            value: data.overview.totalBranches.toString(), 
            icon: Building, 
            description: "All operational",
            change: "0%",
            trend: "neutral" as const
        },
        { 
            title: "Attendance Rate", 
            value: `${data.attendance.attendanceRate}%`, 
            icon: UserCheck, 
            description: `${data.attendance.presentDays} present days`,
            change: "+3%",
            trend: "up" as const
        },
    ];

    // Prepare attendance chart data
    const attendanceChartData = [
        { name: "Present", value: data.attendance.presentDays, color: COLORS[0] },
        { name: "Leave", value: data.attendance.leaveDays, color: COLORS[1] },
        { name: "Absent", value: data.attendance.absentDays, color: COLORS[2] },
    ].filter(item => item.value > 0);

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground">
                        Team management overview and operational metrics
                    </p>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Branch</label>
                            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select branch" />
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
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">From Date</label>
                            <div className="relative">
                                <Input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                />
                                <CalendarIcon className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">To Date</label>
                            <div className="relative">
                                <Input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                />
                                <CalendarIcon className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium invisible">Apply</label>
                            <Button 
                                onClick={handleFilterChange} 
                                disabled={loading} 
                                className="w-full"
                            >
                                {loading ? "Loading..." : "Apply Filters"}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat) => {
                    const IconComponent = stat.icon;
                    return (
                        <Card key={stat.title}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                                <IconComponent className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stat.value}</div>
                                <p className="text-xs text-muted-foreground">{stat.description}</p>
                                <div className={cn(
                                    "flex items-center text-xs mt-1",
                                    stat.trend === "up" ? "text-green-600" : stat.trend === "down" ? "text-red-600" : "text-gray-500"
                                )}>
                                    <TrendingUp className={cn(
                                        "h-3 w-3 mr-1",
                                        stat.trend === "down" && "rotate-180"
                                    )} />
                                    {stat.change} from last month
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Attendance Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle>Attendance Overview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {attendanceChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie
                                        data={attendanceChartData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, value, percent }) => `${name}: ${value} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {attendanceChartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                                No attendance data available
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Employee Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {data.recentActivity.length > 0 ? (
                                data.recentActivity.slice(0, 5).map((activity) => (
                                    <div key={activity.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                                        <div>
                                            <p className="font-medium">{activity.employeeName}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {new Date(activity.date).toLocaleDateString()} - {activity.status}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            {activity.checkIn && (
                                                <p className="text-sm">
                                                    In: {new Date(activity.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            )}
                                            {activity.checkOut && (
                                                <p className="text-sm">
                                                    Out: {new Date(activity.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center text-muted-foreground py-8">
                                    No recent activity available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Actions */}
            <Card>
                <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Button asChild className="h-20 flex-col space-y-2">
                            <a href="/employee/manager/profile-requests">
                                <ClipboardList className="h-6 w-6" />
                                <span>Review Profile Requests</span>
                                <span className="text-xs opacity-75">{data.requests.pendingProfileRequests} pending</span>
                            </a>
                        </Button>
                        <Button asChild variant="outline" className="h-20 flex-col space-y-2">
                            <a href="/employee/manager/employees">
                                <Users className="h-6 w-6" />
                                <span>Manage Employees</span>
                                <span className="text-xs opacity-75">{data.overview.totalEmployees} total</span>
                            </a>
                        </Button>
                        <Button asChild variant="outline" className="h-20 flex-col space-y-2">
                            <a href="/employee/manager/holidays">
                                <CalendarIcon className="h-6 w-6" />
                                <span>Holiday Management</span>
                                <span className="text-xs opacity-75">Manage holidays</span>
                            </a>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}