"use client";

import React, { useState, useMemo, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Search,
    Crown,
    Shield,
    Users,
    Archive,
    MoreHorizontal,
    ArchiveRestore,
    CheckCircle,
    XCircle,
    Settings,
} from "lucide-react";
import { toast } from "sonner";
import { changeUserRole, toggleUserArchiveStatus, toggleManagerStatus } from "@/actions/user.actions";
import { Role, UserStatus } from "@prisma/client";

interface User {
    id: string;
    clerkId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    name: string;
    imageUrl: string | null;
    role: Role;
    isManager: boolean;
    status: UserStatus;
    employeeStatus: string | null;
    isArchived: boolean;
    dateOfJoining: Date | null;
    createdAt: Date;
    updatedAt: Date;
    branch?: {
        id: string;
        name: string;
    } | null;
    department?: {
        id: string;
        name: string;
    } | null;
    designation?: {
        id: string;
        name: string;
    } | null;
}

interface RoleManagementClientProps {
    users: User[];
}

export function RoleManagementClient({ users }: RoleManagementClientProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedRole, setSelectedRole] = useState<string>("all");
    const [selectedStatus, setSelectedStatus] = useState<string>("all");
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [bulkRole, setBulkRole] = useState<Role | "">("");
    const [showArchived, setShowArchived] = useState(false);
    const [isPending, startTransition] = useTransition();

    // Filter users
    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchesSearch = 
                user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRole = selectedRole === "all" || user.role === selectedRole;
            const matchesStatus = 
                selectedStatus === "all" || 
                (selectedStatus === "PENDING" && user.status === "PENDING") ||
                (selectedStatus === "ACTIVE" && user.status === "APPROVED");
            const matchesArchive = showArchived || !user.isArchived;
            return matchesSearch && matchesRole && matchesStatus && matchesArchive;
        });
    }, [users, searchTerm, selectedRole, selectedStatus, showArchived]);

    // Role statistics
    const roleStats = useMemo(() => {
        const stats = {
            SUPERADMIN: 0,
            HR: 0,
            EMPLOYEE: 0,
            MANAGERS: 0,
            total: users.filter(u => !u.isArchived).length,
            archived: users.filter(u => u.isArchived).length,
            pending: users.filter(u => u.status === "PENDING" && !u.isArchived).length,
        };
        
        users.filter(u => !u.isArchived).forEach(user => {
            if (['SUPERADMIN', 'HR', 'EMPLOYEE'].includes(user.role)) {
                stats[user.role]++;
            }
            if (user.role === "EMPLOYEE" && user.isManager) {
                stats.MANAGERS++;
            }
        });

        return stats;
    }, [users]);

    // Handle single role change
    const handleRoleChange = async (userId: string, newRole: Role) => {
        startTransition(async () => {
            try {
                const result = await changeUserRole(userId, newRole);
                if (result.success) {
                    toast.success(result.message || "User role changed successfully");
                } else {
                    toast.error(result.error || "Failed to change role");
                }
            } catch {
                toast.error("An unexpected error occurred");
            }
        });
    };

    // Handle bulk role change
    const handleBulkRoleChange = async () => {
        if (!bulkRole || selectedUsers.length === 0) return;

        startTransition(async () => {
            try {
                const promises = selectedUsers.map(userId => 
                    changeUserRole(userId, bulkRole as Role)
                );
                await Promise.all(promises);
                
                toast.success(`${selectedUsers.length} users updated successfully`);
                setSelectedUsers([]);
                setBulkRole("");
            } catch {
                toast.error("Failed to update users");
            }
        });
    };

    // Handle archive toggle
    const handleArchiveToggle = async (userId: string) => {
        startTransition(async () => {
            try {
                const result = await toggleUserArchiveStatus(userId);
                if (result.success) {
                    toast.success(result.message);
                } else {
                    toast.error(result.error || "Failed to update user");
                }
            } catch {
                toast.error("An unexpected error occurred");
            }
        });
    };

    // Handle manager toggle
    const handleManagerToggle = async (userId: string) => {
        startTransition(async () => {
            try {
                const result = await toggleManagerStatus(userId);
                if (result.success) {
                    toast.success(result.message);
                } else {
                    toast.error(result.error || "Failed to update manager status");
                }
            } catch {
                toast.error("An unexpected error occurred");
            }
        });
    };

    // Handle checkbox selection
    const handleUserSelection = (userId: string, checked: boolean) => {
        if (checked) {
            setSelectedUsers([...selectedUsers, userId]);
        } else {
            setSelectedUsers(selectedUsers.filter(id => id !== userId));
        }
    };

    // Role color and icon mapping
    const getRoleDisplay = (role: Role) => {
        const config = {
            SUPERADMIN: { color: "destructive", icon: Crown, label: "Super Admin" },
            HR: { color: "secondary", icon: Shield, label: "HR Specialist" },
            EMPLOYEE: { color: "outline", icon: Users, label: "Employee" },
        } as const;

        return config[role] || config.EMPLOYEE;
    };

    return (
        <div className="space-y-6 p-6">
            <h1 className="text-2xl font-bold">User Role Management</h1>
            
            {/* Role Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{roleStats.total}</div>
                        <p className="text-xs text-muted-foreground">
                            Active users
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Super Admins</CardTitle>
                        <Crown className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{roleStats.SUPERADMIN}</div>
                        <p className="text-xs text-muted-foreground">
                            Full system access
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">HR Specialists</CardTitle>
                        <Shield className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{roleStats.HR}</div>
                        <p className="text-xs text-muted-foreground">
                            HR management access
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Employees</CardTitle>
                        <Users className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{roleStats.EMPLOYEE}</div>
                        <p className="text-xs text-muted-foreground">
                            Regular access
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Managers</CardTitle>
                        <Settings className="h-4 w-4 text-purple-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{roleStats.MANAGERS}</div>
                        <p className="text-xs text-muted-foreground">
                            Team management access
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Archived</CardTitle>
                        <Archive className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{roleStats.archived}</div>
                        <p className="text-xs text-muted-foreground">
                            Archived users
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8"
                        />
                    </div>
                </div>
                
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by role" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        <SelectItem value="SUPERADMIN">Super Admin</SelectItem>
                        <SelectItem value="HR">HR Specialist</SelectItem>
                        <SelectItem value="EMPLOYEE">Employee</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="PENDING">Pending</SelectItem>
                    </SelectContent>
                </Select>

                <Button
                    variant={showArchived ? "default" : "outline"}
                    onClick={() => setShowArchived(!showArchived)}
                    className="whitespace-nowrap"
                >
                    {showArchived ? "Hide Archived" : "Show Archived"}
                </Button>
            </div>

            {/* Bulk Actions */}
            {selectedUsers.length > 0 && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-sm text-blue-700">
                        {selectedUsers.length} users selected
                    </span>
                    <Select 
                        value={bulkRole} 
                        onValueChange={(value: Role) => setBulkRole(value)}
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Change role to..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="SUPERADMIN">Super Admin</SelectItem>
                            <SelectItem value="HR">HR Specialist</SelectItem>
                            <SelectItem value="EMPLOYEE">Employee</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        onClick={handleBulkRoleChange}
                        disabled={!bulkRole || isPending}
                    >
                        Apply Changes
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setSelectedUsers([])}
                    >
                        Clear Selection
                    </Button>
                </div>
            )}

            {/* Users Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Users ({filteredUsers.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left p-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedUsers(filteredUsers.map(u => u.id));
                                                } else {
                                                    setSelectedUsers([]);
                                                }
                                            }}
                                        />
                                    </th>
                                    <th className="text-left p-2">User</th>
                                    <th className="text-left p-2">Role</th>
                                    <th className="text-left p-2">Status</th>
                                    <th className="text-left p-2">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map((user) => {
                                    const roleDisplay = getRoleDisplay(user.role);
                                    const RoleIcon = roleDisplay.icon;
                                    
                                    return (
                                        <tr key={user.id} className={`border-b hover:bg-gray-50 ${user.isArchived ? 'opacity-50' : ''}`}>
                                            <td className="p-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedUsers.includes(user.id)}
                                                    onChange={(e) => handleUserSelection(user.id, e.target.checked)}
                                                />
                                            </td>
                                            <td className="p-2">
                                                <div>
                                                    <div className="font-medium">{user.name}</div>
                                                    <div className="text-sm text-gray-500">{user.email}</div>
                                                </div>
                                            </td>
                                            <td className="p-2">
                                                <div className="flex items-center space-x-2">
                                                    <Badge variant={roleDisplay.color} className="gap-1">
                                                        <RoleIcon className="h-3 w-3" />
                                                        {roleDisplay.label}
                                                    </Badge>
                                                    {user.role === "EMPLOYEE" && user.isManager && (
                                                        <Badge variant="outline" className="gap-1 text-xs">
                                                            <Settings className="h-3 w-3" />
                                                            Manager
                                                        </Badge>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-2">
                                                <Badge variant={user.status === "APPROVED" ? "default" : "secondary"}>
                                                    {user.status === "APPROVED" ? (
                                                        <>
                                                            <CheckCircle className="mr-1 h-3 w-3" />
                                                            Active
                                                        </>
                                                    ) : (
                                                        <>
                                                            <XCircle className="mr-1 h-3 w-3" />
                                                            Pending
                                                        </>
                                                    )}
                                                </Badge>
                                            </td>
                                            <td className="p-2">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem
                                                            onClick={() => handleRoleChange(user.id, "EMPLOYEE")}
                                                            disabled={user.role === "EMPLOYEE"}
                                                        >
                                                            <Users className="mr-2 h-4 w-4" />
                                                            Make Employee
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => handleRoleChange(user.id, "HR")}
                                                            disabled={user.role === "HR"}
                                                        >
                                                            <Shield className="mr-2 h-4 w-4" />
                                                            Make HR Specialist
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => handleRoleChange(user.id, "SUPERADMIN")}
                                                            disabled={user.role === "SUPERADMIN"}
                                                        >
                                                            <Crown className="mr-2 h-4 w-4" />
                                                            Make Super Admin
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        {user.role === "EMPLOYEE" && (
                                                            <DropdownMenuItem
                                                                onClick={() => handleManagerToggle(user.id)}
                                                            >
                                                                <Settings className="mr-2 h-4 w-4" />
                                                                {user.isManager ? "Remove Manager Status" : "Make Manager"}
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => handleArchiveToggle(user.id)}
                                                        >
                                                            {user.isArchived ? (
                                                                <>
                                                                    <ArchiveRestore className="mr-2 h-4 w-4" />
                                                                    Restore User
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Archive className="mr-2 h-4 w-4" />
                                                                    Archive User
                                                                </>
                                                            )}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}