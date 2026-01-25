import { getSystemSettings, getAllowanceTypes } from "@/actions/settings.actions";
import { getActiveBranches } from "@/actions/branch.actions";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AllowanceDialog } from "@/components/admin/AddAllowanceDialog";
import { AllowanceToggle } from "@/components/admin/AllowanceToggle";
import { GlobalSettingsForm } from "@/components/admin/GlobalSettingsForm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function SettingsPage() {
    const [allowances, branches, systemSettings] = await Promise.all([
        getAllowanceTypes(),
        getActiveBranches(),
        getSystemSettings(),
    ]);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
                <p className="text-muted-foreground">Manage organization-wide policies and custom employee benefits.</p>
            </div>

            <div className="grid gap-8 lg:grid-cols-3">
                {/* Global Config Section */}
                <div className="lg:col-span-1">
                    <GlobalSettingsForm initialData={systemSettings} />
                </div>

                {/* Custom Allowances Section */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-semibold">Custom Allowances</h2>
                            <p className="text-xs text-muted-foreground">Define additional benefits for specific branches.</p>
                        </div>
                        <AllowanceDialog branches={branches} />
                    </div>

                    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 text-[11px] uppercase tracking-wider">
                                    <TableHead>Benefit</TableHead>
                                    <TableHead className="text-right">Value</TableHead>
                                    <TableHead>Branches</TableHead>
                                    <TableHead className="text-center">Active</TableHead>
                                    <TableHead className="text-right pr-6">Manage</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {allowances.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                            No custom allowances defined.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    allowances.map((allowance) => (
                                        <TableRow key={allowance.id} className="hover:bg-muted/10 transition-colors">
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-sm">{allowance.name}</span>
                                                    <span className="text-[10px] text-muted-foreground uppercase">{allowance.type}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums text-sm font-semibold text-indigo-700">
                                                {allowance.type === "FIXED"
                                                    ? `₹${allowance.amount.toLocaleString()}`
                                                    : `${allowance.amount}%`}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {allowance.branches.length === 0 ? (
                                                        <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">Global</Badge>
                                                    ) : (
                                                        allowance.branches.map(br => (
                                                            <Badge key={br.id} variant="secondary" className="text-[9px]">{br.name}</Badge>
                                                        ))
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <AllowanceToggle allowanceId={allowance.id} initialStatus={allowance.isActive} />
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <AllowanceDialog
                                                    branches={branches}
                                                    initialData={{
                                                        id: allowance.id,
                                                        name: allowance.name,
                                                        type: allowance.type,
                                                        amount: allowance.amount,
                                                        branchIds: allowance.branches.map(b => b.id)
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
                </div>
            </div>
        </div>
    );
}
