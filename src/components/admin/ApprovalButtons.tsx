"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { approveEmployeeWithDetails, rejectEmployee } from "@/actions/employee.actions";
import { getActiveBranches } from "@/actions/branch.actions";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Check, X, Loader2 } from "lucide-react";

interface ApprovalButtonsProps {
    employeeId: string;
}

interface Branch {
    id: string;
    name: string;
}

export function ApprovalButtons({ employeeId }: ApprovalButtonsProps) {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [branchId, setBranchId] = useState<string>("");
    const [baseSalary, setBaseSalary] = useState<string>("");
    const [open, setOpen] = useState(false);
    const [approving, setApproving] = useState(false);
    const [rejecting, setRejecting] = useState(false);

    useEffect(() => {
        const loadBranches = async () => {
            const data = await getActiveBranches();
            setBranches(data);
        };
        loadBranches();
    }, []);

    const handleApprove = async () => {
        if (!branchId) {
            toast.error("Please select a branch");
            return;
        }
        if (!baseSalary || Number(baseSalary) <= 0) {
            toast.error("Please enter a valid base salary");
            return;
        }

        setApproving(true);
        try {
            const result = await approveEmployeeWithDetails(employeeId, branchId, Number(baseSalary));
            if (result.success) {
                toast.success("Employee approved successfully");
                setOpen(false);
                setBranchId("");
                setBaseSalary("");
            } else {
                toast.error(result.error || "Failed to approve employee");
            }
        } catch {
            toast.error("Failed to approve employee");
        } finally {
            setApproving(false);
        }
    };

    const handleReject = async () => {
        if (!confirm("Are you sure you want to reject this employee? This action cannot be undone.")) {
            return;
        }

        setRejecting(true);
        try {
            const result = await rejectEmployee(employeeId);
            if (result.success) {
                toast.success("Employee rejected and removed");
            } else {
                toast.error(result.error || "Failed to reject employee");
            }
        } catch {
            toast.error("Failed to reject employee");
        } finally {
            setRejecting(false);
        }
    };

    return (
        <div className="flex gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button 
                        size="sm" 
                        disabled={rejecting}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        <Check className="h-4 w-4" />
                        Accept
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Approve Employee</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="branch">Branch <span className="text-red-500">*</span></Label>
                            <Select value={branchId} onValueChange={setBranchId}>
                                <SelectTrigger id="branch">
                                    <SelectValue placeholder="Select branch" />
                                </SelectTrigger>
                                <SelectContent>
                                    {branches.map(branch => (
                                        <SelectItem key={branch.id} value={branch.id}>
                                            {branch.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="baseSalary">Base Salary <span className="text-red-500">*</span></Label>
                            <Input
                                id="baseSalary"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Enter base salary"
                                value={baseSalary}
                                onChange={(e) => setBaseSalary(e.target.value)}
                            />
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button 
                                variant="outline" 
                                onClick={() => setOpen(false)}
                                disabled={approving}
                            >
                                Cancel
                            </Button>
                            <Button 
                                onClick={handleApprove} 
                                disabled={approving}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {approving ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Approving...
                                    </>
                                ) : (
                                    "Approve"
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            
            <Button 
                size="sm" 
                variant="destructive"
                onClick={handleReject}
                disabled={approving || rejecting}
            >
                {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Reject
            </Button>
        </div>
    );
}