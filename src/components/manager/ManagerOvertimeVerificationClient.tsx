"use client";

import { useEffect, useState } from "react";
import { getPendingOvertimeForManager, verifyOvertimeRequest, rejectOvertimeRequest } from "@/actions/manager-verification.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

interface OvertimeRequest {
  id: string;
  overtimeDate: Date;
  totalOvertime: string;
  requestedOTstart?: Date | null;
  requestedOTend?: Date | null;
  reason: string;
  taskNo: string | null;
  status: string;
  createdAt: Date;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phoneNumber: string | null;
    department: { name: string } | null;
    designation: { name: string } | null;
    branch: { name: string } | null;
  };
}

export default function ManagerOvertimeVerificationClient() {
  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [showRejectionBox, setShowRejectionBox] = useState<Record<string, boolean>>({});
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  const branchOptions = Array.from(
    new Map(
      requests
        .map((request) => request.user.branch?.name)
        .filter((branch): branch is string => Boolean(branch))
        .map((branch) => [branch, branch])
    ).values()
  ).sort();

  const filteredRequests = requests.filter((request) => {
    const requestBranch = request.user.branch?.name || "";
    if (branchFilter !== "all" && requestBranch !== branchFilter) {
      return false;
    }

    const requestDate = format(new Date(request.overtimeDate), "yyyy-MM-dd");
    if (startDateFilter && requestDate < startDateFilter) {
      return false;
    }

    if (endDateFilter && requestDate > endDateFilter) {
      return false;
    }

    return true;
  });

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    try {
      setLoading(true);
      const data = await getPendingOvertimeForManager();
      setRequests(data as OvertimeRequest[]);
    } catch (error) {
      console.error("Failed to load overtime requests:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(requestId: string) {
    try {
      setActionLoading(requestId);
      await verifyOvertimeRequest(requestId, comments[requestId]);
      await loadRequests();
    } catch (error) {
      console.error("Failed to verify overtime:", error);
      alert("Failed to verify overtime request");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(requestId: string) {
    const reason = rejectionReasons[requestId];
    if (!reason || reason.trim() === "") {
      alert("Rejection reason is required");
      return;
    }

    try {
      setActionLoading(requestId);
      await rejectOvertimeRequest(requestId, reason);
      await loadRequests();
    } catch (error) {
      console.error("Failed to reject overtime:", error);
      alert("Failed to reject overtime request");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return <div className="p-6">Loading overtime requests...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Overtime Verifications</h1>
        <p className="text-muted-foreground mt-2">
          Verify or reject employee overtime requests before they go to admin.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label className="text-sm font-medium">Branch</label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
              >
                <option value="all">All Branches</option>
                {branchOptions.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                className="mt-1"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
              />
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                className="mt-1"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setBranchFilter("all");
                setStartDateFilter("");
                setEndDateFilter("");
              }}
            >
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {filteredRequests.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No pending overtime requests found.</p>
          </CardContent>
        </Card>
      ) : (
        filteredRequests.map((request) => (
          <Card key={request.id}>
            <CardHeader>
              <CardTitle>
                {request.user.firstName} {request.user.lastName} - {request.totalOvertime} hours
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>Employee:</strong> {request.user.firstName} {request.user.lastName}</p>
                  <p><strong>Email:</strong> {request.user.email}</p>
                  <p><strong>Department:</strong> {request.user.department?.name || "N/A"}</p>
                  <p><strong>Designation:</strong> {request.user.designation?.name || "N/A"}</p>
                </div>
                <div>
                  <p><strong>Date:</strong> {new Date(request.overtimeDate).toLocaleDateString()}</p>
                  <p>
                    <strong>Requested Time:</strong>{" "}
                    {request.requestedOTstart && request.requestedOTend
                      ? `${new Date(request.requestedOTstart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${new Date(request.requestedOTend).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "N/A"}
                  </p>
                  <p><strong>Duration:</strong> {request.totalOvertime}</p>
                  <p><strong>Task No:</strong> {request.taskNo || "N/A"}</p>
                </div>
              </div>

              <div>
                <p><strong>Reason:</strong></p>
                <p className="text-sm text-muted-foreground">{request.reason}</p>
              </div>

              <div>
                <label className="text-sm font-medium">Verification Notes (Optional)</label>
                <Textarea
                  value={comments[request.id] || ""}
                  onChange={(e) => setComments((prev) => ({ ...prev, [request.id]: e.target.value }))}
                  placeholder="Add optional notes for admin..."
                  className="mt-1"
                />
              </div>

              {showRejectionBox[request.id] && (
                <div>
                  <label className="text-sm font-medium text-red-600">Rejection Reason (Required)</label>
                  <Textarea
                    value={rejectionReasons[request.id] || ""}
                    onChange={(e) => setRejectionReasons((prev) => ({ ...prev, [request.id]: e.target.value }))}
                    placeholder="Enter reason for rejection..."
                    className="mt-1"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => handleVerify(request.id)}
                  disabled={actionLoading === request.id}
                >
                  {actionLoading === request.id ? "Processing..." : "Verify"}
                </Button>

                {!showRejectionBox[request.id] ? (
                  <Button
                    variant="destructive"
                    onClick={() => setShowRejectionBox((prev) => ({ ...prev, [request.id]: true }))}
                    disabled={actionLoading === request.id}
                  >
                    Reject
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    onClick={() => handleReject(request.id)}
                    disabled={actionLoading === request.id}
                  >
                    Confirm Rejection
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
