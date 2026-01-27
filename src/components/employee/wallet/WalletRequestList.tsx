import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { WalletRequest } from "@prisma/client";

interface WalletRequestListProps {
    requests: WalletRequest[];
}

export function WalletRequestList({ requests }: WalletRequestListProps) {
    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {requests.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">No requests found</TableCell>
                        </TableRow>
                    ) : (
                        requests.map((req) => (
                            <TableRow key={req.id}>
                                <TableCell>{format(new Date(req.createdAt), "PPP")}</TableCell>
                                <TableCell>{req.description}</TableCell>
                                <TableCell>৳{req.amount.toLocaleString("en-BD")}</TableCell>
                                <TableCell>
                                    <Badge variant={req.status === "APPROVED" ? "default" : req.status === "REJECTED" ? "destructive" : "secondary"}>
                                        {req.status}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
