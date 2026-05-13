"use client";

import * as React from "react";
import {
    LayoutDashboard,
    Users,
    CalendarDays,
    FileCheck,
    Clock,
    ScrollText,
    ClipboardList,
    Archive,
    ChevronRight,
    ArrowLeft,
    Stethoscope,
    Wallet,
    Timer,
    Building2,
    Settings,
    Megaphone,
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

const managerNavItems = [
    { 
        title: "Dashboard", 
        url: "/manager", 
        icon: LayoutDashboard,
    },
    { 
        title: "Holiday Management", 
        url: "/manager/holidays", 
        icon: CalendarDays,
    },
    {
        title: "Leave-board",
        url: "/manager/leave-board",
        icon: ScrollText,
    },
    {
        title: "Employee Notes",
        url: "/manager/employee-notes",
        icon: ClipboardList,
    },
    { 
        title: "Profile Requests", 
        url: "/manager/profile-requests", 
        icon: FileCheck,
    },
    {
        title: "Medical",
        url: "/manager/medical",
        icon: Stethoscope,
    },
    {
        title: "Loans",
        url: "/manager/loans",
        icon: Wallet,
    },
    {
        title: "Overtime Requests",
        url: "/manager/overtime-requests",
        icon: Timer,
    },
    {
        title: "Timeline",
        url: "/manager/timeline",
        icon: Clock,
    },
    {
        title: "Timeline Modify Requests",
        url: "/manager/timeline-modification-requests",
        icon: ClipboardList,
    },
    {
        title: "Organization Settings",
        url: "/manager/organization",
        icon: Building2,
    },
    {
        title: "System Control",
        url: "/manager/system-control",
        icon: Settings,
    },
    {
        title: "Notice",
        url: "/manager/notices",
        icon: Megaphone,
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
            
            <SidebarFooter className="p-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton 
                            asChild 
                            tooltip="Switch to Employee View"
                        >
                            <Link href="/dashboard">
                                <ArrowLeft className="h-4 w-4" />
                                <span>Switch to Employee View</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}