import { getUserLeaveEntitlements, getUserLeaveApplications } from "@/actions/leave.actions";
import { getDbUser } from "@/actions/user.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApplyLeaveDialog } from "@/components/employee/ApplyLeaveDialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { CalendarDays, Clock, CheckCircle, XCircle, Calendar } from "lucide-react";
import { redirect } from "next/navigation";

export default async function EmployeeLeavePage() {
    const user = await getDbUser();
    
    if (!user) {
        redirect("/sign-in");
    }

    const currentYear = new Date().getFullYear();
    const [entitlements, applications] = await Promise.all([
        getUserLeaveEntitlements(user.id, currentYear),
        getUserLeaveApplications(user.id, currentYear)
    ]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">My Leaves</h1>
                    <p className="text-muted-foreground">Track your leave balance and apply for time off</p>
                </div>
                {entitlements.length > 0 && <ApplyLeaveDialog entitlements={entitlements} />}
            </div>

            {/* Leave Entitlements Summary */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {entitlements.length === 0 ? (
                    <Card className="col-span-full">
                        <CardContent className="pt-6">
                            <div className="text-center">
                                <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                                <p className="text-muted-foreground">No leave types assigned</p>
                                <p className="text-sm text-muted-foreground">
                                    Contact HR to get leave types assigned to your account
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    entitlements.map((entitlement) => {
                        const remainingDays = entitlement.allocatedDays - entitlement.usedDays;
                        const usagePercentage = (entitlement.usedDays / entitlement.allocatedDays) * 100;
                        
                        return (
                            <Card key={entitlement.id} className="hover:shadow-md transition-shadow">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-lg flex items-center justify-between">
                                        {entitlement.leaveType.name}
                                        <Badge variant={entitlement.leaveType.requiresApproval ? "destructive" : "secondary"}>
                                            {entitlement.leaveType.requiresApproval ? "Approval Required" : "Auto Approve"}
                                        </Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">Total Allocated:</span>
                                        <span className="font-semibold">{entitlement.allocatedDays} days</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">Used:</span>
                                        <span className="font-semibold text-red-600">{entitlement.usedDays} days</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">Remaining:</span>
                                        <span className={`font-semibold ${remainingDays > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {remainingDays} days
                                        </span>
                                    </div>
                                    
                                    {/* Progress Bar */}
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                            className={`h-2 rounded-full transition-all duration-300 ${
                                                usagePercentage >= 100 ? 'bg-red-500' :
                                                usagePercentage >= 80 ? 'bg-orange-500' :
                                                'bg-green-500'
                                            }`}
                                            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-center text-muted-foreground">
                                        {usagePercentage.toFixed(1)}% used
                                    </p>
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            {/* Recent Leave Applications */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Recent Leave Applications
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {applications.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Clock className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p>No leave applications found</p>
                            <p className="text-sm">Your leave applications will appear here</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Leave Type</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Applied On</TableHead>
                                        <TableHead>Approved By</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {applications.map((application) => (
                                        <TableRow key={application.id}>
                                            <TableCell className="font-medium">
                                                {application.leaveType.name}
                                            </TableCell>
                                            <TableCell>
                                                {new Date(application.leaveDate).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                {application.reason || "No reason provided"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge 
                                                    variant={
                                                        application.status === "APPROVED" ? "default" :
                                                        application.status === "REJECTED" ? "destructive" :
                                                        "secondary"
                                                    }
                                                    className="flex items-center gap-1 w-fit"
                                                >
                                                    {application.status === "APPROVED" && <CheckCircle className="h-3 w-3" />}
                                                    {application.status === "REJECTED" && <XCircle className="h-3 w-3" />}
                                                    {application.status === "PENDING" && <Clock className="h-3 w-3" />}
                                                    {application.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {new Date(application.createdAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {application.approvedBy || "-"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}