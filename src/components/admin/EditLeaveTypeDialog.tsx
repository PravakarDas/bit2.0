"use client";

import { useState } from "react";
import { updateLeaveType } from "@/actions/leave.actions";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings } from "lucide-react";

interface Branch {
    id: string;
    name: string;
}

interface LeaveType {
    id: string;
    name: string;
    allocatedDays: number;
    requiresApproval: boolean;
    applicableBranches: string;
    isActive: boolean;
}

interface EditLeaveTypeDialogProps {
    leaveType: LeaveType;
    branches: Branch[];
}

export function EditLeaveTypeDialog({ leaveType, branches }: EditLeaveTypeDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: leaveType.name,
        allocatedDays: leaveType.allocatedDays.toString(),
        requiresApproval: leaveType.requiresApproval,
        selectedBranches: JSON.parse(leaveType.applicableBranches || '[]') as string[]
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name.trim()) {
            toast.error("Leave type name is required");
            return;
        }
        
        if (!formData.allocatedDays || parseInt(formData.allocatedDays) <= 0) {
            toast.error("Please enter a valid number of days");
            return;
        }

        setLoading(true);
        
        try {
            const result = await updateLeaveType(leaveType.id, {
                name: formData.name.trim(),
                allocatedDays: parseInt(formData.allocatedDays),
                requiresApproval: formData.requiresApproval,
                applicableBranches: formData.selectedBranches
            });
            
            if (result.success) {
                toast.success("Leave type updated successfully");
                setIsOpen(false);
            } else {
                toast.error(result.error || "Failed to update leave type");
            }
        } catch (error) {
            toast.error("An error occurred while updating leave type");
        } finally {
            setLoading(false);
        }
    };

    const handleBranchToggle = (branchId: string) => {
        setFormData(prev => ({
            ...prev,
            selectedBranches: prev.selectedBranches.includes(branchId)
                ? prev.selectedBranches.filter(id => id !== branchId)
                : [...prev.selectedBranches, branchId]
        }));
    };

    const selectAllBranches = () => {
        setFormData(prev => ({
            ...prev,
            selectedBranches: branches.map(branch => branch.id)
        }));
    };

    const clearAllBranches = () => {
        setFormData(prev => ({
            ...prev,
            selectedBranches: []
        }));
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Settings className="mr-2 h-4 w-4" />
                    Edit
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Edit Leave Type</DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Leave Type Name</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g., Annual Leave, Sick Leave"
                                required
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="allocatedDays">Days per Year</Label>
                            <Input
                                id="allocatedDays"
                                type="number"
                                min="1"
                                max="365"
                                value={formData.allocatedDays}
                                onChange={(e) => setFormData({ ...formData, allocatedDays: e.target.value })}
                                placeholder="Enter number of days"
                                required
                            />
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="requiresApproval"
                                checked={formData.requiresApproval}
                                onCheckedChange={(checked) => 
                                    setFormData({ ...formData, requiresApproval: !!checked })
                                }
                            />
                            <Label htmlFor="requiresApproval" className="text-sm">
                                Requires admin approval
                            </Label>
                        </div>

                        <div className="grid gap-2">
                            <Label>Applicable Branches</Label>
                            <div className="flex gap-2 mb-2">
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={selectAllBranches}
                                >
                                    Select All
                                </Button>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={clearAllBranches}
                                >
                                    Clear All
                                </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded p-2">
                                {branches.map((branch) => (
                                    <div key={branch.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`edit-branch-${branch.id}`}
                                            checked={formData.selectedBranches.includes(branch.id)}
                                            onCheckedChange={() => handleBranchToggle(branch.id)}
                                        />
                                        <Label htmlFor={`edit-branch-${branch.id}`} className="text-sm">
                                            {branch.name}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Select which branches can use this leave type. Leave empty for no restrictions.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => setIsOpen(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Updating..." : "Update Leave Type"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}