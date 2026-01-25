"use client";

import { useEffect, useState } from "react";
import {
    getPendingMedicalClaims,
    approveMedicalClaim,
    rejectMedicalClaim
} from "@/actions/medical.actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { ExternalLink, Check, X } from "lucide-react";

export default function AdminMedicalClaimsPage() {
    const [claims, setClaims] = useState<any[]>([]);
    const [selectedClaim, setSelectedClaim] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const loadClaims = async () => {
        try {
            const data = await getPendingMedicalClaims();
            setClaims(data);
        } catch (error) {
            console.error("Error loading claims:", error);
        }
    };

    useEffect(() => {
        loadClaims();
    }, []);

    const handleAction = async (action: "approve" | "reject") => {
        if (!selectedClaim) return;

        setLoading(true);
        try {
            const res = action === "approve"
                ? await approveMedicalClaim(selectedClaim.id)
                : await rejectMedicalClaim(selectedClaim.id);

            if (res.success) {
                toast.success(`Claim ${action === "approve" ? "approved" : "rejected"} successfully`);
                setSelectedClaim(null);
                loadClaims();
            } else {
                toast.error((res as any).error || `Failed to ${action} claim`);
            }
        } catch (error: any) {
            toast.error(error.message || "An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Medical Claims Review</h1>
                <p className="text-muted-foreground">Approve or reject employee medical reimbursement requests.</p>
            </div>

            <div className="border rounded-lg bg-card bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold">Employee</TableHead>
                            <TableHead className="font-semibold">Description</TableHead>
                            <TableHead className="font-semibold text-right">Amount</TableHead>
                            <TableHead className="font-semibold text-right">Remaining Bal.</TableHead>
                            <TableHead className="font-semibold text-center">Attachment</TableHead>
                            <TableHead className="font-semibold text-right pr-6">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {claims.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                    No pending medical claims to review.
                                </TableCell>
                            </TableRow>
                        ) : (
                            claims.map((claim) => {
                                const entitlement = claim.user.medicalEntitlements?.[0];
                                const balance = entitlement?.remainingBalance ?? 0;

                                return (
                                    <TableRow key={claim.id} className="hover:bg-muted/30 transition-colors text-sm">
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-black">{claim.user.email}</span>
                                                <span className="text-[10px] text-muted-foreground uppercase">{claim.user.role}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate">
                                            {claim.description}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums font-semibold text-indigo-700">
                                            ₹{claim.amount.toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums font-medium">
                                            <span className={balance < claim.amount ? "text-destructive" : "text-green-600"}>
                                                ₹{balance.toLocaleString()}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {claim.attachmentUrl ? (
                                                <a
                                                    href={claim.attachmentUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 hover:text-blue-800 flex items-center justify-center"
                                                >
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            ) : (
                                                <span className="text-[10px] text-muted-foreground italic">None</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right pr-6">
                                            <div className="flex justify-end gap-2 text-sm">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-destructive h-7 w-7 p-0"
                                                    onClick={() => setSelectedClaim({ ...claim, action: "reject" })}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="h-7 w-7 p-0"
                                                    onClick={() => setSelectedClaim({ ...claim, action: "approve" })}
                                                    disabled={balance < claim.amount}
                                                >
                                                    <Check className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Confirmation Dialog */}
            <Dialog open={!!selectedClaim} onOpenChange={(open) => !open && setSelectedClaim(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {selectedClaim?.action === "approve" ? "Approve Medical Claim" : "Reject Medical Claim"}
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to {selectedClaim?.action} this claim of <strong>₹{selectedClaim?.amount.toLocaleString()}</strong> from <strong>{selectedClaim?.user.email}</strong>?
                            {selectedClaim?.action === "approve" && " This will automatically deduct the amount from their annual medical entitlement."}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedClaim(null)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            variant={selectedClaim?.action === "approve" ? "default" : "destructive"}
                            onClick={() => handleAction(selectedClaim.action)}
                            disabled={loading}
                        >
                            {loading ? "Processing..." : selectedClaim?.action === "approve" ? "Approve" : "Reject"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
