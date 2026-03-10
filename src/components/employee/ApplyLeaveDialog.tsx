"use client";

import { useState, useEffect } from "react";
import { applyForLeave, checkAllHolidays } from "@/actions/leave.actions";
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
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CalendarPlus } from "lucide-react";

interface LeaveType {
    id: string;
    name: string;
    allocatedDays: number;
    requiresApproval: boolean;
}

interface LeaveEntitlement {
    id: string;
    year: number;
    allocatedDays: number;
    usedDays: number;
    leaveType: LeaveType;
}

interface ApplyLeaveDialogProps {
    entitlements: LeaveEntitlement[];
    userId: string; // Pass userId as prop instead of fetching in client
}

export function ApplyLeaveDialog({ entitlements, userId }: ApplyLeaveDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [holidayCheck, setHolidayCheck] = useState<{
        hasAnyHoliday: boolean;
        isPublicHoliday: boolean;
        publicHolidayName?: string | null;
        publicHolidayDescription?: string | null;
        isWeeklyHoliday: boolean;
        weeklyHolidayDay?: string;
        branchName?: string;
    }>({ hasAnyHoliday: false, isPublicHoliday: false, isWeeklyHoliday: false });
    const [checkingHoliday, setCheckingHoliday] = useState(false);
    const [formData, setFormData] = useState({
        leaveTypeId: "",
        leaveDate: "",
        reason: ""
    });

    // Filter to only show leave types with remaining days
    const availableEntitlements = entitlements.filter(e => e.allocatedDays - e.usedDays > 0);

    // Check for holiday when date changes
    useEffect(() => {
        if (formData.leaveDate) {
            setCheckingHoliday(true);
            checkAllHolidays(userId, formData.leaveDate)
                .then((result) => {
                    setHolidayCheck(result);
                })
                .catch(() => {
                    setHolidayCheck({ hasAnyHoliday: false, isPublicHoliday: false, isWeeklyHoliday: false });
                })
                .finally(() => {
                    setCheckingHoliday(false);
                });
        } else {
            setHolidayCheck({ hasAnyHoliday: false, isPublicHoliday: false, isWeeklyHoliday: false });
        }
    }, [formData.leaveDate, userId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.leaveTypeId) {
            toast.error("Please select a leave type");
            return;
        }
        
        if (!formData.leaveDate) {
            toast.error("Please select a leave date");
            return;
        }

        // Check if date is in the past
        const selectedDate = new Date(formData.leaveDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (selectedDate < today) {
            toast.error("Cannot apply for leave in the past");
            return;
        }

        // Check if the selected date is a holiday
        if (holidayCheck.hasAnyHoliday) {
            if (holidayCheck.isPublicHoliday && holidayCheck.isWeeklyHoliday) {
                toast.error(`Cannot apply for leave on ${holidayCheck.publicHolidayName || 'this date'}. This date is both a public holiday and a weekly holiday (${holidayCheck.weeklyHolidayDay?.toLowerCase()}).`);
            } else if (holidayCheck.isPublicHoliday) {
                toast.error(`Cannot apply for leave on ${holidayCheck.publicHolidayName || 'this date'}. This is a public holiday.`);
            } else if (holidayCheck.isWeeklyHoliday) {
                toast.error(`Cannot apply for leave on ${holidayCheck.weeklyHolidayDay?.toLowerCase()}. This is a weekly holiday for your branch.`);
            }
            return;
        }

        setLoading(true);
        
        try {
            const result = await applyForLeave({
                leaveTypeId: formData.leaveTypeId,
                leaveDate: formData.leaveDate,
                reason: formData.reason.trim() || undefined,
                userId: userId
            });
            
            if (result.success) {
                const selectedEntitlement = entitlements.find(e => e.leaveType.id === formData.leaveTypeId);
                const requiresApproval = selectedEntitlement?.leaveType.requiresApproval;
                
                if (requiresApproval) {
                    toast.success("Leave application submitted for approval");
                } else {
                    toast.success("Leave applied successfully (auto-approved)");
                }
                
                setIsOpen(false);
                setFormData({
                    leaveTypeId: "",
                    leaveDate: "",
                    reason: ""
                });
                
                // Refresh the page to show updated data
                window.location.reload();
            } else {
                toast.error(result.error || "Failed to apply for leave");
            }
        } catch {
            toast.error("An error occurred while applying for leave");
        } finally {
            setLoading(false);
        }
    };

    const selectedEntitlement = entitlements.find(e => e.leaveType.id === formData.leaveTypeId);
    const remainingDays = selectedEntitlement ? selectedEntitlement.allocatedDays - selectedEntitlement.usedDays : 0;

    if (availableEntitlements.length === 0) {
        return (
            <Button disabled>
                <CalendarPlus className="mr-2 h-4 w-4" />
                No Leave Available
            </Button>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button>
                    <CalendarPlus className="mr-2 h-4 w-4" />
                    Apply for Leave
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-125">
                <DialogHeader>
                    <DialogTitle>Apply for Leave</DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="leaveType">Leave Type</Label>
                        <Select
                            value={formData.leaveTypeId}
                            onValueChange={(value) => setFormData({ ...formData, leaveTypeId: value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select leave type" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableEntitlements.map((entitlement) => {
                                    const remaining = entitlement.allocatedDays - entitlement.usedDays;
                                    return (
                                        <SelectItem key={entitlement.leaveType.id} value={entitlement.leaveType.id}>
                                            <div className="flex justify-between items-center w-full">
                                                <span>{entitlement.leaveType.name}</span>
                                                <span className="text-xs text-muted-foreground ml-2">
                                                    ({remaining} days left)
                                                </span>
                                            </div>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                        {selectedEntitlement && (
                            <p className="text-sm text-muted-foreground">
                                Remaining: {remainingDays} days
                                {selectedEntitlement.leaveType.requiresApproval && " • Requires approval"}
                            </p>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="leaveDate">Leave Date</Label>
                        <Input
                            id="leaveDate"
                            type="date"
                            value={formData.leaveDate}
                            onChange={(e) => setFormData({ ...formData, leaveDate: e.target.value })}
                            min={new Date().toISOString().split('T')[0]} // Prevent past dates
                            required
                        />
                        {checkingHoliday && (
                            <p className="text-xs text-muted-foreground">
                                Checking for holidays...
                            </p>
                        )}
                        {holidayCheck.isPublicHoliday && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded-md">
                                <p className="text-sm text-red-600 font-medium">
                                    ⚠️ Public Holiday: {holidayCheck.publicHolidayName || 'Holiday'}
                                </p>
                                {holidayCheck.publicHolidayDescription && (
                                    <p className="text-xs text-red-500 mt-1">
                                        {holidayCheck.publicHolidayDescription}
                                    </p>
                                )}
                                <p className="text-xs text-red-500 mt-1">
                                    Leave applications are not allowed on public holidays.
                                </p>
                            </div>
                        )}
                        {holidayCheck.isWeeklyHoliday && (
                            <div className="p-2 bg-orange-50 border border-orange-200 rounded-md">
                                <p className="text-sm text-orange-600 font-medium">
                                    📅 Weekly Holiday: {holidayCheck.weeklyHolidayDay}
                                </p>
                                <p className="text-xs text-orange-500 mt-1">
                                    This is a weekly holiday for your branch ({holidayCheck.branchName}). Leave applications are not allowed.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="reason">Reason (Optional)</Label>
                        <Textarea
                            id="reason"
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                            placeholder="Enter reason for leave..."
                            rows={3}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => setIsOpen(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            disabled={loading || holidayCheck.hasAnyHoliday || checkingHoliday}
                        >
                            {loading ? "Applying..." : "Apply for Leave"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}