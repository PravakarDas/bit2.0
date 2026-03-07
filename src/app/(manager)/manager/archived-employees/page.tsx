import { redirect } from "next/navigation";
import { getDbUser } from "@/actions/user.actions";

export default async function ManagerArchivedEmployeesPage() {
    const user = await getDbUser();
    
    if (!user) {
        redirect("/sign-in");
    }
    
    if (!["SUPERADMIN", "MANAGER"].includes(user.role)) {
        redirect("/unauthorized");
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Archived Employees</h1>
                    <p className="text-muted-foreground">
                        View and manage archived team members
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Total Archived</h3>
                    </div>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                        Archived employees
                    </p>
                </div>
                
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">This Month</h3>
                    </div>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                        Recently archived
                    </p>
                </div>
                
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Restorable</h3>
                    </div>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                        Can be restored
                    </p>
                </div>
                
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Permanently Deleted</h3>
                    </div>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                        Cannot be restored
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
                <div className="p-6">
                    <h3 className="text-lg font-medium">Archived Employees</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                        Archived employee management functionality will be available here.
                    </p>
                </div>
            </div>
        </div>
    );
}