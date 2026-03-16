"use client";

import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isBefore } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { CalendarDays, ChevronLeft, ChevronRight, Users, Search, Phone, Mail, UserCheck, UserX } from "lucide-react";
import { getAvailabilityData } from "@/actions/availability.actions";

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

function toDayKey(date: Date) {
    return format(date, "yyyy-MM-dd");
}

function getEmployeeName(employee: Employee) {
    if (employee.firstName && employee.lastName) {
        return `${employee.firstName} ${employee.lastName}`;
    }
    return employee.email;
}

interface EmployeeCardProps {
    employee: Employee;
    reason?: string;
    isHighlighted: boolean;
    onHighlight: (id: string | null) => void;
}

function EmployeeCard({ employee, reason, isHighlighted, onHighlight }: EmployeeCardProps) {
    const hasContactInfo = employee.phoneNumber || employee.personalEmail;
    
    return (
        <TooltipProvider>
            <div 
                className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                    isHighlighted ? 'bg-blue-50 border-blue-300 shadow-md' : 'hover:bg-gray-50'
                }`}
                onMouseEnter={() => onHighlight(employee.id)}
                onMouseLeave={() => onHighlight(null)}
            >
                <div className="flex-1">
                    <div className="font-medium">{getEmployeeName(employee)}</div>
                    <div className="text-xs text-muted-foreground">{employee.branch?.name || "No Branch"}</div>
                </div>
                <div className="flex items-center gap-2">
                    {hasContactInfo && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" className="h-7 w-7 p-0">
                                    <Users className="h-3 w-3" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                                <div className="space-y-2">
                                    <div className="font-medium">{getEmployeeName(employee)}</div>
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
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    )}
                    {reason && <Badge variant="secondary">{reason}</Badge>}
                </div>
            </div>
        </TooltipProvider>
    );
}

export default function AvailabilityCalendar() {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
    const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedBranch, setSelectedBranch] = useState("all");
    const [selectedEmployee, setSelectedEmployee] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [highlightedEmployee, setHighlightedEmployee] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const result = await getAvailabilityData(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
                setEmployees(result.employees || []);
                setLeaves(result.leaves || []);
                setHolidays(result.holidays || []);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [currentMonth]);

    const availableBranches = useMemo(() => {
        const map = new Map<string, { id: string; name: string }>();
        employees.forEach((employee) => {
            if (employee.branch?.id && employee.branch?.name) {
                map.set(employee.branch.id, { id: employee.branch.id, name: employee.branch.name });
            }
        });
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [employees]);

    const filteredEmployees = useMemo(() => {
        return employees.filter((employee) => {
            if (selectedBranch !== "all" && employee.branch?.id !== selectedBranch) {
                return false;
            }
            if (selectedEmployee !== "all" && employee.id !== selectedEmployee) {
                return false;
            }
            return true;
        });
    }, [employees, selectedBranch, selectedEmployee]);

    const filteredLeaves = useMemo(() => {
        if (selectedBranch === "all" && selectedEmployee === "all") {
            return leaves;
        }
        const allowedIds = new Set(filteredEmployees.map((employee) => employee.id));
        return leaves.filter((leave) => allowedIds.has(leave.userId));
    }, [leaves, filteredEmployees, selectedBranch, selectedEmployee]);

    const leaveByDate = useMemo(() => {
        const map = new Map<string, LeaveEntry[]>();
        filteredLeaves.forEach((leave) => {
            const key = leave.date.slice(0, 10);
            const existing = map.get(key) || [];
            existing.push(leave);
            map.set(key, existing);
        });
        return map;
    }, [filteredLeaves]);

    const activeBranchIds = useMemo(() => {
        if (selectedEmployee !== "all") {
            const selected = employees.find((employee) => employee.id === selectedEmployee);
            return selected?.branch?.id ? [selected.branch.id] : [];
        }

        if (selectedBranch !== "all") {
            return [selectedBranch];
        }

        return Array.from(new Set(filteredEmployees.map((employee) => employee.branch?.id).filter(Boolean) as string[]));
    }, [selectedEmployee, selectedBranch, employees, filteredEmployees]);

    const filteredHolidays = useMemo(() => {
        if (activeBranchIds.length === 0) {
            return holidays.filter((holiday) => holiday.appliesToAllBranches);
        }

        return holidays.filter((holiday) =>
            holiday.appliesToAllBranches ||
            holiday.applicableBranchIds.some((branchId) => activeBranchIds.includes(branchId))
        );
    }, [holidays, activeBranchIds]);

    const holidayByDate = useMemo(() => {
        const map = new Map<string, HolidayEntry[]>();
        filteredHolidays.forEach((holiday) => {
            const key = holiday.date.slice(0, 10);
            const existing = map.get(key) || [];
            existing.push(holiday);
            map.set(key, existing);
        });
        return map;
    }, [filteredHolidays]);

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

    const selectedHolidays = useMemo(() => {
        return holidayByDate.get(selectedKey) || [];
    }, [holidayByDate, selectedKey]);

    const weeklyOffUsers = useMemo(() => {
        return filteredEmployees.filter((employee) =>
            employee.branch?.weeklyOffDays?.includes(selectedDayName)
        );
    }, [filteredEmployees, selectedDayName]);

    const offUsers = useMemo(() => {
        const result = new Map<string, { employee: Employee; reason: string }>();

        selectedHolidays.forEach((holiday) => {
            filteredEmployees.forEach((employee) => {
                if (!employee.branch?.id) {
                    return;
                }

                const isApplicable = holiday.appliesToAllBranches || holiday.applicableBranchIds.includes(employee.branch.id);
                if (isApplicable && !result.has(employee.id)) {
                    result.set(employee.id, {
                        employee,
                        reason: `Holiday (${holiday.name})`
                    });
                }
            });
        });

        selectedLeaves.forEach((leave) => {
            const employee = filteredEmployees.find((emp) => emp.id === leave.userId);
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
    }, [filteredEmployees, selectedLeaves, weeklyOffUsers, selectedHolidays]);

    const availableEmployees = useMemo(() => {
        const offUserIds = new Set(offUsers.map(item => item.employee.id));
        return filteredEmployees.filter(employee => !offUserIds.has(employee.id));
    }, [filteredEmployees, offUsers]);

    const searchResults = useMemo(() => {
        if (!searchTerm.trim()) {
            return { availableEmployees, offUsers };
        }
        
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = (employee: Employee) => {
            const name = getEmployeeName(employee).toLowerCase();
            const email = employee.email.toLowerCase();
            const personalEmail = employee.personalEmail?.toLowerCase() || '';
            return name.includes(searchLower) || 
                   email.includes(searchLower) || 
                   personalEmail.includes(searchLower);
        };

        return {
            availableEmployees: availableEmployees.filter(matchesSearch),
            offUsers: offUsers.filter(item => matchesSearch(item.employee))
        };
    }, [availableEmployees, offUsers, searchTerm]);

    const handleSearch = (value: string) => {
        setSearchTerm(value);
        setHighlightedEmployee(null);
    };

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
                    <p className="text-muted-foreground">Upcoming leaves, holidays and weekly off days for all employees</p>
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
                        <div className="mb-4 grid gap-3 md:grid-cols-2">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Branch</label>
                                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="All branches" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All branches</SelectItem>
                                        {availableBranches.map((branch) => (
                                            <SelectItem key={branch.id} value={branch.id}>
                                                {branch.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground">Employee</label>
                                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="All employees" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All employees</SelectItem>
                                        {filteredEmployees.map((employee) => (
                                            <SelectItem key={employee.id} value={employee.id}>
                                                {getEmployeeName(employee)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
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
                                const holidayCount = holidayByDate.get(key)?.length || 0;
                                const weeklyOffCount = filteredEmployees.filter((employee) =>
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
                                            <div>Holiday: <span className="font-medium text-foreground">{holidayCount}</span></div>
                                            <div>Weekly off: <span className="font-medium text-foreground">{weeklyOffCount}</span></div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary">Leave count (approved, upcoming)</Badge>
                            <Badge variant="secondary">Holiday count</Badge>
                            <Badge variant="secondary">Weekly off count</Badge>
                            <Badge variant="outline">Past</Badge>
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
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search by name or email..."
                                value={searchTerm}
                                onChange={(e) => handleSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {/* Available Employees Section */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <UserCheck className="h-4 w-4 text-green-600" />
                                    <h3 className="font-medium text-green-700">
                                        Available ({searchResults.availableEmployees.length})
                                    </h3>
                                </div>
                                <Card className="bg-green-50 border-green-200">
                                    <CardContent className="p-4">
                                        {searchResults.availableEmployees.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-4">
                                                {searchTerm ? "No available employees match your search." : "No available employees."}
                                            </p>
                                        ) : (
                                            <div className="space-y-3">
                                                {searchResults.availableEmployees.map((employee) => (
                                                    <EmployeeCard
                                                        key={employee.id}
                                                        employee={employee}
                                                        isHighlighted={highlightedEmployee === employee.id}
                                                        onHighlight={setHighlightedEmployee}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Not Available Employees Section */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <UserX className="h-4 w-4 text-red-600" />
                                    <h3 className="font-medium text-red-700">
                                        Not Available ({searchResults.offUsers.length})
                                    </h3>
                                </div>
                                <Card className="bg-red-50 border-red-200">
                                    <CardContent className="p-4">
                                        {searchResults.offUsers.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-4">
                                                {searchTerm ? "No unavailable employees match your search." : "No unavailable employees."}
                                            </p>
                                        ) : (
                                            <div className="space-y-3">
                                                {searchResults.offUsers.map(({ employee, reason }) => (
                                                    <EmployeeCard
                                                        key={employee.id}
                                                        employee={employee}
                                                        reason={reason}
                                                        isHighlighted={highlightedEmployee === employee.id}
                                                        onHighlight={setHighlightedEmployee}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Search Summary */}
                            {searchTerm && (
                                <div className="text-xs text-muted-foreground text-center pt-2 border-t">
                                    Showing {searchResults.availableEmployees.length + searchResults.offUsers.length} result(s) for &quot;{searchTerm}&quot;
                                </div>
                            )}
                        </div>
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
