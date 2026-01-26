"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoanList } from "./LoanList";
import { LoanApplicationForm } from "./LoanApplicationForm";
import { CreditCard, Landmark, CalendarClock } from "lucide-react";

interface LoanDashboardProps {
    loans: any[];
    maxEligibleAmount: number;
}

export function LoanDashboard({ loans, maxEligibleAmount }: LoanDashboardProps) {
    const totalDebt = loans
        .filter(l => l.status === "ACTIVE")
        .reduce((sum, l) => sum + l.remainingPrincipal, 0);

    const nextEmi = loans
        .filter(l => l.status === "ACTIVE")
        .reduce((sum, l) => sum + (l.emiState?.currentEmi || 0), 0);

    return (
        <Tabs defaultValue="overview" className="space-y-6">
            <div className="flex justify-between items-center">
                <TabsList className="grid w-full max-w-[400px] grid-cols-3">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="history">My Loans</TabsTrigger>
                    <TabsTrigger value="apply">Apply Now</TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="overview" className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                    <Card className="bg-gradient-to-br from-red-50 to-white border-red-100">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-red-600">Total Active Debt</CardTitle>
                            <CreditCard className="h-4 w-4 text-red-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-red-700">৳{totalDebt.toLocaleString("en-BD")}</div>
                            <p className="text-xs text-muted-foreground mt-1">across {loans.filter(l => l.status === "ACTIVE").length} active loans</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-blue-600">Next EMI Due</CardTitle>
                            <Landmark className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-700">৳{nextEmi.toLocaleString("en-BD")}</div>
                            <p className="text-xs text-muted-foreground mt-1">Deducted from next payroll</p>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-green-50 to-white border-green-100">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-green-600">Available Limit</CardTitle>
                            <CalendarClock className="h-4 w-4 text-green-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-700">৳{maxEligibleAmount.toLocaleString("en-BD")}</div>
                            <p className="text-xs text-muted-foreground mt-1">Max eligible for new requests</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="pt-4">
                    <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                    <LoanList loans={loans.slice(0, 3)} />
                </div>
            </TabsContent>

            <TabsContent value="history">
                <LoanList loans={loans} />
            </TabsContent>

            <TabsContent value="apply">
                <div className="py-4">
                    <LoanApplicationForm maxEligibleAmount={maxEligibleAmount} />
                </div>
            </TabsContent>
        </Tabs>
    );
}
