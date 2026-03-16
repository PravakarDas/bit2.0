"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock } from "lucide-react";
import { format, isToday, isTomorrow, isThisWeek } from "date-fns";

interface PublicHoliday {
    id: string;
    name: string;
    date: Date;
    description: string | null;
    isRecurring: boolean;
    isActive: boolean;
}

interface ManagerHolidaysListProps {
    initialHolidays: PublicHoliday[];
}

export function ManagerHolidaysList({ initialHolidays }: ManagerHolidaysListProps) {
    const [holidays] = useState<PublicHoliday[]>(initialHolidays);

    const getHolidayBadgeVariant = (date: Date) => {
        if (isToday(date)) return "destructive";
        if (isTomorrow(date)) return "default";
        if (isThisWeek(date)) return "secondary";
        return "outline";
    };

    const getHolidayTimeLabel = (date: Date) => {
        if (isToday(date)) return "Today";
        if (isTomorrow(date)) return "Tomorrow";
        if (isThisWeek(date)) return "This Week";
        return format(date, "MMM d, yyyy");
    };

    return (
        <div className="space-y-3">
            {holidays.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No upcoming holidays</p>
                </div>
            ) : (
                holidays.map((holiday) => {
                    const holidayDate = new Date(holiday.date);
                    return (
                        <Card key={holiday.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-medium text-gray-900">
                                                {holiday.name}
                                            </h4>
                                            {holiday.isRecurring && (
                                                <Badge variant="outline" className="text-xs">
                                                    Annual
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Calendar className="h-3.5 w-3.5" />
                                            <span>{format(holidayDate, "EEEE, MMMM d, yyyy")}</span>
                                        </div>
                                        {holiday.description && (
                                            <p className="text-sm text-gray-500 mt-1">
                                                {holiday.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <Badge variant={getHolidayBadgeVariant(holidayDate)}>
                                            {getHolidayTimeLabel(holidayDate)}
                                        </Badge>
                                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                                            <Clock className="h-3 w-3" />
                                            <span>{format(holidayDate, "dd/MM")}</span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })
            )}
        </div>
    );
}