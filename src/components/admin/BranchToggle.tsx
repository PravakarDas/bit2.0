"use client";

import { useState } from "react";
import { toggleBranchStatus } from "@/actions/branch.actions";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export function BranchToggle({
    branchId,
    initialStatus
}: {
    branchId: string;
    initialStatus: boolean
}) {
    const [isActive, setIsActive] = useState(initialStatus);
    const [loading, setLoading] = useState(false);

    const handleToggle = async (checked: boolean) => {
        setLoading(true);
        const res = await toggleBranchStatus(branchId, checked);
        if (res.success) {
            setIsActive(checked);
            toast.success(`Branch ${checked ? "activated" : "deactivated"} successfully`);
        } else {
            toast.error(res.error || "Failed to update status");
        }
        setLoading(false);
    };

    return (
        <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted-foreground">{isActive ? "Active" : "Inactive"}</span>
            <Switch
                checked={isActive}
                onCheckedChange={handleToggle}
                disabled={loading}
            />
        </div>
    );
}
