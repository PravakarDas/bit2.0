"use client";

import { useState, useEffect, useCallback } from "react";
import { updateEmployeeProfile } from "@/actions/employee.actions";
import { 
    getActiveLeaveTypes, 
    getUserLeaveEntitlements, 
    assignLeaveToUser, 
    removeLeaveFromUser,
    adjustUserLeaveBalance
} from "@/actions/leave.actions";
import { 
    getEmployeeAllowances, 
    getCustomAllowancesForEmployee, 
    assignEmployeeAllowance, 
    removeEmployeeAllowance 
} from "@/actions/settings.actions";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { UserCog, CalendarDays, DollarSign } from "lucide-react";
import { Role } from "@prisma/client";

interface Branch {
    id: string;
    name: string;
}

interface User {
    id: string;
    email: string;
    role: Role;
    branchId: string | null;
}

interface LeaveType {
    id: string;
    name: string;
    allocatedDays: number;
    requiresApproval: boolean;
    applicableBranches: string;
    isActive: boolean;
}

interface LeaveEntitlement {
    id: string;
    year: number;
    allocatedDays: number;
    usedDays: number;
    leaveType: LeaveType;
}

interface CustomAllowance {
    id: string;
    name: string;
    amount: number;
    valueType: string;
    scope: string;
}

interface EmployeeAllowance {
    id: string;
    isActive: boolean;
    allowance: CustomAllowance;
}

