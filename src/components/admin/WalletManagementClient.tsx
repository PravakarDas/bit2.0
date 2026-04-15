"use client";

import { useState, useMemo } from "react";
import { updateWalletRequestStatus } from "@/actions/wallet.actions";
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
import { Label } from "@/components/ui/label";
import { ExternalLink, Check, X, TrendingUp, Wallet, Clock, DollarSign, Users as UsersIcon, Search } from "lucide-react";
import { format } from "date-fns";
import EmployeeProfileLink from "@/components/admin/EmployeeProfileLink";

interface WalletRequest {
    id: string;
    amount: number;
    description: string;
    status: string;
    attachmentUrl?: string | null;
    createdAt: Date;
    user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        walletBalance: number;
    };
}

interface WalletTransaction {
    id: string;
    amount: number;
    type: string;
    description: string;
    createdAt: Date;
    user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        department?: { name: string } | null;
        designation?: { name: string } | null;
    };
}

interface EmployeeWallet {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    walletBalance: number;
    department?: { name: string } | null;
    designation?: { name: string } | null;
    walletTransactions: Array<{
        id: string;
        amount: number;
        type: string;
        description: string;
        createdAt: Date;
    }>;
}

interface WalletManagementClientProps {
    initialPendingRequests: WalletRequest[];
    allTransactionsData: {
        transactions: WalletTransaction[];
        stats: {
            total: number;
            totalReimbursement: number;
            totalDeduction: number;
            totalAdjustment: number;
            reimbursementCount: number;
            deductionCount: number;
            adjustmentCount: number;
        };
    };
    employeeWallets: EmployeeWallet[];
}

