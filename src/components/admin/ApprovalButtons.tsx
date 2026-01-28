"use client";

import { Button } from "@/components/ui/button";
import { approveEmployee, rejectEmployee } from "@/actions/employee.actions";
import { toast } from "sonner";
import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";

interface ApprovalButtonsProps {
    employeeId: string;
}

export function ApprovalButtons({ employeeId }: ApprovalButtonsProps) {
    const [approving, setApproving] = useState(false);
    const [rejecting, setRejecting] = useState(false);

    const handleApprove = async () => {
        setApproving(true);
        try {
            const result = await approveEmployee(employeeId);
            if (result.success) {
                toast.success("Employee approved successfully");
            } else {
                toast.error(result.error || "Failed to approve employee");
            }
        } catch (error) {
            toast.error("Failed to approve employee");
        } finally {
            setApproving(false);
        }
    };

    const handleReject = async () => {
        if (!confirm("Are you sure you want to reject this employee? This action cannot be undone.")) {
            return;
        }

        setRejecting(true);
        try {
            const result = await rejectEmployee(employeeId);
            if (result.success) {
                toast.success("Employee rejected and removed");
            } else {
                toast.error(result.error || "Failed to reject employee");
            }
        } catch (error) {
            toast.error("Failed to reject employee");
        } finally {
            setRejecting(false);
        }
    };

    return (
        <div className="flex gap-2">
            <Button 
                size="sm" 
                onClick={handleApprove}
                disabled={approving || rejecting}
                className="bg-green-600 hover:bg-green-700"
            >
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Accept
            </Button>
            <Button 
                size="sm" 
                variant="destructive"
                onClick={handleReject}
                disabled={approving || rejecting}
            >
                {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Reject
            </Button>
        </div>
    );
}