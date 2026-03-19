"use client";

import { useState, useEffect } from "react";
import { createAllowanceType, updateAllowanceType, deleteAllowanceType } from "@/actions/settings.actions";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { ValueType, AllowanceScope } from "@prisma/client";

interface Branch {
    id: string;
    name: string;
}

interface AllowanceDialogProps {
    branches: Branch[];
    initialData?: {
        id: string;
        name: string;
        valueType: ValueType;
        scope: AllowanceScope;
        amount: number;
        targetBranchIds: string[];
    };
    trigger?: React.ReactNode;
}

export function AllowanceDialog({ branches, initialData, trigger }: AllowanceDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: initialData?.name || "",
        valueType: (initialData?.valueType || "FIXED") as ValueType,
        scope: (initialData?.scope || "FIXED") as AllowanceScope,
        amount: initialData?.amount || 0,
        targetBranchIds: initialData?.targetBranchIds || [] as string[],
    });

    // Reset form when initialData changes or dialog closes/opens
    useEffect(() => {
        if (isOpen) {
            setFormData({
                name: initialData?.name || "",
                valueType: (initialData?.valueType || "FIXED") as ValueType,
                scope: (initialData?.scope || "FIXED") as AllowanceScope,
                amount: initialData?.amount || 0,
                targetBranchIds: initialData?.targetBranchIds || [] as string[],
            });
        }
    }, [isOpen, initialData]);

    const toggleBranch = (id: string) => {
        setFormData((prev) => ({
            ...prev,
            targetBranchIds: prev.targetBranchIds.includes(id)
                ? prev.targetBranchIds.filter((bid) => bid !== id)
                : [...prev.targetBranchIds, id],
        }));
    };

    const handleSubmit = async () => {
        if (!formData.name || formData.amount < 0) {
            toast.error("Please fill in all fields correctly");
            return;
        }

        setLoading(true);
        try {
            const res = initialData
                ? await updateAllowanceType(initialData.id, formData)
                : await createAllowanceType(formData);

            if (res.success) {
                toast.success(`Allowance ${initialData ? "updated" : "created"} successfully`);
                setIsOpen(false);
                if (!initialData) setFormData({ 
                    name: "", 
                    valueType: "FIXED", 
                    scope: "FIXED", 
                    amount: 0, 
                    targetBranchIds: [] 
                });
            } else {
                toast.error(("error" in res && typeof res.error === "string" ? res.error : undefined) || "Failed to save allowance");
            }
        } catch {
            toast.error("An error occurred");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!initialData) return;
        if (!confirm("Are you sure you want to delete this allowance type?")) return;

        setLoading(true);
        try {
            const res = await deleteAllowanceType(initialData.id);
            if (res.success) {
                toast.success("Allowance deleted successfully");
                setIsOpen(false);
            }
        } catch {
            toast.error("Delete failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> Add Allowance
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{initialData ? "Modify Allowance Type" : "Add New Allowance Type"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Allowance Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g. Travel Allowance"
                            value={formData.name}
                            onChange={(e) =>
                                setFormData({ ...formData, name: e.target.value })
                            }
                        />
                    </div>
                    
                    <div className="grid gap-2">
                        <Label htmlFor="scope">Allowance Scope</Label>
                        <Select
                            value={formData.scope}
                            onValueChange={(value: AllowanceScope) =>
                                setFormData({ ...formData, scope: value, targetBranchIds: value !== "FULL_BRANCH" ? [] : formData.targetBranchIds })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select scope" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="FIXED">All Employees (Company-wide)</SelectItem>
                                <SelectItem value="FULL_BRANCH">Branch-specific</SelectItem>
                                <SelectItem value="CUSTOM">Individual Assignment</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                            {formData.scope === "FIXED" && "Applied to all employees automatically"}
                            {formData.scope === "FULL_BRANCH" && "Applied to all employees in selected branches"}
                            {formData.scope === "CUSTOM" && "Manually assigned to specific employees"}
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="valueType">Value Type</Label>
                            <Select
                                value={formData.valueType}
                                onValueChange={(value: ValueType) =>
                                    setFormData({ ...formData, valueType: value })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="FIXED">Fixed Amount</SelectItem>
                                    <SelectItem value="PERCENTAGE">Percentage of Salary</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="amount">Value</Label>
                            <Input
                                id="amount"
                                type="number"
                                placeholder={formData.valueType === "FIXED" ? "e.g. 5000" : "e.g. 10"}
                                value={formData.amount}
                                onChange={(e) =>
                                    setFormData({ ...formData, amount: Number(e.target.value) })
                                }
                            />
                        </div>
                    </div>

                    {formData.scope === "FULL_BRANCH" && (
                        <div className="space-y-3">
                            <Label>Target Branches</Label>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                Select branches where this allowance will apply to all employees.
                            </p>
                            <div className="grid grid-cols-2 gap-3 border rounded-lg p-4 bg-muted/30">
                                {branches.map((branch) => (
                                    <div key={branch.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`${initialData ? 'edit' : 'add'}-branch-${branch.id}`}
                                            checked={formData.targetBranchIds.includes(branch.id)}
                                            onCheckedChange={() => toggleBranch(branch.id)}
                                        />
                                        <label
                                            htmlFor={`${initialData ? 'edit' : 'add'}-branch-${branch.id}`}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                        >
                                            {branch.name}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter className="flex justify-between items-center sm:justify-between">
                    {initialData ? (
                        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={loading}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </Button>
                    ) : <div />}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setIsOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSubmit} disabled={loading}>
                            {loading ? "Saving..." : initialData ? "Update Allowance" : "Create Allowance"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