export default function WalletManagementClient({ 
    initialPendingRequests, 
    allTransactionsData,
    employeeWallets
}: WalletManagementClientProps) {
    const [pendingRequests, setPendingRequests] = useState(initialPendingRequests);
    const [selectedRequest, setSelectedRequest] = useState<(WalletRequest & { action: "approve" | "reject" }) | null>(null);
    const [loading, setLoading] = useState(false);

    // Filters for history
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [monthFilter, setMonthFilter] = useState<string>("all");

    const handleRequestAction = async (action: "approve" | "reject") => {
        if (!selectedRequest) return;

        setLoading(true);
        try {
            await updateWalletRequestStatus(selectedRequest.id, action === "approve" ? "APPROVED" : "REJECTED");
            toast.success(`Request ${action === "approve" ? "approved" : "rejected"} successfully`);
            setSelectedRequest(null);
            
            // Update pending requests list
            setPendingRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
            
            // Refresh the page to update stats
            window.location.reload();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "An unexpected error occurred");
        } finally {
            setLoading(false);
        }
    };

    // Get unique months from transactions
    const availableMonths = useMemo(() => {
        const months = new Set<string>();
        allTransactionsData.transactions.forEach(transaction => {
            const monthYear = format(new Date(transaction.createdAt), "MMM yyyy");
            months.add(monthYear);
        });
        return Array.from(months).sort((a, b) => {
            const dateA = new Date(a);
            const dateB = new Date(b);
            return dateB.getTime() - dateA.getTime();
        });
    }, [allTransactionsData.transactions]);

    // Filtered transactions for history
    const filteredTransactions = useMemo(() => {
        return allTransactionsData.transactions.filter(transaction => {
            // Type filter
            if (typeFilter !== "all" && transaction.type !== typeFilter) {
                return false;
            }

            // Search filter
            if (searchQuery) {
                const search = searchQuery.toLowerCase();
                const employeeName = `${transaction.user.firstName || ''} ${transaction.user.lastName || ''}`.toLowerCase();
                const email = transaction.user.email?.toLowerCase() || '';
                const description = transaction.description?.toLowerCase() || '';
                
                if (!employeeName.includes(search) && !email.includes(search) && !description.includes(search)) {
                    return false;
                }
            }

            // Month filter
            if (monthFilter !== "all") {
                const transactionMonth = format(new Date(transaction.createdAt), "MMM yyyy");
                if (transactionMonth !== monthFilter) {
                    return false;
                }
            }

            return true;
        });
    }, [allTransactionsData.transactions, typeFilter, searchQuery, monthFilter]);

    const getTypeBadge = (type: string) => {
        switch (type) {
            case "REIMBURSEMENT":
                return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Reimbursement</Badge>;
            case "DEDUCTION":
                return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Deduction</Badge>;
            case "ADJUSTMENT":
                return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Adjustment</Badge>;
            default:
                return <Badge variant="outline">{type}</Badge>;
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Wallet Management</h1>
                <p className="text-muted-foreground">Manage employee wallet balances and transactions.</p>
            </div>

            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="pending">
                        Pending Requests
                        {pendingRequests.length > 0 && (
                            <Badge className="ml-2" variant="destructive">{pendingRequests.length}</Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="history">Transaction History</TabsTrigger>
                    <TabsTrigger value="balances">Employee Balances</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
                                <Wallet className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{allTransactionsData.stats.total}</div>
                                <p className="text-xs text-muted-foreground">All time transactions</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
                                <Clock className="h-4 w-4 text-yellow-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-yellow-600">{pendingRequests.length}</div>
                                <p className="text-xs text-muted-foreground">Awaiting review</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Reimbursements</CardTitle>
                                <TrendingUp className="h-4 w-4 text-green-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">
                                    ৳{allTransactionsData.stats.totalReimbursement.toLocaleString("en-BD")}
                                </div>
                                <p className="text-xs text-muted-foreground">{allTransactionsData.stats.reimbursementCount} transactions</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Deductions</CardTitle>
                                <DollarSign className="h-4 w-4 text-red-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">
                                    ৳{allTransactionsData.stats.totalDeduction.toLocaleString("en-BD")}
                                </div>
                                <p className="text-xs text-muted-foreground">{allTransactionsData.stats.deductionCount} transactions</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Adjustments</CardTitle>
                                <TrendingUp className="h-4 w-4 text-blue-600" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600">
                                    ৳{allTransactionsData.stats.totalAdjustment.toLocaleString("en-BD")}
                                </div>
                                <p className="text-xs text-muted-foreground">{allTransactionsData.stats.adjustmentCount} adjustments</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
                                <UsersIcon className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{employeeWallets.length}</div>
                                <p className="text-xs text-muted-foreground">With wallet accounts</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Recent Activity */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Transactions</CardTitle>
                            <CardDescription>Latest 5 wallet transactions</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {allTransactionsData.transactions.slice(0, 5).map((transaction) => (
                                    <div key={transaction.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">
                                                <EmployeeProfileLink
                                                    employeeId={transaction.user.id}
                                                    name={`${transaction.user.firstName || ""} ${transaction.user.lastName || ""}`}
                                                    email={transaction.user.email}
                                                />
                                            </p>
                                            <p className="text-xs text-muted-foreground">{transaction.description}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {format(new Date(transaction.createdAt), "MMM dd, yyyy 'at' hh:mm a")}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-sm font-semibold ${
                                                transaction.type === "DEDUCTION" ? "text-red-600" : "text-green-600"
                                            }`}>
                                                {transaction.type === "DEDUCTION" ? "-" : "+"}৳{Math.abs(Number(transaction.amount)).toLocaleString("en-BD")}
                                            </span>
                                            {getTypeBadge(transaction.type)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Pending Requests Tab */}
                <TabsContent value="pending" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Pending Requests</CardTitle>
                            <CardDescription>Review and approve employee wallet reimbursement requests</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-semibold">Employee</TableHead>
                                        <TableHead className="font-semibold">Description</TableHead>
                                        <TableHead className="font-semibold text-right">Amount</TableHead>
                                        <TableHead className="font-semibold text-right">Current Balance</TableHead>
                                        <TableHead className="font-semibold text-center">Attachment</TableHead>
                                        <TableHead className="font-semibold text-center">Submitted</TableHead>
                                        <TableHead className="font-semibold text-right pr-6">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingRequests.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                                No pending wallet requests to review.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        pendingRequests.map((request) => (
                                            <TableRow key={request.id} className="hover:bg-muted/30 transition-colors">
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">
                                                            <EmployeeProfileLink
                                                                employeeId={request.user.id}
                                                                name={`${request.user.firstName || ""} ${request.user.lastName || ""}`}
                                                                email={request.user.email}
                                                            />
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">{request.user.email}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="max-w-50">
                                                    <p className="line-clamp-2">{request.description}</p>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums font-semibold text-green-700">
                                                    ৳{Number(request.amount).toLocaleString("en-BD")}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums font-medium">
                                                    ৳{Number(request.user.walletBalance).toLocaleString("en-BD")}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {request.attachmentUrl ? (
                                                        <a
                                                            href={request.attachmentUrl}
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
                                                    {format(new Date(request.createdAt), "MMM dd, yyyy")}
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="text-destructive h-8"
                                                            onClick={() => setSelectedRequest({ ...request, action: "reject" })}
                                                        >
                                                            <X className="h-4 w-4 mr-1" />
                                                            Reject
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            className="h-8"
                                                            onClick={() => setSelectedRequest({ ...request, action: "approve" })}
                                                        >
                                                            <Check className="h-4 w-4 mr-1" />
                                                            Approve
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Transaction History Tab */}
                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Transaction History</CardTitle>
                            <CardDescription>View all wallet transactions with filters and search</CardDescription>
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
                                <Select value={typeFilter} onValueChange={setTypeFilter}>
                                    <SelectTrigger className="w-full md:w-45">
                                        <SelectValue placeholder="Filter by type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Types</SelectItem>
                                        <SelectItem value="REIMBURSEMENT">Reimbursement</SelectItem>
                                        <SelectItem value="DEDUCTION">Deduction</SelectItem>
                                        <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
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
                                Showing {filteredTransactions.length} of {allTransactionsData.transactions.length} transactions
                            </div>

                            {/* Table */}
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-semibold">Employee</TableHead>
                                        <TableHead className="font-semibold">Department</TableHead>
                                        <TableHead className="font-semibold">Description</TableHead>
                                        <TableHead className="font-semibold text-right">Amount</TableHead>
                                        <TableHead className="font-semibold text-center">Type</TableHead>
                                        <TableHead className="font-semibold text-center">Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredTransactions.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                                No transactions found matching your filters.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredTransactions.map((transaction) => (
                                            <TableRow key={transaction.id} className="hover:bg-muted/30 transition-colors">
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">
                                                            <EmployeeProfileLink
                                                                employeeId={transaction.user.id}
                                                                name={`${transaction.user.firstName || ""} ${transaction.user.lastName || ""}`}
                                                                email={transaction.user.email}
                                                            />
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">{transaction.user.email}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        {transaction.user.department && (
                                                            <span className="text-sm">{transaction.user.department.name}</span>
                                                        )}
                                                        {transaction.user.designation && (
                                                            <span className="text-xs text-muted-foreground">{transaction.user.designation.name}</span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="max-w-62.5">
                                                    <p className="line-clamp-2 text-sm">{transaction.description}</p>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums font-semibold">
                                                    <span className={transaction.type === "DEDUCTION" ? "text-red-600" : "text-green-600"}>
                                                        {transaction.type === "DEDUCTION" ? "-" : "+"}৳{Math.abs(Number(transaction.amount)).toLocaleString("en-BD")}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {getTypeBadge(transaction.type)}
                                                </TableCell>
                                                <TableCell className="text-center text-xs text-muted-foreground">
                                                    {format(new Date(transaction.createdAt), "MMM dd, yyyy")}
                                                    <br />
                                                    {format(new Date(transaction.createdAt), "hh:mm a")}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Employee Balances Tab */}
                <TabsContent value="balances" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Employee Wallet Balances</CardTitle>
                            <CardDescription>View wallet balance status for all employees</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-semibold">Employee</TableHead>
                                        <TableHead className="font-semibold">Department</TableHead>
                                        <TableHead className="font-semibold text-right">Wallet Balance</TableHead>
                                        <TableHead className="font-semibold text-center">Recent Transactions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {employeeWallets.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                                                No employee wallet records found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        employeeWallets.map((employee) => (
                                            <TableRow key={employee.id} className="hover:bg-muted/30 transition-colors">
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">
                                                            <EmployeeProfileLink
                                                                employeeId={employee.id}
                                                                name={`${employee.firstName || ""} ${employee.lastName || ""}`}
                                                                email={employee.email}
                                                            />
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {employee.email}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        {employee.department && (
                                                            <span className="text-sm">{employee.department.name}</span>
                                                        )}
                                                        {employee.designation && (
                                                            <span className="text-xs text-muted-foreground">
                                                                {employee.designation.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums font-semibold text-lg">
                                                    <span className={Number(employee.walletBalance) < 0 ? "text-red-600" : "text-green-600"}>
                                                        ৳{Number(employee.walletBalance).toLocaleString("en-BD")}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className="font-medium">
                                                        {employee.walletTransactions.length} recent
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>

            {/* Confirmation Dialog */}
            <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {selectedRequest?.action === "approve" ? "Approve Wallet Request" : "Reject Wallet Request"}
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to {selectedRequest?.action} this request of <strong>৳{selectedRequest?.amount?.toLocaleString("en-BD")}</strong> from <strong><EmployeeProfileLink employeeId={selectedRequest?.user?.id || ""} name={`${selectedRequest?.user?.firstName || ""} ${selectedRequest?.user?.lastName || ""}`} email={selectedRequest?.user?.email} className="font-semibold" /></strong>?
                            {selectedRequest?.action === "approve" && " This will add the amount to their wallet balance."}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedRequest(null)} disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            variant={selectedRequest?.action === "approve" ? "default" : "destructive"}
                            onClick={() => selectedRequest && handleRequestAction(selectedRequest.action)}
                            disabled={loading}
                        >
                            {loading ? "Processing..." : selectedRequest?.action === "approve" ? "Approve" : "Reject"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
