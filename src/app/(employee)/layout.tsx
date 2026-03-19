import { redirect } from "next/navigation";
import { getDbUser } from "@/actions/user.actions";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getDbUser();
    const headersList = await headers();
    const pathname = headersList.get('x-pathname') || '';

    if (!user) {
        redirect("/sign-in");
    }

    // Security: Check for PENDING status
    if (user.status === "PENDING") {
        redirect("/pending");
    }

    // If user is accessing manager routes, don't render employee layout
    // Let the manager layout handle its own sidebar and header
    if (pathname.includes('/employee/manager')) {
        return <>{children}</>;
    }

    return (
        <SidebarProvider>
            <AppSidebar role={user.role} isManager={user.isManager} />
            <SidebarInset>
                <Header />
                <main className="flex-1 p-6 overflow-auto">
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}
