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
    Archive,
    Wallet,
    Clock,
    CalendarDays,
    FileCheck,
    Building2,
    Briefcase,
    ChevronDown,
    ChevronRight,
    Gift,
    DollarSign,
    Zap,
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
    SidebarHeader,
} from "@/components/ui/sidebar";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import logo from "@/assets/logo.gif";

const adminItems = [
    { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
    { title: "Employee Management", url: "/admin/employees", icon: Users },
    { title: "Profile Requests", url: "/admin/profile-requests", icon: FileCheck },
    { title: "Archived Employees", url: "/admin/archived-employees", icon: Archive },
    { title: "Timeline", url: "/admin/timeline", icon: Clock },
    { title: "Calendar", url: "/calendar", icon: CalendarDays },
    { title: "Leave Types", url: "/admin/leave-types", icon: ScrollText },
    { title: "Leave Applications", url: "/admin/leave-applications", icon: History },
    { title: "Leave Automation", url: "/admin/leave-automation", icon: Zap },
    { title: "Loan Management", url: "/admin/loans", icon: Banknote },
    { title: "Medical Claims", url: "/admin/medical", icon: Stethoscope },
    { title: "Wallet Management", url: "/admin/wallet", icon: Wallet },
    { title: "Payroll", url: "/admin/payroll", icon: CircleDollarSign },
    { title: "OT/UT Payouts", url: "/admin/overtime-payouts", icon: CircleDollarSign },
    { title: "Settings", url: "/admin/settings", icon: Wrench },
];

const employeeItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "My Profile", url: "/profile", icon: UserCircle },
    { title: "My Timeline", url: "/timeline", icon: Clock },
    { title: "Calendar", url: "/calendar", icon: CalendarDays },
    { title: "My Leaves", url: "/leaves", icon: ScrollText },
    { title: "My Loans", url: "/loans", icon: Banknote },
    { title: "My Medical", url: "/medical", icon: Stethoscope },
    { title: "My Wallet", url: "/wallet", icon: Wallet },
    { title: "Salary History", url: "/salary-history", icon: History },
];

const organizationSubItems = [
    { title: "Branches", icon: Building2, hash: "#branches" },
    { title: "Departments & Designations", icon: Briefcase, hash: "#departments" },
    { title: "Bonuses", icon: Gift, hash: "#bonuses" },
    { title: "Allowances", icon: DollarSign, hash: "#allowances" },
    { title: "Leave Types", icon: CalendarDays, hash: "#leave-types" },
];

export function AppSidebar({ role }: { role: string }) {
    const pathname = usePathname();
    const items = role === "SUPERADMIN" ? adminItems : employeeItems;
    const [isOrganizationOpen, setIsOrganizationOpen] = React.useState(false);

    // Auto-open organization menu if on organization page
    React.useEffect(() => {
        if (pathname === "/admin/organization") {
            setIsOrganizationOpen(true);
        }
    }, [pathname]);

    const handleSubItemClick = (hash: string) => {
        const element = document.querySelector(hash);
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader className="p-4">
                <div className="flex items-center gap-2 font-bold text-xl">
                    <Image 
                        src={logo} 
                        alt="BIT Logo" 
                        width={32} 
                        height={32} 
                        className="rounded"
                    />
                    <span></span>
                </div>
            </SidebarHeader>
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel></SidebarGroupLabel>
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
                            
                            {/* Organization Collapsible Menu (Admin Only) */}
                            {role === "SUPERADMIN" && (
                                <Collapsible open={isOrganizationOpen} onOpenChange={setIsOrganizationOpen}>
                                    <SidebarMenuItem>
                                        <CollapsibleTrigger asChild>
                                            <SidebarMenuButton 
                                                isActive={pathname === "/admin/organization"}
                                                tooltip="Organization"
                                            >
                                                <Building2 className="h-4 w-4" />
                                                <span>Organization</span>
                                                {isOrganizationOpen ? (
                                                    <ChevronDown className="ml-auto h-4 w-4 transition-transform" />
                                                ) : (
                                                    <ChevronRight className="ml-auto h-4 w-4 transition-transform" />
                                                )}
                                            </SidebarMenuButton>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                            <SidebarMenuSub>
                                                {organizationSubItems.map((subItem) => (
                                                    <SidebarMenuSubItem key={subItem.title}>
                                                        <SidebarMenuSubButton asChild>
                                                            <Link 
                                                                href={`/admin/organization${subItem.hash}`}
                                                                onClick={(e) => {
                                                                    if (pathname === "/admin/organization") {
                                                                        e.preventDefault();
                                                                        handleSubItemClick(subItem.hash);
                                                                    }
                                                                }}
                                                            >
                                                                <subItem.icon className="h-3.5 w-3.5" />
                                                                <span className="text-xs">{subItem.title}</span>
                                                            </Link>
                                                        </SidebarMenuSubButton>
                                                    </SidebarMenuSubItem>
                                                ))}
                                            </SidebarMenuSub>
                                        </CollapsibleContent>
                                    </SidebarMenuItem>
                                </Collapsible>
                            )}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    );
}
