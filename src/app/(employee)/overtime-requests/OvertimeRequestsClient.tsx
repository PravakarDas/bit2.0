"use client";

import { useState } from "react";
import { OvertimeRequestForm } from "@/components/employee/OvertimeRequestForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Clock, Calendar, CheckCircle2, XCircle, Loader2, Trash2 } from "lucide-react";
import { cancelOvertimeRequest } from "@/actions/overtime-request.actions";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OvertimeRequest {
  id: string;
  overtimeDate: Date;
  totalOvertime: string;
  requestedOTstart?: Date | null;
  requestedOTend?: Date | null;
  reason: string;
  taskNo: string | null;
  status: "PENDING" | "MANAGER_VERIFIED" | "MANAGER_REJECTED" | "APPROVED" | "DECLINED";
  reviewedBy: string | null;
  reviewedAt: Date | null;
  declineReason: string | null;
  managerVerifiedAt?: Date | null;
  managerVerifiedBy?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  managerRejectionReason?: string | null;
  managerComments?: string | null;
  adminDeclinedReason?: string | null;
  requestedAt: Date;
}

interface OvertimeRequestsClientProps {
  initialRequests: OvertimeRequest[];
}

export function OvertimeRequestsClient({ initialRequests }: OvertimeRequestsClientProps) {
  const [requests, setRequests] = useState<OvertimeRequest[]>(initialRequests);
  const [requestToCancel, setRequestToCancel] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const handleSuccess = () => {
    // Refresh the page or refetch requests
    window.location.reload();
  };

  const handleCancelRequest = async (requestId: string) => {
    setIsCancelling(true);
    try {
      const result = await cancelOvertimeRequest(requestId);
      if (result.success) {
        toast.success("Request cancelled successfully");
        setRequests(requests.filter((r) => r.id !== requestId));
      } else {
        toast.error(result.error || "Failed to cancel request");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsCancelling(false);
      setRequestToCancel(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
      case "APPROVED":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Approved
          </Badge>
        );
      case "MANAGER_VERIFIED":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Manager Verified
          </Badge>
        );
      case "MANAGER_REJECTED":
        return (
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
            <XCircle className="mr-1 h-3 w-3" />
            Manager Rejected
          </Badge>
        );
      case "DECLINED":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
            <XCircle className="mr-1 h-3 w-3" />
            Declined
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-1">
        <OvertimeRequestForm onSuccess={handleSuccess} />
      </div>

      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>Request History</CardTitle>
            <CardDescription>
              View the status of your previous overtime requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No overtime requests yet</p>
                <p className="text-sm">Submit your first request using the form</p>
              </div>
            ) : (
              <div className="space-y-4">
                {requests.map((request) => (
                  <Card key={request.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {format(new Date(request.overtimeDate), "PPP")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>{request.totalOvertime} hours</span>
                          </div>
                          {request.requestedOTstart && request.requestedOTend && (
                            <div className="text-sm text-muted-foreground">
                              Requested Time: {format(new Date(request.requestedOTstart), "p")} - {format(new Date(request.requestedOTend), "p")}
                            </div>
                          )}
                        </div>
                        {getStatusBadge(request.status)}
                      </div>

                      {request.taskNo && (
                        <div className="mb-2 text-sm">
                          <span className="font-medium">Task: </span>
                          <span className="text-muted-foreground">{request.taskNo}</span>
                        </div>
                      )}

                      <div className="mb-3 text-sm">
                        <span className="font-medium">Reason: </span>
                        <span className="text-muted-foreground">{request.reason}</span>
                      </div>

                      {request.managerVerifiedBy && (
                        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                          <span className="font-medium text-blue-700">Checked by Manager: </span>
                          <span className="text-blue-700">
                            {request.managerVerifiedBy.firstName} {request.managerVerifiedBy.lastName}
                          </span>
                          {request.managerComments && (
                            <div className="mt-1 text-blue-600">Notes: {request.managerComments}</div>
                          )}
                        </div>
                      )}

                      {request.status === "MANAGER_REJECTED" && request.managerRejectionReason && (
                        <div className="mb-3 p-2 bg-orange-50 border border-orange-200 rounded text-sm">
                          <span className="font-medium text-orange-700">Manager Rejection Reason: </span>
                          <span className="text-orange-600">{request.managerRejectionReason}</span>
                        </div>
                      )}

                      {request.status === "DECLINED" && (request.adminDeclinedReason || request.declineReason) && (
                        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm">
                          <span className="font-medium text-red-700">Decline Reason: </span>
                          <span className="text-red-600">{request.adminDeclinedReason || request.declineReason}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t">
                        <span className="text-xs text-muted-foreground">
                          Requested {format(new Date(request.requestedAt), "PPp")}
                        </span>
                        {request.status === "PENDING" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRequestToCancel(request.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!requestToCancel} onOpenChange={(open) => !open && setRequestToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Overtime Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this request? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>No, keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => requestToCancel && handleCancelRequest(requestToCancel)}
              disabled={isCancelling}
              className="bg-red-600 hover:bg-red-700"
            >
              {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
