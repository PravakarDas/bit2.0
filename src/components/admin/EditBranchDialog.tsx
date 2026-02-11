"use client";

import { useState, useEffect } from "react";
import { updateBranch } from "@/actions/branch.actions";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Edit2, Clock } from "lucide-react";

type Branch = {
    id: string;
    name: string;
    location: string;
    checkInTime: string;
    checkOutTime: string;
    breakDuration: string;
    weeklyOffDays: string[];
    isActive: boolean;
};

interface EditBranchDialogProps {
    branch: Branch;
}

export function EditBranchDialog({ branch }: EditBranchDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        location: "",
        checkInTime: "09:00",
        checkOutTime: "18:00",
        breakDuration: "01:00",
        weeklyOffDays: ["SUNDAY"] as string[]
    });

    const weekDays = [
        { value: "MONDAY", label: "Monday" },
        { value: "TUESDAY", label: "Tuesday" },
        { value: "WEDNESDAY", label: "Wednesday" },
        { value: "THURSDAY", label: "Thursday" },
        { value: "FRIDAY", label: "Friday" },
        { value: "SATURDAY", label: "Saturday" },
        { value: "SUNDAY", label: "Sunday" }
    ];

    // Initialize form with branch data when dialog opens
    useEffect(() => {
        if (isOpen) {
            setFormData({
                name: branch.name,
                location: branch.location,
                checkInTime: branch.checkInTime || "09:00",
                checkOutTime: branch.checkOutTime || "18:00",
                breakDuration: branch.breakDuration || "01:00",
                weeklyOffDays: branch.weeklyOffDays || ["SUNDAY"]
            });
        }
    }, [isOpen, branch]);

    const handleWeeklyOffChange = (day: string, checked: boolean) => {
        if (checked) {
            setFormData({
                ...formData,
                weeklyOffDays: [...formData.weeklyOffDays, day]
            });
        } else {
            setFormData({
                ...formData,
                weeklyOffDays: formData.weeklyOffDays.filter(d => d !== day)
            });
        }
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.location) {
            toast.error("Please fill in all fields");
            return;
        }

        setLoading(true);
        const res = await updateBranch(branch.id, formData);
        if (res.success) {
            toast.success("Branch updated successfully");
            setIsOpen(false);
        } else {
            toast.error(res.error || "Failed to update branch");
        }
        setLoading(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                    <Edit2 className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-150 max-h-screen overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Branch</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    {/* Basic Information */}
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-base">Basic Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="edit-name">Branch Name</Label>
                                <Input
                                    id="edit-name"
                                    placeholder="e.g. Mumbai HQ"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="edit-location">Location</Label>
                                <Input
                                    id="edit-location"
                                    placeholder="e.g. Mumbai, Maharashtra"
                                    value={formData.location}
                                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Timeline Settings */}
                    <Card>
                        <CardHeader className="pb-4">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Timeline Settings
                            </CardTitle>
                            <CardDescription>
                                Configure working hours and off days for this branch
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-checkInTime">Check-in Time</Label>
                                    <Input
                                        id="edit-checkInTime"
                                        type="time"
                                        value={formData.checkInTime}
                                        onChange={(e) => setFormData({ ...formData, checkInTime: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="edit-checkOutTime">Check-out Time</Label>
                                    <Input
                                        id="edit-checkOutTime"
                                        type="time"
                                        value={formData.checkOutTime}
                                        onChange={(e) => setFormData({ ...formData, checkOutTime: e.target.value })}
                                    />
                                </div>
                            </div>
                            
                            <div className="grid gap-2">
                                <Label htmlFor="edit-breakDuration">Break Duration (HH:MM)</Label>
                                <Input
                                    id="edit-breakDuration"
                                    type="time"
                                    value={formData.breakDuration}
                                    onChange={(e) => setFormData({ ...formData, breakDuration: e.target.value })}
                                />
                            </div>

                            <div className="grid gap-3">
                                <Label>Weekly Off Days</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {weekDays.map((day) => (
                                        <div key={day.value} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`edit-${day.value}`}
                                                checked={formData.weeklyOffDays.includes(day.value)}
                                                onCheckedChange={(checked) => 
                                                    handleWeeklyOffChange(day.value, checked as boolean)
                                                }
                                            />
                                            <Label
                                                htmlFor={`edit-${day.value}`}
                                                className="text-sm font-normal cursor-pointer"
                                            >
                                                {day.label}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading}>
                        {loading ? "Updating..." : "Update Branch"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}