"use client";

import { useState, useEffect } from "react";
import { updateEmployeeProfile } from "@/actions/employee.actions";
import { getActiveDepartments } from "@/actions/department.actions";
import { getDesignationsByDepartment } from "@/actions/designation.actions";
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

interface Department {
    id: string;
    name: string;
}

interface Designation {
    id: string;
    name: string;
}

interface User {
    id: string;
    email: string;
    role: Role;
    branchId: string | null;
    departmentId: string | null;
    designationId: string | null;
}

export function EditEmployeeDialog({ user, branches, onUpdate }: { user: User, branches: Branch[], onUpdate?: () => void }) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [designations, setDesignations] = useState<Designation[]>([]);
    const [formData, setFormData] = useState({
        role: user.role,
        branchId: user.branchId,
        departmentId: user.departmentId,
        designationId: user.designationId,
    });

    useEffect(() => {
        const loadDepartments = async () => {
            try {
                const data = await getActiveDepartments();
                setDepartments(data);
            } catch (error) {
                console.error("Failed to load departments", error);
            }
        };
        loadDepartments();
    }, []);

    useEffect(() => {
        const loadDesignations = async () => {
            if (formData.departmentId) {
                try {
                    const data = await getDesignationsByDepartment(formData.departmentId);
                    setDesignations(data);
                } catch (error) {
                    console.error("Failed to load designations", error);
                }
            } else {
                setDesignations([]);
                setFormData(prev => ({ ...prev, designationId: null }));
            }
        };
        loadDesignations();
    }, [formData.departmentId]);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const res = await updateEmployeeProfile(user.id, formData);
            if (res.success) {
                toast.success("Employee profile updated successfully");
                setIsOpen(false);
                onUpdate?.(); // Call the onUpdate callback to refresh data
            } else {
                toast.error(res.error || "Failed to update profile");
            }
        } catch {
            toast.error("An error occurred during update");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="default" size="sm">
                    <UserCog className="mr-2 h-4 w-4" /> Edit Role & Assignment
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
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
                    <div className="grid gap-2">
                        <Label htmlFor="department">Department</Label>
                        <Select
                            value={formData.departmentId || "none"}
                            onValueChange={(value) => setFormData({ ...formData, departmentId: value === "none" ? null : value })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Not Assigned</SelectItem>
                                {departments.map((dept) => (
                                    <SelectItem key={dept.id} value={dept.id}>
                                        {dept.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="designation">Designation</Label>
                        <Select
                            value={formData.designationId || "none"}
                            onValueChange={(value) => setFormData({ ...formData, designationId: value === "none" ? null : value })}
                            disabled={!formData.departmentId}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={formData.departmentId ? "Select designation" : "Select department first"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Not Assigned</SelectItem>
                                {designations.map((desig) => (
                                    <SelectItem key={desig.id} value={desig.id}>
                                        {desig.name}
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
