import { getActiveEmployees, getPendingEmployees } from "@/actions/employee.actions";
import { getActiveBranches } from "@/actions/branch.actions";
import { Badge } from "@/components/ui/badge";
import { EditEmployeeDialog } from "@/components/admin/EditEmployeeDialog";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ApprovalButtons } from "@/components/admin/ApprovalButtons";
import { EmployeeStatusSelect } from "@/components/admin/EmployeeStatusSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EmployeesPage() {
    const [activeEmployees, pendingEmployees] = await Promise.all([
        getActiveEmployees(),
        getPendingEmployees()
    ]);
    const branches = await getActiveBranches();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Employee Management</h1>
                <p className="text-muted-foreground">Manage active and pending employees</p>
            </div>

            {/* Pending Employees Section */}
            {pendingEmployees.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Pending Approvals ({pendingEmployees.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {pendingEmployees.map((employee) => (
                                <div key={employee.id} className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50">
                                    <div className="flex items-center gap-3">
                                        <div>
                                            <p className="font-medium">
                                                {employee.firstName && employee.lastName 
                                                    ? `${employee.firstName} ${employee.lastName}`
                                                    : employee.email
                                                }
                                            </p>
                                            <p className="text-sm text-muted-foreground">{employee.email}</p>
                                            {employee.branch && (
                                                <Badge variant="outline" className="text-xs">{employee.branch.name}</Badge>
                                            )}
                                        </div>
                                    </div>
                                    <ApprovalButtons employeeId={employee.id} />
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Active Employees Section */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">Active Employees ({activeEmployees.length})</CardTitle>
                    <Link href="/admin/archived-employees">
                        <Button variant="outline">View Archived</Button>
                    </Link>
                </CardHeader>
                <CardContent>
                    {activeEmployees.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No active employees found
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activeEmployees.map((employee) => (
                                <div key={employee.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <Link 
                                            href={`/admin/employees/${employee.id}`}
                                            className="flex-1 hover:text-blue-600 transition-colors"
                                        >
                                            <p className="font-medium">
                                                {employee.firstName && employee.lastName 
                                                    ? `${employee.firstName} ${employee.lastName}`
                                                    : employee.email
                                                }
                                            </p>
                                            <p className="text-sm text-muted-foreground">{employee.email}</p>
                                            <div className="flex gap-2 mt-1">
                                                {employee.branch && (
                                                    <Badge variant="outline" className="text-xs">{employee.branch.name}</Badge>
                                                )}
                                                {employee.department && (
                                                    <Badge variant="secondary" className="text-xs">{employee.department.name}</Badge>
                                                )}
                                                {employee.designation && (
                                                    <Badge variant="secondary" className="text-xs">{employee.designation.name}</Badge>
                                                )}
                                                {employee.employeeStatus && (
                                                    <Badge 
                                                        variant={
                                                            employee.employeeStatus === "ACTIVE" ? "default" :
                                                            employee.employeeStatus === "PROBATION" ? "secondary" :
                                                            "destructive"
                                                        }
                                                        className="text-xs"
                                                    >
                                                        {employee.employeeStatus}
                                                    </Badge>
                                                )}
                                            </div>
                                        </Link>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <EmployeeStatusSelect 
                                            employeeId={employee.id} 
                                            currentStatus={employee.employeeStatus} 
                                        />
                                        <EditEmployeeDialog
                                            user={{
                                                id: employee.id,
                                                email: employee.email,
                                                role: employee.role,
                                                branchId: employee.branchId,
                                                departmentId: employee.departmentId,
                                                designationId: employee.designationId,
                                            }}
                                            branches={branches}
                                        />
                                        <Link href={`/admin/employees/${employee.id}`}>
                                            <Button variant="outline" size="sm">View Profile</Button>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
