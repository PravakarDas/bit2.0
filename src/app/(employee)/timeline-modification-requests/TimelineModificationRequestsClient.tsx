"use client";

import { useState } from "react";
import { TimelineModificationRequestForm } from "@/components/employee/TimelineModificationRequestForm";
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
import { formatTime12 } from "@/lib/utils";
import { CheckCircle2, Clock, Loader2, XCircle, Trash2 } from "lucide-react";
import { cancelTimelineModificationRequest } from "@/actions/timeline-modification-request.actions";
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

interface TimelineModificationRequest {
  id: string;
  requestedDate: Date;
  requestedCheckIn: Date | null;
  requestedCheckOut: Date | null;
  requestedBreakTime: string | null;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewerNote: string | null;
  reviewedAt: Date | null;
  reviewedBy?: {
    firstName: string | null;
    lastName: string | null;
    role: string;
  } | null;
  createdAt: Date;
}

interface TimelineModificationRequestsClientProps {
  initialRequests: TimelineModificationRequest[];
}

export function TimelineModificationRequestsClient({ initialRequests }: TimelineModificationRequestsClientProps) {
  const [requests, setRequests] = useState<TimelineModificationRequest[]>(initialRequests);
  const [requestToCancel, setRequestToCancel] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const handleSuccess = () => {
    window.location.reload();
  };

  const handleCancelRequest = async (requestId: string) => {
    setIsCancelling(true);
    try {
      const result = await cancelTimelineModificationRequest(requestId);
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
      case "REJECTED":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
            <XCircle className="mr-1 h-3 w-3" />
            Rejected
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-1">
        <TimelineModificationRequestForm onSuccess={handleSuccess} />
      </div>

      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>Request History</CardTitle>
            <CardDescription>
              View the status of your timeline modification requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No timeline modification requests yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {requests.map((request) => (
                  <Card key={request.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{format(new Date(request.requestedDate), "PPP")}</p>
                          <p className="text-sm text-muted-foreground">
                            Requested {format(new Date(request.createdAt), "PPp")}
                          </p>
                        </div>
                        {getStatusBadge(request.status)}
                      </div>

                      <div className="text-sm space-y-1">
                        <p>
                          <span className="font-medium">Check-In:</span>{" "}
                          {formatTime12(request.requestedCheckIn)}
                        </p>
                        <p>
                          <span className="font-medium">Check-Out:</span>{" "}
                          {formatTime12(request.requestedCheckOut)}
                        </p>
                        <p>
                          <span className="font-medium">Break:</span> {request.requestedBreakTime || "-"}
                        </p>
                      </div>

                      <div className="text-sm">
                        <span className="font-medium">Reason:</span> {request.reason || "-"}
                      </div>

                      {request.reviewedBy && (
                        <div className="text-xs text-muted-foreground">
                          Reviewed by {request.reviewedBy.firstName} {request.reviewedBy.lastName}
                          {request.reviewedAt ? ` on ${format(new Date(request.reviewedAt), "PPp")}` : ""}
                        </div>
                      )}

                      {request.reviewerNote && (
                        <div className="p-2 rounded border bg-muted/40 text-sm">
                          <span className="font-medium">Reviewer note:</span> {request.reviewerNote}
                        </div>
                      )}

                      {request.status === "PENDING" && (
                        <div className="pt-2 border-t flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRequestToCancel(request.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      )}
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
            <AlertDialogTitle>Cancel Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this timeline modification request?
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
