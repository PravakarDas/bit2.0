import { getAllLeaveTypes } from "@/actions/leave.actions";
import { getActiveBranches } from "@/actions/branch.actions";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddLeaveTypeDialog } from "@/components/admin/AddLeaveTypeDialog";
import { EditLeaveTypeDialog } from "@/components/admin/EditLeaveTypeDialog";
import { LeaveTypeToggle } from "@/components/admin/LeaveTypeToggle";
import { CalendarDays } from "lucide-react";

export default async function AdminLeaveTypesPage() {
    const [leaveTypes, branches] = await Promise.all([
        getAllLeaveTypes(),
        getActiveBranches()
    ]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Leave Types</h1>
                    <p className="text-muted-foreground">Manage different types of leaves and their allocations</p>
                </div>
                <AddLeaveTypeDialog branches={branches} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CalendarDays className="h-5 w-5" />
                        All Leave Types ({leaveTypes.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {leaveTypes.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p>No leave types found</p>
                            <p className="text-sm">Add your first leave type to get started</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Leave Type</TableHead>
                                        <TableHead>Days per Year</TableHead>
                                        <TableHead>Requires Approval</TableHead>
                                        <TableHead>Applicable Branches</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {leaveTypes.map((leaveType) => {
                                        const applicableBranchIds = JSON.parse(leaveType.applicableBranches || '[]');
                                        const applicableBranches = branches.filter(branch => 
                                            applicableBranchIds.includes(branch.id)
                                        );

                                        return (
                                            <TableRow key={leaveType.id}>
                                                <TableCell>
                                                    <div className="font-medium">{leaveType.name}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-semibold text-blue-600">
                                                        {leaveType.allocatedDays} days
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge 
                                                        variant={leaveType.requiresApproval ? "destructive" : "secondary"}
                                                    >
                                                        {leaveType.requiresApproval ? "Yes" : "No"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {applicableBranches.length === 0 ? (
                                                            <Badge variant="outline" className="text-xs">None</Badge>
                                                        ) : applicableBranches.length === branches.length ? (
                                                            <Badge variant="outline" className="text-xs">All Branches</Badge>
                                                        ) : (
                                                            applicableBranches.slice(0, 2).map(branch => (
                                                                <Badge key={branch.id} variant="outline" className="text-xs">
                                                                    {branch.name}
                                                                </Badge>
                                                            ))
                                                        )}
                                                        {applicableBranches.length > 2 && (
                                                            <Badge variant="outline" className="text-xs">
                                                                +{applicableBranches.length - 2} more
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <LeaveTypeToggle 
                                                        leaveTypeId={leaveType.id} 
                                                        isActive={leaveType.isActive} 
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <EditLeaveTypeDialog 
                                                        leaveType={leaveType} 
                                                        branches={branches}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}