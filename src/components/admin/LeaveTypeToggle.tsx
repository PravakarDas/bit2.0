"use client";

import { useState } from "react";
import { toggleLeaveTypeStatus } from "@/actions/leave.actions";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface LeaveTypeToggleProps {
    leaveTypeId: string;
    isActive: boolean;
}

export function LeaveTypeToggle({ leaveTypeId, isActive }: LeaveTypeToggleProps) {
    const [loading, setLoading] = useState(false);

    const handleToggle = async (checked: boolean) => {
        setLoading(true);
        
        try {
            const result = await toggleLeaveTypeStatus(leaveTypeId);
            
            if (result.success) {
                toast.success(`Leave type ${checked ? 'activated' : 'deactivated'} successfully`);
            } else {
                toast.error(result.error || "Failed to update leave type status");
            }
        } catch {
            toast.error("An error occurred while updating status");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Switch
            checked={isActive}
            onCheckedChange={handleToggle}
            disabled={loading}
        />
    );
}