"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Mail, Phone, Search, Users } from "lucide-react";
import { getEmployeeContacts } from "@/actions/employee-contact.actions";

interface EmployeeContact {
    id: string;
    firstName: string | null;
    lastName: string | null;
    personalEmail: string | null;
    phoneNumber: string | null;
    branch: {
        id: string;
        name: string;
    } | null;
}

function getEmployeeName(employee: EmployeeContact) {
    if (employee.firstName && employee.lastName) {
        return `${employee.firstName} ${employee.lastName}`;
    }
    return employee.firstName || employee.lastName || "Unnamed Employee";
}

export default function EmployeeContactDirectory() {
    const [employees, setEmployees] = useState<EmployeeContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const result = await getEmployeeContacts();
                setEmployees(result);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    const filteredEmployees = useMemo(() => {
        if (!searchTerm.trim()) {
            return employees;
        }
        const searchLower = searchTerm.toLowerCase();
        return employees.filter((employee) => {
            const name = getEmployeeName(employee).toLowerCase();
            const branch = employee.branch?.name.toLowerCase() || "";
            const email = employee.personalEmail?.toLowerCase() || "";
            const phone = employee.phoneNumber?.toLowerCase() || "";
            return (
                name.includes(searchLower) ||
                branch.includes(searchLower) ||
                email.includes(searchLower) ||
                phone.includes(searchLower)
            );
        });
    }, [employees, searchTerm]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Employee Contact</h1>
                <p className="text-muted-foreground">Names, branches, personal email and phone numbers for all employees</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4" />
                        All Employees ({filteredEmployees.length})
                    </CardTitle>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search by name, branch, email or phone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">Loading employees...</p>
                    ) : filteredEmployees.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            {searchTerm ? "No employees match your search." : "No employees found."}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                                        <th className="pb-2 pr-4">Name</th>
                                        <th className="pb-2 pr-4">Branch</th>
                                        <th className="pb-2 pr-4">Personal Email</th>
                                        <th className="pb-2 pr-4">Phone Number</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredEmployees.map((employee) => (
                                        <tr key={employee.id} className="border-b last:border-0 hover:bg-gray-50">
                                            <td className="py-3 pr-4 font-medium">{getEmployeeName(employee)}</td>
                                            <td className="py-3 pr-4 text-muted-foreground">{employee.branch?.name || "No Branch"}</td>
                                            <td className="py-3 pr-4">
                                                {employee.personalEmail ? (
                                                    <span className="flex items-center gap-1.5">
                                                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                                                        {employee.personalEmail}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="py-3 pr-4">
                                                {employee.phoneNumber ? (
                                                    <span className="flex items-center gap-1.5">
                                                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                                                        {employee.phoneNumber}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
