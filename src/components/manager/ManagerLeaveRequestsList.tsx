"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow 
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, X, Clock, User, Calendar, FileText } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface User {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    imageUrl: string | null;
    attendanceId: string | null;
    branch: {
        name: string;
    } | null;
}

interface LeaveType {
    name: string;
    allocatedDays: number;
}

interface LeaveRequest {
    id: string;
    reason: string;
    startDate: Date;
    endDate: Date;
    totalDays: number;
    status: "PENDING" | "APPROVED" | "REJECTED";
    approvedBy: string | null;
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    user: User;
    leaveType: LeaveType;
}

interface ManagerLeaveRequestsListProps {
    initialRequests: LeaveRequest[];
    showAll?: boolean;
}

export function ManagerLeaveRequestsList({ 
    initialRequests, 
    showAll = false 
}: ManagerLeaveRequestsListProps) {
    const [requests, setRequests] = useState<LeaveRequest[]>(initialRequests);
    const [isLoading, setIsLoading] = useState(false);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "PENDING":
                return <Badge variant="default" className="bg-yellow-100 text-yellow-800">Pending</Badge>;
            case "APPROVED":
                return <Badge variant="default" className="bg-green-100 text-green-800">Approved</Badge>;
            case "REJECTED":
                return <Badge variant="destructive">Rejected</Badge>;
            default:
                return <Badge variant="secondary">{status}</Badge>;
        }
    };

    const handleApprove = async (requestId: string) => {
        setIsLoading(true);
        try {
            // TODO: Call approval action
            toast.success("Leave request approved successfully");
            // Update local state
            setRequests(prev => 
                prev.map(req => 
                    req.id === requestId 
                        ? { ...req, status: "APPROVED" as const }
                        : req
                )
            );
        } catch (error) {
            toast.error("Failed to approve leave request");
        } finally {
            setIsLoading(false);
        }
    };

    const handleReject = async (requestId: string) => {
        setIsLoading(true);
        try {
            // TODO: Call rejection action  
            toast.success("Leave request rejected");
            // Update local state
            setRequests(prev => 
                prev.map(req => 
                    req.id === requestId 
                        ? { ...req, status: "REJECTED" as const }
                        : req
                )
            );
        } catch (error) {
            toast.error("Failed to reject leave request");
        } finally {
            setIsLoading(false);
        }
    };

    const displayRequests = showAll ? requests : requests.filter(req => req.status === "PENDING");

    if (displayRequests.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>{showAll ? "No leave requests found" : "No pending leave requests"}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {!showAll && displayRequests.length <= 3 ? (
                // Card view for small number of pending requests
                <div className="space-y-3">
                    {displayRequests.map((request) => (
                        <Card key={request.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={request.user.imageUrl || ""} />
                                            <AvatarFallback>
                                                {request.user.firstName[0]}{request.user.lastName[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <h4 className="font-medium text-gray-900">
                                                {request.user.firstName} {request.user.lastName}
                                            </h4>
                                            <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    {format(new Date(request.startDate), "MMM d")} - {format(new Date(request.endDate), "MMM d")}
                                                </span>
                                                <span className="text-blue-600 font-medium">
                                                    {request.totalDays} day{request.totalDays !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                                {request.reason}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {request.status === "PENDING" && (
                                            <>
                                                <Button 
                                                    size="sm" 
                                                    variant="outline"
                                                    onClick={() => handleApprove(request.id)}
                                                    disabled={isLoading}
                                                    className="text-green-600 border-green-200 hover:bg-green-50"
                                                >
                                                    <Check className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="outline"
                                                    onClick={() => handleReject(request.id)}
                                                    disabled={isLoading}
                                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            </>
                                        )}
                                        {request.status !== "PENDING" && getStatusBadge(request.status)}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                // Table view for larger lists or all requests
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Leave Type</TableHead>
                            <TableHead>Dates</TableHead>
                            <TableHead>Days</TableHead>
                            <TableHead>Status</TableHead>
                            {!showAll && <TableHead>Actions</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {displayRequests.map((request) => (
                            <TableRow key={request.id}>
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={request.user.imageUrl || ""} />
                                            <AvatarFallback className="text-xs">
                                                {request.user.firstName[0]}{request.user.lastName[0]}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-medium text-sm">
                                                {request.user.firstName} {request.user.lastName}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {request.user.branch?.name || 'No Branch'}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className="text-sm">{request.leaveType.name}</span>
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm">
                                        <span>{format(new Date(request.startDate), "MMM d")}</span>
                                        <span className="text-gray-400 mx-1">to</span>
                                        <span>{format(new Date(request.endDate), "MMM d")}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className="text-sm font-medium">{request.totalDays}</span>
                                </TableCell>
                                <TableCell>
                                    {getStatusBadge(request.status)}
                                </TableCell>
                                {!showAll && (
                                    <TableCell>
                                        {request.status === "PENDING" && (
                                            <div className="flex gap-2">
                                                <Button 
                                                    size="sm" 
                                                    variant="outline"
                                                    onClick={() => handleApprove(request.id)}
                                                    disabled={isLoading}
                                                    className="text-green-600 border-green-200 hover:bg-green-50"
                                                >
                                                    <Check className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="outline"
                                                    onClick={() => handleReject(request.id)}
                                                    disabled={isLoading}
                                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        )}
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    );
}