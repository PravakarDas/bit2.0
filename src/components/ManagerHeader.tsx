"use client";

import { UserButton } from "@clerk/nextjs";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { SmartBreadcrumb } from "@/components/SmartBreadcrumb";
import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";

export function ManagerHeader() {
    return (
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="flex flex-1 items-center gap-2">
                <SmartBreadcrumb />
            </div>
            <div className="flex items-center gap-4">
                <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                    <Crown className="h-3 w-3 mr-1" />
                    Manager Mode
                </Badge>
                <UserButton afterSignOutUrl="/sign-in" />
            </div>
        </header>
    );
}