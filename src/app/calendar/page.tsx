import { redirect } from "next/navigation";
import { getDbUser } from "@/actions/user.actions";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import AvailabilityCalendar from "@/components/shared/AvailabilityCalendar";

export default async function CalendarPage() {
    const user = await getDbUser();

    if (!user) {
        redirect("/sign-in");
    }

    if (user.status === "PENDING") {
        redirect("/pending");
    }

    return (
        <SidebarProvider>
            <AppSidebar role={user.role} />
            <SidebarInset>
                <Header />
                <main className="flex-1 p-6 overflow-auto">
                    <AvailabilityCalendar />
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}
