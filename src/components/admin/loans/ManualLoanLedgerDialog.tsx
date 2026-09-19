"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";
import { getLoanActivityHistory, recordManualPayment } from "@/actions/loan.actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoanPaymentLedger } from "@/components/shared/LoanPaymentLedger";
import { formatCurrency, formatDate } from "@/lib/utils";

type LoanActivityHistory = Awaited<ReturnType<typeof getLoanActivityHistory>>;

interface ManualLoanLedgerDialogProps {
  loan: {
    id: string;
    issuedAmount: number;
    remainingPrincipal: number;
    status: string;
    reason: string;
    createdAt: Date;
    user: { firstName: string; lastName: string };
  };
  onChanged?: () => void;
}

/**
 * Ledger for a manual-mode loan: who approved it, when, how much, and every
 * month's deduction. Deductions themselves are chosen in the Payroll screen;
 * here admin can additionally record an off-payroll (cash) payment.
 */
export function ManualLoanLedgerDialog({ loan, onChanged }: ManualLoanLedgerDialogProps) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<LoanActivityHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setHistory(await getLoanActivityHistory(loan.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load loan history");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void load();
  };

  const handleRecordPayment = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please provide a reason");
      return;
    }
    setSaving(true);
    try {
      await recordManualPayment(loan.id, value, reason.trim());
      toast.success("Payment recorded");
      setAmount("");
      setReason("");
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const current = history?.loan ?? null;
  const remaining = current?.remainingPrincipal ?? loan.remainingPrincipal;
  const status = current?.status ?? loan.status;
  const approver = history?.approver
    ? `${history.approver.firstName ?? ""} ${history.approver.lastName ?? ""}`.trim() || history.approver.email
    : "—";
  const approvedAt = history?.auditLogs.length
    ? history.auditLogs[history.auditLogs.length - 1].createdAt
    : loan.createdAt;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <BookOpen className="h-4 w-4 mr-1" />
          Ledger
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Loan ledger — {loan.user.firstName} {loan.user.lastName}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <Label className="text-xs text-muted-foreground">Approved amount</Label>
            <div className="font-semibold">{formatCurrency(loan.issuedAmount)}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Total repaid</Label>
            <div className="font-semibold text-green-700">{formatCurrency(loan.issuedAmount - remaining)}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Remaining</Label>
            <div className="font-semibold text-orange-600">{formatCurrency(remaining)}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div className="font-semibold">{status}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Approved on</Label>
            <div>{formatDate(approvedAt)}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Approved by</Label>
            <div>{approver}</div>
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Reason</Label>
            <div>{loan.reason}</div>
          </div>
        </div>

        <div className="border rounded-lg">
          {loading && !history ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : (
            <LoanPaymentLedger issuedAmount={loan.issuedAmount} payments={history?.payments ?? []} />
          )}
        </div>

        {status === "ACTIVE" && (
          <div className="border rounded-lg p-4 space-y-3">
            <div>
              <h4 className="font-medium text-sm">Record cash / off-payroll payment</h4>
              <p className="text-xs text-muted-foreground">
                Salary deductions are set in Payroll for the month being processed.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <Input
                type="number"
                min={0}
                max={remaining}
                placeholder="Amount (৳)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button onClick={handleRecordPayment} disabled={saving}>
                {saving ? "Saving…" : "Record payment"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
