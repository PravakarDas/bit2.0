"use client";

import { useState, useMemo } from "react";
import {
    approveMedicalClaim,
    rejectMedicalClaim
} from "@/actions/medical.actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ExternalLink, Check, X, TrendingUp, FileText, Clock, CheckCircle, XCircle, Search } from "lucide-react";
import { format } from "date-fns";
import EmployeeProfileLink from "@/components/admin/EmployeeProfileLink";

interface Entitlement {
    id: string;
    year: number;
    totalLimit: number;
    remainingBalance: number;
    totalClaimed: number;
    claimsCount: number;
    utilizationPercentage: string;
    user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        department?: { name: string } | null;
        designation?: { name: string } | null;
    };
    claims: Array<{
        id: string;
        amount: number;
        description: string;
        createdAt: Date;
    }>;
}

interface Claim {
    id: string;
    amount: number;
    description: string;
    status: string;
    attachmentUrl?: string | null;
    createdAt: Date;
    userId: string;
    user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        department?: { name: string } | null;
        designation?: { name: string } | null;
        medicalEntitlements?: { remainingBalance: number }[];
    };
}

interface MedicalClaimsClientProps {
    initialPendingClaims: Claim[];
    allClaimsData: {
        claims: Claim[];
        stats: {
            total: number;
            pending: number;
            approved: number;
            rejected: number;
            totalAmount: number;
            approvedAmount: number;
        };
    };
    employeeEntitlements: Entitlement[];
}

