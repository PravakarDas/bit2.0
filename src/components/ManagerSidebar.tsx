"use client";

import * as React from "react";
import {
    LayoutDashboard,
    Users,
    CalendarDays,
    Clock,
    FileCheck,
    Archive,
    ChevronRight,
    ArrowLeft,
    Crown,
} from "lucide-react";

import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarFooter,
} from "@/components/ui/sidebar";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const managerNavItems = [
    { 
        title: "Dashboard", 
        url: "/manager", 
        icon: LayoutDashboard,
    },
    {
        title: "Late Check-Ins",
        url: "/manager/late-checkins",
        icon: Clock,
    },
    { 
        title: "Holiday Management", 
        url: "/manager/holidays", 
        icon: CalendarDays,
    },
    { 
        title: "Profile Requests", 
        url: "/manager/profile-requests", 
        icon: FileCheck,
    },
];

const employeeNavItems = [
    { 
        title: "All Employees", 
        url: "/manager/employees", 
        icon: Users,
    },
    { 
        title: "Archived", 
        url: "/manager/employees/archived", 
        icon: Archive,
    },
];

export function ManagerSidebar() {
    const pathname = usePathname();
    const [isEmployeeOpen, setIsEmployeeOpen] = React.useState(false);

    // Auto-open employee section when on employee pages
    React.useEffect(() => {
        if (pathname?.includes("/manager/employees")) {
            setIsEmployeeOpen(true);
        }
    }, [pathname]);

    return (
        <Sidebar collapsible="icon">
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Management</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {managerNavItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton 
                                        asChild 
                                        isActive={pathname === item.url}
                                        tooltip={item.title}
                                    >
                                        <Link href={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                <SidebarGroup>
                    <SidebarGroupLabel>Team Management</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            <Collapsible open={isEmployeeOpen} onOpenChange={setIsEmployeeOpen}>
                                <SidebarMenuItem>
                                    <CollapsibleTrigger asChild>
                                        <SidebarMenuButton 
                                            isActive={pathname?.includes("/manager/employees")}
                                            tooltip="Employee Management"
                                        >
                                            <Users />
                                            <span>Employee Management</span>
                                            <ChevronRight className={`ml-auto transition-transform ${
                                                isEmployeeOpen ? 'rotate-90' : ''
                                            }`} />
                                        </SidebarMenuButton>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        <SidebarMenuSub>
                                            {employeeNavItems.map((subItem) => (
                                                <SidebarMenuSubItem key={subItem.title}>
                                                    <SidebarMenuSubButton 
                                                        asChild 
                                                        isActive={pathname === subItem.url}
                                                    >
                                                        <Link href={subItem.url}>
                                                            <subItem.icon />
                                                            <span>{subItem.title}</span>
                                                        </Link>
                                                    </SidebarMenuSubButton>
                                                </SidebarMenuSubItem>
                                            ))}
                                        </SidebarMenuSub>
                                    </CollapsibleContent>
                                </SidebarMenuItem>
                            </Collapsible>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            
            <SidebarFooter>
                <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard">
                        <ArrowLeft />
                        Switch to Employee View
                    </Link>
                </Button>
            </SidebarFooter>
        </Sidebar>
    );
}