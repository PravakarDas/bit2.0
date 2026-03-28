"use client";

import { useState } from "react";
import { createBonusType } from "@/actions/bonus.actions";
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
import { Plus } from "lucide-react";
import { ValueType } from "@prisma/client";

interface Branch {
    id: string;
    name: string;
}

export function AddBonusDialog({ branches }: { branches: Branch[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        type: "FIXED" as ValueType,
        value: 0,
        branchIds: [] as string[],
    });

    const toggleBranch = (id: string) => {
        setFormData((prev) => ({
            ...prev,
            branchIds: prev.branchIds.includes(id)
                ? prev.branchIds.filter((bid) => bid !== id)
                : [...prev.branchIds, id],
        }));
    };

    const handleSubmit = async () => {
        if (!formData.name || formData.value <= 0) {
            toast.error("Please fill in all fields correctly");
            return;
        }

        setLoading(true);
        const res = await createBonusType(formData);
        if (res.success) {
            toast.success("Bonus type created successfully");
            setIsOpen(false);
            setFormData({ name: "", type: "FIXED", value: 0, branchIds: [] });
        } else {
            toast.error(("error" in res && typeof res.error === "string" ? res.error : undefined) || "Failed to create bonus type");
        }
        setLoading(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" /> Add Bonus
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Add New Bonus Type</DialogTitle>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Bonus Name</Label>
                        <Input
                            id="name"
                            placeholder="e.g. Festival Bonus"
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
                            <Label htmlFor="value">Value</Label>
                            <Input
                                id="value"
                                type="number"
                                placeholder="e.g. 5000"
                                value={formData.value}
                                onChange={(e) =>
                                    setFormData({ ...formData, value: Number(e.target.value) })
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
                                        id={`bonus-branch-${branch.id}`}
                                        checked={formData.branchIds.includes(branch.id)}
                                        onCheckedChange={() => toggleBranch(branch.id)}
                                    />
                                    <label
                                        htmlFor={`bonus-branch-${branch.id}`}
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        {branch.name}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading}>
                        {loading ? "Creating..." : "Create Bonus"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
