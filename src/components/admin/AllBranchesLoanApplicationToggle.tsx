"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { toggleAllBranchesLoanApplication } from "@/actions/branch.actions";

export function AllBranchesLoanApplicationToggle({
    branches,
}: {
    branches: Array<{ id: string; isLoanApplicationEnabled: boolean }>;
}) {
    const [loading, setLoading] = useState(false);

    const allEnabled = useMemo(
        () => branches.length > 0 && branches.every((branch) => branch.isLoanApplicationEnabled),
        [branches]
    );

    const allDisabled = useMemo(
        () => branches.length > 0 && branches.every((branch) => !branch.isLoanApplicationEnabled),
        [branches]
    );

    const hasBranches = branches.length > 0;

    const setAll = async (enabled: boolean) => {
        setLoading(true);
        const res = await toggleAllBranchesLoanApplication(enabled);
        if (res.success) {
            toast.success(`Loan applications ${enabled ? "enabled" : "disabled"} for all branches`);
        } else {
            toast.error(res.error || "Failed to update all branches");
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50 p-3">
            <div className="text-sm text-muted-foreground">
                {allEnabled
                    ? "All branches currently allow loan applications."
                    : allDisabled
                      ? "All branches currently block loan applications."
                      : "Mixed branch loan application settings."}
            </div>
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{allEnabled ? "On" : "Off"}</span>
                <Switch
                    checked={allEnabled}
                    onCheckedChange={setAll}
                    disabled={loading || !hasBranches}
                />
            </div>
        </div>
    );
}
