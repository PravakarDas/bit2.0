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
import { Plus, Edit2, Trash2 } from "lucide-react";
import { ValueType } from "@prisma/client";

interface Branch {
    id: string;
    name: string;
}

interface AllowanceDialogProps {
    branches: Branch[];
    initialData?: {
        id: string;
        name: string;
        type: ValueType;
        amount: number;
        branchIds: string[];
    };
    trigger?: React.ReactNode;
}

export function AllowanceDialog({ branches, initialData, trigger }: AllowanceDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: initialData?.name || "",
        type: (initialData?.type || "FIXED") as ValueType,
        amount: initialData?.amount || 0,
        branchIds: initialData?.branchIds || [] as string[],
    });

    // Reset form when initialData changes or dialog closes/opens
    useEffect(() => {
        if (isOpen) {
            setFormData({
                name: initialData?.name || "",
                type: (initialData?.type || "FIXED") as ValueType,
                amount: initialData?.amount || 0,
                branchIds: initialData?.branchIds || [] as string[],
            });
        }
    }, [isOpen, initialData]);

    const toggleBranch = (id: string) => {
        setFormData((prev) => ({
            ...prev,
            branchIds: prev.branchIds.includes(id)
                ? prev.branchIds.filter((bid) => bid !== id)
                : [...prev.branchIds, id],
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
                if (!initialData) setFormData({ name: "", type: "FIXED", amount: 0, branchIds: [] });
            } else {
                toast.error((res as any).error || "Failed to save allowance");
            }
        } catch (error) {
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
        } catch (error) {
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
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="type">Value Type</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(value: ValueType) =>
                                    setFormData({ ...formData, type: value })
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
                                placeholder="e.g. 5000"
                                value={formData.amount}
                                onChange={(e) =>
                                    setFormData({ ...formData, amount: Number(e.target.value) })
                                }
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label>Target Branches</Label>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            If none selected, it applies to ALL branches.
                        </p>
                        <div className="grid grid-cols-2 gap-3 border rounded-lg p-4 bg-muted/30">
                            {branches.map((branch) => (
                                <div key={branch.id} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`${initialData ? 'edit' : 'add'}-branch-${branch.id}`}
                                        checked={formData.branchIds.includes(branch.id)}
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
