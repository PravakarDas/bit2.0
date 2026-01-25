"use client";

import { useState } from "react";
import { approveLoan } from "@/actions/loan.actions";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ApproveLoanDialogProps {
    loan: {
        id: string;
        issuedAmount: number;
        user: {
            email: string;
        };
    };
}

export function ApproveLoanDialog({ loan }: ApproveLoanDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        issuedAmount: loan.issuedAmount,
        gracePeriodMonths: 6,
        totalMonths: 12,
    });

    const handleApprove = async () => {
        setLoading(true);
        try {
            await approveLoan(loan.id, formData);
            toast.success("Loan approved and initialized successfully");
            setIsOpen(false);
        } catch (error) {
            toast.error("Failed to approve loan");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button size="sm">Approve</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Approve Loan Request</DialogTitle>
                    <p className="text-sm text-muted-foreground pt-1">
                        Setting up initial parameters for {loan.user.email}
                    </p>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="issuedAmount">Issued Amount</Label>
                        <Input
                            id="issuedAmount"
                            type="number"
                            value={formData.issuedAmount}
                            onChange={(e) =>
                                setFormData({ ...formData, issuedAmount: Number(e.target.value) })
                            }
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="gracePeriodMonths">Grace Period (Months)</Label>
                        <Input
                            id="gracePeriodMonths"
                            type="number"
                            value={formData.gracePeriodMonths}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    gracePeriodMonths: Number(e.target.value),
                                })
                            }
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="totalMonths">Total Duration (Months)</Label>
                        <Input
                            id="totalMonths"
                            type="number"
                            value={formData.totalMonths}
                            onChange={(e) =>
                                setFormData({ ...formData, totalMonths: Number(e.target.value) })
                            }
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleApprove} disabled={loading}>
                        {loading ? "Approving..." : "Confirm Approval"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
