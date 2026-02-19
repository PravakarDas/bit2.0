"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { History, Loader2, TrendingUp, DollarSign, Calendar } from "lucide-react";
import { getMySalaryPaymentHistory } from "@/actions/salary.actions";
import { toast } from "sonner";

type SalaryPayment = {
    id: string;
    month: string;
    baseSalary: number;
    totalBonuses: number;
    totalAllowances: number;
    medicalReimbursement: number;
    loanDeduction: number;
    walletAdjustment: number;
    netAmount: number;
    createdAt: Date;
};

export default function SalaryHistoryPage() {
    const { user } = useUser();
    const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [totalPaid, setTotalPaid] = useState<number>(0);

    const fetchSalaryHistory = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await getMySalaryPaymentHistory();
            setSalaryPayments(data);
            
            // Calculate total paid
            const total = data.reduce((sum: number, payment: SalaryPayment) => sum + payment.netAmount, 0);
            setTotalPaid(total);
        } catch (error) {
            console.error("Failed to fetch salary history:", error);
            toast.error("Failed to load salary history");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user) {
            fetchSalaryHistory();
        }
    }, [user, fetchSalaryHistory]);

    const formatMonth = (monthStr: string) => {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-100">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Salary History</h1>
                <p className="text-muted-foreground">View your complete salary payment history</p>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{salaryPayments.length}</div>
                        <p className="text-xs text-muted-foreground">Salary payments received</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Earned</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">৳{totalPaid.toLocaleString("en-BD")}</div>
                        <p className="text-xs text-muted-foreground">Cumulative earnings</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Latest Payment</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {salaryPayments.length > 0 
                                ? `৳${salaryPayments[0].netAmount.toLocaleString("en-BD")}`
                                : "−"
                            }
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {salaryPayments.length > 0 
                                ? formatMonth(salaryPayments[0].month)
                                : "No payments yet"
                            }
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Salary Payment History Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Payment History
                    </CardTitle>
                    <CardDescription>Detailed breakdown of all salary payments</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>Month</TableHead>
                                    <TableHead>Processed Date</TableHead>
                                    <TableHead className="text-right">Base Salary</TableHead>
                                    <TableHead className="text-right">Allowances</TableHead>
                                    <TableHead className="text-right">Bonuses</TableHead>
                                    <TableHead className="text-right">Medical</TableHead>
                                    <TableHead className="text-right">Deductions</TableHead>
                                    <TableHead className="text-right">Net Amount</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {salaryPayments.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                                            No salary payments found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    salaryPayments.map((payment) => {
                                        const totalDeductions = payment.loanDeduction + Math.abs(payment.walletAdjustment < 0 ? payment.walletAdjustment : 0);
                                        
                                        return (
                                            <TableRow key={payment.id} className="hover:bg-muted/30 transition-colors">
                                                <TableCell className="font-medium">
                                                    {formatMonth(payment.month)}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {new Date(payment.createdAt).toLocaleDateString('en-US', {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric'
                                                    })}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    ৳{payment.baseSalary.toLocaleString("en-BD")}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-green-600">
                                                    +৳{payment.totalAllowances.toLocaleString("en-BD")}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-green-600">
                                                    +৳{payment.totalBonuses.toLocaleString("en-BD")}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-green-600">
                                                    +৳{payment.medicalReimbursement.toLocaleString("en-BD")}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-red-600">
                                                    −৳{totalDeductions.toLocaleString("en-BD")}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums font-bold text-lg">
                                                    ৳{payment.netAmount.toLocaleString("en-BD")}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="default" className="bg-green-600">Paid</Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
