"use client";

import { useState } from "react";
import { AlertTriangle, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface Loan {
  id: string;
  issuedAmount: number;
  remainingPrincipal: number;
  status: string;
  reason?: string;
}

interface ArchiveWarningsModalProps {
  isOpen: boolean;
  employeeId: string;
  employeeName: string;
  walletBalance: number;
  loans: Loan[];
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ArchiveWarningsModal({
  isOpen,
  employeeId,
  employeeName,
  walletBalance,
  loans,
  onConfirm,
  onCancel,
  isLoading = false,
}: ArchiveWarningsModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  const hasWalletWarning = walletBalance !== 0;
  const hasLoanWarning = loans.length > 0;
  const hasWarnings = hasWalletWarning || hasLoanWarning;

  const handleConfirm = () => {
    if (hasWarnings && !confirmed) {
      setConfirmed(true);
      return;
    }

    onConfirm();
  };

  const handleCancel = () => {
    setConfirmed(false);
    onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Archive Employee - Confirmation Required
          </DialogTitle>
          <DialogDescription>
            Employee: <span className="font-semibold">{employeeName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning Summary */}
          {!confirmed && hasWarnings && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                ⚠️ This employee has pending items that should be reviewed before archiving:
              </AlertDescription>
            </Alert>
          )}

          {/* Wallet Balance Warning */}
          {hasWalletWarning && (
            <Alert
              className={
                walletBalance < 0
                  ? "border-red-200 bg-red-50"
                  : "border-yellow-200 bg-yellow-50"
              }
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription
                className={
                  walletBalance < 0 ? "text-red-800" : "text-yellow-800"
                }
              >
                <div className="font-semibold mb-1">Wallet Balance Alert</div>
                <div>
                  This employee has a non-zero wallet balance that should be
                  cleared before archiving.
                </div>
                <div className="mt-2 font-semibold">
                  Current Balance:{" "}
                  <span className={walletBalance < 0 ? "text-red-600" : ""}>
                    {walletBalance < 0 ? "-" : "+"}
                    ৳{Math.abs(walletBalance).toFixed(2)}
                  </span>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Loans Warning */}
          {hasLoanWarning && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-orange-800">
                <div className="font-semibold mb-2">Loan Records Found</div>
                <div className="mb-3">
                  This employee has loan records associated and they should be
                  reviewed/cleared before archiving.
                </div>

                <div className="space-y-2">
                  {loans.map((loan) => (
                    <div
                      key={loan.id}
                      className="p-2 border border-orange-200 rounded bg-white"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium">
                            Loan ID: {loan.id.slice(0, 8)}...
                          </div>
                          {loan.reason && (
                            <div className="text-sm text-gray-600">
                              Reason: {loan.reason}
                            </div>
                          )}
                          <div className="text-sm text-gray-600 mt-1">
                            Issued: ৳{loan.issuedAmount.toFixed(2)} | Remaining:
                            ৳{loan.remainingPrincipal.toFixed(2)}
                          </div>
                        </div>
                        <Badge variant="outline" className="ml-2">
                          {loan.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Confirmation Required */}
          {hasWarnings && !confirmed && (
            <Alert className="border-blue-200 bg-blue-50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-blue-800">
                Please click <span className="font-semibold">"I Understand & Proceed"</span> to confirm that you have reviewed
                these items and wish to proceed with archiving this employee.
              </AlertDescription>
            </Alert>
          )}

          {/* Confirmation Checkbox */}
          {hasWarnings && !confirmed && (
            <div className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50">
              <input
                type="checkbox"
                id="confirm-archive"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="confirm-archive" className="text-sm font-medium cursor-pointer">
                I have reviewed all warnings and wish to proceed with archiving
              </label>
            </div>
          )}

          {/* No Warnings Case */}
          {!hasWarnings && (
            <Alert className="border-green-200 bg-green-50">
              <AlertCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                ✓ No wallet balance or loan records found. Ready to archive.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              isLoading ||
              (hasWarnings && !confirmed)
            }
            className={
              hasWarnings && !confirmed
                ? "opacity-50 cursor-not-allowed"
                : ""
            }
          >
            {confirmed || !hasWarnings ? "Proceed to Archive" : "I Understand & Proceed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
