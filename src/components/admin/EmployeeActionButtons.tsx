"use client";

import { useState } from "react";
import { updateUserStatus } from "@/actions/employee.actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserStatus } from "@prisma/client";
import { Banknote, ShieldAlert, UserCheck, XCircle } from "lucide-react";
import Link from "next/link";

export function EmployeeActionButtons({
    userId,
    currentStatus
}: {
    userId: string,
    currentStatus: UserStatus
}) {
    const [loading, setLoading] = useState(false);

    const handleStatusUpdate = async (status: UserStatus) => {
        setLoading(true);
        const res = await updateUserStatus(userId, status);
        if (res.success) {
            toast.success(`User ${status.toLowerCase()} successfully`);
        } else {
            toast.error(res.error || "Failed to update status");
        }
        setLoading(false);
    };

    if (currentStatus === "APPROVED") {
        return (
            <div className="flex justify-end gap-2">
                <Link href={`/employees/${userId}/salary`}>
                    <Button variant="outline" size="sm">
                        <Banknote className="mr-2 h-4 w-4 text-green-600" />
                        Manage Salary
                    </Button>
                </Link>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => handleStatusUpdate("PENDING")}
                    disabled={loading}
                >
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    Suspend
                </Button>
            </div>
        );
    }

    return (
        <div className="flex justify-end gap-2">
            <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => toast.info("Rejection logic pending")}
                disabled={loading}
            >
                <XCircle className="mr-1 h-4 w-4" />
                Reject
            </Button>
            <Button
                size="sm"
                onClick={() => handleStatusUpdate("APPROVED")}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
            >
                <UserCheck className="mr-1 h-4 w-4" />
                Approve
            </Button>
        </div>
    );
}
