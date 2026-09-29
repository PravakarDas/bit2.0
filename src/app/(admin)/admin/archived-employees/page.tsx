import { getArchivedEmployees } from "@/actions/employee.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArchiveFilters } from "@/components/admin/ArchiveFilters";
import { ResetEmployeeDataButton } from "@/components/admin/ResetEmployeeDataButton";

interface SearchParams {
    fromDate?: string;
    toDate?: string;
}

export default async function ArchivedEmployeesPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const params = await searchParams;
    const archivedEmployees = await getArchivedEmployees(params.fromDate, params.toDate);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Archived Employees</h1>
                    <p className="text-muted-foreground">Employees who have resigned or been terminated</p>
                </div>
                <Link href="/admin/employees">
                    <Button variant="outline">Back to Active Employees</Button>
                </Link>
            </div>

            <ArchiveFilters />

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">
                        Archived Employees ({archivedEmployees.length})
                        {(params.fromDate || params.toDate) && " - Filtered Results"}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {archivedEmployees.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            {(params.fromDate || params.toDate) 
                                ? "No archived employees found for the selected date range"
                                : "No archived employees found"
                            }
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {archivedEmployees.map((employee) => (
                                <div key={employee.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                                    <div className="flex items-center gap-3">
                                        <div>
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
                                                {employee.employeeStatus && (
                                                    <Badge 
                                                        variant="destructive"
                                                        className="text-xs"
                                                    >
                                                        {employee.employeeStatus}
                                                    </Badge>
                                                )}
                                                <Badge variant="secondary" className="text-xs">
                                                    Archived {new Date(employee.updatedAt).toLocaleDateString()}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Link href={`/admin/employees/${employee.id}`}>
                                            <Button variant="outline" size="sm">View Profile</Button>
                                        </Link>
                                        <ResetEmployeeDataButton userId={employee.id} />
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