import { redirect } from "next/navigation";
import { getDbUser } from "@/actions/user.actions";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";

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

    // Security: Check for MANAGER or SUPERADMIN role
    // Managers now have access to most admin features except payroll, loans, and role management
    if (!["MANAGER", "SUPERADMIN"].includes(user.role)) {
        redirect("/unauthorized");
    }

    return (
        <SidebarProvider>
            <AppSidebar role={user.role} />
            <SidebarInset>
                <Header />
                <main className="flex-1 p-6 overflow-auto">
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}