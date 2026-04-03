"use client";

import { format } from "date-fns";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoanStatus } from "@prisma/client";

export interface Loan {
    id: string;
    issuedAmount: number;
    remainingPrincipal: number;
    remainingPrincipalRaw?: number; // Optional if you control the mapping
    status: LoanStatus;
    totalMonths: number;
    gracePeriodMonths: number;
    createdAt: Date;
    managerVerifiedAt?: Date | null;
    managerVerifiedBy?: {
        id: string;
        firstName: string | null;
        lastName: string | null;
    } | null;
    managerRejectionReason?: string | null;
    managerComments?: string | null;
    adminDeclinedReason?: string | null;
    emiStartMonth?: number | null;
    emiStartYear?: number | null;
    emiState?: {
        currentEmi: number;
    } | null;
}

export function LoanList({ loans }: { loans: Loan[] }) {
    if (loans.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground border rounded-lg bg-white/50">
                <p>No loan history found.</p>
            </div>
        );
    }

    return (
        <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50">
                        <TableHead>Date Issued</TableHead>
                        <TableHead className="text-right">Issued Amount</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead className="text-center">Term</TableHead>
                        <TableHead className="text-right">Monthly EMI</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loans.map((loan) => (
                        <TableRow key={loan.id} className="hover:bg-muted/30">
                            <TableCell className="font-medium text-muted-foreground text-xs">
                                {format(new Date(loan.createdAt), "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                                ৳{loan.issuedAmount.toLocaleString("en-BD")}
                            </TableCell>
                            <TableCell className="text-right text-destructive font-bold">
                                ৳{loan.remainingPrincipal.toLocaleString("en-BD")}
                            </TableCell>
                            <TableCell className="text-center text-xs">
                                {Math.max(0, loan.totalMonths - loan.gracePeriodMonths)} EMI months
                                <span className="block text-[10px] text-muted-foreground">
                                    (+{loan.gracePeriodMonths} grace)
                                </span>
                                <span className="block text-[10px] text-muted-foreground">
                                    First: {format(
                                        loan.emiStartMonth && loan.emiStartYear
                                            ? new Date(loan.emiStartYear, loan.emiStartMonth - 1, 1)
                                            : new Date(new Date(loan.createdAt).getFullYear(), new Date(loan.createdAt).getMonth() + loan.gracePeriodMonths, 1),
                                        "MMM yyyy"
                                    )}
                                </span>
                                <span className="block text-[10px] text-muted-foreground">
                                    Ends: {format(
                                        (() => {
                                            const firstEmiDate = loan.emiStartMonth && loan.emiStartYear
                                                ? new Date(loan.emiStartYear, loan.emiStartMonth - 1, 1)
                                                : new Date(new Date(loan.createdAt).getFullYear(), new Date(loan.createdAt).getMonth() + loan.gracePeriodMonths, 1);
                                            const emiMonths = Math.max(1, loan.totalMonths - loan.gracePeriodMonths);
                                            return new Date(firstEmiDate.getFullYear(), firstEmiDate.getMonth() + emiMonths, 1);
                                        })(),
                                        "MMM yyyy"
                                    )}
                                </span>
                            </TableCell>
                            <TableCell className="text-right">
                                {loan.status === "ACTIVE" ? (
                                    <span className="text-green-600 font-semibold">
                                        ৳{(loan.emiState?.currentEmi || 0).toLocaleString("en-BD")}
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">-</span>
                                )}
                            </TableCell>
                            <TableCell className="text-center">
                                <div className="space-y-2">
                                    <LoanStatusBadge status={loan.status} />
                                    {loan.managerVerifiedBy && (
                                        <div className="text-[10px] text-muted-foreground">
                                            Checked by {loan.managerVerifiedBy.firstName} {loan.managerVerifiedBy.lastName}
                                        </div>
                                    )}
                                    {loan.status === "MANAGER_REJECTED" && loan.managerRejectionReason && (
                                        <div className="text-[10px] text-red-600 max-w-40 mx-auto">
                                            {loan.managerRejectionReason}
                                        </div>
                                    )}
                                    {loan.status === "DECLINED" && loan.adminDeclinedReason && (
                                        <div className="text-[10px] text-red-600 max-w-40 mx-auto">
                                            {loan.adminDeclinedReason}
                                        </div>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function LoanStatusBadge({ status }: { status: LoanStatus }) {
    const styles = {
        PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
        APPROVED: "bg-blue-100 text-blue-800 border-blue-200",
        ACTIVE: "bg-green-100 text-green-800 border-green-200",
        CLOSED: "bg-gray-100 text-gray-800 border-gray-200",
        DECLINED: "bg-red-100 text-red-800 border-red-200",
        MANAGER_VERIFIED: "bg-blue-100 text-blue-800 border-blue-200",
        MANAGER_REJECTED: "bg-orange-100 text-orange-800 border-orange-200",
    };

    return (
        <Badge variant="outline" className={`${styles[status]} font-normal uppercase tracking-wider text-[10px]`}>
            {status}
        </Badge>
    );
}
