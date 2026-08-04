"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { toggleBranchLoanApplication } from "@/actions/branch.actions";

export function BranchLoanApplicationToggle({
    branchId,
    initialStatus,
}: {
    branchId: string;
    initialStatus: boolean;
}) {
    const [isEnabled, setIsEnabled] = useState(initialStatus);
    const [loading, setLoading] = useState(false);

    const handleToggle = async (checked: boolean) => {
        setLoading(true);
        const res = await toggleBranchLoanApplication(branchId, checked);
        if (res.success) {
            setIsEnabled(checked);
            toast.success(`Loan applications ${checked ? "enabled" : "disabled"} for this branch`);
        } else {
            toast.error(res.error || "Failed to update loan application setting");
        }
        setLoading(false);
    };

    return (
        <div className="flex items-center justify-center gap-1.5">
            <span className="text-xs text-muted-foreground">{isEnabled ? "On" : "Off"}</span>
            <Switch
                checked={isEnabled}
                onCheckedChange={handleToggle}
                disabled={loading}
                aria-label="Toggle loan applications for this branch"
            />
        </div>
    );
}
