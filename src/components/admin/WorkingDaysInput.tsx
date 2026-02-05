"use client";

import { useState } from "react";
import { updateWorkingDaysInMonth } from "@/actions/employee.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface WorkingDaysInputProps {
    employeeId: string;
    currentWorkingDays: number | null;
}

export function WorkingDaysInput({ employeeId, currentWorkingDays }: WorkingDaysInputProps) {
    const [value, setValue] = useState(String(currentWorkingDays ?? 22));
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        const parsed = Number(value);
        if (Number.isNaN(parsed) || parsed < 0 || parsed > 31) {
            toast.error("Working days must be between 0 and 31");
            return;
        }

        setIsSaving(true);
        try {
            const result = await updateWorkingDaysInMonth(employeeId, parsed);
            if (result.success) {
                toast.success("Working days updated");
            } else {
                toast.error(result.error || "Failed to update working days");
            }
        } catch (error) {
            console.error("Failed to update working days:", error);
            toast.error("Failed to update working days");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <Input
                type="number"
                min={0}
                max={31}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="w-28"
            />
            <Button onClick={handleSave} disabled={isSaving} size="sm">
                {isSaving ? "Saving..." : "Save"}
            </Button>
        </div>
    );
}
