"use client";

import { UserButton } from "@clerk/nextjs";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { SmartBreadcrumb } from "@/components/SmartBreadcrumb";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { useUser } from "@clerk/nextjs";

export function Header() {
    const { user } = useUser();
    const isAdmin = user?.organizationMemberships?.[0]?.role === 'org:admin';

    return (
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-white sticky top-0 z-10">
            <div className="flex flex-1 items-center gap-2">
                <SidebarTrigger />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <SmartBreadcrumb />
            </div>
            <div className="flex items-center gap-4">
                {isAdmin && <NotificationBell />}
                <UserButton afterSignOutUrl="/sign-in" />
            </div>
        </header>
    );
}
