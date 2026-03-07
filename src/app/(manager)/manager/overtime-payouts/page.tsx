import { redirect } from "next/navigation";
import { getDbUser } from "@/actions/user.actions";

export default async function ManagerOvertimePayoutsPage() {
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
                    <h1 className="text-3xl font-bold tracking-tight">Overtime Payouts</h1>
                    <p className="text-muted-foreground">
                        Manage and process overtime payouts for your team members
                    </p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Total Overtime Hours</h3>
                    </div>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                        This month
                    </p>
                </div>
                
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Pending Payouts</h3>
                    </div>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                        Awaiting processing
                    </p>
                </div>
                
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <h3 className="tracking-tight text-sm font-medium">Processed</h3>
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
                        Payouts processed
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
                <div className="p-6">
                    <h3 className="text-lg font-medium">Overtime Payouts</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                        Overtime payout management functionality will be available here.
                    </p>
                </div>
            </div>
        </div>
    );
}