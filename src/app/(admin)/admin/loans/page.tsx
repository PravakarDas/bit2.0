"use client";

import { useEffect, useState } from "react";
import { getAllLoans } from "@/actions/loan.actions";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ApproveLoanDialog } from "@/components/admin/ApproveLoanDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { ProcessEMIButton } from "@/components/admin/loans/ProcessEMIButton";
import { EmiManageDialog } from "@/components/admin/EmiManageDialog";

interface Loan {
    id: string;
    issuedAmount: number;
    remainingPrincipal: number;
    status: string;
    createdAt: Date;
    userId: string;
    user: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
        phoneNumber: string;
        baseSalary: number;
        walletBalance: number;
        dateOfJoining: Date;
        department: { name: string } | null;
        designation: { name: string } | null;
        branch: { name: string } | null;
    };
    emiState: {
        currentEmi: number;
        carryForward: number;
    } | null;
}

export default function AdminLoansPage() {
    const [allLoans, setAllLoans] = useState<Loan[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadLoans = async () => {
        try {
            setRefreshing(true);
            const loans = await getAllLoans();
            setAllLoans(loans as Loan[]);
        } catch (error) {
            console.error("Failed to load loans:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadLoans();
    }, []);

    const handleApprovalSuccess = () => {
        loadLoans();
    };

    const getEmployeeName = (user: any) => {
        return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    };

    // Filter loans for tabs
    const pendingLoans = allLoans.filter(l => l.status === "PENDING");
    const activeLoans = allLoans.filter(l => l.status === "ACTIVE" || l.status === "CLOSED");

    if (loading) {
        return (
            <div className="container mx-auto py-10 px-4">
                <div className="flex items-center justify-center min-h-100">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                        <p className="mt-2 text-sm text-muted-foreground">Loading loans...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Loan Management</h1>
                    <p className="text-muted-foreground mt-1">
                        Review pending requests and monitor active loan portfolios.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={loadLoans}
                        disabled={refreshing}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <ProcessEMIButton />
                </div>
            </div>

            <Tabs defaultValue="pending" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="pending">Pending Reviews ({pendingLoans.length})</TabsTrigger>
                    <TabsTrigger value="active">Active Portfolio ({activeLoans.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="pending">
                    <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="font-semibold">Employee</TableHead>
                                    <TableHead className="font-semibold">Department</TableHead>
                                    <TableHead className="font-semibold text-right">Requested Amount</TableHead>
                                    <TableHead className="font-semibold text-right">Base Salary</TableHead>
                                    <TableHead className="font-semibold text-center">Date Requested</TableHead>
                                    <TableHead className="font-semibold text-right pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingLoans.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                            No pending loan requests found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pendingLoans.map((loan) => (
                                        <TableRow key={loan.id} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{getEmployeeName(loan.user)}</span>
                                                    <span className="text-xs text-muted-foreground">{loan.user.email}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm">
                                                    <div>{loan.user.department?.name || 'N/A'}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {loan.user.designation?.name || 'N/A'}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums font-medium">
                                                ৳{loan.issuedAmount.toLocaleString("en-BD")}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                ৳{loan.user.baseSalary.toLocaleString("en-BD")}
                                            </TableCell>
                                            <TableCell className="text-center text-muted-foreground text-sm">
                                                {new Date(loan.createdAt).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric'
                                                })}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <ApproveLoanDialog 
                                                    loan={loan as any} 
                                                    onApprovalSuccess={handleApprovalSuccess}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                <TabsContent value="active">
                    <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="font-semibold">Employee</TableHead>
                                    <TableHead className="font-semibold">Department</TableHead>
                                    <TableHead className="font-semibold text-right">Principal</TableHead>
                                    <TableHead className="font-semibold text-right">Remaining</TableHead>
                                    <TableHead className="font-semibold text-right">Current EMI</TableHead>
                                    <TableHead className="font-semibold text-center">Status</TableHead>
                                    <TableHead className="font-semibold text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activeLoans.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                            No active loans found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    activeLoans.map((loan) => (
                                        <TableRow key={loan.id} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{getEmployeeName(loan.user)}</span>
                                                    <span className="text-xs text-muted-foreground">{loan.user.email}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm">
                                                    <div>{loan.user.department?.name || 'N/A'}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {loan.user.designation?.name || 'N/A'}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                ৳{loan.issuedAmount.toLocaleString("en-BD")}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                ৳{loan.remainingPrincipal.toLocaleString("en-BD")}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                ৳{loan.emiState?.currentEmi?.toLocaleString("en-BD") || "0"}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge 
                                                    variant={loan.status === "ACTIVE" ? "default" : "secondary"}
                                                    className={loan.status === "ACTIVE" ? "bg-green-100 text-green-800" : ""}
                                                >
                                                    {loan.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <EmiManageDialog loan={loan} />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
