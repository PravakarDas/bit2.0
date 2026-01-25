"use client";

import { useEffect, useState } from "react";
import {
    getMedicalEntitlement,
    submitMedicalClaim,
    getMyMedicalClaims
} from "@/actions/medical.actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { History } from "lucide-react";

export default function EmployeeMedicalPage() {
    const [entitlement, setEntitlement] = useState<any>(null);
    const [claims, setClaims] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        amount: "",
        description: "",
        attachmentUrl: "",
    });

    const loadData = async () => {
        try {
            const [e, c] = await Promise.all([
                getMedicalEntitlement(),
                getMyMedicalClaims(),
            ]);
            setEntitlement(e);
            setClaims(c);
        } catch (error) {
            console.error("Error loading medical data:", error);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.amount || !formData.description) {
            toast.error("Please fill in required fields");
            return;
        }

        const amount = Number(formData.amount);
        if (amount > entitlement.remainingBalance) {
            toast.error(`Amount exceeds remaining balance of ৳${entitlement.remainingBalance}`);
            return;
        }

        setLoading(true);
        const res = await submitMedicalClaim({
            amount,
            description: formData.description,
            attachmentUrl: formData.attachmentUrl || undefined,
        });

        if (res.success) {
            toast.success("Claim submitted successfully");
            setFormData({ amount: "", description: "", attachmentUrl: "" });
            loadData();
        } else {
            toast.error(res.error || "Failed to submit claim");
        }
        setLoading(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Medical Reimbursement</h1>
                    <p className="text-muted-foreground">Submit and track your medical claims for the current year.</p>
                </div>
                <Link href="/medical/history">
                    <Button variant="outline">
                        <History className="mr-2 h-4 w-4" />
                        View History
                    </Button>
                </Link>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="md:col-span-1">
                    <CardHeader>
                        <CardTitle>Entitlement Summary</CardTitle>
                        <CardDescription>Current year: {new Date().getFullYear()}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Total Limit:</span>
                            <span className="font-bold">৳{entitlement?.totalLimit.toLocaleString("en-BD") || "..."}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Remaining:</span>
                            <span className="font-bold text-green-600">৳{entitlement?.remainingBalance.toLocaleString("en-BD") || "..."}</span>
                        </div>
                        {entitlement && (
                            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div
                                    className="bg-green-500 h-full transition-all duration-500"
                                    style={{ width: `${(entitlement.remainingBalance / entitlement.totalLimit) * 100}%` }}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>New Claim Request</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="amount">Amount (৳)</Label>
                                    <Input
                                        id="amount"
                                        type="number"
                                        placeholder="Enter amount"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="attachment">Attachment URL (Optional)</Label>
                                    <Input
                                        id="attachment"
                                        placeholder="https://link-to-receipt.com"
                                        value={formData.attachmentUrl}
                                        onChange={(e) => setFormData({ ...formData, attachmentUrl: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Describe the nature of the claim (e.g. Consultation fee, Medicine...)"
                                    className="min-h-[100px]"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            <Button type="submit" disabled={loading} className="w-full md:w-auto">
                                {loading ? "Submitting..." : "Submit Claim"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Claim History</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {claims.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                        No claims found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                claims.map((claim) => (
                                    <TableRow key={claim.id}>
                                        <TableCell className="text-sm">
                                            {new Date(claim.createdAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="max-w-[300px] truncate">
                                            {claim.description}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            ৳{claim.amount.toLocaleString("en-BD")}
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
                                                        claim.status === "PENDING" ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-yellow-200" : ""
                                                }
                                            >
                                                {claim.status}
                                            </Badge>
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
