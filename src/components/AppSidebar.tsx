"use client";

import * as React from "react";
import {
    LayoutDashboard,
    Users,
    Banknote,
    Stethoscope,
    CircleDollarSign,
    UserCircle,
    History,
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
    Bell,
    ClipboardList,
    UserCog,
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
    SidebarHeader,
    SidebarFooter,
} from "@/components/ui/sidebar";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import logo from "@/assets/logo.gif";
import { NotificationWithBadge } from "@/components/NotificationWithBadge";

const adminItems = [
    { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
    { title: "Late Check-Ins", url: "/admin/late-checkins", icon: Clock },
    { title: "Notifications", url: "/admin/notifications", icon: Bell },
    { title: "Role Management", url: "/admin/role-management", icon: UserCog },
    { title: "Calendar", url: "/calendar", icon: CalendarDays },
    { title: "Holiday Management", url: "/admin/holidays", icon: CalendarDays },
    { title: "Loan", url: "/admin/loans", icon: Banknote },
    { title: "Medical", url: "/admin/medical", icon: Stethoscope },
    { title: "OT/UT Payouts", url: "/admin/overtime-payouts", icon: CircleDollarSign },
    { title: "Overtime Requests", url: "/admin/overtime-requests", icon: ClipboardList },
    { title: "Timeline", url: "/admin/timeline", icon: Clock },
    { title: "Wallet", url: "/admin/wallet", icon: Wallet },
];

const employeeSubItems = [
    { title: "Employee Management", url: "/admin/employees", icon: Users },
    { title: "Archived Employees", url: "/admin/archived-employees", icon: Archive },
];

const payrollSubItems = [
    { title: "Process Payroll", url: "/admin/payroll", icon: Zap },
    { title: "Processed Payroll", url: "/admin/payroll/processed", icon: FileCheck },
];

const requestSubItems = [
    { title: "Profile Requests", url: "/admin/profile-requests", icon: FileCheck },
    { title: "Leave Applications", url: "/admin/leave-applications", icon: History },
];

const employeeItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "My Late Check-Ins", url: "/late-checkins", icon: Clock },
    { title: "My Profile", url: "/profile", icon: UserCircle },
    { title: "My Timeline", url: "/timeline", icon: Clock },
    { title: "Calendar", url: "/calendar", icon: CalendarDays },
    { title: "My Leaves", url: "/leaves", icon: ScrollText },
    { title: "Overtime Requests", url: "/overtime-requests", icon: ClipboardList },
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

