"use client";

import { UserButton } from "@clerk/nextjs";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { usePathname } from "next/navigation";
import React from "react";

export function Header() {
    const pathname = usePathname();
    const pathSegments = pathname.split("/").filter(Boolean);

    return (
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-white sticky top-0 z-10">
            <div className="flex flex-1 items-center gap-2">
                <SidebarTrigger />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink href="/">Home</BreadcrumbLink>
                        </BreadcrumbItem>
                        {pathSegments.map((segment, index) => {
                            const url = `/${pathSegments.slice(0, index + 1).join("/")}`;
                            const isLast = index === pathSegments.length - 1;
                            const formattedName = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");

                            return (
                                <React.Fragment key={url}>
                                    <BreadcrumbSeparator />
                                    <BreadcrumbItem>
                                        {isLast ? (
                                            <BreadcrumbPage>{formattedName}</BreadcrumbPage>
                                        ) : (
                                            <BreadcrumbLink href={url}>{formattedName}</BreadcrumbLink>
                                        )}
                                    </BreadcrumbItem>
                                </React.Fragment>
                            );
                        })}
                    </BreadcrumbList>
                </Breadcrumb>
            </div>
            <div className="flex items-center gap-4">
                <UserButton afterSignOutUrl="/sign-in" />
            </div>
        </header>
    );
}
