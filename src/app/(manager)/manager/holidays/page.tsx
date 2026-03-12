import { getManagerHolidaysAndLeaveRequests } from "@/actions/manager.actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ManagerHolidaysList } from "@/components/manager/ManagerHolidaysList";
import { ManagerLeaveRequestsList } from "@/components/manager/ManagerLeaveRequestsList";
import { CalendarDays, Clock, Users } from "lucide-react";

export default async function ManagerHolidaysPage() {
    const { holidays, leaveRequests } = await getManagerHolidaysAndLeaveRequests();

    const pendingLeaveRequests = leaveRequests.filter(req => req.status === 'PENDING');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Holidays & Leave Management</h1>
                    <p className="text-gray-600 mt-1">
                        Manage company holidays and review employee leave requests
                    </p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Pending Leave Requests */}
                <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 shadow-sm">
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-amber-700">
                            <Clock className="h-5 w-5" />
                            Pending Leave Requests
                        </CardTitle>
                        <CardDescription className="text-amber-600">
                            {pendingLeaveRequests.length === 0 
                                ? "No pending leave requests" 
                                : `${pendingLeaveRequests.length} leave request${pendingLeaveRequests.length === 1 ? '' : 's'} awaiting your approval`
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ManagerLeaveRequestsList 
                            initialRequests={pendingLeaveRequests}
                        />
                    </CardContent>
                </Card>

                {/* Upcoming Holidays */}
                <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-sm">
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-green-700">
                            <CalendarDays className="h-5 w-5" />
                            Company Holidays
                        </CardTitle>
                        <CardDescription className="text-green-600">
                            Upcoming and current company holidays
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ManagerHolidaysList 
                            initialHolidays={holidays}
                        />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        All Leave Requests
                    </CardTitle>
                    <CardDescription>
                        Complete history of leave requests (approved, rejected, pending)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ManagerLeaveRequestsList
                        initialRequests={leaveRequests}
                        showAll={true}
                    />
                </CardContent>
            </Card>
        </div>
    );
}