"use client";

import { useState } from "react";
import { toggleEmiCarryForward, processPayroll } from "@/actions/payroll.actions";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, DollarSign } from "lucide-react";

interface PayrollAggregation {
    userId: string;
    email: string;
    baseSalary: number;
    totalBonuses: number;
    totalAllowances: number;
    totalMedical: number;
    activeLoans: {
        id: string;
        currentEmi: number;
        carryForward: number;
        remainingPrincipal: number;
    }[];
    totalLoanDeduction: number;
    netPay: number;
}

export function PayrollClient({ initialData }: { initialData: PayrollAggregation[] }) {
    const [data, setData] = useState(initialData);
    const [processing, setProcessing] = useState(false);

    const handleToggleCarryForward = async (loanId: string, checked: boolean) => {
        try {
            await toggleEmiCarryForward(loanId, !checked);
            toast.success(checked ? "EMI will be deducted" : "EMI carried forward");
        } catch (error) {
            toast.error("Failed to update EMI status");
        }
    };

    const handleProcessPayroll = async () => {
        const month = new Date().toISOString().slice(0, 7);
        setProcessing(true);
        try {
            await processPayroll(month);
            toast.success(`Payroll for ${month} processed successfully`);
        } catch (error) {
            toast.error("Failed to process payroll");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Monthly Payroll Review</h1>
                    <p className="text-muted-foreground">Review summary for all approved employees across organization branches.</p>
                </div>
                <Button
                    size="lg"
                    onClick={handleProcessPayroll}
                    disabled={processing || data.length === 0}
                    className="bg-green-600 hover:bg-green-700"
                >
                    {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                    Process Payroll
                </Button>
            </div>

            <div className="border rounded-lg bg-card bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold">Employee</TableHead>
                            <TableHead className="font-semibold text-right">Base Salary</TableHead>
                            <TableHead className="font-semibold text-right">Allowances</TableHead>
                            <TableHead className="font-semibold text-right">Bonuses</TableHead>
                            <TableHead className="font-semibold text-right">Medical</TableHead>
                            <TableHead className="font-semibold text-right">Loan EMI</TableHead>
                            <TableHead className="font-semibold">Loan Ctrl</TableHead>
                            <TableHead className="font-semibold text-right text-green-700">Net Pay</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                    No approved employees found for payroll.
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.map((emp) => (
                                <TableRow key={emp.userId} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="font-medium">{emp.email}</TableCell>
                                    <TableCell className="text-right tabular-nums">৳{emp.baseSalary.toLocaleString("en-BD")}</TableCell>
                                    <TableCell className="text-right tabular-nums text-blue-600 font-medium">
                                        +৳{emp.totalAllowances.toLocaleString("en-BD")}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-purple-600 font-medium">
                                        +৳{emp.totalBonuses.toLocaleString("en-BD")}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-indigo-600 font-medium">
                                        +৳{emp.totalMedical.toLocaleString("en-BD")}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <div className="flex flex-col items-end">
                                            <span className="text-destructive">-৳{(emp.totalLoanDeduction).toLocaleString("en-BD")}</span>
                                            {emp.activeLoans.some(l => l.carryForward > 0) && (
                                                <span className="text-[10px] text-orange-600 font-bold uppercase tracking-tighter">Incl. CF</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            {emp.activeLoans.map(loan => (
                                                <div key={loan.id} className="flex items-center gap-2">
                                                    <Switch
                                                        defaultChecked={loan.currentEmi > 0}
                                                        onCheckedChange={(checked) => handleToggleCarryForward(loan.id, checked)}
                                                    />
                                                </div>
                                            ))}
                                            {emp.activeLoans.length === 0 && <span className="text-[10px] text-muted-foreground italic">None</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums font-bold text-green-700 text-lg">
                                        ৳{emp.netPay.toLocaleString("en-BD")}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
