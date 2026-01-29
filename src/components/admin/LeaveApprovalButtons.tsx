"use client";

import { useState } from "react";
import { approveLeaveApplication, rejectLeaveApplication } from "@/actions/leave.actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle } from "lucide-react";

interface ApprovalButtonsProps {
    applicationId: string;
}

export function ApprovalButtons({ applicationId }: ApprovalButtonsProps) {
    const [loading, setLoading] = useState(false);

    const handleApprove = async () => {
        setLoading(true);
        
        try {
            const result = await approveLeaveApplication(applicationId, "admin");
            
            if (result.success) {
                toast.success("Leave application approved successfully");
                // Refresh the page to update the list
                window.location.reload();
            } else {
                toast.error(result.error || "Failed to approve application");
            }
        } catch (error) {
            toast.error("An error occurred while approving");
        } finally {
            setLoading(false);
        }
    };

    const handleReject = async () => {
        if (!confirm("Are you sure you want to reject this leave application?")) {
            return;
        }

        setLoading(true);
        
        try {
            const result = await rejectLeaveApplication(applicationId, "admin");
            
            if (result.success) {
                toast.success("Leave application rejected");
                // Refresh the page to update the list
                window.location.reload();
            } else {
                toast.error(result.error || "Failed to reject application");
            }
        } catch (error) {
            toast.error("An error occurred while rejecting");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex gap-2">
            <Button
                size="sm"
                variant="outline"
                onClick={handleReject}
                disabled={loading}
                className="text-red-600 hover:bg-red-50"
            >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
            </Button>
            <Button
                size="sm"
                onClick={handleApprove}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
            >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
            </Button>
        </div>
    );
}