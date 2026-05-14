"use client";

import { Badge } from "@/components/ui/badge";
import { EmployeeStatus } from "@prisma/client";
import { getStatusLabel, getStatusBadgeVariant } from "@/lib/employee-status";

interface EmployeeStatusBadgeProps {
    status: EmployeeStatus | null | undefined;
    showLabel?: boolean;
}

export function EmployeeStatusBadge({ status, showLabel = true }: EmployeeStatusBadgeProps) {
    const label = getStatusLabel(status);
    const variant = getStatusBadgeVariant(status);

    return (
        <Badge variant={variant} className="font-medium">
            {showLabel ? label : status}
        </Badge>
    );
}
