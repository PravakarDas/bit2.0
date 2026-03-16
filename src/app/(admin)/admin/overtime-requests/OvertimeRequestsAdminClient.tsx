"use client";

import { useState } from "react";
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
import {
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Filter,
} from "lucide-react";
import {
  approveOvertimeRequest,
  declineOvertimeRequest,
} from "@/actions/overtime-request.actions";
import { toast } from "sonner";

interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  attendanceId: string | null;
  branch: { name: string } | null;
  department: { name: string } | null;
  designation: { name: string } | null;
}

interface OvertimeRequest {
  id: string;
  overtimeDate: Date;
  totalOvertime: string;
  reason: string;
  taskNo: string | null;
  status: "PENDING" | "MANAGER_VERIFIED" | "MANAGER_REJECTED" | "APPROVED" | "DECLINED";
  reviewedBy: string | null;
  reviewedAt: Date | null;
  declineReason: string | null;
  managerVerifiedAt?: Date | null;
  managerVerifiedById?: string | null;
  managerVerifiedBy?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  managerComments?: string | null;
  managerRejectionReason?: string | null;
  adminDeclinedReason?: string | null;
  requestedAt: Date;
  user: User;
}

interface OvertimeRequestsAdminClientProps {
  initialRequests: OvertimeRequest[];
}

