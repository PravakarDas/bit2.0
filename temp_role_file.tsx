"use client";

import { useState, useMemo, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
    Search, 
    Filter, 
    MoreHorizontal, 
    UserCog, 
    Archive, 
    ArchiveRestore,
    Users,
    Crown,
    Shield,
    Settings,
    Download,
    Upload,
    RefreshCw
} from "lucide-react";
import { Role, UserStatus } from "@prisma/client";
import { toast } from "sonner";

interface User {
    id: string;
    clerkId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    imageUrl: string | null;
    role: Role;
    isManager: boolean;
    status: UserStatus;
    employeeStatus: string | null;
    isArchived: boolean;
    dateOfJoining: Date | null;
    createdAt: Date;
    updatedAt: Date;
    branch: { id: string; name: string } | null;
    department: { id: string; name: string } | null;
    designation: { id: string; name: string } | null;
}

interface RoleManagementClientProps {
    users: User[];
    updateUserRoleAction: (userId: string, newRole: Role, reason?: string) => Promise<any>;
    bulkUpdateUserRolesAction: (updates: Array<{ userId: string; newRole: Role }>) => Promise<any>;
    toggleUserArchiveStatusAction: (userId: string) => Promise<any>;
}

export function RoleManagementClient({ 
    users: initialUsers, 
    updateUserRoleAction,
    bulkUpdateUserRolesAction,
    toggleUserArchiveStatusAction
}: RoleManagementClientProps) {
    const [users, setUsers] = useState<User[]>(initialUsers);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedRole, setSelectedRole] = useState<string>("all");
    const [selectedStatus, setSelectedStatus] = useState<string>("all");
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [showArchived, setShowArchived] = useState(false);
    const [bulkRole, setBulkRole] = useState<Role | "">("");
    const [isPending, startTransition] = useTransition();

    // Filter users based on search and filters
    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchesSearch = searchTerm === "" || 
                user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesRole = selectedRole === "all" || user.role === selectedRole;
            const matchesStatus = selectedStatus === "all" || user.status === selectedStatus;
            const matchesArchive = showArchived ? true : !user.isArchived;

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
            stats[user.role]++;
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
                const result = await updateUserRoleAction(userId, newRole);
                if (result.success) {
                    setUsers(users.map(user => 
                        user.id === userId 
                            ? { ...user, role: newRole, updatedAt: new Date() }
                            : user
                    ));
                    toast.success(result.message);
                } else {
                    toast.error(result.error);
                }
            } catch (error) {
                toast.error("Failed to update user role");
            }
        });
    };

    // Handle bulk role changes
    const handleBulkRoleChange = async () => {
        if (!bulkRole || selectedUsers.length === 0) {
            toast.error("Please select users and a role");
            return;
        }

        startTransition(async () => {
            try {
                const updates = selectedUsers.map(userId => ({ userId, newRole: bulkRole }));
                const result = await bulkUpdateUserRolesAction(updates);
                
                if (result.success) {
                    setUsers(users.map(user =>
                        selectedUsers.includes(user.id)
                            ? { ...user, role: bulkRole, updatedAt: new Date() }
                            : user
                    ));
                    setSelectedUsers([]);
                    setBulkRole("");
                    toast.success(result.message);
                } else {
                    toast.error(result.error);
                }
            } catch (error) {
                toast.error("Failed to perform bulk update");
            }
        });
    };

    // Handle archive toggle
    const handleArchiveToggle = async (userId: string) => {
        startTransition(async () => {
            try {
                const result = await toggleUserArchiveStatusAction(userId);
                if (result.success) {
                    setUsers(users.map(user =>
                        user.id === userId
                            ? { ...user, isArchived: result.isArchived!, updatedAt: new Date() }
                            : user
                    ));
                    toast.success(result.message);
                } else {
                    toast.error(result.error);
                }
            } catch (error) {
                toast.error("Failed to update archive status");
            }
        });
    };

    // Handle select all checkbox
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedUsers(filteredUsers.map(user => user.id));
        } else {
            setSelectedUsers([]);
        }
    };

    // Handle individual checkbox
    const handleSelectUser = (userId: string, checked: boolean) => {
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

        return config[role];
    };

    return (
        <div className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{roleStats.total}</div>
                        <p className="text-xs text-muted-foreground">
                            {roleStats.pending} pending approval
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
                            Inactive users
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters and Actions */}
            <Card>
                <CardHeader>
                    <CardTitle>Filters & Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                                <SelectItem value=""></SelectItem>
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
                                <SelectItem value="APPROVED">Approved</SelectItem>
                                <SelectItem value="PENDING">Pending</SelectItem>
                            </SelectContent>
                        </Select>

                        <Button
                            variant="outline"
                            onClick={() => setShowArchived(!showArchived)}
                        >
                            <Archive className="mr-2 h-4 w-4" />
                            {showArchived ? "Hide" : "Show"} Archived
                        </Button>
                    </div>

                    {/* Bulk Actions */}
                    {selectedUsers.length > 0 && (
                        <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                            <span className="text-sm font-medium">
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
                                    <SelectItem value=""></SelectItem>
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
                </CardContent>
            </Card>

            {/* Users Table */}
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle>
                            Users ({filteredUsers.length})
                        </CardTitle>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                                <Download className="mr-2 h-4 w-4" />
                                Export
                            </Button>
                            <Button variant="outline" size="sm">
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]">
                                    <Checkbox
                                        checked={
                                            filteredUsers.length > 0 && 
                                            selectedUsers.length === filteredUsers.length
                                        }
                                        onCheckedChange={handleSelectAll}
                                    />
                                </TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Department</TableHead>
                                <TableHead>Joined</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredUsers.map((user) => {
                                const roleDisplay = getRoleDisplay(user.role);
                                const IconComponent = roleDisplay.icon;

                                return (
                                    <TableRow key={user.id} className={user.isArchived ? "opacity-60" : ""}>
                                        <TableCell>
                                            <Checkbox
                                                checked={selectedUsers.includes(user.id)}
                                                onCheckedChange={(checked) => 
                                                    handleSelectUser(user.id, checked as boolean)
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center space-x-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarImage src={user.imageUrl || undefined} />
                                                    <AvatarFallback>
                                                        {user.firstName?.charAt(0) || user.email.charAt(0)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="font-medium">
                                                        {user.firstName} {user.lastName}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground">
                                                        {user.email}
                                                    </div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={roleDisplay.color} className="gap-1">
                                                <IconComponent className="h-3 w-3" />
                                                {roleDisplay.label}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge 
                                                variant={user.status === "APPROVED" ? "default" : "secondary"}
                                            >
                                                {user.status}
                                            </Badge>
                                            {user.isArchived && (
                                                <Badge variant="outline" className="ml-2">
                                                    Archived
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm">
                                                {user.department?.name || "Not assigned"}
                                            </div>
                                            {user.branch && (
                                                <div className="text-xs text-muted-foreground">
                                                    {user.branch.name}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {user.dateOfJoining?.toLocaleDateString() || "Not set"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0">
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
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>

                    {filteredUsers.length === 0 && (
                        <div className="text-center py-12">
                            <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold">No users found</h3>
                            <p className="text-muted-foreground">
                                Try adjusting your search criteria or filters
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
