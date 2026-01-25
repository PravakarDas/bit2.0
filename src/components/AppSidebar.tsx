"use client";

import * as React from "react";
import {
    LayoutDashboard,
    Users,
    Banknote,
    Stethoscope,
    CircleDollarSign,
    Settings,
    UserCircle,
    History,
    Wrench,
    ScrollText,
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
    SidebarHeader,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";

const adminItems = [
    { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
    { title: "Employee Management", url: "/admin/employees", icon: Users },
    { title: "Loan Management", url: "/admin/loans", icon: Banknote },
    { title: "Medical Claims", url: "/admin/medical", icon: Stethoscope },
    { title: "Payroll", url: "/admin/payroll", icon: CircleDollarSign },
    { title: "Branches", url: "/admin/branches", icon: Settings },
    { title: "Bonuses", url: "/admin/bonuses", icon: CircleDollarSign },
    { title: "Settings", url: "/admin/settings", icon: Wrench },
];

const employeeItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "My Profile", url: "/profile", icon: UserCircle },
    { title: "My Loans", url: "/loans", icon: Banknote },
    { title: "My Medical", url: "/medical", icon: Stethoscope },
    { title: "Salary History", url: "/salary-history", icon: History },
];

export function AppSidebar({ role }: { role: string }) {
    const pathname = usePathname();
    const items = role === "SUPERADMIN" ? adminItems : employeeItems;

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader className="p-4">
                <div className="flex items-center gap-2 font-bold text-xl">
                    <div className="bg-primary text-primary-foreground p-1 rounded">AG</div>
                    <span>Bit 2.0</span>
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Menu</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {items.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                                        <Link href={item.url}>
                                            <item.icon className="h-4 w-4" />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
}
