"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { formatTime12 } from "@/lib/utils";
import {
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  Filter,
} from "lucide-react";
import {
  approveTimelineModificationRequest,
  rejectTimelineModificationRequest,
} from "@/actions/timeline-modification-request.actions";
import { toast } from "sonner";

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
  createdAt: Date;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    attendanceId: string | null;
    branch: { name: string } | null;
    department: { name: string } | null;
    designation: { name: string } | null;
  };
  reviewedBy?: {
    firstName: string | null;
    lastName: string | null;
    role: string;
  } | null;
}

interface TimelineModificationReviewClientProps {
  initialRequests: TimelineModificationRequest[];
}

export function TimelineModificationReviewClient({ initialRequests }: TimelineModificationReviewClientProps) {
  const [requests, setRequests] = useState<TimelineModificationRequest[]>(initialRequests);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<TimelineModificationRequest | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [reviewNote, setReviewNote] = useState("");

  const filteredRequests = useMemo(() => {
    if (statusFilter === "all") return requests;
    return requests.filter((request) => request.status === statusFilter.toUpperCase());
  }, [requests, statusFilter]);

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;
  const rejectedCount = requests.filter((r) => r.status === "REJECTED").length;

  const handleApprove = async () => {
    if (!selectedRequest) return;

    setIsApproving(true);
    try {
      const result = await approveTimelineModificationRequest(selectedRequest.id, reviewNote);
      if (result.success) {
        toast.success("Request approved and timeline updated");
        setRequests((prev) =>
          prev.map((request) =>
            request.id === selectedRequest.id
              ? {
                  ...request,
                  status: "APPROVED",
                  reviewerNote: reviewNote || null,
                  reviewedAt: new Date(),
                }
              : request
          )
        );
        setSelectedRequest(null);
        setReviewNote("");
      } else {
        toast.error(result.error || "Failed to approve request");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    if (!reviewNote.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }

    setIsRejecting(true);
    try {
      const result = await rejectTimelineModificationRequest(selectedRequest.id, reviewNote);
      if (result.success) {
        toast.success("Request rejected");
        setRequests((prev) =>
          prev.map((request) =>
            request.id === selectedRequest.id
              ? {
                  ...request,
                  status: "REJECTED",
                  reviewerNote: reviewNote,
                  reviewedAt: new Date(),
                }
              : request
          )
        );
        setSelectedRequest(null);
        setReviewNote("");
      } else {
        toast.error(result.error || "Failed to reject request");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsRejecting(false);
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
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold">{approvedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold">{rejectedCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Timeline Modification Requests</CardTitle>
              <CardDescription>
                Review and process employee check-in/check-out/break-time correction requests
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-45">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Requests</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No timeline modification requests found</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Requested Changes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested At</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {request.user.firstName} {request.user.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {request.user.attendanceId || request.user.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{format(new Date(request.requestedDate), "PPP")}</TableCell>
                      <TableCell className="text-sm">
                        <div>In: {formatTime12(request.requestedCheckIn)}</div>
                        <div>Out: {formatTime12(request.requestedCheckOut)}</div>
                        <div>Break: {request.requestedBreakTime || "-"}</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(request.createdAt), "PPp")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedRequest(request)}>
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Timeline Modification Request Details</DialogTitle>
            <DialogDescription>Review details and approve or reject this request</DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Employee</Label>
                  <p className="font-medium">{selectedRequest.user.firstName} {selectedRequest.user.lastName}</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.user.email}</p>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">Department</Label>
                  <p className="font-medium">{selectedRequest.user.department?.name || "N/A"}</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.user.designation?.name || "N/A"}</p>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">Request Date</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{format(new Date(selectedRequest.requestedDate), "PPP")}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                </div>
              </div>

              <div className="rounded-lg border p-3 text-sm">
                <p><span className="font-medium">Requested Check-In:</span> {formatTime12(selectedRequest.requestedCheckIn)}</p>
                <p><span className="font-medium">Requested Check-Out:</span> {formatTime12(selectedRequest.requestedCheckOut)}</p>
                <p><span className="font-medium">Requested Break:</span> {selectedRequest.requestedBreakTime || "-"}</p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">Reason</Label>
                <p className="mt-1 text-sm">{selectedRequest.reason || "-"}</p>
              </div>

              {selectedRequest.status === "PENDING" ? (
                <div>
                  <Label htmlFor="reviewNote">Review Note</Label>
                  <Textarea
                    id="reviewNote"
                    placeholder="Write optional note for approve, or required reason for reject"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    className="mt-2"
                  />
                </div>
              ) : (
                selectedRequest.reviewerNote && (
                  <div className="rounded-lg border p-3 text-sm">
                    <span className="font-medium">Reviewer Note:</span> {selectedRequest.reviewerNote}
                  </div>
                )
              )}

              <DialogFooter>
                {selectedRequest.status === "PENDING" ? (
                  <>
                    <Button variant="destructive" onClick={handleReject} disabled={isRejecting || isApproving}>
                      {isRejecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Reject
                    </Button>
                    <Button onClick={handleApprove} disabled={isApproving || isRejecting}>
                      {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Approve & Apply
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => setSelectedRequest(null)}>
                    Close
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
