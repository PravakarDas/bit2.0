"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DollarSign, Loader2 } from "lucide-react";
import { adjustWalletBalance } from "@/actions/wallet.actions";

interface WalletAdjustmentDialogProps {
    userId: string;
    currentBalance: number;
    onSuccess?: () => void;
}

export function WalletAdjustmentDialog({ 
    userId, 
    currentBalance, 
    onSuccess 
}: WalletAdjustmentDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [adjustmentType, setAdjustmentType] = useState<"CREDIT" | "DEBIT">("CREDIT");
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");

    const handleSubmit = async () => {
        if (!amount || !reason.trim()) {
            toast.error("Please fill in all required fields");
            return;
        }

        const adjustmentAmount = parseFloat(amount);
        if (isNaN(adjustmentAmount) || adjustmentAmount <= 0) {
            toast.error("Please enter a valid amount");
            return;
        }

        setIsLoading(true);
        try {
            const finalAmount = adjustmentType === "DEBIT" ? -adjustmentAmount : adjustmentAmount;
            
            await adjustWalletBalance(userId, finalAmount, reason.trim());
            
            toast.success(
                `Wallet ${adjustmentType.toLowerCase()} of ৳${adjustmentAmount.toLocaleString("en-BD")} applied successfully`
            );
            
            setIsOpen(false);
            setAmount("");
            setReason("");
            setAdjustmentType("CREDIT");
            onSuccess?.();
        } catch (error) {
            console.error("Failed to adjust wallet:", error);
            toast.error("Failed to process wallet adjustment");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Adjust Wallet
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Wallet Adjustment</DialogTitle>
                    <DialogDescription>
                        Make credit or debit adjustments to the employee wallet balance.
                        Current balance: ৳{currentBalance.toLocaleString("en-BD")}
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="adjustment-type">Adjustment Type</Label>
                        <Select value={adjustmentType} onValueChange={(value: "CREDIT" | "DEBIT") => setAdjustmentType(value)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select adjustment type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="CREDIT">
                                    <div className="flex items-center gap-2">
                                        <span className="text-green-600">+</span>
                                        Credit (Add Money)
                                    </div>
                                </SelectItem>
                                <SelectItem value="DEBIT">
                                    <div className="flex items-center gap-2">
                                        <span className="text-red-600">-</span>
                                        Debit (Deduct Money)
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount (৳)</Label>
                        <Input
                            id="amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="Enter amount"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="reason">Reason for Adjustment</Label>
                        <Textarea
                            id="reason"
                            placeholder="Enter reason for this adjustment..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                        />
                    </div>

                    {amount && (
                        <div className={`p-3 rounded-lg border ${
                            adjustmentType === "CREDIT" ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                        }`}>
                            <div className="text-sm">
                                <strong>Preview:</strong>
                            </div>
                            <div className="text-sm text-muted-foreground">
                                Current Balance: ৳{currentBalance.toLocaleString("en-BD")}
                            </div>
                            <div className={`text-sm font-medium ${
                                adjustmentType === "CREDIT" ? "text-green-600" : "text-red-600"
                            }`}>
                                {adjustmentType === "CREDIT" ? "+" : "-"}৳{parseFloat(amount || "0").toLocaleString("en-BD")}
                            </div>
                            <div className="text-sm font-bold">
                                New Balance: ৳{(
                                    adjustmentType === "CREDIT" 
                                        ? currentBalance + parseFloat(amount || "0")
                                        : currentBalance - parseFloat(amount || "0")
                                ).toLocaleString("en-BD")}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setIsOpen(false)}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!amount || !reason.trim() || isLoading}
                    >
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Apply Adjustment
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}