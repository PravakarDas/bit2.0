"use client";

import { useState } from "react";
import { assignBranch } from "@/actions/employee.actions";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Branch {
    id: string;
    name: string;
}

export function AssignBranchSelect({
    userId,
    currentBranchId,
    branches
}: {
    userId: string;
    currentBranchId: string | null;
    branches: Branch[]
}) {
    const [loading, setLoading] = useState(false);

    const handleBranchChange = async (branchId: string) => {
        setLoading(true);
        const id = branchId === "none" ? null : branchId;
        const res = await assignBranch(userId, id);
        if (res.success) {
            toast.success("Branch assigned successfully");
        } else {
            toast.error(res.error || "Failed to assign branch");
        }
        setLoading(false);
    };

    return (
        <Select
            defaultValue={currentBranchId || "none"}
            onValueChange={handleBranchChange}
            disabled={loading}
        >
            <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="none">Not Assigned</SelectItem>
                {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
