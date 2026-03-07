import { redirect } from "next/navigation";
import { getDbUser } from "@/actions/user.actions";

export default async function ManagerOrganizationPage() {
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
                    <h1 className="text-3xl font-bold tracking-tight">Organizational Settings</h1>
                    <p className="text-muted-foreground">
                        Manage branches, departments, designations, and organizational structure
                    </p>
                </div>
            </div>

            {/* Branches Section */}
            <section id="branches" className="space-y-4">
                <h2 className="text-2xl font-semibold">Branches</h2>
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <p className="text-sm text-muted-foreground">
                        Branch management functionality will be available here.
                    </p>
                </div>
            </section>

            {/* Departments Section */}
            <section id="departments" className="space-y-4">
                <h2 className="text-2xl font-semibold">Departments & Designations</h2>
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <p className="text-sm text-muted-foreground">
                        Department and designation management functionality will be available here.
                    </p>
                </div>
            </section>

            {/* Bonuses Section */}
            <section id="bonuses" className="space-y-4">
                <h2 className="text-2xl font-semibold">Bonuses</h2>
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <p className="text-sm text-muted-foreground">
                        Bonus management functionality will be available here.
                    </p>
                </div>
            </section>

            {/* Allowances Section */}
            <section id="allowances" className="space-y-4">
                <h2 className="text-2xl font-semibold">Allowances</h2>
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <p className="text-sm text-muted-foreground">
                        Allowance management functionality will be available here.
                    </p>
                </div>
            </section>

            {/* Leave Types Section */}
            <section id="leave-types" className="space-y-4">
                <h2 className="text-2xl font-semibold">Leave Types</h2>
                <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
                    <p className="text-sm text-muted-foreground">
                        Leave type management functionality will be available here.
                    </p>
                </div>
            </section>
        </div>
    );
}