import { getDbUser } from "@/actions/user.actions";
import { redirect } from "next/navigation";
import { RoleManagementClient } from "@/components/admin/RoleManagementClient";
import { getAllUsersWithDetails } from "@/actions/role-management.actions";

export default async function RoleManagementPage() {
    const user = await getDbUser();

    if (!user) {
        redirect("/sign-in");
    }

    if (user.role !== "SUPERADMIN") {
        redirect("/unauthorized");
    }

    const users = await getAllUsersWithDetails();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Role Management</h1>
                    <p className="text-muted-foreground">
                        Manage user roles, assignments, and access permissions across your organization
                    </p>
                </div>
            </div>

            <RoleManagementClient 
                users={users} 
            />
        </div>
    );
}