"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, Search, Users, X } from "lucide-react";
import { getWeeklyAvailabilityData } from "@/actions/availability.actions";

const WEEK_LENGTH = 7;

interface Employee {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    personalEmail: string | null;
    phoneNumber: string | null;
    branch: {
        id: string;
        name: string;
        weeklyOffDays: string[];
    } | null;
}

interface LeaveEntry {
    userId: string;
    date: string;
    leaveTypeName: string;
}

interface HolidayEntry {
    id: string;
    name: string;
    date: string;
    appliesToAllBranches: boolean;
    applicableBranchIds: string[];
}

type EmployeeDayStatus =
    | { available: true }
    | { available: false; reason: string };

function toDayKey(date: Date) {
    return format(date, "yyyy-MM-dd");
}

function getEmployeeName(employee: Employee) {
    if (employee.firstName && employee.lastName) {
        return `${employee.firstName} ${employee.lastName}`;
    }
    return employee.email;
}

function StatusCell({ status }: { status: EmployeeDayStatus }) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span
                        className={
                            "mx-auto flex h-6 w-6 items-center justify-center rounded-full " +
                            (status.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")
                        }
                    >
                        {status.available ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                    {status.available ? "Available" : status.reason}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

export default function AvailabilityCalendar() {
    const [weekStart] = useState(() => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        return date;
    });
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
    const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const result = await getWeeklyAvailabilityData(weekStart.toISOString(), WEEK_LENGTH);
                setEmployees(result.employees || []);
                setLeaves(result.leaves || []);
                setHolidays(result.holidays || []);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [weekStart]);

    const days = useMemo(
        () => Array.from({ length: WEEK_LENGTH }, (_, index) => addDays(weekStart, index)),
        [weekStart]
    );

    const filteredEmployees = useMemo(() => {
        if (!searchTerm.trim()) {
            return employees;
        }
        const searchLower = searchTerm.toLowerCase();
        return employees.filter((employee) => {
            const name = getEmployeeName(employee).toLowerCase();
            const email = employee.email.toLowerCase();
            const personalEmail = employee.personalEmail?.toLowerCase() || "";
            return name.includes(searchLower) || email.includes(searchLower) || personalEmail.includes(searchLower);
        });
    }, [employees, searchTerm]);

    const branches = useMemo(() => {
        const map = new Map<string, { id: string; name: string }>();
        filteredEmployees.forEach((employee) => {
            if (employee.branch?.id && employee.branch?.name) {
                map.set(employee.branch.id, { id: employee.branch.id, name: employee.branch.name });
            }
        });
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [filteredEmployees]);

    const unbranchedEmployees = useMemo(
        () => filteredEmployees.filter((employee) => !employee.branch?.id),
        [filteredEmployees]
    );

    const leaveByDate = useMemo(() => {
        const map = new Map<string, LeaveEntry[]>();
        leaves.forEach((leave) => {
            const key = leave.date.slice(0, 10);
            const existing = map.get(key) || [];
            existing.push(leave);
            map.set(key, existing);
        });
        return map;
    }, [leaves]);

    const holidayByDate = useMemo(() => {
        const map = new Map<string, HolidayEntry[]>();
        holidays.forEach((holiday) => {
            const key = holiday.date.slice(0, 10);
            const existing = map.get(key) || [];
            existing.push(holiday);
            map.set(key, existing);
        });
        return map;
    }, [holidays]);

    function getStatus(employee: Employee, date: Date): EmployeeDayStatus {
        const dayKey = toDayKey(date);
        const dayName = format(date, "EEEE").toUpperCase();

        const holidaysToday = holidayByDate.get(dayKey) || [];
        const isOnHoliday = holidaysToday.some(
            (holiday) => holiday.appliesToAllBranches || (employee.branch?.id && holiday.applicableBranchIds.includes(employee.branch.id))
        );
        if (isOnHoliday) {
            return { available: false, reason: "Holiday" };
        }

        const leaveToday = (leaveByDate.get(dayKey) || []).find((leave) => leave.userId === employee.id);
        if (leaveToday) {
            return { available: false, reason: leaveToday.leaveTypeName };
        }

        if (employee.branch?.weeklyOffDays?.includes(dayName)) {
            return { available: false, reason: "Weekly Off" };
        }

        return { available: true };
    }

    function renderEmployeeRow(employee: Employee) {
        return (
            <tr key={employee.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="sticky left-0 whitespace-nowrap bg-white py-2 pr-4 font-medium">
                    {getEmployeeName(employee)}
                </td>
                {days.map((date) => (
                    <td key={toDayKey(date)} className="py-2 text-center">
                        <StatusCell status={getStatus(employee, date)} />
                    </td>
                ))}
            </tr>
        );
    }

    const totalResults = filteredEmployees.length;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Team Availability Calendar</h1>
                <p className="text-muted-foreground">
                    {format(days[0], "MMMM d")} – {format(days[days.length - 1], "MMMM d, yyyy")} · availability by branch
                </p>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4" />
                        Employees ({totalResults})
                    </CardTitle>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">Loading availability...</p>
                    ) : totalResults === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            {searchTerm ? "No employees match your search." : "No employees found."}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-sm">
                                <thead>
                                    <tr className="border-b text-xs font-medium text-muted-foreground">
                                        <th className="sticky left-0 bg-white py-2 pr-4 text-left">Employee</th>
                                        {days.map((date) => {
                                            const isToday = isSameDay(date, new Date());
                                            return (
                                                <th
                                                    key={toDayKey(date)}
                                                    className={"py-2 text-center " + (isToday ? "text-primary" : "")}
                                                >
                                                    <div>{format(date, "EEE")}</div>
                                                    <div className="text-[11px] font-normal">{format(date, "MMM d")}</div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {branches.map((branch) => {
                                        const branchEmployees = filteredEmployees.filter(
                                            (employee) => employee.branch?.id === branch.id
                                        );
                                        if (branchEmployees.length === 0) {
                                            return null;
                                        }

                                        return (
                                            <Fragment key={branch.id}>
                                                <tr className="bg-muted/40">
                                                    <td colSpan={days.length + 1} className="py-1.5 pr-4 text-xs font-semibold text-muted-foreground">
                                                        {branch.name}
                                                    </td>
                                                </tr>
                                                {branchEmployees.map(renderEmployeeRow)}
                                            </Fragment>
                                        );
                                    })}

                                    {unbranchedEmployees.length > 0 && (
                                        <Fragment>
                                            <tr className="bg-muted/40">
                                                <td colSpan={days.length + 1} className="py-1.5 pr-4 text-xs font-semibold text-muted-foreground">
                                                    No Branch
                                                </td>
                                            </tr>
                                            {unbranchedEmployees.map(renderEmployeeRow)}
                                        </Fragment>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
