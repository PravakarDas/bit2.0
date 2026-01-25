import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDbUser } from "@/actions/user.actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export default async function ProfilePage() {
    const user = await getDbUser();

    if (!user) return null;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24">
                    <AvatarFallback className="text-2xl">{user.email[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{user.email}</h1>
                    <div className="flex gap-2 mt-2">
                        <Badge>{user.role}</Badge>
                        <Badge variant="outline">{user.status}</Badge>
                    </div>
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

                <Card>
                    <CardHeader>
                        <CardTitle>Account Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Clerk ID:</span>
                            <span className="font-mono text-xs">{user.clerkId}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Member Since:</span>
                            <span className="font-medium">{new Date(user.createdAt).toLocaleDateString()}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
