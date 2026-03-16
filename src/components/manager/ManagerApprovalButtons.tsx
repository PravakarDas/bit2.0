"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { approveEmployeeAsManager } from "@/actions/manager.actions";
import { rejectEmployee } from "@/actions/employee.actions";

interface ManagerApprovalButtonsProps {
  employeeId: string;
}

export function ManagerApprovalButtons({ employeeId }: ManagerApprovalButtonsProps) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const handleApprove = async () => {
    if (!confirm("Are you sure you want to approve this employee?")) {
      return;
    }

    setApproving(true);
    try {
      const result = await approveEmployeeAsManager(employeeId);
      if (result.success) {
        toast.success("Employee approved successfully");
      } else {
        toast.error(result.error || "Failed to approve employee");
      }
    } catch (error) {
      console.error("Manager failed to approve employee:", error);
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
      console.error("Manager failed to reject employee:", error);
      toast.error("Failed to reject employee");
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button 
        size="sm" 
        disabled={rejecting || approving}
        onClick={handleApprove}
        className="bg-green-600 hover:bg-green-700"
      >
        {approving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="ml-1">Approving...</span>
          </>
        ) : (
          <>
            <Check className="h-4 w-4" />
            <span className="ml-1">Accept</span>
          </>
        )}
      </Button>
      <Button 
        size="sm" 
        variant="destructive"
        onClick={handleReject}
        disabled={approving || rejecting}
      >
        {rejecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <X className="h-4 w-4" />
        )}
        <span className="ml-1">Reject</span>
      </Button>
    </div>
  );
}
