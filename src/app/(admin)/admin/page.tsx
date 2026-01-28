import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote, Users, Building, Gift, UserCheck, ClipboardList } from "lucide-react";
import { getAdminDashboardData } from "@/actions/dashboard.actions";

export default async function AdminDashboard() {
    const data = await getAdminDashboardData();

    const stats = [
        { 
            title: "Total Employees", 
            value: data.totalEmployees.toString(), 
            icon: Users, 
            description: data.pendingEmployees > 0 ? `${data.pendingEmployees} pending approval` : "All employees active" 
        },
        { 
            title: "Active Loans", 
            value: `৳${data.activeLoanAmount.toLocaleString("en-BD")}`, 
            icon: Banknote, 
            description: `${data.activeLoanCount} loans active` 
        },
        { 
            title: "Active Branches", 
            value: data.activeBranches.toString(), 
            icon: Building, 
            description: "All operational" 
        },
        { 
            title: "Active Bonuses", 
            value: data.activeBonuses.toString(), 
            icon: Gift, 
            description: "Performance bonuses" 
        },
        { 
            title: "Monthly Payroll", 
            value: `৳${data.monthlyPayrollAmount.toLocaleString("en-BD")}`, 
            icon: UserCheck, 
            description: `${data.monthlyPayrollCount} employees paid this month` 
        },
        { 
            title: "Medical Claims", 
            value: `৳${data.totalMedicalClaimsAmount.toLocaleString("en-BD")}`, 
            icon: ClipboardList, 
            description: `${data.totalMedicalClaimsCount} claims this year` 
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
                <p className="text-muted-foreground">Overview of the organization's performance and requests.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {stats.map((stat) => (
                    <Card key={stat.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                            <stat.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stat.value}</div>
                            <p className="text-xs text-muted-foreground">{stat.description}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
