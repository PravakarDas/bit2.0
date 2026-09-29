"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import {
    getEmployeeDataResetPreview,
    resetArchivedEmployeeData,
    type EmployeeDataResetPreview,
} from "@/actions/employee-data-reset.actions";

export function ResetEmployeeDataButton({ userId }: { userId: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [preview, setPreview] = useState<EmployeeDataResetPreview | null>(null);
    const [confirmEmail, setConfirmEmail] = useState("");

    const handleOpen = async () => {
        setOpen(true);
        setPreview(null);
        setConfirmEmail("");
        setLoadingPreview(true);
        const result = await getEmployeeDataResetPreview(userId);
        setLoadingPreview(false);
        if (!result.success) {
            toast.error(result.error);
            setOpen(false);
            return;
        }
        setPreview(result.preview);
    };

    const handleReset = async () => {
        setResetting(true);
        const result = await resetArchivedEmployeeData(userId, confirmEmail);
        setResetting(false);
        if (!result.success) {
            toast.error(result.error);
            return;
        }
        toast.success("Employee data has been reset");
        setOpen(false);
        router.refresh();
    };

    const hasOpenItems =
        !!preview && (preview.walletBalance !== 0 || preview.openLoans.length > 0 || preview.pendingRequests.length > 0);
    const emailMatches = !!preview && confirmEmail.trim().toLowerCase() === preview.email.toLowerCase();

    return (
        <>
            <Button variant="destructive" size="sm" onClick={handleOpen}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset Data
            </Button>

            <Dialog open={open} onOpenChange={(value) => !resetting && setOpen(value)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-600" />
                            Reset Employee Data for Rejoin
                        </DialogTitle>
                        <DialogDescription>
                            {preview ? (
                                <>
                                    Permanently deletes all previous history of{" "}
                                    <span className="font-semibold">{preview.employeeName}</span> so they start fresh as a new
                                    employee. This cannot be undone.
                                </>
                            ) : (
                                "Loading employee data..."
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    {loadingPreview || !preview ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {hasOpenItems && (
                                <Alert className="border-yellow-200 bg-yellow-50">
                                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                                    <AlertDescription className="text-yellow-800 space-y-2">
                                        <div className="font-semibold">Open items will also be deleted:</div>
                                        <ul className="list-disc pl-5 text-sm space-y-1">
                                            {preview.walletBalance !== 0 && (
                                                <li>Wallet balance {formatCurrency(preview.walletBalance)} (will be set to ৳0)</li>
                                            )}
                                            {preview.openLoans.map((loan) => (
                                                <li key={loan.id}>
                                                    Loan #{loan.id.slice(-6)} ({loan.status}
                                                    {loan.reason ? `, ${loan.reason}` : ""}), remaining{" "}
                                                    {formatCurrency(loan.remainingPrincipal)}
                                                </li>
                                            ))}
                                            {preview.pendingRequests.map((row) => (
                                                <li key={row.label}>
                                                    {row.count} pending {row.label.toLowerCase()}
                                                </li>
                                            ))}
                                        </ul>
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="rounded-lg border p-3">
                                <div className="font-semibold text-sm mb-2">Will be deleted</div>
                                {preview.toDelete.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No history records found.</p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                                        {preview.toDelete.map((row) => (
                                            <div key={row.label} className="flex justify-between gap-2">
                                                <span className="text-muted-foreground">{row.label}</span>
                                                <span className="font-medium">{row.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border p-3 bg-gray-50 text-sm space-y-1">
                                <div className="font-semibold">Will be kept</div>
                                <p className="text-muted-foreground">
                                    Login account, profile details, current base salary (history restarts from it),
                                    allowance assignments, and {preview.finalizedPayrollsKept} finalized payroll record(s).
                                    The employee stays archived; change their status to Active when they rejoin, then
                                    set joining date and assign leave entitlements.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor={`reset-confirm-${userId}`}>
                                    Type <span className="font-mono font-semibold">{preview.email}</span> to confirm
                                </Label>
                                <Input
                                    id={`reset-confirm-${userId}`}
                                    value={confirmEmail}
                                    onChange={(e) => setConfirmEmail(e.target.value)}
                                    placeholder={preview.email}
                                    autoComplete="off"
                                    disabled={resetting}
                                />
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={resetting}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleReset} disabled={!emailMatches || resetting}>
                            {resetting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                            Delete All Previous Data
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
