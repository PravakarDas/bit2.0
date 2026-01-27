import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { WalletTransaction } from "@prisma/client";
import { cn } from "@/lib/utils";

interface WalletTransactionListProps {
    transactions: WalletTransaction[];
}

export function WalletTransactionList({ transactions }: WalletTransactionListProps) {
    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No transactions found</TableCell>
                        </TableRow>
                    ) : (
                        transactions.map((tx) => (
                            <TableRow key={tx.id}>
                                <TableCell>{format(new Date(tx.createdAt), "PPP")}</TableCell>
                                <TableCell className="capitalize">{tx.type.toLowerCase().replace("_", " ")}</TableCell>
                                <TableCell>{tx.description}</TableCell>
                                <TableCell className={cn("text-right font-medium", tx.amount > 0 ? "text-green-600" : "text-red-600")}>
                                    {tx.amount > 0 ? "+" : ""}৳{tx.amount.toLocaleString("en-BD")}
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
