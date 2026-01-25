import { getEmployees } from "@/actions/employee.actions";
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
import { EmployeeActionButtons } from "@/components/admin/EmployeeActionButtons";
import { AssignBranchSelect } from "@/components/admin/AssignBranchSelect";
import { EditEmployeeDialog } from "@/components/admin/EditEmployeeDialog";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

export default async function EmployeesPage() {
    const employees: any[] = await getEmployees();
    const branches = await getActiveBranches();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Employee Management</h1>
                <p className="text-muted-foreground">Approve new users and manage employee organizations.</p>
            </div>

            <div className="border rounded-lg bg-card bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold">Employee</TableHead>
                            <TableHead className="font-semibold text-center">Status</TableHead>
                            <TableHead className="font-semibold">Branch</TableHead>
                            <TableHead className="font-semibold text-right pr-6">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {employees.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                                    No employees found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            employees.map((employee) => (
                                <TableRow key={employee.id} className="hover:bg-muted/30 transition-colors">
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-sm">{employee.email}</span>
                                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Role: {employee.role}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={employee.status === "APPROVED" ? "default" : "secondary"}>
                                            {employee.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <AssignBranchSelect
                                            userId={employee.id}
                                            currentBranchId={employee.branchId}
                                            branches={branches}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                        <div className="flex justify-end gap-2 items-center">
                                            <Link href={`/admin/employees/${employee.id}`}>
                                                <Button variant="outline" size="sm">
                                                    <Users className="mr-2 h-4 w-4" /> View Profile
                                                </Button>
                                            </Link>
                                            <EmployeeActionButtons
                                                userId={employee.id}
                                                currentStatus={employee.status}
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