export default function MedicalClaimsClient({ initialPendingClaims, allClaimsData, employeeEntitlements }: MedicalClaimsClientProps) {
    const [pendingClaims, setPendingClaims] = useState(initialPendingClaims);
    const [selectedClaim, setSelectedClaim] = useState<(Claim & { action: "approve" | "reject" }) | null>(null);
    const [loading, setLoading] = useState(false);
    
    // Filters for history
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [monthFilter, setMonthFilter] = useState<string>("all");

    const handleAction = async (action: "approve" | "reject") => {
        if (!selectedClaim) return;

        setLoading(true);
        try {
            const res = action === "approve"
                ? await approveMedicalClaim(selectedClaim.id)
                : await rejectMedicalClaim(selectedClaim.id);

            if (res.success) {
                toast.success(`Claim ${action === "approve" ? "approved" : "rejected"} successfully`);
                setSelectedClaim(null);
                
                // Update pending claims list
                setPendingClaims(prev => prev.filter(c => c.id !== selectedClaim.id));
                
                // Refresh the page to update stats
                window.location.reload();
            } else {
                toast.error((res as { error?: string }).error || `Failed to ${action} claim`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    };

    // Get unique months from claims
    const availableMonths = useMemo(() => {
        const months = new Set<string>();
        allClaimsData.claims.forEach(claim => {
            const monthYear = format(new Date(claim.createdAt), "MMM yyyy");
            months.add(monthYear);
        });
        return Array.from(months).sort((a, b) => {
            const dateA = new Date(a);
            const dateB = new Date(b);
            return dateB.getTime() - dateA.getTime();
        });
    }, [allClaimsData.claims]);

    // Filtered claims for history
    const filteredClaims = useMemo(() => {
        return allClaimsData.claims.filter(claim => {
            // Status filter
            if (statusFilter !== "all" && claim.status !== statusFilter) {
                return false;
            }

            // Search filter
            if (searchQuery) {
                const search = searchQuery.toLowerCase();
                const employeeName = `${claim.user.firstName || ''} ${claim.user.lastName || ''}`.toLowerCase();
                const email = claim.user.email?.toLowerCase() || '';
                const description = claim.description?.toLowerCase() || '';
                
                if (!employeeName.includes(search) && !email.includes(search) && !description.includes(search)) {
                    return false;
                }
            }

            // Month filter
            if (monthFilter !== "all") {
                const claimMonth = format(new Date(claim.createdAt), "MMM yyyy");
                if (claimMonth !== monthFilter) {
                    return false;
                }
            }

            return true;
        });
    }, [allClaimsData.claims, statusFilter, searchQuery, monthFilter]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "APPROVED":
                return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>;
            case "REJECTED":
                return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Rejected</Badge>;
            case "PENDING":
                return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Medical Claims Management</h1>
                <p className="text-muted-foreground">Manage and review employee medical reimbursement claims.</p>
            </div>

            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="pending">
                        Pending Claims
                        {pendingClaims.length > 0 && (
                            <Badge className="ml-2" variant="destructive">{pendingClaims.length}</Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="history">Claims History</TabsTrigger>
                    <TabsTrigger value="entitlements">
                        Employee Entitlements
                    </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Claims</CardTitle>
                                <FileText className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{allClaimsData.stats.total}</div>
                                <p className="text-xs text-muted-foreground">All time claims</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Pending Claims</CardTitle>
                                <Clock className="h-4 w-4 text-yellow-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-yellow-600">{allClaimsData.stats.pending}</div>
                                <p className="text-xs text-muted-foreground">Awaiting review</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Approved Claims</CardTitle>
                                <CheckCircle className="h-4 w-4 text-green-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">{allClaimsData.stats.approved}</div>
                                <p className="text-xs text-muted-foreground">Successfully processed</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Rejected Claims</CardTitle>
                                <XCircle className="h-4 w-4 text-red-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">{allClaimsData.stats.rejected}</div>
                                <p className="text-xs text-muted-foreground">Declined requests</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
                                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">৳{allClaimsData.stats.totalAmount.toLocaleString("en-BD")}</div>
                                <p className="text-xs text-muted-foreground">All claims combined</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Approved Amount</CardTitle>
                                <TrendingUp className="h-4 w-4 text-green-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">৳{allClaimsData.stats.approvedAmount.toLocaleString("en-BD")}</div>
                                <p className="text-xs text-muted-foreground">Total disbursed</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Recent Activity */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Claims</CardTitle>
                            <CardDescription>Latest 5 medical claims submitted</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {allClaimsData.claims.slice(0, 5).map((claim) => (
                                    <div key={claim.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">
                                                <EmployeeProfileLink
                                                    employeeId={claim.user.id}
                                                    name={`${claim.user.firstName || ""} ${claim.user.lastName || ""}`}
                                                    email={claim.user.email}
                                                />
                                            </p>
                                            <p className="text-xs text-muted-foreground">{claim.description}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {format(new Date(claim.createdAt), "MMM dd, yyyy 'at' hh:mm a")}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-semibold">৳{Number(claim.amount).toLocaleString("en-BD")}</span>
                                            {getStatusBadge(claim.status)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Pending Claims Tab */}
                <TabsContent value="pending" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Pending Claims Review</CardTitle>
                            <CardDescription>Approve or reject employee medical reimbursement requests</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-semibold">Employee</TableHead>
                                        <TableHead className="font-semibold">Description</TableHead>
                                        <TableHead className="font-semibold text-right">Amount</TableHead>
                                        <TableHead className="font-semibold text-right">Remaining Bal.</TableHead>
                                        <TableHead className="font-semibold text-center">Attachment</TableHead>
                                        <TableHead className="font-semibold text-center">Submitted</TableHead>
                                        <TableHead className="font-semibold text-right pr-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingClaims.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                No pending medical claims to review.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        pendingClaims.map((claim) => {
                                            const entitlement = claim.user.medicalEntitlements?.[0];
                                            const balance = entitlement?.remainingBalance ?? 0;

                                            return (
                                                <TableRow key={claim.id} className="hover:bg-muted/30 transition-colors">
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">
                                                                <EmployeeProfileLink
                                                                    employeeId={claim.user.id}
                                                                    name={`${claim.user.firstName || ""} ${claim.user.lastName || ""}`}
                                                                    email={claim.user.email}
                                                                />
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">{claim.user.email}</span>
                                                            {claim.user.department && (
                                                                <span className="text-xs text-muted-foreground">{claim.user.department.name}</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="max-w-50">
                                                        <p className="line-clamp-2">{claim.description}</p>
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums font-semibold text-indigo-700">
                                                        ৳{Number(claim.amount).toLocaleString("en-BD")}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums font-medium">
                                                        <span className={balance < claim.amount ? "text-destructive" : "text-green-600"}>
                                                            ৳{balance.toLocaleString("en-BD")}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {claim.attachmentUrl ? (
                                                            <a
                                                                href={claim.attachmentUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                                                            >
                                                                <ExternalLink className="h-4 w-4" />
                                                                <span className="text-xs">View</span>
                                                            </a>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground italic">None</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center text-xs text-muted-foreground">
                                                        {format(new Date(claim.createdAt), "MMM dd, yyyy")}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="text-destructive h-8"
                                                                onClick={() => setSelectedClaim({ ...claim, action: "reject" })}
                                                            >
                                                                <X className="h-4 w-4 mr-1" />
                                                                Reject
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                className="h-8"
                                                                onClick={() => setSelectedClaim({ ...claim, action: "approve" })}
                                                                disabled={balance < claim.amount}
                                                            >
                                                                <Check className="h-4 w-4 mr-1" />
                                                                Approve
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Claims History Tab */}
                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Claims History</CardTitle>
                            <CardDescription>View all medical claims with filters and search</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Filters */}
                            <div className="flex flex-col md:flex-row gap-3">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by employee name, email, or description..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-full md:w-45">
                                        <SelectValue placeholder="Filter by status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="PENDING">Pending</SelectItem>
                                        <SelectItem value="APPROVED">Approved</SelectItem>
                                        <SelectItem value="REJECTED">Rejected</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={monthFilter} onValueChange={setMonthFilter}>
                                    <SelectTrigger className="w-full md:w-45">
                                        <SelectValue placeholder="Filter by month" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Months</SelectItem>
                                        {availableMonths.map(month => (
                                            <SelectItem key={month} value={month}>{month}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Results */}
                            <div className="text-sm text-muted-foreground">
                                Showing {filteredClaims.length} of {allClaimsData.claims.length} claims
                            </div>

                            {/* Table */}
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-semibold">Employee</TableHead>
                                        <TableHead className="font-semibold">Department</TableHead>
                                        <TableHead className="font-semibold">Description</TableHead>
                                        <TableHead className="font-semibold text-right">Amount</TableHead>
                                        <TableHead className="font-semibold text-center">Status</TableHead>
                                        <TableHead className="font-semibold text-center">Submitted</TableHead>
                                        <TableHead className="font-semibold text-center">Attachment</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredClaims.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                No claims found matching your filters.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredClaims.map((claim) => (
                                            <TableRow key={claim.id} className="hover:bg-muted/30 transition-colors">
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">
                                                            <EmployeeProfileLink
                                                                employeeId={claim.user.id}
                                                                name={`${claim.user.firstName || ""} ${claim.user.lastName || ""}`}
                                                                email={claim.user.email}
                                                            />
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">{claim.user.email}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        {claim.user.department && (
                                                            <span className="text-sm">{claim.user.department.name}</span>
                                                        )}
                                                        {claim.user.designation && (
                                                            <span className="text-xs text-muted-foreground">{claim.user.designation.name}</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="max-w-62.5">
                                                    <p className="line-clamp-2 text-sm">{claim.description}</p>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums font-semibold">
                                                    ৳{Number(claim.amount).toLocaleString("en-BD")}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {getStatusBadge(claim.status)}
                                                </TableCell>
                                                <TableCell className="text-center text-xs text-muted-foreground">
                                                    {format(new Date(claim.createdAt), "MMM dd, yyyy")}
                                                    <br />
                                                    {format(new Date(claim.createdAt), "hh:mm a")}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {claim.attachmentUrl ? (
                                                        <a
                                                            href={claim.attachmentUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800"
                                                        >
                                                            <ExternalLink className="h-4 w-4" />
                                                            <span className="text-xs">View</span>
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground italic">None</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Employee Entitlements Tab */}
                <TabsContent value="entitlements" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Employee Medical Entitlements</CardTitle>
                            <CardDescription>View medical entitlement status and claiming history for all employees ({new Date().getFullYear()})</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-semibold">Employee</TableHead>
                                        <TableHead className="font-semibold">Department</TableHead>
                                        <TableHead className="font-semibold text-right">Total Limit</TableHead>
                                        <TableHead className="font-semibold text-right">Total Claimed</TableHead>
                                        <TableHead className="font-semibold text-right">Remaining</TableHead>
                                        <TableHead className="font-semibold text-center">Utilization</TableHead>
                                        <TableHead className="font-semibold text-center">Claims Count</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {employeeEntitlements.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                No employee entitlements found for {new Date().getFullYear()}.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        employeeEntitlements.map((entitlement) => {
                                            const utilizationNum = parseFloat(entitlement.utilizationPercentage);
                                            const utilizationColor = utilizationNum >= 80 
                                                ? "text-red-600" 
                                                : utilizationNum >= 50 
                                                    ? "text-yellow-600" 
                                                    : "text-green-600";

                                            return (
                                                <TableRow key={entitlement.id} className="hover:bg-muted/30 transition-colors">
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">
                                                                <EmployeeProfileLink
                                                                    employeeId={entitlement.user.id}
                                                                    name={`${entitlement.user.firstName || ""} ${entitlement.user.lastName || ""}`}
                                                                    email={entitlement.user.email}
                                                                />
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {entitlement.user.email}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            {entitlement.user.department && (
                                                                <span className="text-sm">{entitlement.user.department.name}</span>
                                                            )}
                                                            {entitlement.user.designation && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {entitlement.user.designation.name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums font-semibold">
                                                        ৳{Number(entitlement.totalLimit).toLocaleString("en-BD")}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums font-medium text-indigo-700">
                                                        ৳{Number(entitlement.totalClaimed).toLocaleString("en-BD")}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums font-medium text-green-600">
                                                        ৳{Number(entitlement.remainingBalance).toLocaleString("en-BD")}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className={`font-semibold ${utilizationColor}`}>
                                                                {entitlement.utilizationPercentage}%
                                                            </span>
                                                            <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                                                                <div 
                                                                    className={`h-2 rounded-full ${
                                                                        utilizationNum >= 80 
                                                                            ? "bg-red-600" 
                                                                            : utilizationNum >= 50 
                                                                                ? "bg-yellow-600" 
                                                                                : "bg-green-600"
                                                                    }`}
                                                                    style={{ width: `${Math.min(utilizationNum, 100)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Badge variant="outline" className="font-medium">
                                                            {entitlement.claimsCount} {entitlement.claimsCount === 1 ? "claim" : "claims"}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Confirmation Dialog */}
            <Dialog open={!!selectedClaim} onOpenChange={(open) => !open && setSelectedClaim(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {selectedClaim?.action === "approve" ? "Approve Medical Claim" : "Reject Medical Claim"}
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to {selectedClaim?.action} this claim of <strong>৳{selectedClaim?.amount?.toLocaleString("en-BD")}</strong> from <strong><EmployeeProfileLink employeeId={selectedClaim?.user?.id || ""} name={`${selectedClaim?.user?.firstName || ""} ${selectedClaim?.user?.lastName || ""}`} email={selectedClaim?.user?.email} className="font-semibold" /></strong>?
                            {selectedClaim?.action === "approve" && " This will automatically deduct the amount from their annual medical entitlement."}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedClaim(null)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            variant={selectedClaim?.action === "approve" ? "default" : "destructive"}
                            onClick={() => selectedClaim && handleAction(selectedClaim.action)}
                            disabled={loading}
                        >
                            {loading ? "Processing..." : selectedClaim?.action === "approve" ? "Approve" : "Reject"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
