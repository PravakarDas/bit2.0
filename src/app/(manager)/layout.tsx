import { redirect } from "next/navigation";
import { getDbUser } from "@/actions/user.actions";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ManagerSidebar } from "@/components/ManagerSidebar";
import { ManagerHeader } from "@/components/ManagerHeader";

export default async function ManagerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getDbUser();

    if (!user) {
        redirect("/sign-in");
    }

    // Security: Check for PENDING status
    if (user.status === "PENDING") {
        redirect("/pending");
    }

    // Security: Check for Employee role with Manager privileges
    if (user.role !== "EMPLOYEE" || !user.isManager) {
        redirect("/unauthorized");
    }

    return (
        <SidebarProvider defaultOpen={true}>
            <ManagerSidebar />
            <SidebarInset className="flex-1">
                <ManagerHeader />
                <main className="flex-1 p-6">
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}