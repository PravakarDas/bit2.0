import { getPendingLoans } from "@/actions/loan.actions";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ApproveLoanDialog } from "@/components/admin/ApproveLoanDialog";

export default async function AdminLoansPage() {
    const pendingLoans = await getPendingLoans();

    return (
        <div className="container mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Loan Management</h1>
                    <p className="text-muted-foreground mt-1">
                        Review and approve pending loan requests from employees.
                    </p>
                </div>
            </div>

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
        </div>
    );
}
