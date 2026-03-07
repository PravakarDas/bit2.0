import { redirect } from "next/navigation";
import { getDbUser } from "@/actions/user.actions";

export default async function ManagerMedicalPage() {
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
                    <h1 className="text-3xl font-bold tracking-tight">Medical Claims Management</h1>
                    <p className="text-muted-foreground">
                        Manage and review medical claims for your team members
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Total Claims</h3>
                    </div>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                        All medical claims
                    </p>
                </div>
                
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Pending Review</h3>
                    </div>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                        Awaiting approval
                    </p>
                </div>
                
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Approved</h3>
                    </div>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                        This month
                    </p>
                </div>
                
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Total Amount</h3>
                    </div>
                    <div className="text-2xl font-bold">$0</div>
                    <p className="text-xs text-muted-foreground">
                        Claims processed
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
                <div className="p-6">
                    <h3 className="text-lg font-medium">Medical Claims</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                        Medical claims management functionality will be available here.
                    </p>
                </div>
            </div>
        </div>
    );
}