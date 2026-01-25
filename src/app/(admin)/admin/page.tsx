import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote, Users, Building, Gift } from "lucide-react";

export default function AdminDashboard() {
    const stats = [
        { title: "Total Employees", value: "124", icon: Users, description: "+4 from last month" },
        { title: "Active Loans", value: "৳4,50,000", icon: Banknote, description: "12 loans pending recovery" },
        { title: "Branches", value: "3", icon: Building, description: "All active" },
        { title: "Active Bonuses", value: "2", icon: Gift, description: "Performance, Festival" },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
                <p className="text-muted-foreground">Overview of the organization's performance and requests.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
