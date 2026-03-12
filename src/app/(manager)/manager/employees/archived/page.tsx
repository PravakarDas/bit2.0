import { Suspense } from "react";
import { Metadata } from "next";
import { getArchivedEmployeesForManager } from "@/actions/manager.actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Archive, RotateCcw, Search } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Archived Employees - Manager Portal",
  description: "View and manage archived employees in the system.",
};

interface ArchivedEmployee {
  id: string;
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
  imageUrl: string | null;
  role: string;
  isManager: boolean;
  status: string;
  employeeStatus: string | null;
  dateOfJoining: Date | null;
  attendanceId: string | null;
  branch: {
    id: string;
    name: string;
    location: string;
  } | null;
  department: {
    id: string;
    name: string;
  } | null;
  designation: {
    id: string;
    name: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

async function ArchivedEmployeesList() {
  try {
    const archivedEmployees = await getArchivedEmployeesForManager();

    if (archivedEmployees.length === 0) {
      return (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Archive className="h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">
              No Archived Employees
            </h3>
            <p className="text-gray-500">
              There are no archived employees in the system.
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Archive className="h-5 w-5" />
              Archived Employees ({archivedEmployees.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <SearchInput placeholder="Search archived employees..." className="w-64" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Archived Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archivedEmployees.map((employee: ArchivedEmployee) => (
                  <TableRow key={employee.id} className="hover:bg-gray-50/50">
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={employee.imageUrl || undefined} />
                          <AvatarFallback className="bg-gray-100">
                            {employee.firstName.charAt(0) + employee.lastName.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-gray-900">
                            {employee.firstName} {employee.lastName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {employee.email}
                          </p>
                          {employee.attendanceId && (
                            <p className="text-xs text-gray-400">
                              ID: {employee.attendanceId}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline">
                          {employee.role}
                        </Badge>
                        {employee.isManager && (
                          <Badge variant="secondary" className="text-xs">
                            Manager
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {employee.branch?.name || "No Branch"}
                        </p>
                        {employee.branch?.location && (
                          <p className="text-sm text-muted-foreground">
                            {employee.branch.location}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {employee.department?.name || "No Department"}
                        </p>
                        {employee.designation?.name && (
                          <p className="text-sm text-muted-foreground">
                            {employee.designation.name}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">
                        Archived
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">
                          {formatDate(employee.updatedAt)}
                        </p>
                        {employee.dateOfJoining && (
                          <p className="text-xs text-muted-foreground">
                            Joined: {formatDate(employee.dateOfJoining)}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1"
                        disabled // Managers cannot restore employees
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  } catch (error) {
    console.error("Error fetching archived employees:", error);
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <p className="text-base text-red-600 font-medium mb-2">
            Error loading archived employees
          </p>
          <p className="text-sm text-red-500">
            Please try again later or contact support if the issue persists.
          </p>
        </CardContent>
      </Card>
    );
  }
}

function ArchivedEmployeesLoading() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-9 w-64" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ArchivedEmployeesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Archived Employees
          </h1>
          <p className="text-gray-600 mt-1">
            View previously archived employees in the system.
          </p>
        </div>
      </div>

      <Suspense fallback={<ArchivedEmployeesLoading />}>
        <ArchivedEmployeesList />
      </Suspense>
    </div>
  );
}