import { getBonusTypes } from "@/actions/bonus.actions";
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
import { AddBonusDialog } from "@/components/admin/AddBonusDialog";
import { BonusToggle } from "@/components/admin/BonusToggle";

export default async function BonusesPage() {
    const [bonuses, branches] = await Promise.all([
        getBonusTypes(),
        getActiveBranches(),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Bonuses</h1>
                    <p className="text-muted-foreground">Configure and manage employee bonus structures.</p>
                </div>
                <AddBonusDialog branches={branches} />
            </div>

            <div className="border rounded-lg bg-card bg-white shadow-sm overflow-hidden">
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
                            bonuses.map((bonus: any) => (
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
                                                bonus.branches.map((br: any) => (
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
        </div>
    );
}

