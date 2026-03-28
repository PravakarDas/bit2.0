"use client";

import { useState } from "react";
import { updateEmployeeSalary } from "@/actions/salary.actions";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { TrendingUp } from "lucide-react";
import { SalaryChangeReason } from "@prisma/client";

export function UpdateSalaryDialog({ userId, onUpdate }: { userId: string, onUpdate?: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        amount: "",
        reason: "INCREMENT" as SalaryChangeReason,
        effectiveFrom: new Date().toISOString().split('T')[0],
    });

    const handleSubmit = async () => {
        if (!formData.amount || Number(formData.amount) <= 0) {
            toast.error("Please enter a valid amount");
            return;
        }

        setLoading(true);
        try {
            await updateEmployeeSalary({
                userId,
                amount: Number(formData.amount),
                reason: formData.reason,
                effectiveFrom: new Date(formData.effectiveFrom),
            });

            toast.success("Salary updated successfully");
            setIsOpen(false);
            setFormData({ amount: "", reason: "INCREMENT", effectiveFrom: new Date().toISOString().split('T')[0] });
            if (onUpdate) onUpdate();
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : "Failed to update salary");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button>
                    <TrendingUp className="mr-2 h-4 w-4" /> Update Salary
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Revise Employee Salary</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="amount">New Base Salary (Monthly)</Label>
                        <Input
                            id="amount"
                            type="number"
                            placeholder="e.g. 50000"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="reason">Revision Reason</Label>
                        <Select
                            value={formData.reason}
                            onValueChange={(value: SalaryChangeReason) => setFormData({ ...formData, reason: value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select reason" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="JOINING">Initial Joining</SelectItem>
                                <SelectItem value="PROMOTION">Promotion</SelectItem>
                                <SelectItem value="INCREMENT">Annual Increment</SelectItem>
                                <SelectItem value="ADJUSTMENT">Market Adjustment</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="effectiveDate">Effective From</Label>
                        <Input
                            id="effectiveDate"
                            type="date"
                            value={formData.effectiveFrom}
                            onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={loading}>
                        {loading ? "Processing..." : "Commit Change"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
