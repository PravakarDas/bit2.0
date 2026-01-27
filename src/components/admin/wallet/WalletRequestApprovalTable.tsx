"use client";

import { useTransition } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { WalletRequest, User } from "@prisma/client";
import { updateWalletRequestStatus } from "@/actions/wallet.actions";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

interface WalletRequestWithUser extends WalletRequest {
    user: User;
}

interface WalletRequestApprovalTableProps {
    requests: WalletRequestWithUser[];
}

export function WalletRequestApprovalTable({ requests }: WalletRequestApprovalTableProps) {
    const [isPending, startTransition] = useTransition();

    const handleAction = (requestId: string, status: "APPROVED" | "REJECTED") => {
        startTransition(async () => {
            try {
                await updateWalletRequestStatus(requestId, status);
                toast.success(`Request ${status.toLowerCase()}`);
            } catch (error) {
                toast.error("Failed to update status");
                console.error(error);
            }
        });
    };

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {requests.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">No pending requests</TableCell>
                        </TableRow>
                    ) : (
                        requests.map((req) => (
                            <TableRow key={req.id}>
                                <TableCell>{req.user.email}</TableCell>
                                <TableCell>{format(new Date(req.createdAt), "PPP")}</TableCell>
                                <TableCell>{req.description}</TableCell>
                                <TableCell>৳{req.amount.toLocaleString("en-BD")}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary">
                                        {req.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right space-x-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 w-8 p-0 border-green-200 hover:bg-green-100 hover:text-green-600"
                                        onClick={() => handleAction(req.id, "APPROVED")}
                                        disabled={isPending}
                                    >
                                        <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 w-8 p-0 border-red-200 hover:bg-red-100 hover:text-red-600"
                                        onClick={() => handleAction(req.id, "REJECTED")}
                                        disabled={isPending}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
