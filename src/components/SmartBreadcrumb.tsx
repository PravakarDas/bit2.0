"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import React from "react";

interface BreadcrumbData {
    name: string;
    href: string;
}

export function SmartBreadcrumb() {
    const pathname = usePathname();
    const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbData[]>([]);

    useEffect(() => {
        async function generateBreadcrumbs() {
            const pathSegments = pathname.split("/").filter(Boolean);
            const crumbs: BreadcrumbData[] = [
                { name: "Home", href: "/" }
            ];

            for (let i = 0; i < pathSegments.length; i++) {
                const segment = pathSegments[i];
                const url = `/${pathSegments.slice(0, i + 1).join("/")}`;
                
                // Check if this is an employee ID segment
                if (pathSegments[i - 1] === "employees" && segment.match(/^[a-zA-Z0-9_-]+$/)) {
                    try {
                        const response = await fetch(`/api/employees/${segment}/name`);
                        if (response.ok) {
                            const data = await response.json();
                            crumbs.push({
                                name: data.name || segment,
                                href: url
                            });
                            continue;
                        }
                    } catch (error) {
                        console.error("Failed to fetch employee name:", error);
                    }
                }

                // Default formatting for other segments
                const formattedName = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
                crumbs.push({
                    name: formattedName,
                    href: url
                });
            }

            setBreadcrumbs(crumbs);
        }

        generateBreadcrumbs();
    }, [pathname]);

    return (
        <Breadcrumb>
            <BreadcrumbList>
                {breadcrumbs.map((crumb, index) => {
                    const isLast = index === breadcrumbs.length - 1;
                    
                    return (
                        <React.Fragment key={crumb.href}>
                            {index > 0 && <BreadcrumbSeparator />}
                            <BreadcrumbItem>
                                {isLast ? (
                                    <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink href={crumb.href}>{crumb.name}</BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                        </React.Fragment>
                    );
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
}