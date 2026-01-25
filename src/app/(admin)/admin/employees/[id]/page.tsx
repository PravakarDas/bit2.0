import { getActiveBranches } from "@/actions/branch.actions";
import { getUserById } from "@/actions/user.actions";
import { getSalaryHistory } from "@/actions/salary.actions";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EditEmployeeDialog } from "@/components/admin/EditEmployeeDialog";
import { ArrowLeft, Wallet, Banknote, History } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function AdminEmployeeDetailPage({ params }: { params: { id: string } }) {
    const { id } = await params;
    const [user, branches, salaryHistory] = await Promise.all([
        getUserById(id),
        getActiveBranches(),
        getSalaryHistory(id),
    ]);

    if (!user) notFound();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin/employees">
                        <Button variant="outline" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Employee Profile</h1>
                        <p className="text-muted-foreground">Detailed view for <span className="font-semibold text-black">{user.email}</span></p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Link href={`/employees/${id}/salary`}>
                        <Button variant="outline">
                            <History className="mr-2 h-4 w-4" /> Manage History
                        </Button>
                    </Link>
                    <EditEmployeeDialog
                        user={{
                            id: user.id,
                            email: user.email,
                            role: user.role,
                            branchId: user.branchId
                        }}
                        branches={branches}
                    />
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="md:col-span-1">
                    <CardHeader className="flex flex-col items-center">
                        <Avatar className="h-32 w-32 mb-4">
                            <AvatarFallback className="text-4xl">{user.email[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <CardTitle className="text-2xl">{user.email}</CardTitle>
                        <div className="flex gap-2 mt-2">
                            <Badge>{user.role}</Badge>
                            <Badge variant={user.status === "APPROVED" ? "default" : "secondary"}>{user.status}</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="pt-4 border-t space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Joined:</span>
                                <span className="font-medium">{new Date(user.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Branch:</span>
                                <span className="font-medium">{user.branchId || "None"}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="md:col-span-2 space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center">
                                    <Wallet className="mr-2 h-4 w-4 text-green-600" /> Wallet Balance
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-700">₹{user.walletBalance.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium flex items-center">
                                    <Banknote className="mr-2 h-4 w-4 text-indigo-600" /> Base Salary
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-indigo-700">₹{user.baseSalary.toLocaleString()}</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Salary Revisions</CardTitle>
                            <CardDescription>Latest changes to base compensation.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {salaryHistory.slice(0, 3).reverse().map((rev: { id: string; reason: string; effectiveFrom: Date; amount: number }) => (
                                    <div key={rev.id} className="flex justify-between items-center p-3 border rounded-lg bg-muted/20">
                                        <div>
                                            <p className="text-sm font-semibold capitalize">{rev.reason.toLowerCase().replace('_', ' ')}</p>
                                            <p className="text-[10px] text-muted-foreground">
                                                Effective: {new Date(rev.effectiveFrom).toLocaleDateString()}
                                            </p>
                                        </div>
                                        <div className="text-lg font-bold tabular-nums">
                                            ₹{rev.amount.toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                                {salaryHistory.length === 0 && <p className="text-center text-muted-foreground py-4 italic">No history found.</p>}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
