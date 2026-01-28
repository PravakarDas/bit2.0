import { getArchivedEmployees } from "@/actions/employee.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArchiveFilters } from "@/components/admin/ArchiveFilters";

interface SearchParams {
    fromDate?: string;
    toDate?: string;
}

export default async function ArchivedEmployeesPage({
    searchParams,
}: {
    searchParams: SearchParams;
}) {
    const archivedEmployees = await getArchivedEmployees(searchParams.fromDate, searchParams.toDate);

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
                        {(searchParams.fromDate || searchParams.toDate) && " - Filtered Results"}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {archivedEmployees.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            {(searchParams.fromDate || searchParams.toDate) 
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
                                    <Link href={`/admin/employees/${employee.id}`}>
                                        <Button variant="outline" size="sm">View Profile</Button>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}