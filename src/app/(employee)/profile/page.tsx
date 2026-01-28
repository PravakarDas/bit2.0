import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDbUser } from "@/actions/user.actions";
import { Badge } from "@/components/ui/badge";

export default async function ProfilePage() {
    const user = await getDbUser();

    if (!user) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">
                    {user.firstName && user.lastName 
                        ? `${user.firstName} ${user.lastName}` 
                        : user.email
                    }
                </h1>
                <p className="text-muted-foreground">{user.email}</p>
                <div className="flex gap-2 mt-2">
                    <Badge>{user.role}</Badge>
                    <Badge variant="outline">{user.status}</Badge>
                    {user.employeeStatus && (
                        <Badge variant={user.employeeStatus === "ACTIVE" ? "default" : "secondary"}>
                            {user.employeeStatus}
                        </Badge>
                    )}
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            Wallet Balance
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold text-primary">
                            ৳{user.walletBalance.toLocaleString("en-BD")}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wider font-semibold">
                            Available for withdrawal
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Work Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Branch:</span>
                            <span className="font-medium text-sm">{user.branchId || "Not Assigned"}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2">
                            <span className="text-muted-foreground">Current Base:</span>
                            <span className="font-bold text-indigo-700">৳{user.baseSalary.toLocaleString("en-BD")}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
