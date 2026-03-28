import { getActiveEmployeesForManager, getPendingEmployeesForManager } from "@/actions/manager.actions";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ManagerApprovalButtons } from "@/components/manager/ManagerApprovalButtons";
import { EmployeeStatusSelect } from "@/components/admin/EmployeeStatusSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, CheckCircle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default async function ManagerEmployeesPage() {
    const [activeEmployees, pendingEmployees] = await Promise.all([
        getActiveEmployeesForManager(),
        getPendingEmployeesForManager(),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Employee Management</h1>
                    <p className="text-gray-600 mt-1">
                        Manage your team members and their information
                    </p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total Employees
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeEmployees.length}</div>
                        <p className="text-xs text-muted-foreground">
                            Active team members
                        </p>
                    </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Pending Approval
                        </CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pendingEmployees.length}</div>
                        <p className="text-xs text-muted-foreground">
                            Awaiting approval
                        </p>
                    </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Active Status
                        </CardTitle>
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {activeEmployees.filter(emp => emp.employeeStatus === "ACTIVE").length}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Currently active
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Pending Employees Section */}
            {pendingEmployees.length > 0 && (
                <Card className="border-orange-200 bg-orange-50/50">
                    <CardHeader>
                        <CardTitle className="text-orange-800">Pending Employees ({pendingEmployees.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-md border bg-white">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Branch</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingEmployees.map((employee) => (
                                        <TableRow key={employee.id}>
                                            <TableCell>
                                                <div className="flex items-center space-x-2">
                                                    {employee.imageUrl && (
                                                        <Image
                                                            src={employee.imageUrl}
                                                            alt={`${employee.firstName} ${employee.lastName}`}
                                                            className="w-8 h-8 rounded-full"
                                                            width={32}
                                                            height={32}
                                                        />
                                                    )}
                                                    <div>
                                                        <div className="font-medium">
                                                            {employee.firstName} {employee.lastName}
                                                        </div>
                                                        {employee.attendanceId && (
                                                            <div className="text-sm text-muted-foreground">
                                                                ID: {employee.attendanceId}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{employee.email}</TableCell>
                                            <TableCell>
                                                <Badge variant={employee.role === "HR" ? "default" : "secondary"}>
                                                    {employee.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {employee.branch?.name || "Not assigned"}
                                            </TableCell>
                                            <TableCell>
                                                {employee.department?.name || "Not assigned"}
                                            </TableCell>
                                            <TableCell>
                                                <ManagerApprovalButtons employeeId={employee.id} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Active Employees Section */}
            <Card>
                <CardHeader>
                    <CardTitle>All Employees ({activeEmployees.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Branch</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Designation</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activeEmployees.map((employee) => (
                                    <TableRow key={employee.id} className="hover:bg-gray-50/50">
                                        <TableCell>
                                            <div className="flex items-center space-x-2">
                                                {employee.imageUrl && (
                                                    <Image
                                                        src={employee.imageUrl}
                                                        alt={`${employee.firstName} ${employee.lastName}`}
                                                        className="w-8 h-8 rounded-full"
                                                        width={32}
                                                        height={32}
                                                    />
                                                )}
                                                <div>
                                                    <div className="font-medium">
                                                        {employee.firstName} {employee.lastName}
                                                        {employee.isManager && (
                                                            <Badge variant="outline" className="ml-2 text-xs">
                                                                Manager
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {employee.attendanceId && (
                                                        <div className="text-sm text-muted-foreground">
                                                            ID: {employee.attendanceId}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>{employee.email}</TableCell>
                                        <TableCell>
                                            <Badge variant={employee.role === "HR" ? "default" : "secondary"}>
                                                {employee.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <EmployeeStatusSelect 
                                                employeeId={employee.id} 
                                                currentStatus={employee.employeeStatus || "ACTIVE"}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {employee.branch?.name || "Not assigned"}
                                        </TableCell>
                                        <TableCell>
                                            {employee.department?.name || "Not assigned"}
                                        </TableCell>
                                        <TableCell>
                                            {employee.designation?.name || "Not assigned"}
                                        </TableCell>
                                        <TableCell>
                                            <Link 
                                                href={`/manager/employees/${employee.id}`}
                                                className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline"
                                            >
                                                View Details
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}