"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateEmployeeStatus } from "@/actions/employee.actions";
import { getArchiveWarningsData } from "@/actions/employee.actions";
import { EmployeeStatus } from "@prisma/client";
import { toast } from "sonner";
import { useState } from "react";
import { ArchiveWarningsModal } from "./ArchiveWarningsModal";
import { isArchivingTransition, getStatusLabel, getArchivedTypeStatuses, getActiveTypeStatuses } from "@/lib/employee-status";

interface EmployeeStatusSelectProps {
    employeeId: string;
    currentStatus: EmployeeStatus | null;
    employeeName?: string;
    onStatusChanged?: () => void;
}

export function EmployeeStatusSelect({ 
    employeeId, 
    currentStatus, 
    employeeName = "Employee",
    onStatusChanged 
}: EmployeeStatusSelectProps) {
    const [isUpdating, setIsUpdating] = useState(false);
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [pendingStatus, setPendingStatus] = useState<EmployeeStatus | null>(null);
    const [archiveWarnings, setArchiveWarnings] = useState<Awaited<ReturnType<typeof getArchiveWarningsData>>>({
        walletBalance: 0,
        loans: [],
    });

    const handleStatusChange = async (newStatus: EmployeeStatus) => {
        if (newStatus === currentStatus) return;

        // Check if this is an archiving transition
        if (isArchivingTransition(currentStatus, newStatus)) {
            // Fetch warnings data
            try {
                const warnings = await getArchiveWarningsData(employeeId);
                setArchiveWarnings(warnings);
                setPendingStatus(newStatus);
                setShowArchiveModal(true);
            } catch (error) {
                console.error("Failed to fetch archive warnings:", error);
                toast.error("Failed to fetch warning data");
            }
            return;
        }

        // For other status changes, apply directly
        await applyStatusChange(newStatus);
    };

    const applyStatusChange = async (newStatus: EmployeeStatus) => {
        setIsUpdating(true);
        try {
            const result = await updateEmployeeStatus(employeeId, newStatus);
            if (result.success) {
                toast.success(`Employee status updated to ${getStatusLabel(newStatus)}`);
                onStatusChanged?.();
            } else {
                toast.error(result.error || "Failed to update status");
            }
        } catch {
            toast.error("Failed to update status");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleArchiveConfirm = async () => {
        if (pendingStatus) {
            await applyStatusChange(pendingStatus);
            setShowArchiveModal(false);
            setPendingStatus(null);
        }
    };

    return (
        <>
            <Select 
                value={currentStatus || "ACTIVE"} 
                onValueChange={handleStatusChange}
                disabled={isUpdating}
            >
                <SelectTrigger className="w-40">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {/* Active Type Statuses */}
                    <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">Active Employees</div>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="PROBATION">Probation</SelectItem>

                    {/* Separator */}
                    <div className="my-1 h-px bg-gray-200" />

                    {/* Archived Type Statuses */}
                    <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">Archived Employees</div>
                    <SelectItem value="RESIGNED">Resigned</SelectItem>
                    <SelectItem value="TERMINATED">Terminated</SelectItem>
                    <SelectItem value="LAYOFF">Layoff</SelectItem>
                    <SelectItem value="RETIRED">Retired</SelectItem>
                    <SelectItem value="CONTRACT_ENDED">Contract Ended</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                    <SelectItem value="ABSCONDED">Absconded</SelectItem>
                </SelectContent>
            </Select>

            <ArchiveWarningsModal
                isOpen={showArchiveModal}
                employeeId={employeeId}
                employeeName={employeeName}
                walletBalance={archiveWarnings.walletBalance}
                loans={archiveWarnings.loans}
                onConfirm={handleArchiveConfirm}
                onCancel={() => {
                    setShowArchiveModal(false);
                    setPendingStatus(null);
                }}
                isLoading={isUpdating}
            />
        </>
    );
}