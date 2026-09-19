"use client";

import { PdfTemplatesSection, type PdfTemplateSummary } from "@/components/admin/PdfTemplatesSection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, Briefcase, DollarSign, Gift, CalendarDays } from "lucide-react";
import { AddBranchDialog } from "./AddBranchDialog";
import { EditBranchDialog } from "./EditBranchDialog";
import { DeleteBranchButton } from "./DeleteBranchButton";
import { BranchToggle } from "./BranchToggle";
import { BranchLoanApplicationToggle } from "./BranchLoanApplicationToggle";
import { AllBranchesLoanApplicationToggle } from "./AllBranchesLoanApplicationToggle";
import { DepartmentClient } from "./DepartmentClient";
import { DesignationClient } from "./DesignationClient";
import { AddBonusDialog } from "./AddBonusDialog";
import { BonusToggle } from "./BonusToggle";
import { AllowanceDialog } from "./AddAllowanceDialog";
import { AllowanceToggle } from "./AllowanceToggle";
import { AddLeaveTypeDialog } from "./AddLeaveTypeDialog";
import { EditLeaveTypeDialog } from "./EditLeaveTypeDialog";
import { LeaveTypeToggle } from "./LeaveTypeToggle";
import { GlobalSettingsForm } from "./GlobalSettingsForm";
import { Edit2 } from "lucide-react";

type Branch = {
    id: string;
    name: string;
    location: string;
    isLoanApplicationEnabled: boolean;
    checkInTime: string;
    checkOutTime: string;
    breakDuration: string;
    weeklyOffDays: string[];
    isActive: boolean;
};

type Department = {
    id: string;
    name: string;
    parentId: string | null;
    parent: { id: string; name: string } | null;
    description: string | null;
    isActive: boolean;
    _count: {
        users: number;
        designations: number;
    };
    children: unknown[];
};

type Designation = {
    id: string;
    name: string;
    description: string | null;
    departmentId: string;
    isActive: boolean;
    department: {
        id: string;
        name: string;
        isActive: boolean;
    };
    _count: {
        users: number;
    };
};

type Bonus = {
    id: string;
    name: string;
    type: string;
    value: number;
    isActive: boolean;
    branches: { id: string; name: string }[];
};

type Allowance = {
    id: string;
    name: string;
    valueType: string;
    scope: string;
    amount: number;
    targetBranchIds: string[];
    isActive: boolean;
};

type LeaveType = {
    id: string;
    name: string;
    allocatedDays: number;
    requiresApproval: boolean;
    applicableBranches: string | null;
    isActive: boolean;
};

interface UnifiedOrganizationClientProps {
    branches: Branch[];
    departments: Department[];
    designations: Designation[];
    bonuses: Bonus[];
    allowances: Allowance[];
    leaveTypes: LeaveType[];
    systemSettings: {
        medicalClaimLimit: number;
    };
    /** Only passed for Admin/HR; managers do not see the PDF Templates section. */
    pdfTemplates?: PdfTemplateSummary | null;
}

