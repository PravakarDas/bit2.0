"use client";

import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isBefore } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { getAvailabilityData } from "@/actions/availability.actions";

interface Employee {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    branch: {
        name: string;
        weeklyOffDays: string[];
    } | null;
}

interface LeaveEntry {
    userId: string;
    date: string;
    leaveTypeName: string;
}

function toDayKey(date: Date) {
    return format(date, "yyyy-MM-dd");
}

function getEmployeeName(employee: Employee) {
    if (employee.firstName && employee.lastName) {
        return `${employee.firstName} ${employee.lastName}`;
    }
    return employee.email;
}

export default function AvailabilityCalendar() {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const result = await getAvailabilityData(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
                setEmployees(result.employees || []);
                setLeaves(result.leaves || []);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [currentMonth]);

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

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
        days.push(day);
        day = addDays(day, 1);
    }

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();

    const selectedKey = toDayKey(selectedDate);
    const selectedDayName = format(selectedDate, "EEEE").toUpperCase();

    const selectedLeaves = useMemo(() => {
        return leaveByDate.get(selectedKey) || [];
    }, [leaveByDate, selectedKey]);

    const weeklyOffUsers = useMemo(() => {
        return employees.filter((employee) =>
            employee.branch?.weeklyOffDays?.includes(selectedDayName)
        );
    }, [employees, selectedDayName]);

    const offUsers = useMemo(() => {
        const result = new Map<string, { employee: Employee; reason: string }>();
        selectedLeaves.forEach((leave) => {
            const employee = employees.find((emp) => emp.id === leave.userId);
            if (employee) {
                result.set(employee.id, {
                    employee,
                    reason: `Leave (${leave.leaveTypeName})`
                });
            }
        });

        weeklyOffUsers.forEach((employee) => {
            if (!result.has(employee.id)) {
                result.set(employee.id, {
                    employee,
                    reason: "Weekly Off"
                });
            }
        });

        return Array.from(result.values());
    }, [employees, selectedLeaves, weeklyOffUsers]);

    const goPrevMonth = () => {
        setCurrentMonth((prev) => addDays(startOfMonth(prev), -1));
    };

    const goNextMonth = () => {
        setCurrentMonth((prev) => addDays(endOfMonth(prev), 1));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Team Availability Calendar</h1>
                    <p className="text-muted-foreground">Upcoming leaves and weekly off days for all employees</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={goPrevMonth}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={goNextMonth}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarDays className="h-5 w-5" />
                            {format(currentMonth, "MMMM yyyy")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-7 gap-2 text-sm font-medium text-muted-foreground">
                            {dayNames.map((name) => (
                                <div key={name} className="text-center">
                                    {name}
                                </div>
                            ))}
                        </div>
                        <div className="mt-2 grid grid-cols-7 gap-2">
                            {days.map((date) => {
                                const key = toDayKey(date);
                                const dayName = format(date, "EEEE").toUpperCase();
                                const isInMonth = isSameMonth(date, monthStart);
                                const isSelected = isSameDay(date, selectedDate);
                                const isPast = isBefore(date, startOfDay(today));

                                const leaveCount = leaveByDate.get(key)?.length || 0;
                                const weeklyOffCount = employees.filter((employee) =>
                                    employee.branch?.weeklyOffDays?.includes(dayName)
                                ).length;

                                return (
                                    <button
                                        type="button"
                                        key={key}
                                        onClick={() => setSelectedDate(date)}
                                        className={
                                            "rounded-lg border p-2 text-left transition " +
                                            (isSelected ? "border-primary bg-primary/10" : "border-border hover:border-primary/60") +
                                            (!isInMonth ? " opacity-50" : "")
                                        }
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold">{format(date, "d")}</span>
                                            {isPast && <Badge variant="outline">Past</Badge>}
                                        </div>
                                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                            <div>Leave: <span className="font-medium text-foreground">{leaveCount}</span></div>
                                            <div>Weekly off: <span className="font-medium text-foreground">{weeklyOffCount}</span></div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {loading && (
                            <div className="mt-4 text-sm text-muted-foreground">Loading availability...</div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            {format(selectedDate, "MMMM d, yyyy")}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {offUsers.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No employees off on this day.</p>
                        ) : (
                            <div className="space-y-3">
                                {offUsers.map(({ employee, reason }) => (
                                    <div key={employee.id} className="flex items-center justify-between rounded-lg border p-3">
                                        <div>
                                            <div className="font-medium">{getEmployeeName(employee)}</div>
                                            <div className="text-xs text-muted-foreground">{employee.branch?.name || "No Branch"}</div>
                                        </div>
                                        <Badge variant="secondary">{reason}</Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function startOfDay(date: Date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
}
