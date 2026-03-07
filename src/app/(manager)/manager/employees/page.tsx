import { getDbUser } from "@/actions/user.actions";
import { getManagerTeamMembers } from "@/actions/manager-permissions.actions";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, UserCog, Mail, Building, Calendar, Users } from "lucide-react";

interface TeamMember {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    imageUrl: string | null;
    role: string;
    dateOfJoining: Date | null;
    department?: {
        id: string;
        name: string;
    } | null;
    designation?: {
        id: string;
        name: string;
    } | null;
    branch?: {
        id: string;
        name: string;
    } | null;
}

export default async function ManagerEmployees() {
    const user = await getDbUser();

    if (!user) {
        redirect("/sign-in");
    }

    if (!["MANAGER", "SUPERADMIN"].includes(user.role)) {
        redirect("/unauthorized");
    }

    const teamMembers: TeamMember[] = await getManagerTeamMembers();

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
                    <p className="text-muted-foreground">
                        Manage your team members and their details
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Badge variant="outline">
                        {teamMembers.length} Team Members
                    </Badge>
                    {user.role === "SUPERADMIN" && (
                        <Badge variant="destructive">
                            Admin View - All Employees
                        </Badge>
                    )}
                </div>
            </div>

            {/* Search and Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Search Team Members</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search by name or email..." className="pl-8" />
                            </div>
                        </div>
                        <Button variant="outline">
                            Filter by Department
                        </Button>
                        <Button variant="outline">
                            Export List
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Team Members Grid */}
            {teamMembers.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {teamMembers.map((member: TeamMember) => (
                        <Card key={member.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <Avatar>
                                            <AvatarImage src={member.imageUrl || undefined} />
                                            <AvatarFallback>
                                                {member.firstName?.charAt(0) || ''}{member.lastName?.charAt(0) || ''}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <h3 className="font-semibold">
                                                {member.firstName} {member.lastName}
                                            </h3>
                                            <Badge variant="secondary" className="text-xs">
                                                {member.role}
                                            </Badge>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon">
                                        <UserCog className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="space-y-2">
                                    <div className="flex items-center text-sm text-muted-foreground">
                                        <Mail className="h-3 w-3 mr-2" />
                                        {member.email}
                                    </div>
                                    {member.department && (
                                        <div className="flex items-center text-sm text-muted-foreground">
                                            <Building className="h-3 w-3 mr-2" />
                                            {member.department.name}
                                            {member.designation && ` - ${member.designation.name}`}
                                        </div>
                                    )}
                                    {member.branch && (
                                        <div className="flex items-center text-sm text-muted-foreground">
                                            <Building className="h-3 w-3 mr-2" />
                                            Branch: {member.branch.name}
                                        </div>
                                    )}
                                    <div className="flex items-center text-sm text-muted-foreground">
                                        <Calendar className="h-3 w-3 mr-2" />
                                        Joined: {member.dateOfJoining?.toLocaleDateString() || "Not set"}
                                    </div>
                                </div>
                                
                                <div className="flex gap-2 pt-2">
                                    <Button variant="outline" size="sm" className="flex-1">
                                        View Profile
                                    </Button>
                                    <Button variant="outline" size="sm" className="flex-1">
                                        Timeline
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                /* Empty State */
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Users className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold">No team members found</h3>
                        <div className="text-center max-w-sm space-y-2">
                            <p className="text-muted-foreground">
                                {user.role === "SUPERADMIN" 
                                    ? "No employees found in the system."
                                    : "No team members assigned to your department or branch yet."
                                }
                            </p>
                            {user.role === "MANAGER" && (
                                <p className="text-sm text-muted-foreground">
                                    Managers can only see employees in their department or branch. 
                                    Contact your admin to assign employees to your department.
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Team Summary */}
            {teamMembers.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Team Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center">
                                <div className="text-2xl font-bold">{teamMembers.length}</div>
                                <div className="text-sm text-muted-foreground">Total Members</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold">
                                    {teamMembers.filter((m: TeamMember) => m.department).length}
                                </div>
                                <div className="text-sm text-muted-foreground">In Departments</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold">
                                    {teamMembers.filter((m: TeamMember) => m.branch).length}
                                </div>
                                <div className="text-sm text-muted-foreground">Assigned Branches</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold">
                                    {teamMembers.filter((m: TeamMember) => m.designation).length}
                                </div>
                                <div className="text-sm text-muted-foreground">With Designations</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}