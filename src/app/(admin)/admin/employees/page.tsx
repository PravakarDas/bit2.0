import { getActiveEmployees, getPendingEmployees } from "@/actions/employee.actions";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ApprovalButtons } from "@/components/admin/ApprovalButtons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeesListPanel } from "@/components/admin/EmployeesListPanel";

export default async function EmployeesPage() {
    const [activeEmployees, pendingEmployees] = await Promise.all([
        getActiveEmployees(),
        getPendingEmployees()
    ]);

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
                    <EmployeesListPanel employees={activeEmployees} />
                </CardContent>
            </Card>
        </div>
    );
}