export function UnifiedOrganizationClient({
    branches,
    departments,
    designations,
    bonuses,
    allowances,
    leaveTypes,
    systemSettings,
    pdfTemplates = null,
}: UnifiedOrganizationClientProps) {
    return (
        <div className="space-y-12 pb-12">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Organization Management</h1>
                <p className="text-muted-foreground">
                    Manage your organization structure, locations, and compensation policies.
                </p>
            </div>

            {/* PDF letterhead templates (Admin/HR only) */}
            {pdfTemplates && (
                <section id="pdf-templates" className="scroll-mt-20">
                    <PdfTemplatesSection templates={pdfTemplates} branches={branches} />
                </section>
            )}

            {/* Section 1: Branches */}
            <section id="branches" className="scroll-mt-20">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-primary" />
                                <div>
                                    <CardTitle>Branches</CardTitle>
                                    <CardDescription>Manage organization branches and locations</CardDescription>
                                </div>
                            </div>
                            <AddBranchDialog />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div id="branch-loan-settings" className="mb-4 scroll-mt-20">
                            <AllBranchesLoanApplicationToggle branches={branches} />
                        </div>
                        <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-semibold">Name</TableHead>
                                        <TableHead className="font-semibold">Location</TableHead>
                                        <TableHead className="font-semibold text-center">Loan Apply</TableHead>
                                        <TableHead className="font-semibold text-center">Status</TableHead>
                                        <TableHead className="font-semibold text-right pr-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {branches.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                                No branches found. Add your first branch above.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        branches.map((branch) => (
                                            <TableRow key={branch.id} className="hover:bg-muted/30 transition-colors">
                                                <TableCell className="font-medium">{branch.name}</TableCell>
                                                <TableCell>{branch.location}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={branch.isLoanApplicationEnabled ? "default" : "secondary"}>
                                                        {branch.isLoanApplicationEnabled ? "On" : "Off"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={branch.isActive ? "default" : "secondary"}>
                                                        {branch.isActive ? "Active" : "Inactive"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <BranchLoanApplicationToggle
                                                            branchId={branch.id}
                                                            initialStatus={branch.isLoanApplicationEnabled}
                                                        />
                                                        <EditBranchDialog branch={branch} />
                                                        <DeleteBranchButton branchId={branch.id} branchName={branch.name} />
                                                        <BranchToggle branchId={branch.id} initialStatus={branch.isActive} />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* Section 2: Departments & Designations */}
            <section id="departments" className="scroll-mt-20">
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Briefcase className="h-5 w-5 text-primary" />
                            <div>
                                <CardTitle>Departments & Designations</CardTitle>
                                <CardDescription>Define organizational structure and job roles</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-6 lg:grid-cols-2">
                            <div>
                                <DepartmentClient initialDepartments={departments} />
                            </div>
                            <div>
                                <DesignationClient 
                                    initialDesignations={designations}
                                    departments={departments.filter(d => d.isActive)}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* Section 3: Bonuses */}
            <section id="bonuses" className="scroll-mt-20">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Gift className="h-5 w-5 text-primary" />
                                <div>
                                    <CardTitle>Bonuses</CardTitle>
                                    <CardDescription>Configure employee bonus structures and incentives</CardDescription>
                                </div>
                            </div>
                            <AddBonusDialog branches={branches.filter(b => b.isActive)} />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-semibold">Bonus Type</TableHead>
                                        <TableHead className="font-semibold text-right">Value</TableHead>
                                        <TableHead className="font-semibold">Target Branches</TableHead>
                                        <TableHead className="font-semibold text-center">Status</TableHead>
                                        <TableHead className="font-semibold text-right pr-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {bonuses.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                                No bonus types found. Add your first bonus above.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        bonuses.map((bonus) => (
                                            <TableRow key={bonus.id} className="hover:bg-muted/30 transition-colors">
                                                <TableCell className="font-medium">
                                                    <div className="flex flex-col">
                                                        <span>{bonus.name}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase">{bonus.type}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {bonus.type === "FIXED"
                                                        ? `৳${bonus.value.toLocaleString("en-BD")}`
                                                        : `${bonus.value}%`}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {bonus.branches.length === 0 ? (
                                                            <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Global</Badge>
                                                        ) : (
                                                            bonus.branches.map((br) => (
                                                                <Badge key={br.id} variant="secondary" className="text-[10px]">{br.name}</Badge>
                                                            ))
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={bonus.isActive ? "default" : "secondary"}>
                                                        {bonus.isActive ? "Active" : "Inactive"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <BonusToggle bonusId={bonus.id} initialStatus={bonus.isActive} />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* Section 4: Allowances & Settings */}
            <section id="allowances" className="scroll-mt-20">
                <div className="space-y-6">
                    {/* Medical Settings */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2">
                                <DollarSign className="h-5 w-5 text-primary" />
                                <div>
                                    <CardTitle>Medical Settings</CardTitle>
                                    <CardDescription>Configure default medical claim limits</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <GlobalSettingsForm initialData={systemSettings} />
                        </CardContent>
                    </Card>

                    {/* Custom Allowances */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-5 w-5 text-primary" />
                                    <div>
                                        <CardTitle>Allowance Types</CardTitle>
                                        <CardDescription>Manage allowance types with different scopes and calculation methods</CardDescription>
                                    </div>
                                </div>
                                <AllowanceDialog branches={branches.filter(b => b.isActive)} />
                            </div>
                        </CardHeader>
                    <CardContent>
                        <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-semibold">Allowance</TableHead>
                                        <TableHead className="font-semibold text-center">Scope</TableHead>
                                        <TableHead className="font-semibold text-right">Value</TableHead>
                                        <TableHead className="font-semibold">Target</TableHead>
                                        <TableHead className="font-semibold text-center">Status</TableHead>
                                        <TableHead className="font-semibold text-right pr-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {allowances.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                                No allowance types defined.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        allowances.map((allowance) => (
                                            <TableRow key={allowance.id} className="hover:bg-muted/10 transition-colors">
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-sm">{allowance.name}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase">{allowance.valueType}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge 
                                                        variant={
                                                            allowance.scope === "FIXED" ? "default" : 
                                                            allowance.scope === "FULL_BRANCH" ? "secondary" : 
                                                            "outline"
                                                        }
                                                        className="text-[10px]"
                                                    >
                                                        {allowance.scope === "FIXED" ? "All Employees" :
                                                         allowance.scope === "FULL_BRANCH" ? "Branch-wide" :
                                                         "Individual"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums text-sm font-semibold text-indigo-700">
                                                    {allowance.valueType === "FIXED"
                                                        ? `৳${allowance.amount.toLocaleString("en-BD")}`
                                                        : `${allowance.amount}%`}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {allowance.scope === "FIXED" ? (
                                                            <Badge variant="outline" className="text-[9px] bg-green-50 text-green-700 border-green-200">All Branches</Badge>
                                                        ) : allowance.scope === "CUSTOM" ? (
                                                            <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-700 border-purple-200">Per Employee</Badge>
                                                        ) : allowance.targetBranchIds.length === 0 ? (
                                                            <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">No Selection</Badge>
                                                        ) : (
                                                            allowance.targetBranchIds.map(branchId => {
                                                                const branch = branches.find(b => b.id === branchId);
                                                                return branch ? (
                                                                    <Badge key={branchId} variant="secondary" className="text-[9px]">{branch.name}</Badge>
                                                                ) : null;
                                                            })
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <AllowanceToggle allowanceId={allowance.id} initialStatus={allowance.isActive} />
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <AllowanceDialog
                                                        branches={branches.filter(b => b.isActive)}
                                                        initialData={{
                                                            id: allowance.id,
                                                            name: allowance.name,
                                                            valueType: allowance.valueType as "FIXED" | "PERCENTAGE",
                                                            scope: allowance.scope as "FIXED" | "FULL_BRANCH" | "CUSTOM",
                                                            amount: allowance.amount,
                                                            targetBranchIds: allowance.targetBranchIds
                                                        }}
                                                        trigger={
                                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                                                            </Button>
                                                        }
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
                </div>
            </section>

            {/* Section 5: Leave Types */}
            <section id="leave-types" className="scroll-mt-20">
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CalendarDays className="h-5 w-5 text-primary" />
                                <div>
                                    <CardTitle>Leave Types</CardTitle>
                                    <CardDescription>Manage different types of leaves and their allocations</CardDescription>
                                </div>
                            </div>
                            <AddLeaveTypeDialog branches={branches.filter(b => b.isActive)} />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-semibold">Leave Type</TableHead>
                                        <TableHead className="font-semibold">Days per Year</TableHead>
                                        <TableHead className="font-semibold">Requires Approval</TableHead>
                                        <TableHead className="font-semibold">Applicable Branches</TableHead>
                                        <TableHead className="font-semibold text-center">Status</TableHead>
                                        <TableHead className="font-semibold text-right pr-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {leaveTypes.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                                <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                                                <p>No leave types found</p>
                                                <p className="text-sm">Add your first leave type to get started</p>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        leaveTypes.map((leaveType) => {
                                            const applicableBranchIds = JSON.parse(leaveType.applicableBranches || '[]');
                                            const applicableBranches = branches.filter(branch => 
                                                applicableBranchIds.includes(branch.id)
                                            );

                                            return (
                                                <TableRow key={leaveType.id} className="hover:bg-muted/30 transition-colors">
                                                    <TableCell className="font-medium">{leaveType.name}</TableCell>
                                                    <TableCell>
                                                        <div className="font-semibold text-blue-600">
                                                            {leaveType.allocatedDays} days
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge 
                                                            variant={leaveType.requiresApproval ? "destructive" : "secondary"}
                                                        >
                                                            {leaveType.requiresApproval ? "Yes" : "No"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-wrap gap-1">
                                                            {applicableBranches.length === 0 ? (
                                                                <Badge variant="outline" className="text-xs">None</Badge>
                                                            ) : applicableBranches.length === branches.length ? (
                                                                <Badge variant="outline" className="text-xs">All Branches</Badge>
                                                            ) : (
                                                                applicableBranches.slice(0, 2).map(branch => (
                                                                    <Badge key={branch.id} variant="outline" className="text-xs">
                                                                        {branch.name}
                                                                    </Badge>
                                                                ))
                                                            )}
                                                            {applicableBranches.length > 2 && (
                                                                <Badge variant="outline" className="text-xs">
                                                                    +{applicableBranches.length - 2} more
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <LeaveTypeToggle 
                                                            leaveTypeId={leaveType.id} 
                                                            isActive={leaveType.isActive} 
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <EditLeaveTypeDialog 
                                                            leaveType={leaveType} 
                                                            branches={branches.filter(b => b.isActive)}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </section>
        </div>
    );
}
