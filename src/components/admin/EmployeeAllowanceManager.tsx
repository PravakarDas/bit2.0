"use client";

import { useState, useEffect, useCallback } from "react";
import { 
    getEmployeeAllowances, 
    getCustomAllowancesForEmployee, 
    assignEmployeeAllowance, 
    removeEmployeeAllowance 
} from "@/actions/settings.actions";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, X, DollarSign } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface EmployeeAllowanceManagerProps {
    userId: string;
    userName: string;
}

type EmployeeAllowance = {
    id: string;
    isActive: boolean;
    allowance: {
        id: string;
        name: string;
        amount: number;
        valueType: string;
        scope: string;
    };
};

type CustomAllowance = {
    id: string;
    name: string;
    amount: number;
    valueType: string;
};

export function EmployeeAllowanceManager({ userId, userName }: EmployeeAllowanceManagerProps) {
    const [employeeAllowances, setEmployeeAllowances] = useState<EmployeeAllowance[]>([]);
    const [availableAllowances, setAvailableAllowances] = useState<CustomAllowance[]>([]);
    const [selectedAllowanceId, setSelectedAllowanceId] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [employeeAlloData, customAlloData] = await Promise.all([
                getEmployeeAllowances(userId),
                getCustomAllowancesForEmployee(userId)
            ]);
            
            setEmployeeAllowances(employeeAlloData);
            setAvailableAllowances(customAlloData);
        } catch {
            toast.error("Failed to load allowance data");
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleAssignAllowance = async () => {
        if (!selectedAllowanceId) {
            toast.error("Please select an allowance to assign");
            return;
        }

        setAdding(true);
        try {
            const res = await assignEmployeeAllowance(userId, selectedAllowanceId);
            if (res.success) {
                toast.success("Allowance assigned successfully");
                setSelectedAllowanceId("");
                await loadData();
            } else {
                toast.error(res.error || "Failed to assign allowance");
            }
        } catch {
            toast.error("An error occurred");
        } finally {
            setAdding(false);
        }
    };

    const handleRemoveAllowance = async (allowanceId: string, allowanceName: string) => {
        if (!confirm(`Remove ${allowanceName} allowance from ${userName}?`)) return;

        try {
            const res = await removeEmployeeAllowance(userId, allowanceId);
            if (res.success) {
                toast.success("Allowance removed successfully");
                await loadData();
            } else {
                toast.error(res.error || "Failed to remove allowance");
            }
        } catch {
            toast.error("An error occurred");
        }
    };

    const assignedAllowanceIds = employeeAllowances
        .filter(ea => ea.isActive)
        .map(ea => ea.allowance.id);
    
    const unassignedAllowances = availableAllowances.filter(
        allowance => !assignedAllowanceIds.includes(allowance.id)
    );

    if (loading) return <div>Loading allowances...</div>;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                    <div>
                        <CardTitle>Custom Allowances</CardTitle>
                        <CardDescription>
                            Individual allowances assigned to {userName}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Add New Allowance */}
                {unassignedAllowances.length > 0 && (
                    <div className="flex gap-2">
                        <Select value={selectedAllowanceId} onValueChange={setSelectedAllowanceId}>
                            <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select allowance to assign" />
                            </SelectTrigger>
                            <SelectContent>
                                {unassignedAllowances.map((allowance) => (
                                    <SelectItem key={allowance.id} value={allowance.id}>
                                        {allowance.name} ({allowance.valueType === "FIXED" 
                                            ? `৳${allowance.amount.toLocaleString("en-BD")}`
                                            : `${allowance.amount}%`})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button 
                            onClick={handleAssignAllowance} 
                            disabled={adding || !selectedAllowanceId}
                        >
                            <Plus className="h-4 w-4" />
                            {adding ? "Adding..." : "Assign"}
                        </Button>
                    </div>
                )}

                {/* Current Allowances */}
                <div className="space-y-2">
                    {employeeAllowances.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No custom allowances assigned
                        </p>
                    ) : (
                        employeeAllowances
                            .filter(ea => ea.isActive)
                            .map((employeeAllowance) => (
                                <div
                                    key={employeeAllowance.id}
                                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <div>
                                            <p className="font-medium">{employeeAllowance.allowance.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {employeeAllowance.allowance.valueType === "FIXED"
                                                    ? `৳${employeeAllowance.allowance.amount.toLocaleString("en-BD")}`
                                                    : `${employeeAllowance.allowance.amount}% of salary`}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveAllowance(
                                            employeeAllowance.allowance.id,
                                            employeeAllowance.allowance.name
                                        )}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))
                    )}
                </div>

                {unassignedAllowances.length === 0 && employeeAllowances.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        No custom allowance types available. Create some in Organization → Allowances.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}