export function AppSidebar({ role, isManager = false }: { role: string; isManager?: boolean }) {
    const pathname = usePathname();
    const router = useRouter();
    
    // Determine navigation items based on role
    const items = role === "SUPERADMIN"
        ? adminItems
        : employeeItems.filter((item) => !(isManager && item.url === "/late-checkins"));
    
    const [isOrganizationOpen, setIsOrganizationOpen] = React.useState(false);
    const [isEmployeeOpen, setIsEmployeeOpen] = React.useState(false);
    const [isPayrollOpen, setIsPayrollOpen] = React.useState(false);
    const [isRequestOpen, setIsRequestOpen] = React.useState(false);

    // Auto-open menus based on current page
    React.useEffect(() => {
        const orgPaths = ["/admin/organization"];
        const employeePaths = ["/admin/employees", "/admin/archived-employees"];
        const payrollPaths = ["/admin/payroll", "/admin/payroll/processed"];
        const requestPaths = ["/admin/profile-requests", "/admin/leave-applications"];
        
        if (orgPaths.some(path => pathname === path)) {
            setIsOrganizationOpen(true);
        }
        if (employeePaths.some(path => pathname === path)) {
            setIsEmployeeOpen(true);
        }
        if (payrollPaths.some(path => pathname === path)) {
            setIsPayrollOpen(true);
        }
        if (requestPaths.some(path => pathname === path)) {
            setIsRequestOpen(true);
        }
    }, [pathname]);

    const handleSubItemClick = (hash: string) => {
        const baseUrl = "/admin/organization";
        // Update URL with the hash
        router.push(`${baseUrl}${hash}`, { scroll: false });
        
        // Scroll to the element
        setTimeout(() => {
            const element = document.querySelector(hash);
            if (element) {
                element.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }, 0);
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
                                            {item.title === "Notifications" && role === "SUPERADMIN" ? (
                                                <NotificationWithBadge>
                                                    <item.icon className="h-4 w-4" />
                                                </NotificationWithBadge>
                                            ) : (
                                                <item.icon className="h-4 w-4" />
                                            )}
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                            
                            {/* Payroll Collapsible Menu (Admin Only) */}
                            {role === "SUPERADMIN" && (
                                <Collapsible open={isPayrollOpen} onOpenChange={setIsPayrollOpen}>
                                    <SidebarMenuItem>
                                        <CollapsibleTrigger asChild>
                                            <SidebarMenuButton 
                                                isActive={pathname === "/admin/payroll" || pathname === "/admin/payroll/processed"}
                                                tooltip="Payroll"
                                            >
                                                <CircleDollarSign className="h-4 w-4" />
                                                <span>Payroll</span>
                                                {isPayrollOpen ? (
                                                    <ChevronDown className="ml-auto h-4 w-4 transition-transform" />
                                                ) : (
                                                    <ChevronRight className="ml-auto h-4 w-4 transition-transform" />
                                                )}
                                            </SidebarMenuButton>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                            <SidebarMenuSub>
                                                {payrollSubItems.map((subItem) => (
                                                    <SidebarMenuSubItem key={subItem.title}>
                                                        <SidebarMenuSubButton asChild isActive={pathname === subItem.url}>
                                                            <Link href={subItem.url}>
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
                            
                            {/* Employee Collapsible Menu (Admin Only) */}
                            {role === "SUPERADMIN" && (
                                <Collapsible open={isEmployeeOpen} onOpenChange={setIsEmployeeOpen}>
                                    <SidebarMenuItem>
                                        <CollapsibleTrigger asChild>
                                            <SidebarMenuButton 
                                                isActive={pathname === "/admin/employees" || pathname === "/admin/archived-employees"}
                                                tooltip="Employee"
                                            >
                                                <Users className="h-4 w-4" />
                                                <span>Employee</span>
                                                {isEmployeeOpen ? (
                                                    <ChevronDown className="ml-auto h-4 w-4 transition-transform" />
                                                ) : (
                                                    <ChevronRight className="ml-auto h-4 w-4 transition-transform" />
                                                )}
                                            </SidebarMenuButton>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                            <SidebarMenuSub>
                                                {employeeSubItems.map((subItem) => (
                                                    <SidebarMenuSubItem key={subItem.title}>
                                                        <SidebarMenuSubButton asChild isActive={pathname === subItem.url}>
                                                            <Link href={subItem.url}>
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

                            {/* Organizational Settings Collapsible Menu (Admin Only) */}
                            {role === "SUPERADMIN" && (
                                <Collapsible open={isOrganizationOpen} onOpenChange={setIsOrganizationOpen}>
                                    <SidebarMenuItem>
                                        <CollapsibleTrigger asChild>
                                            <SidebarMenuButton 
                                                isActive={pathname === "/admin/organization"}
                                                tooltip="Organizational Settings"
                                            >
                                                <Building2 className="h-4 w-4" />
                                                <span>Organizational Settings</span>
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

                            {/* Request Collapsible Menu (Admin Only) */}
                            {role === "SUPERADMIN" && (
                                <Collapsible open={isRequestOpen} onOpenChange={setIsRequestOpen}>
                                    <SidebarMenuItem>
                                        <CollapsibleTrigger asChild>
                                            <SidebarMenuButton 
                                                isActive={pathname === "/admin/profile-requests" || pathname === "/admin/leave-applications"}
                                                tooltip="Request"
                                            >
                                                <FileCheck className="h-4 w-4" />
                                                <span>Request</span>
                                                {isRequestOpen ? (
                                                    <ChevronDown className="ml-auto h-4 w-4 transition-transform" />
                                                ) : (
                                                    <ChevronRight className="ml-auto h-4 w-4 transition-transform" />
                                                )}
                                            </SidebarMenuButton>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                            <SidebarMenuSub>
                                                {requestSubItems.map((subItem) => (
                                                    <SidebarMenuSubItem key={subItem.title}>
                                                        <SidebarMenuSubButton asChild isActive={pathname === subItem.url}>
                                                            <Link href={subItem.url}>
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
            {/* Manager Switch Button */}
            {role === "EMPLOYEE" && isManager && (
                <SidebarFooter className="p-2">
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton 
                                asChild 
                                tooltip="Switch to Manager View"
                            >
                                <Link href="/manager">
                                    <Crown className="h-4 w-4" />
                                    <span>Switch to Manager View</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
            )}
        </Sidebar>
    );
}
