import { getDbUser } from "@/actions/user.actions";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function ManagerReports() {
    const user = await getDbUser();

    if (!user) {
        redirect("/sign-in");
    }

    if (!["MANAGER", "SUPERADMIN"].includes(user.role)) {
        redirect("/unauthorized");
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Team Reports</h1>
                    <p className="text-muted-foreground">
                        Generate insights and reports for your team's performance
                    </p>
                </div>
                <Badge variant="outline">
                    Manager Access
                </Badge>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Features Coming Soon</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <p className="text-muted-foreground">
                            This page will include:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
                            <li>Team attendance summary reports</li>
                            <li>Individual performance analytics</li>
                            <li>Leave utilization reports</li>
                            <li>Overtime and productivity metrics</li>
                            <li>Team workload distribution analysis</li>
                            <li>Custom report generation</li>
                            <li>Export reports in multiple formats</li>
                            <li>Scheduled automated reports</li>
                        </ul>
                        <Button variant="outline" className="mt-4">
                            Create Custom Report
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}