"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface ArchiveInfoProps {
    archivedAt: Date | null | undefined;
    payrollContinuationMonths: number;
}

export function ArchiveInfo({ archivedAt, payrollContinuationMonths }: ArchiveInfoProps) {
    if (!archivedAt) {
        return null;
    }

    // Calculate the payroll cutoff date
    const cutoffDate = new Date(archivedAt);
    cutoffDate.setMonth(cutoffDate.getMonth() + payrollContinuationMonths);

    // Check if still in payroll continuation period
    const now = new Date();
    const isInPayrollPeriod = now <= cutoffDate;

    return (
        <Card className="border-amber-200 bg-amber-50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-900">
                    <AlertTriangle className="h-5 w-5" />
                    Archive Information
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-900">Archived Date</p>
                    <p className="text-sm text-amber-800">{formatDate(archivedAt)}</p>
                </div>

                <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-900">Payroll Continuation Months</p>
                    <p className="text-sm text-amber-800">{payrollContinuationMonths} month(s)</p>
                </div>

                <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-900">Payroll Cutoff Date</p>
                    <p className="text-sm text-amber-800">{formatDate(cutoffDate)}</p>
                </div>

                <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-900">Payroll Status</p>
                    <p className={`text-sm font-semibold ${isInPayrollPeriod ? "text-green-700" : "text-red-700"}`}>
                        {isInPayrollPeriod ? "✓ Active (payroll generating)" : "✗ Expired (payroll stopped)"}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
