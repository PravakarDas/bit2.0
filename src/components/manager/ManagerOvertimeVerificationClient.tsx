"use client";

import { useEffect, useState } from "react";
import { getPendingOvertimeForManager, verifyOvertimeRequest, rejectOvertimeRequest } from "@/actions/manager-verification.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface OvertimeRequest {
  id: string;
  overtimeDate: Date;
  totalOvertime: string;
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

      {requests.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No pending overtime requests found.</p>
          </CardContent>
        </Card>
      ) : (
        requests.map((request) => (
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