export function OvertimeRequestsAdminClient({
  initialRequests,
}: OvertimeRequestsAdminClientProps) {
  const [requests, setRequests] = useState<OvertimeRequest[]>(initialRequests);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<OvertimeRequest | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const filteredRequests = requests.filter((request) => {
    if (statusFilter === "all") return true;
    return request.status === statusFilter.toUpperCase();
  });

  const handleApprove = async (requestId: string) => {
    setIsApproving(true);
    try {
      const result = await approveOvertimeRequest(requestId);
      if (result.success) {
        toast.success("Overtime request approved successfully");
        setRequests(
          requests.map((r) =>
            r.id === requestId
              ? { ...r, status: "APPROVED" as const, reviewedAt: new Date() }
              : r
          )
        );
        setSelectedRequest(null);
      } else {
        toast.error(result.error || "Failed to approve request");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsApproving(false);
    }
  };

  const handleDeclineSubmit = async () => {
    if (!selectedRequest || !declineReason.trim()) {
      toast.error("Please provide a reason for declining");
      return;
    }

    setIsDeclining(true);
    try {
      const result = await declineOvertimeRequest(selectedRequest.id, declineReason);
      if (result.success) {
        toast.success("Overtime request declined");
        setRequests(
          requests.map((r) =>
            r.id === selectedRequest.id
              ? {
                  ...r,
                  status: "DECLINED" as const,
                  reviewedAt: new Date(),
                  declineReason,
                }
              : r
          )
        );
        setSelectedRequest(null);
        setDeclineDialogOpen(false);
        setDeclineReason("");
      } else {
        toast.error(result.error || "Failed to decline request");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsDeclining(false);
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
      case "APPROVED":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Approved
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

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const managerVerifiedCount = requests.filter((r) => r.status === "MANAGER_VERIFIED").length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;
  const declinedCount = requests.filter((r) => r.status === "DECLINED").length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Pending Requests
                </p>
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
                <p className="text-sm font-medium text-muted-foreground">
                  Manager Verified
                </p>
                <p className="text-2xl font-bold">{managerVerifiedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Approved
                </p>
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
                <p className="text-sm font-medium text-muted-foreground">
                  Declined
                </p>
                <p className="text-2xl font-bold">{declinedCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Overtime Requests</CardTitle>
              <CardDescription>
                Review and manage employee overtime requests
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
                  <SelectItem value="manager_verified">Manager Verified</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No overtime requests found</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Task No</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
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
                      <TableCell>
                        {format(new Date(request.overtimeDate), "PPP")}
                      </TableCell>
                      <TableCell>{request.totalOvertime}</TableCell>
                      <TableCell>
                        {request.taskNo || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(request.requestedAt), "PP")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedRequest(request)}
                        >
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

      {/* Request Details Dialog */}
      <Dialog
        open={!!selectedRequest}
        onOpenChange={(open) => !open && setSelectedRequest(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Overtime Request Details</DialogTitle>
            <DialogDescription>
              Review the details and approve or decline the request
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Employee</Label>
                  <p className="font-medium">
                    {selectedRequest.user.firstName} {selectedRequest.user.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedRequest.user.email}
                  </p>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">Department</Label>
                  <p className="font-medium">
                    {selectedRequest.user.department?.name || "N/A"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedRequest.user.designation?.name || "N/A"}
                  </p>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">Overtime Date</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">
                      {format(new Date(selectedRequest.overtimeDate), "PPP")}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">Duration</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{selectedRequest.totalOvertime} hours</p>
                  </div>
                </div>

                {selectedRequest.taskNo && (
                  <div>
                    <Label className="text-sm text-muted-foreground">Task Reference</Label>
                    <p className="font-medium mt-1">{selectedRequest.taskNo}</p>
                  </div>
                )}

                <div>
                  <Label className="text-sm text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                </div>
              </div>

              {selectedRequest.managerVerifiedBy && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Verified By Manager</Label>
                    <p className="font-medium mt-1">
                      {selectedRequest.managerVerifiedBy.firstName} {selectedRequest.managerVerifiedBy.lastName}
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm text-muted-foreground">Manager Verified At</Label>
                    <p className="font-medium mt-1">
                      {selectedRequest.managerVerifiedAt ? format(new Date(selectedRequest.managerVerifiedAt), "PPpp") : "N/A"}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm text-muted-foreground">Reason for Overtime</Label>
                <p className="mt-1 p-3 bg-muted rounded-md">{selectedRequest.reason}</p>
              </div>

              {selectedRequest.managerComments && (
                <div>
                  <Label className="text-sm text-muted-foreground">Manager Notes</Label>
                  <p className="mt-1 p-3 bg-blue-50 border border-blue-200 rounded-md text-blue-700">
                    {selectedRequest.managerComments}
                  </p>
                </div>
              )}

              {selectedRequest.status === "MANAGER_REJECTED" && selectedRequest.managerRejectionReason && (
                <div>
                  <Label className="text-sm text-muted-foreground">Manager Rejection Reason</Label>
                  <p className="mt-1 p-3 bg-orange-50 border border-orange-200 rounded-md text-orange-700">
                    {selectedRequest.managerRejectionReason}
                  </p>
                </div>
              )}

              {selectedRequest.status === "DECLINED" && selectedRequest.declineReason && (
                <div>
                  <Label className="text-sm text-muted-foreground">Decline Reason</Label>
                  <p className="mt-1 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
                    {selectedRequest.declineReason}
                  </p>
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                Requested on {format(new Date(selectedRequest.requestedAt), "PPpp")}
              </div>
            </div>
          )}

          {selectedRequest && selectedRequest.status === "MANAGER_VERIFIED" && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeclineDialogOpen(true);
                }}
                disabled={isApproving || isDeclining}
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                Decline
              </Button>
              <Button
                onClick={() => handleApprove(selectedRequest.id)}
                disabled={isApproving || isDeclining}
                className="bg-green-600 hover:bg-green-700"
              >
                {isApproving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <ThumbsUp className="mr-2 h-4 w-4" />
                Approve
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Decline Reason Dialog */}
      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline Overtime Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for declining this overtime request
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="declineReason">Reason for Declining</Label>
              <Textarea
                id="declineReason"
                placeholder="Enter the reason for declining..."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="mt-2 min-h-25"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeclineDialogOpen(false);
                setDeclineReason("");
              }}
              disabled={isDeclining}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeclineSubmit}
              disabled={isDeclining || !declineReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeclining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Decline Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
