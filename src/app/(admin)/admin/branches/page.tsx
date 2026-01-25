import { getBranches, toggleBranchStatus } from "@/actions/branch.actions";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AddBranchDialog } from "@/components/admin/AddBranchDialog";
import { BranchToggle } from "@/components/admin/BranchToggle";

export default async function BranchesPage() {
    const branches = await getBranches();

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Branches</h1>
                    <p className="text-muted-foreground">Manage organization branches and locations.</p>
                </div>
                <AddBranchDialog />
            </div>

            <div className="border rounded-lg bg-card bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold">Name</TableHead>
                            <TableHead className="font-semibold">Location</TableHead>
                            <TableHead className="font-semibold text-center">Status</TableHead>
                            <TableHead className="font-semibold text-right pr-6">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {branches.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                                    No branches found. Add your first branch above.
                                </TableCell>
                            </TableRow>
                        ) : (
                            branches.map((branch) => (
                                <TableRow key={branch.id} className="hover:bg-muted/30 transition-colors">
                                    <TableCell className="font-medium">{branch.name}</TableCell>
                                    <TableCell>{branch.location}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={branch.isActive ? "default" : "secondary"}>
                                            {branch.isActive ? "Active" : "Inactive"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                        <BranchToggle branchId={branch.id} initialStatus={branch.isActive} />
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
