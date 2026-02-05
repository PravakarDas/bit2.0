import { getUserById } from "@/actions/user.actions";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, User, Mail, Building, Calendar, Banknote } from "lucide-react";
import Link from "next/link";
import { AssignBranchSelect } from "@/components/admin/AssignBranchSelect";
import { EmployeeStatusSelect } from "@/components/admin/EmployeeStatusSelect";
import { getActiveBranches } from "@/actions/branch.actions";
import { WorkingDaysInput } from "@/components/admin/WorkingDaysInput";

export default async function EmployeeProfilePage({ params }: { params: { id: string } }) {
    const { id } = await params;
    const [user, branches] = await Promise.all([
        getUserById(id),
        getActiveBranches()
    ]);

    if (!user) notFound();

    const employeeName = user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}`
        : user.email;
    const workingDaysInMonth = user.workingDaysInMonth ?? 22;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/admin/employees">
                    <Button variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <Avatar className="h-16 w-16">
                    <AvatarImage src={user.imageUrl || ""} alt="Profile picture" />
                    <AvatarFallback className="text-lg">
                        {user.firstName && user.lastName 
                            ? `${user.firstName[0]}${user.lastName[0]}`
                            : user.email[0].toUpperCase()
                        }
                    </AvatarFallback>
                </Avatar>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Employee Profile</h1>
                    <p className="text-muted-foreground">Profile details for {employeeName}</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Basic Information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Basic Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                                <p className="font-medium">{employeeName}</p>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Email</label>
                                <p className="font-medium flex items-center gap-2">
                                    <Mail className="h-4 w-4" />
                                    {user.email}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Role</label>
                                <Badge variant="outline">{user.role}</Badge>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Status</label>
                                <Badge variant={user.status === "APPROVED" ? "default" : "secondary"}>
                                    {user.status}
                                </Badge>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-muted-foreground">Employee Status</label>
                                <EmployeeStatusSelect 
                                    employeeId={user.id} 
                                    currentStatus={user.employeeStatus} 
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Work Information */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Building className="h-5 w-5" />
                            Work Information
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Branch Assignment</label>
                            <AssignBranchSelect
                                userId={user.id}
                                currentBranchId={user.branchId}
                                branches={branches}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Base Salary</label>
                            <p className="font-medium flex items-center gap-2">
                                <Banknote className="h-4 w-4" />
                                ৳{user.baseSalary.toLocaleString("en-BD")}
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-muted-foreground">Wallet Balance</label>
                            <p className="font-medium">
                                ৳{user.walletBalance.toLocaleString("en-BD")}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Employment Details
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-muted-foreground">Date of Joining</label>
                        <p className="font-medium flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {user.dateOfJoining ? new Date(user.dateOfJoining).toLocaleDateString() : "Not set"}
                        </p>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-muted-foreground">Working Days (Monthly)</label>
                        <p className="text-sm text-muted-foreground">
                            Current setting: {workingDaysInMonth}
                        </p>
                        <WorkingDaysInput
                            employeeId={user.id}
                            currentWorkingDays={workingDaysInMonth}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
                <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <Link href={`/admin/employees/${id}/salary`}>
                            <Button variant="outline">
                                <Banknote className="mr-2 h-4 w-4" />
                                Salary History
                            </Button>
                        </Link>
                        <Button variant="outline" disabled>
                            <User className="mr-2 h-4 w-4" />
                            Edit Profile
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}