"use client";

import { useEffect, useState } from "react";
import { getPendingLoansForManager, verifyLoanRequest, rejectLoanRequest } from "@/actions/manager-verification.actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface LoanRequest {
  id: string;
  issuedAmount: number;
  remainingPrincipal: number;
  gracePeriodMonths: number;
  totalMonths: number;
  status: string;
  reason: string;
  createdAt: Date;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phoneNumber: string | null;
    baseSalary: number;
    walletBalance: number;
    dateOfJoining: Date | null;
    department: { name: string } | null;
    designation: { name: string } | null;
    branch: { name: string } | null;
  };
}

export default function ManagerLoansVerificationClient() {
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [showRejectionBox, setShowRejectionBox] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadLoans();
  }, []);

  async function loadLoans() {
    try {
      setLoading(true);
      const data = await getPendingLoansForManager();
      setLoans(data as LoanRequest[]);
    } catch (error) {
      console.error("Failed to load loans:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(loanId: string) {
    try {
      setActionLoading(loanId);
      await verifyLoanRequest(loanId, comments[loanId]);
      await loadLoans();
    } catch (error) {
      console.error("Failed to verify loan:", error);
      alert("Failed to verify loan request");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(loanId: string) {
    const reason = rejectionReasons[loanId];
    if (!reason || reason.trim() === "") {
      alert("Rejection reason is required");
      return;
    }

    try {
      setActionLoading(loanId);
      await rejectLoanRequest(loanId, reason);
      await loadLoans();
    } catch (error) {
      console.error("Failed to reject loan:", error);
      alert("Failed to reject loan request");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return <div className="p-6">Loading loan requests...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Loan Verifications</h1>
        <p className="text-muted-foreground mt-2">
          Verify or reject employee loan requests before they go to admin.
        </p>
      </div>

      {loans.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No pending loan requests found.</p>
          </CardContent>
        </Card>
      ) : (
        loans.map((loan) => (
          <Card key={loan.id}>
            <CardHeader>
              <CardTitle>
                {loan.user.firstName} {loan.user.lastName} - ₹{loan.issuedAmount.toLocaleString()}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>Employee:</strong> {loan.user.firstName} {loan.user.lastName}</p>
                  <p><strong>Email:</strong> {loan.user.email}</p>
                  <p><strong>Department:</strong> {loan.user.department?.name || "N/A"}</p>
                  <p><strong>Designation:</strong> {loan.user.designation?.name || "N/A"}</p>
                </div>
                <div>
                  <p><strong>Amount:</strong> ₹{loan.issuedAmount.toLocaleString()}</p>
                  <p><strong>Duration:</strong> {loan.totalMonths} months</p>
                  <p><strong>Grace Period:</strong> {loan.gracePeriodMonths} months</p>
                  <p><strong>Salary:</strong> ₹{loan.user.baseSalary.toLocaleString()}</p>
                </div>
              </div>

              <div>
                <p><strong>Reason:</strong></p>
                <p className="text-sm text-muted-foreground">{loan.reason}</p>
              </div>

              <div>
                <label className="text-sm font-medium">Verification Notes (Optional)</label>
                <Textarea
                  value={comments[loan.id] || ""}
                  onChange={(e) => setComments((prev) => ({ ...prev, [loan.id]: e.target.value }))}
                  placeholder="Add optional notes for admin..."
                  className="mt-1"
                />
              </div>

              {showRejectionBox[loan.id] && (
                <div>
                  <label className="text-sm font-medium text-red-600">Rejection Reason (Required)</label>
                  <Textarea
                    value={rejectionReasons[loan.id] || ""}
                    onChange={(e) => setRejectionReasons((prev) => ({ ...prev, [loan.id]: e.target.value }))}
                    placeholder="Enter reason for rejection..."
                    className="mt-1"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={() => handleVerify(loan.id)}
                  disabled={actionLoading === loan.id}
                >
                  {actionLoading === loan.id ? "Processing..." : "Verify"}
                </Button>

                {!showRejectionBox[loan.id] ? (
                  <Button
                    variant="destructive"
                    onClick={() => setShowRejectionBox((prev) => ({ ...prev, [loan.id]: true }))}
                    disabled={actionLoading === loan.id}
                  >
                    Reject
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    onClick={() => handleReject(loan.id)}
                    disabled={actionLoading === loan.id}
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
