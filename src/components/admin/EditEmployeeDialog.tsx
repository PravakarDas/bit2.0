"use client";

import { useState } from "react";
import { updateEmployeeProfile } from "@/actions/employee.actions";
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
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { UserCog } from "lucide-react";
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

export function EditEmployeeDialog({ user, branches }: { user: User, branches: Branch[] }) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        role: user.role,
        branchId: user.branchId,
    });

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const res = await updateEmployeeProfile(user.id, formData);
            if (res.success) {
                toast.success("Employee profile updated successfully");
                setIsOpen(false);
            } else {
                toast.error(res.error || "Failed to update profile");
            }
        } catch (error) {
            toast.error("An error occurred during update");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <UserCog className="mr-2 h-4 w-4" /> Edit Profile
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Edit Employee: {user.email}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="role">Assign Role</Label>
                        <Select
                            value={formData.role}
                            onValueChange={(value: Role) => setFormData({ ...formData, role: value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="EMPLOYEE">Employee</SelectItem>
                                <SelectItem value="MANAGER">Manager</SelectItem>
                                <SelectItem value="HR">HR Specialist</SelectItem>
                                <SelectItem value="SUPERADMIN">Super Admin</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="branch">Home Branch</Label>
                        <Select
                            value={formData.branchId || "none"}
                            onValueChange={(value) => setFormData({ ...formData, branchId: value === "none" ? null : value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select branch" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Not Assigned</SelectItem>
                                {branches.map((branch) => (
                                    <SelectItem key={branch.id} value={branch.id}>
                                        {branch.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={loading}>
                        {loading ? "Saving..." : "Save Changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
