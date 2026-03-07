import { getDbUser } from "@/actions/user.actions";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function ManagerLeaveRequests() {
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
                    <h1 className="text-3xl font-bold tracking-tight">Leave Requests</h1>
                    <p className="text-muted-foreground">
                        Review and approve leave requests from your team
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
                            <li>View leave requests from team members</li>
                            <li>Approve or reject leave requests</li>
                            <li>Add approval comments</li>
                            <li>View leave balances for team members</li>
                            <li>Team leave schedule calendar</li>
                            <li>Leave request analytics</li>
                        </ul>
                        <Button variant="outline" className="mt-4">
                            Configure Leave Management
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}