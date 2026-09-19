"use client";

import { useState } from "react";
import { applyForLoan } from "@/actions/loan.actions";
import { toast } from "sonner";
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Calculator } from "lucide-react";

interface LoanApplicationFormProps {
    maxEligibleAmount: number; // 50% of salary or 300k
    branchLoanApplicationEnabled: boolean;
    loanMode?: "AUTO" | "MANUAL";
}

export function LoanApplicationForm({ maxEligibleAmount, branchLoanApplicationEnabled, loanMode = "AUTO" }: LoanApplicationFormProps) {
    const isManual = loanMode === "MANUAL";
    const minimumLoanAmount = 5000;
    const effectiveMaxAmount = Math.max(0, Math.min(300000, Math.floor(maxEligibleAmount / 500) * 500));
    const canApplyByLimit = effectiveMaxAmount >= minimumLoanAmount;
    const canApplyLoan = canApplyByLimit && branchLoanApplicationEnabled;

    const normalizeAmount = (value: number) => {
        if (!Number.isFinite(value)) return minimumLoanAmount;
        const rounded = Math.round(value / 500) * 500;
        return Math.max(minimumLoanAmount, Math.min(effectiveMaxAmount, rounded));
    };

    const [loading, setLoading] = useState(false);
    const [amount, setAmount] = useState(
        canApplyLoan ? normalizeAmount(Math.min(50000, effectiveMaxAmount)) : 0
    );
    const [duration, setDuration] = useState(12);
    const [gracePeriod, setGracePeriod] = useState(3);
    const [reason, setReason] = useState("Personal Requirement");

    const estimatedEmi = Math.round(amount / duration);
    const firstEmiDate = new Date(new Date().getFullYear(), new Date().getMonth() + gracePeriod, 1);
    const completionDate = new Date(firstEmiDate.getFullYear(), firstEmiDate.getMonth() + duration, 1);
    const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!branchLoanApplicationEnabled) {
            toast.error("Loan requests are currently turned off for your branch.");
            return;
        }

        if (!canApplyByLimit) {
            toast.error("You are not currently eligible for a new loan request.");
            return;
        }

        setLoading(true);

        const res = await applyForLoan({
            amount: normalizeAmount(amount),
            duration,
            gracePeriod,
            reason
        });

        if (res.success) {
            toast.success("Application submitted successfully!");
            // Optional: Redirect or reset form
        } else {
            toast.error(res.error || "Application failed");
        }
        setLoading(false);
    };

    return (
        <Card className="w-full max-w-lg mx-auto shadow-md border-0 bg-white">
            <CardHeader className="bg-slate-50 border-b pb-4">
                <CardTitle className="text-xl text-slate-800">New Loan Application</CardTitle>
                <CardDescription>
                    Eligible Limit: <span className="font-bold text-green-600">৳{maxEligibleAmount.toLocaleString("en-BD")}</span>
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <Label>Loan Amount</Label>
                            <span className="text-sm font-bold text-slate-700">৳{amount.toLocaleString("en-BD")}</span>
                        </div>
                        <Input
                            type="number"
                            min={minimumLoanAmount}
                            max={effectiveMaxAmount}
                            step={500}
                            value={amount || ""}
                            onChange={(e) => {
                                const next = Number(e.target.value);
                                if (!Number.isFinite(next)) {
                                    setAmount(minimumLoanAmount);
                                    return;
                                }
                                setAmount(normalizeAmount(next));
                            }}
                            onBlur={() => setAmount(normalizeAmount(amount))}
                            disabled={!canApplyLoan}
                            placeholder="e.g. 15500"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Minimum ৳5,000. Maximum ৳{effectiveMaxAmount.toLocaleString("en-BD")}. Value auto-rounds to nearest ৳500.
                        </p>
                    </div>

                    {!isManual && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Duration (Months)</Label>
                            <Select value={duration.toString()} onValueChange={(v) => setDuration(Number(v))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[6, 12, 18, 24].map((m) => (
                                        <SelectItem key={m} value={m.toString()}>{m} Months</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Grace Period</Label>
                            <Select value={gracePeriod.toString()} onValueChange={(v) => setGracePeriod(Number(v))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[0, 1, 2, 3, 4, 5, 6].map((m) => (
                                        <SelectItem key={m} value={m.toString()}>{m} Months</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    )}

                    <div className="space-y-2">
                        <Label>Reason</Label>
                        <Input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Medical Emergency, Home Renovation"
                        />
                    </div>

                    {isManual ? (
                    <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 text-xs text-blue-900">
                        <p className="font-semibold">Flexible repayment</p>
                        <p className="opacity-70">
                            There is no fixed EMI. HR/admin deducts the loan from your salary in the amounts and months they decide.
                        </p>
                    </div>
                    ) : (
                    <div className="bg-blue-50/50 p-4 rounded-lg flex items-center justify-between border border-blue-100">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-full text-blue-600">
                                <Calculator className="h-4 w-4" />
                            </div>
                            <div className="text-xs text-blue-900">
                                <p className="font-semibold">Estimated Monthly EMI</p>
                                <p className="opacity-70">First EMI: {monthFormatter.format(firstEmiDate)} | Ends: {monthFormatter.format(completionDate)}</p>
                            </div>
                        </div>
                        <span className="text-lg font-bold text-blue-700">
                            ৳{estimatedEmi.toLocaleString("en-BD")}
                        </span>
                    </div>
                    )}

                    {!branchLoanApplicationEnabled && (
                        <p className="text-xs text-red-600">
                            Loan applications are currently disabled for your branch. Please contact HR/admin.
                        </p>
                    )}

                    {branchLoanApplicationEnabled && !canApplyByLimit && (
                        <p className="text-xs text-red-600">
                            You are not eligible for a new loan right now. Your available limit is below ৳5,000.
                        </p>
                    )}
                </div>
            </CardContent>
            <CardFooter className="bg-slate-50 border-t pt-4">
                <Button onClick={handleSubmit} className="w-full" disabled={loading || !canApplyLoan}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Submit Application"}
                </Button>
            </CardFooter>
        </Card>
    );
}
