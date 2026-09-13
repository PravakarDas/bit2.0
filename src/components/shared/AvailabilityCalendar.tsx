"use client";

import { useEffect, useMemo, useState } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { CalendarDays, Building2, Phone, Mail } from "lucide-react";
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

function EmployeeStatusPill({ employee, status }: { employee: Employee; status: EmployeeDayStatus }) {
    const hasContactInfo = employee.phoneNumber || employee.personalEmail;

    const pill = (
        <span
            className={
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium " +
                (status.available
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-red-200 bg-red-50 text-red-700")
            }
        >
            <span className={"h-1.5 w-1.5 rounded-full " + (status.available ? "bg-green-500" : "bg-red-500")} />
            {getEmployeeName(employee)}
            {!status.available && <span className="text-[10px] text-red-500">({status.reason})</span>}
        </span>
    );

    if (!hasContactInfo) {
        return pill;
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>{pill}</TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                    <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            <span className="text-muted-foreground">Work:</span>
                            <span>{employee.email}</span>
                        </div>
                        {employee.personalEmail && (
                            <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                <span className="text-muted-foreground">Personal:</span>
                                <span>{employee.personalEmail}</span>
                            </div>
                        )}
                        {employee.phoneNumber && (
                            <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                <span className="text-muted-foreground">Phone:</span>
                                <span>{employee.phoneNumber}</span>
                            </div>
                        )}
                    </div>
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

    const branches = useMemo(() => {
        const map = new Map<string, { id: string; name: string }>();
        employees.forEach((employee) => {
            if (employee.branch?.id && employee.branch?.name) {
                map.set(employee.branch.id, { id: employee.branch.id, name: employee.branch.name });
            }
        });
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [employees]);

    const unbranchedEmployees = useMemo(
        () => employees.filter((employee) => !employee.branch?.id),
        [employees]
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

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Team Availability Calendar</h1>
                <p className="text-muted-foreground">
                    {format(days[0], "MMMM d")} – {format(days[days.length - 1], "MMMM d, yyyy")} · availability by branch
                </p>
            </div>

            {loading && <div className="text-sm text-muted-foreground">Loading availability...</div>}

            <div className="space-y-4">
                {days.map((date) => {
                    const dayKey = toDayKey(date);
                    const isToday = isSameDay(date, new Date());

                    return (
                        <Card key={dayKey} className={isToday ? "border-primary" : undefined}>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <CalendarDays className="h-4 w-4" />
                                    {format(date, "EEEE, MMMM d")}
                                    {isToday && <Badge>Today</Badge>}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {employees.length === 0 && !loading && (
                                    <p className="text-sm text-muted-foreground">No employees found.</p>
                                )}

                                {branches.map((branch) => {
                                    const branchEmployees = employees.filter((employee) => employee.branch?.id === branch.id);
                                    if (branchEmployees.length === 0) {
                                        return null;
                                    }

                                    return (
                                        <div key={branch.id}>
                                            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                                <Building2 className="h-3.5 w-3.5" />
                                                {branch.name}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {branchEmployees.map((employee) => (
                                                    <EmployeeStatusPill
                                                        key={employee.id}
                                                        employee={employee}
                                                        status={getStatus(employee, date)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}

                                {unbranchedEmployees.length > 0 && (
                                    <div>
                                        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                            <Building2 className="h-3.5 w-3.5" />
                                            No Branch
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {unbranchedEmployees.map((employee) => (
                                                <EmployeeStatusPill
                                                    key={employee.id}
                                                    employee={employee}
                                                    status={getStatus(employee, date)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
