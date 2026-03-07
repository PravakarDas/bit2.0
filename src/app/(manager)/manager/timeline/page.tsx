import { getDbUser } from "@/actions/user.actions";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function ManagerTimeline() {
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
                    <h1 className="text-3xl font-bold tracking-tight">Team Timeline</h1>
                    <p className="text-muted-foreground">
                        Monitor attendance and time tracking for your team members
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
                            <li>Real-time team attendance tracking</li>
                            <li>Individual team member timelines</li>
                            <li>Late check-in and early check-out monitoring</li>
                            <li>Attendance pattern analysis</li>
                            <li>Overtime tracking for team members</li>
                            <li>Generate attendance reports</li>
                            <li>Set attendance policies and alerts</li>
                        </ul>
                        <Button variant="outline" className="mt-4">
                            Configure Timeline Settings
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}