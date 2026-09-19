"use client";

import { useEffect, useState } from "react";
import { getMyMedicalClaims } from "@/actions/medical.actions";
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
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MedicalAmount } from "@/components/shared/MedicalAmount";

type MedicalClaim = Awaited<ReturnType<typeof getMyMedicalClaims>>[number];

export default function MedicalHistoryPage() {
    const [claims, setClaims] = useState<MedicalClaim[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadClaims() {
            try {
                const data = await getMyMedicalClaims();
                setClaims(data);
            } catch (error) {
                console.error("Error loading medical history:", error);
            } finally {
                setLoading(false);
            }
        }
        loadClaims();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/medical">
                    <Button variant="outline" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Medical Claim History</h1>
                    <p className="text-muted-foreground">A detailed log of all your submitted medical reimbursement requests.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>My Claims</CardTitle>
                    <CardDescription>View status and details of past submissions.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date Requested</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-center">Reference ID</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {claims.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                        No medical claims found in your record.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                claims.map((claim) => (
                                    <TableRow key={claim.id} className="hover:bg-muted/30 transition-colors">
                                        <TableCell className="text-sm">
                                            {new Date(claim.createdAt).toLocaleDateString(undefined, {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </TableCell>
                                        <TableCell className="max-w-[300px] truncate font-medium">
                                            {claim.description}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums font-semibold">
                                            <MedicalAmount claim={claim} />
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge
                                                variant={
                                                    claim.status === "APPROVED" ? "default" :
                                                        claim.status === "PENDING" ? "secondary" :
                                                            claim.status === "PAID" ? "outline" : "destructive"
                                                }
                                                className={
                                                    claim.status === "APPROVED" ? "bg-green-100 text-green-800 hover:bg-green-100 border-green-200" :
                                                        claim.status === "PENDING" ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-yellow-200" :
                                                            claim.status === "PAID" ? "bg-blue-50 text-blue-700 border-blue-100" : ""
                                                }
                                            >
                                                {claim.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center text-[10px] font-mono text-muted-foreground">
                                            {claim.id.slice(-8).toUpperCase()}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
