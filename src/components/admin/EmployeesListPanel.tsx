"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EmployeeStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { EmployeeStatusSelect } from "@/components/admin/EmployeeStatusSelect";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

type EmployeesListItem = {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    employeeStatus: EmployeeStatus | null;
    branch?: { name: string } | null;
    department?: { id: string; name: string } | null;
    designation?: { name: string } | null;
};

function getEmployeeName(employee: EmployeesListItem) {
    const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(" ").trim();
    return fullName || employee.email;
}

export function EmployeesListPanel({ employees }: { employees: EmployeesListItem[] }) {
    const [searchText, setSearchText] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState<string>("all");
    const [nameSort, setNameSort] = useState<"asc" | "desc">("asc");

    const departments = useMemo(() => {
        const byId = new Map<string, string>();
        for (const employee of employees) {
            if (employee.department?.id && employee.department.name) {
                byId.set(employee.department.id, employee.department.name);
            }
        }

        return [...byId.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [employees]);

    const filteredEmployees = useMemo(() => {
        const normalizedSearch = searchText.trim().toLowerCase();

        return [...employees]
            .filter((employee) => {
                if (departmentFilter !== "all" && employee.department?.id !== departmentFilter) {
                    return false;
                }

                if (!normalizedSearch) {
                    return true;
                }

                return getEmployeeName(employee).toLowerCase().includes(normalizedSearch);
            })
            .sort((a, b) => {
                const first = getEmployeeName(a);
                const second = getEmployeeName(b);
                const sortResult = first.localeCompare(second);
                return nameSort === "asc" ? sortResult : -sortResult;
            });
    }, [departmentFilter, employees, nameSort, searchText]);

    if (employees.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                No active employees found
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Input
                    placeholder="Search employee by name"
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                />

                <Select value={nameSort} onValueChange={(value: "asc" | "desc") => setNameSort(value)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Sort by name" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="asc">Name: A to Z</SelectItem>
                        <SelectItem value="desc">Name: Z to A</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                    <SelectTrigger>
                        <SelectValue placeholder="Filter by department" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All departments</SelectItem>
                        {departments.map((department) => (
                            <SelectItem key={department.id} value={department.id}>
                                {department.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {filteredEmployees.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No employees match your current filters.
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredEmployees.map((employee) => (
                        <div key={employee.id} className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-gray-50">
                            <div className="flex items-center gap-3">
                                <Link
                                    href={`/admin/employees/${employee.id}`}
                                    className="flex-1 transition-colors hover:text-blue-600"
                                >
                                    <p className="font-medium">{getEmployeeName(employee)}</p>
                                    <p className="text-sm text-muted-foreground">{employee.email}</p>
                                    <div className="mt-1 flex flex-wrap gap-2">
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
                                                    employee.employeeStatus === "ACTIVE"
                                                        ? "default"
                                                        : employee.employeeStatus === "PROBATION"
                                                            ? "secondary"
                                                            : "destructive"
                                                }
                                                className="text-xs"
                                            >
                                                {employee.employeeStatus}
                                            </Badge>
                                        )}
                                    </div>
                                </Link>
                            </div>

                            <div className="ml-3">
                                <EmployeeStatusSelect
                                    employeeId={employee.id}
                                    currentStatus={employee.employeeStatus}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
