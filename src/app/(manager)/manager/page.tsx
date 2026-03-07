import { getDbUser } from "@/actions/user.actions";
import { getManagerDashboardData } from "@/actions/manager-permissions.actions";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, FileCheck, Calendar, ClipboardList, TrendingUp, AlertCircle, Banknote, DollarSign } from "lucide-react";

interface TeamMember {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    imageUrl: string | null;
    role: string;
    designation?: {
        id: string;
        name: string;
    } | null;
    department?: {
        id: string;
        name: string;
    } | null;
}

interface ManagerDashboardStats {
    totalEmployees: number;
    pendingLeaves: number;
    pendingRequests: number;
    monthlyAttendance: number;
    todayAbsent: number;
    upcomingLeaves: number;
    activeLoans: number;
    totalSalaryBudget: number;
    averageSalary?: number;
    teamMembers?: TeamMember[];
}

export default async function ManagerDashboard() {
    const user = await getDbUser();

    if (!user) {
        redirect("/sign-in");
    }

    if (!["MANAGER", "SUPERADMIN"].includes(user.role)) {
        redirect("/unauthorized");
    }

    const stats: any = await getManagerDashboardData();

    const dashboardCards = [
        {
            title: "Team Members",
            value: stats.totalEmployees,
            icon: Users,
            description: "Employees under your supervision",
            color: "text-blue-600"
        },
        {
            title: "Pending Leave Requests",
            value: stats.pendingLeaves,
            icon: Calendar,
            description: "Awaiting your approval",
            color: "text-orange-600"
        },
        {
            title: "Profile Requests",
            value: stats.pendingRequests,
            icon: FileCheck,
            description: "Employee profile updates",
            color: "text-purple-600"
        },
        {
            title: "Monthly Attendance",
            value: `${stats.monthlyAttendance}%`,
            icon: TrendingUp,
            description: "Team average this month",
            color: "text-green-600"
        },
        {
            title: "Today's Absences",
            value: stats.todayAbsent,
            icon: AlertCircle,
            description: "Employees not present today",
            color: "text-red-600"
        },
        {
            title: "Upcoming Leaves",
            value: stats.upcomingLeaves,
            icon: ClipboardList,
            description: "Scheduled leaves this week",
            color: "text-indigo-600"
        },
        {
            title: "Active Loans",
            value: stats.activeLoans,
            icon: Banknote,
            description: "Team members with loans",
            color: "text-yellow-600"
        },
        {
            title: "Total Salary Budget",
            value: `$${stats.totalSalaryBudget?.toLocaleString() || 0}`,
            icon: DollarSign,
            description: "Monthly team salary budget",
            color: "text-emerald-600"
        }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Manager Dashboard</h1>
                    <p className="text-muted-foreground">
                        Welcome back, {user.firstName} {user.lastName}
                    </p>
                </div>
                <Badge variant={user.role === "SUPERADMIN" ? "destructive" : "default"}>
                    {user.role === "SUPERADMIN" ? "Super Admin View" : "Manager"}
                </Badge>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {dashboardCards.map((card, index) => {
                    const IconComponent = card.icon;
                    return (
                        <Card key={index}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {card.title}
                                </CardTitle>
                                <IconComponent className={`h-4 w-4 ${card.color}`} />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{card.value}</div>
                                <p className="text-xs text-muted-foreground">
                                    {card.description}
                                </p>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Team Overview and Quick Actions */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Recent Team Members */}
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Team Members</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {stats.teamMembers && stats.teamMembers.length > 0 ? (
                                stats.teamMembers.map((member: TeamMember) => (
                                    <div key={member.id} className="flex items-center space-x-3">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={member.imageUrl || undefined} />
                                            <AvatarFallback>
                                                {member.firstName?.charAt(0) || member.email.charAt(0)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {member.firstName} {member.lastName}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {member.designation?.name || member.department?.name || "No designation"}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className="text-xs">
                                            {member.role}
                                        </Badge>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    No team members assigned to your department/branch yet.
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
                
                {/* Quick Actions */}
                <Card>
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                                    <div className="flex items-center space-x-2">
                                        <Calendar className="h-4 w-4 text-blue-600" />
                                        <span className="text-sm font-medium">Leave Requests</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {stats.pendingLeaves} pending
                                    </p>
                                </div>
                                <div className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                                    <div className="flex items-center space-x-2">
                                        <FileCheck className="h-4 w-4 text-purple-600" />
                                        <span className="text-sm font-medium">Profile Updates</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {stats.pendingRequests} pending
                                    </p>
                                </div>
                                <div className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                                    <div className="flex items-center space-x-2">
                                        <Users className="h-4 w-4 text-green-600" />
                                        <span className="text-sm font-medium">Team Management</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {stats.totalEmployees} members
                                    </p>
                                </div>
                                <div className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                                    <div className="flex items-center space-x-2">
                                        <TrendingUp className="h-4 w-4 text-orange-600" />
                                        <span className="text-sm font-medium">Reports</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Generate insights
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}