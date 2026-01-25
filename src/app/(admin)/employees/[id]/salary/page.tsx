import { getSalaryHistory } from "@/actions/salary.actions";
import { getUserById } from "@/actions/user.actions";
import { notFound } from "next/navigation";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UpdateSalaryDialog } from "@/components/admin/UpdateSalaryDialog";
import { ArrowLeft, History } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function EmployeeSalaryHistoryPage({ params }: { params: { id: string } }) {
    const { id } = await params;
    const [user, history] = await Promise.all([
        getUserById(id),
        getSalaryHistory(id),
    ]);

    if (!user) notFound();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/admin/employees">
                        <Button variant="outline" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Salary Management</h1>
                        <p className="text-muted-foreground">Historical records for <span className="font-semibold text-black">{user.email}</span></p>
                    </div>
                </div>
                <UpdateSalaryDialog userId={id} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Revision Timeline
                    </CardTitle>
                    <CardDescription>A chronological record of base salary changes.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>Effective From</TableHead>
                                    <TableHead>Effective To</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead className="text-right">Base Amount</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                            No salary records found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    history.map((record: any) => (
                                        <TableRow key={record.id} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="font-medium">
                                                {new Date(record.effectiveFrom).toLocaleDateString(undefined, {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {record.effectiveTo
                                                    ? new Date(record.effectiveTo).toLocaleDateString()
                                                    : <span className="text-green-600 font-medium">Present</span>
                                                }
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="capitalize">
                                                    {record.reason.toLowerCase().replace('_', ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums font-bold text-lg">
                                                ৳{record.amount.toLocaleString("en-BD")}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {!record.effectiveTo ? (
                                                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">Active</Badge>
                                                ) : (
                                                    <Badge variant="secondary">Expired</Badge>
                                                )}
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
    );
}