export function ManageEmployeeDialog({ user, branches }: { user: User, branches: Branch[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
    const [userEntitlements, setUserEntitlements] = useState<LeaveEntitlement[]>([]);
    
    // Allowance states
    const [customAllowances, setCustomAllowances] = useState<CustomAllowance[]>([]);
    const [userAllowances, setUserAllowances] = useState<EmployeeAllowance[]>([]);
    
    const [basicFormData, setBasicFormData] = useState({
        role: user.role,
        branchId: user.branchId,
    });
    
    const [leaveFormData, setLeaveFormData] = useState<{[key: string]: { assigned: boolean; customDays: string }}>({});

    const loadAllowanceData = useCallback(async () => {
        try {
            const [customAllowancesData, userAllowancesData] = await Promise.all([
                getCustomAllowancesForEmployee(user.id),
                getEmployeeAllowances(user.id)
            ]);
            
            setCustomAllowances(customAllowancesData);
            setUserAllowances(userAllowancesData);
        } catch {
            toast.error("Failed to load allowance data");
        }
    }, [user.id]);

    const loadLeaveData = useCallback(async () => {
        try {
            const [leaveTypesData, entitlementsData] = await Promise.all([
                getActiveLeaveTypes(),
                getUserLeaveEntitlements(user.id)
            ]);
            
            setLeaveTypes(leaveTypesData);
            setUserEntitlements(entitlementsData);
            
            // Initialize form data
            const formData: {[key: string]: { assigned: boolean; customDays: string }} = {};
            leaveTypesData.forEach((leaveType: LeaveType) => {
                const entitlement = entitlementsData.find((e: LeaveEntitlement) => e.leaveType.id === leaveType.id);
                formData[leaveType.id] = {
                    assigned: !!entitlement,
                    customDays: entitlement ? entitlement.allocatedDays.toString() : leaveType.allocatedDays.toString()
                };
            });
            setLeaveFormData(formData);
        } catch {
            toast.error("Failed to load leave data");
        }
    }, [user.id]);

    useEffect(() => {
        if (isOpen) {
            loadLeaveData();
            loadAllowanceData();
        }
    }, [isOpen, loadLeaveData, loadAllowanceData]);

    const handleBasicSubmit = async () => {
        setLoading(true);
        try {
            const res = await updateEmployeeProfile(user.id, basicFormData);
            if (res.success) {
                toast.success("Employee profile updated successfully");
            } else {
                toast.error(res.error || "Failed to update profile");
            }
        } catch {
            toast.error("An error occurred during update");
        } finally {
            setLoading(false);
        }
    };

    const handleLeaveSubmit = async () => {
        setLoading(true);
        try {
            // Process leave assignments
            for (const leaveType of leaveTypes) {
                const formEntry = leaveFormData[leaveType.id];
                const currentEntitlement = userEntitlements.find(e => e.leaveType.id === leaveType.id);
                
                if (formEntry?.assigned && !currentEntitlement) {
                    // Assign new leave type
                    const customDays = parseInt(formEntry.customDays) || leaveType.allocatedDays;
                    await assignLeaveToUser(user.id, leaveType.id, customDays);
                } else if (!formEntry?.assigned && currentEntitlement) {
                    // Remove leave type
                    await removeLeaveFromUser(user.id, leaveType.id);
                } else if (formEntry?.assigned && currentEntitlement) {
                    // Update existing leave allocation
                    const customDays = parseInt(formEntry.customDays) || leaveType.allocatedDays;
                    if (customDays !== currentEntitlement.allocatedDays) {
                        await adjustUserLeaveBalance(currentEntitlement.id, customDays);
                    }
                }
            }
            
            toast.success("Leave assignments updated successfully");
            await loadLeaveData(); // Refresh data
        } catch {
            toast.error("Failed to update leave assignments");
        } finally {
            setLoading(false);
        }
    };

    const handleAssignAllowance = async (allowanceId: string) => {
        setLoading(true);
        try {
            const res = await assignEmployeeAllowance(user.id, allowanceId);
            if (res.success) {
                toast.success("Allowance assigned successfully");
                await loadAllowanceData();
            } else {
                toast.error(res.error || "Failed to assign allowance");
            }
        } catch {
            toast.error("Failed to assign allowance");
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveAllowance = async (allowanceId: string) => {
        setLoading(true);
        try {
            const res = await removeEmployeeAllowance(user.id, allowanceId);
            if (res.success) {
                toast.success("Allowance removed successfully");
                await loadAllowanceData();
            } else {
                toast.error(res.error || "Failed to remove allowance");
            }
        } catch {
            toast.error("Failed to remove allowance");
        } finally {
            setLoading(false);
        }
    };

    const handleLeaveToggle = (leaveTypeId: string, assigned: boolean) => {
        setLeaveFormData(prev => ({
            ...prev,
            [leaveTypeId]: {
                ...prev[leaveTypeId],
                assigned
            }
        }));
    };

    const handleCustomDaysChange = (leaveTypeId: string, days: string) => {
        setLeaveFormData(prev => ({
            ...prev,
            [leaveTypeId]: {
                ...prev[leaveTypeId],
                customDays: days
            }
        }));
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <UserCog className="mr-2 h-4 w-4" />
                    Manage Employee
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-175 max-h-screen overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Manage Employee: {user.email}</DialogTitle>
                </DialogHeader>
                
                <Tabs defaultValue="basic" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="basic">Basic Info</TabsTrigger>
                        <TabsTrigger value="leaves">Leave Management</TabsTrigger>
                        <TabsTrigger value="allowances">Allowances</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="basic" className="space-y-4">
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="role">Assign Role</Label>
                                <Select
                                    value={basicFormData.role}
                                    onValueChange={(value: Role) => setBasicFormData({ ...basicFormData, role: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="EMPLOYEE">Employee</SelectItem>
                                        <SelectItem value="HR">HR Specialist</SelectItem>
                                        <SelectItem value="SUPERADMIN">Super Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="branch">Assign Branch</Label>
                                <Select
                                    value={basicFormData.branchId || "none"}
                                    onValueChange={(value) => setBasicFormData({ 
                                        ...basicFormData, 
                                        branchId: value === "none" ? null : value 
                                    })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select branch" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No Branch</SelectItem>
                                        {branches.map((branch) => (
                                            <SelectItem key={branch.id} value={branch.id}>
                                                {branch.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button onClick={handleBasicSubmit} disabled={loading}>
                                {loading ? "Updating..." : "Update Profile"}
                            </Button>
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="leaves" className="space-y-4">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CalendarDays className="h-4 w-4" />
                                Manage leave types and allocations for this employee
                            </div>
                            
                            {leaveTypes.length === 0 ? (
                                <Card>
                                    <CardContent className="pt-6">
                                        <p className="text-center text-muted-foreground">
                                            No leave types available. Create leave types first.
                                        </p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="space-y-3">
                                    {leaveTypes.map(leaveType => {
                                        const entitlement = userEntitlements.find(e => e.leaveType.id === leaveType.id);
                                        const formEntry = leaveFormData[leaveType.id];
                                        const applicableBranchIds = JSON.parse(leaveType.applicableBranches || '[]');
                                        const isApplicable = applicableBranchIds.length === 0 || 
                                                           (user.branchId && applicableBranchIds.includes(user.branchId));
                                        
                                        return (
                                            <Card key={leaveType.id} className={!isApplicable ? "opacity-50" : ""}>
                                                <CardContent className="pt-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center space-x-3">
                                                            <Checkbox
                                                                checked={formEntry?.assigned || false}
                                                                onCheckedChange={(checked) => 
                                                                    handleLeaveToggle(leaveType.id, !!checked)
                                                                }
                                                                disabled={!isApplicable}
                                                            />
                                                            <div>
                                                                <div className="font-medium">{leaveType.name}</div>
                                                                <div className="text-sm text-muted-foreground">
                                                                    Default: {leaveType.allocatedDays} days/year
                                                                    {leaveType.requiresApproval && " • Requires approval"}
                                                                </div>
                                                                {!isApplicable && (
                                                                    <div className="text-xs text-red-500">
                                                                        Not applicable for employee&apos;s branch
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                        
                                                        {formEntry?.assigned && (
                                                            <div className="flex items-center gap-2">
                                                                <Label htmlFor={`days-${leaveType.id}`} className="text-sm">
                                                                    Days:
                                                                </Label>
                                                                <Input
                                                                    id={`days-${leaveType.id}`}
                                                                    type="number"
                                                                    min="0"
                                                                    max="365"
                                                                    value={formEntry.customDays}
                                                                    onChange={(e) => 
                                                                        handleCustomDaysChange(leaveType.id, e.target.value)
                                                                    }
                                                                    className="w-20"
                                                                />
                                                                {entitlement && entitlement.usedDays > 0 && (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        Used: {entitlement.usedDays}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        
                        <div className="flex justify-end">
                            <Button onClick={handleLeaveSubmit} disabled={loading}>
                                {loading ? "Updating..." : "Update Leave Assignments"}
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="allowances" className="space-y-4">
                        <div className="flex items-center gap-2 mb-4">
                            <DollarSign className="h-5 w-5 text-primary" />
                            <h3 className="font-medium">Custom Allowance Assignment</h3>
                        </div>
                        
                        <div className="space-y-4">
                            {/* Available Custom Allowances */}
                            <div>
                                <h4 className="font-medium text-sm mb-3">Available Custom Allowances</h4>
                                {customAllowances.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">
                                        No custom allowance types available. Create some in Organization → Allowances.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {customAllowances.map((allowance) => {
                                            const isAssigned = userAllowances.some(
                                                ua => ua.allowance.id === allowance.id && ua.isActive
                                            );
                                            
                                            return (
                                                <Card key={allowance.id}>
                                                    <CardContent className="p-4">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <div className="font-medium">{allowance.name}</div>
                                                                <div className="text-sm text-muted-foreground">
                                                                    {allowance.valueType === "FIXED" 
                                                                        ? `৳${allowance.amount.toLocaleString("en-BD")}`
                                                                        : `${allowance.amount}% of salary`}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {isAssigned ? (
                                                                    <>
                                                                        <span className="text-sm text-green-600 font-medium">Assigned</span>
                                                                        <Button 
                                                                            variant="outline" 
                                                                            size="sm"
                                                                            onClick={() => handleRemoveAllowance(allowance.id)}
                                                                            disabled={loading}
                                                                        >
                                                                            Remove
                                                                        </Button>
                                                                    </>
                                                                ) : (
                                                                    <Button 
                                                                        variant="default" 
                                                                        size="sm"
                                                                        onClick={() => handleAssignAllowance(allowance.id)}
                                                                        disabled={loading}
                                                                    >
                                                                        Assign
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Currently Assigned Allowances Summary */}
                            {userAllowances.some(ua => ua.isActive) && (
                                <div>
                                    <h4 className="font-medium text-sm mb-3">Currently Assigned Custom Allowances</h4>
                                    <div className="bg-muted/30 rounded-lg p-4">
                                        {userAllowances
                                            .filter(ua => ua.isActive)
                                            .map(userAllowance => (
                                                <div key={userAllowance.id} className="flex justify-between items-center py-1">
                                                    <span className="text-sm">{userAllowance.allowance.name}</span>
                                                    <span className="text-sm font-medium">
                                                        {userAllowance.allowance.valueType === "FIXED" 
                                                            ? `৳${userAllowance.allowance.amount.toLocaleString("en-BD")}`
                                                            : `${userAllowance.allowance.amount}%`}
                                                    </span>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}