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

import { ProcessEMIButton } from "@/components/admin/loans/ProcessEMIButton";

export default async function AdminLoansPage() {
    const allLoans = await getAllLoans();

    // Filter loans for tabs
    const pendingLoans = allLoans.filter(l => l.status === "PENDING");
    const activeLoans = allLoans.filter(l => l.status === "ACTIVE" || l.status === "CLOSED");

    return (
        <div className="container mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Loan Management</h1>
                    <p className="text-muted-foreground mt-1">
                        Review pending requests and monitor active loan portfolios.
                    </p>
                </div>
                <ProcessEMIButton />
            </div>

            <Tabs defaultValue="pending" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="pending">Pending Reviews ({pendingLoans.length})</TabsTrigger>
                    <TabsTrigger value="active">Active Portfolio ({activeLoans.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="pending">
                    <div className="border rounded-lg bg-card bg-white shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="font-semibold">User</TableHead>
                                    <TableHead className="font-semibold text-right">Requested Amount</TableHead>
                                    <TableHead className="font-semibold text-center">Date Requested</TableHead>
                                    <TableHead className="font-semibold text-right pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingLoans.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                                            No pending loan requests found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    pendingLoans.map((loan) => (
                                        <TableRow key={loan.id} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{loan.user.email}</span>
                                                    <span className="text-xs text-muted-foreground">ID: {loan.userId}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                ৳{loan.issuedAmount.toLocaleString("en-BD")}
                                            </TableCell>
                                            <TableCell className="text-center text-muted-foreground">
                                                {new Date(loan.createdAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <ApproveLoanDialog loan={loan as any} />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                <TabsContent value="active">
                    <div className="border rounded-lg bg-card bg-white shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead className="font-semibold">User</TableHead>
                                    <TableHead className="font-semibold text-right">Principal</TableHead>
                                    <TableHead className="font-semibold text-right">Remaining</TableHead>
                                    <TableHead className="font-semibold text-right">Current EMI</TableHead>
                                    <TableHead className="font-semibold text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {activeLoans.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                            No active loans found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    activeLoans.map((loan) => (
                                        <TableRow key={loan.id} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{loan.user.email}</span>
                                                    <span className="text-xs text-muted-foreground">Start: {loan.emiStartMonth}/{loan.emiStartYear}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums text-muted-foreground">
                                                ৳{loan.issuedAmount.toLocaleString("en-BD")}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums font-bold text-destructive">
                                                ৳{loan.remainingPrincipal.toLocaleString("en-BD")}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums text-green-600">
                                                ৳{(loan.emiState?.currentEmi || 0).toLocaleString("en-BD")}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="outline" className={loan.status === "ACTIVE" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-600"}>
                                                    {loan.status}
                                                </Badge>
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
