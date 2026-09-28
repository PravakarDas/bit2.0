import { getPendingLeaveApplications } from "@/actions/leave.actions";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApprovalButtons } from "@/components/admin/LeaveApprovalButtons";
import { Clock, CheckCircle, Calendar } from "lucide-react";

export default async function ManagerLeaveApplicationsPage() {
    const pendingApplications = await getPendingLeaveApplications();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Leave Applications</h1>
                <p className="text-muted-foreground">Review and approve employee leave requests</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Pending Approvals ({pendingApplications.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {pendingApplications.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
                            <p>No pending leave applications</p>
                            <p className="text-sm">All applications have been reviewed</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Leave Type</TableHead>
                                        <TableHead>Leave Date</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Applied On</TableHead>
                                        <TableHead>Remaining Days</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingApplications.map((application) => (
                                        <TableRow key={application.id}>
                                            <TableCell>
                                                <div className="font-medium">
                                                    {application.user.firstName && application.user.lastName
                                                        ? `${application.user.firstName} ${application.user.lastName}`
                                                        : application.user.email
                                                    }
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {application.user.email}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{application.leaveType.name}</span>
                                                    <Badge variant="outline" className="text-xs w-fit mt-1">
                                                        {application.leaveType.allocatedDays} days/year
                                                    </Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                                    {new Date(application.leaveDate).toLocaleDateString('en-US', {
                                                        weekday: 'short',
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric'
                                                    })}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="max-w-xs">
                                                    {application.reason ? (
                                                        <p className="text-sm truncate" title={application.reason}>
                                                            {application.reason}
                                                        </p>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm italic">
                                                            No reason provided
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {new Date(application.createdAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell>
                                                {application.remainingDays !== null ? (
                                                    <Badge variant="secondary">
                                                        {application.remainingDays} {application.remainingDays === 1 ? "day" : "days"}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm italic">
                                                        No entitlement
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <ApprovalButtons applicationId={application.id} />
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
