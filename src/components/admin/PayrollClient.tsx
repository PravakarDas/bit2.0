"use client";

import { useState } from "react";
import { toggleEmiCarryForward, processPayroll, generatePayrollCSVData, getFailedEmployees } from "@/actions/payroll.actions";
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
import { Loader2, DollarSign, Gift } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface EligibleBonus {
    id: string;
    name: string;
    type: "FIXED" | "PERCENTAGE";
    value: number;
    amount: number;
}

interface PayrollAggregation {
    userId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    bankAccountNumber?: string;
    baseSalary: number;
    walletBalance: number;
    eligibleBonuses: EligibleBonus[];
    totalAllowances: number;
    totalMedical: number;
    activeLoans: {
        id: string;
        currentEmi: number;
        carryForward: number;
        remainingPrincipal: number;
    }[];
    totalLoanDeduction: number;
    netPay: number; // Base net pay without bonuses
}

export function PayrollClient({
    initialData,
    month,
    year
}: {
    initialData: PayrollAggregation[],
    month: number,
    year: number
}) {
    const data = initialData;
    const [selectedBonuses, setSelectedBonuses] = useState<Record<string, string[]>>({});
    const [processing, setProcessing] = useState(false);

    const handleToggleCarryForward = async (loanId: string, checked: boolean) => {
        try {
            await toggleEmiCarryForward(loanId, !checked);
            toast.success(checked ? "EMI will be deducted" : "EMI carried forward");
        } catch {
            toast.error("Failed to update EMI status");
        }
    };

    const toggleBonus = (userId: string, bonusId: string) => {
        setSelectedBonuses(prev => {
            const userBonuses = prev[userId] || [];
            if (userBonuses.includes(bonusId)) {
                return { ...prev, [userId]: userBonuses.filter(id => id !== bonusId) };
            } else {
                return { ...prev, [userId]: [...userBonuses, bonusId] };
            }
        });
    };

    const calculateUserNetPay = (emp: PayrollAggregation) => {
        const bonusAmount = (selectedBonuses[emp.userId] || []).reduce((sum, bid) => {
            const b = emp.eligibleBonuses.find(eb => eb.id === bid);
            return sum + (b?.amount || 0);
        }, 0);
        return emp.netPay + bonusAmount + emp.walletBalance;
    };

    const generateAndDownloadCSV = (csvData: any[], filename: string) => {
        const headers = ['Employee Name', 'Account Number', 'Net Pay Amount'];
        const csvContent = [
            headers.join(','),
            ...csvData.map(row => [
                `"${row.employeeName}"`,
                `"${row.accountNumber}"`,
                row.netPayAmount
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleProcessPayroll = async () => {
        const payrollMonth = `${year}-${month.toString().padStart(2, '0')}`;
        setProcessing(true);
        try {
            // 1. Generate CSV data BEFORE processing (when all employee data is available)
            const initialCsvData = await generatePayrollCSVData(data, selectedBonuses);
            
            // 2. Process payroll
            await processPayroll(payrollMonth, selectedBonuses);
            
            // 3. Check for failed employees (employees still left after processing)
            const failedEmployeeIds = await getFailedEmployees(payrollMonth);
            
            // 4. Remove failed employees from CSV data (keep only successfully processed employees)
            const finalCsvData = initialCsvData.filter(row => !failedEmployeeIds.includes(row.userId));
            
            // 5. Download CSV file with only successfully processed employees
            const fileName = `payroll-${payrollMonth}-${new Date().toISOString().split('T')[0]}.csv`;
            generateAndDownloadCSV(finalCsvData, fileName);
            
            const processedCount = finalCsvData.length;
            const failedCount = failedEmployeeIds.length;
            
            if (failedCount > 0) {
                toast.success(`Payroll processed: ${processedCount} successful, ${failedCount} failed. CSV contains only successful employees.`);
            } else {
                toast.success(`Payroll for ${payrollMonth} processed successfully. CSV file downloaded.`);
            }
        } catch (error: unknown) {
            toast.error((error instanceof Error) ? error.message : "Failed to process payroll");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border shadow-sm">
                <div>
                    <h2 className="text-xl font-bold">Review for {month}/{year}</h2>
                    <p className="text-sm text-muted-foreground">Adjust bonuses and EMI states before final commit.</p>
                </div>
                <Button
                    size="lg"
                    onClick={handleProcessPayroll}
                    disabled={processing || data.length === 0}
                    className="bg-green-600 hover:bg-green-700"
                >
                    {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                    Finalize & Process
                </Button>
            </div>

            <div className="border rounded-lg bg-white shadow-sm overflow-hidden text-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold">Employee</TableHead>
                            <TableHead className="font-semibold text-right">Base</TableHead>
                            <TableHead className="font-semibold text-right">Allowances</TableHead>
                            <TableHead className="font-semibold text-right">Medical</TableHead>
                            <TableHead className="font-semibold text-right">Bonuses</TableHead>
                            <TableHead className="font-semibold text-right">Deductions</TableHead>
                            <TableHead className="font-semibold text-right">Wallet</TableHead>
                            <TableHead className="font-semibold">EMI Ctrl</TableHead>
                            <TableHead className="font-semibold text-right text-green-700">Net Pay</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground italic">
                                    No approved employees found for this period.
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.map((emp) => (
                                <TableRow key={emp.userId} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="font-medium">{emp.email}</TableCell>
                                    <TableCell className="text-right tabular-nums">৳{emp.baseSalary.toLocaleString("en-BD")}</TableCell>
                                    <TableCell className="text-right tabular-nums text-blue-600">
                                        +৳{emp.totalAllowances.toLocaleString("en-BD")}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-indigo-600">
                                        +৳{emp.totalMedical.toLocaleString("en-BD")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" size="sm" className="h-7 text-[11px] px-2">
                                                    <Gift className="mr-1 h-3 w-3" />
                                                    Manage ({selectedBonuses[emp.userId]?.length || 0})
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Bonuses for {emp.email}</DialogTitle>
                                                </DialogHeader>
                                                <div className="space-y-4 py-4">
                                                    {emp.eligibleBonuses.length === 0 ? (
                                                        <p className="text-center text-muted-foreground italic py-4">No eligible bonuses found for this branch.</p>
                                                    ) : (
                                                        emp.eligibleBonuses.map(bonus => (
                                                            <div key={bonus.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <Checkbox
                                                                        id={`bonus-${emp.userId}-${bonus.id}`}
                                                                        checked={(selectedBonuses[emp.userId] || []).includes(bonus.id)}
                                                                        onCheckedChange={() => toggleBonus(emp.userId, bonus.id)}
                                                                    />
                                                                    <label htmlFor={`bonus-${emp.userId}-${bonus.id}`} className="flex flex-col cursor-pointer">
                                                                        <span className="font-semibold text-sm">{bonus.name}</span>
                                                                        <span className="text-[10px] text-muted-foreground">{bonus.type} ({bonus.value}{bonus.type === "PERCENTAGE" ? "%" : " FIXED"})</span>
                                                                    </label>
                                                                </div>
                                                                <div className="font-bold text-green-600">
                                                                    ৳{bonus.amount.toLocaleString("en-BD")}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-destructive">
                                        <div className="flex flex-col items-end">
                                            <span>-৳{(emp.totalLoanDeduction).toLocaleString("en-BD")}</span>
                                            {emp.activeLoans.some(l => l.carryForward > 0) && (
                                                <span className="text-[9px] text-orange-600 font-bold uppercase">CF Active</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <span className={emp.walletBalance >= 0 ? "text-blue-600" : "text-red-600"}>
                                            {emp.walletBalance >= 0 ? "+" : ""}৳{emp.walletBalance.toLocaleString("en-BD")}
                                        </span>
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
                                    <TableCell className="text-right tabular-nums font-bold text-green-700 text-base">
                                        ৳{calculateUserNetPay(emp).toLocaleString("en-BD")}
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

