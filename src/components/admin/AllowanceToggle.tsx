"use client";

import { useState } from "react";
import { toggleAllowanceStatus } from "@/actions/settings.actions";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export function AllowanceToggle({
    allowanceId,
    initialStatus
}: {
    allowanceId: string;
    initialStatus: boolean
}) {
    const [isActive, setIsActive] = useState(initialStatus);
    const [loading, setLoading] = useState(false);

    const handleToggle = async (checked: boolean) => {
        setLoading(true);
        try {
            const res = await toggleAllowanceStatus(allowanceId, checked);
            if (res.success) {
                setIsActive(checked);
                toast.success(`Allowance ${checked ? "activated" : "deactivated"} successfully`);
            }
        } catch {
            toast.error("Failed to update status");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-end gap-2">
            <Switch
                checked={isActive}
                onCheckedChange={handleToggle}
                disabled={loading}
            />
        </div>
    );
}
