"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateEmployeeStatus } from "@/actions/employee.actions";
import { EmployeeStatus } from "@prisma/client";
import { toast } from "sonner";
import { useState } from "react";

interface EmployeeStatusSelectProps {
    employeeId: string;
    currentStatus: EmployeeStatus | null;
}

export function EmployeeStatusSelect({ employeeId, currentStatus }: EmployeeStatusSelectProps) {
    const [isUpdating, setIsUpdating] = useState(false);

    const handleStatusChange = async (newStatus: EmployeeStatus) => {
        if (newStatus === currentStatus) return;

        if (newStatus === "RESIGNED" || newStatus === "TERMINATED") {
            if (!confirm(`Are you sure you want to change status to ${newStatus}? This will archive the employee.`)) {
                return;
            }
        }

        setIsUpdating(true);
        try {
            const result = await updateEmployeeStatus(employeeId, newStatus);
            if (result.success) {
                toast.success(`Employee status updated to ${newStatus}`);
                if (newStatus === "RESIGNED" || newStatus === "TERMINATED") {
                    toast.info("Employee has been moved to archive");
                }
            } else {
                toast.error(result.error || "Failed to update status");
            }
        } catch (error) {
            toast.error("Failed to update status");
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <Select 
            value={currentStatus || "ACTIVE"} 
            onValueChange={handleStatusChange}
            disabled={isUpdating}
        >
            <SelectTrigger className="w-32">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PROBATION">Probation</SelectItem>
                <SelectItem value="RESIGNED">Resigned</SelectItem>
                <SelectItem value="TERMINATED">Terminated</SelectItem>
            </SelectContent>
        </Select>
    );
}