"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Search, Eye, Calendar, DollarSign, Users, TrendingUp } from "lucide-react";

type ProcessedPayroll = {
    id: string;
    month: string;
    baseSalary: number;
    totalBonuses: number;
    totalAllowances: number;
    medicalReimbursement: number;
    loanDeduction: number;
    walletAdjustment: number;
    netAmount: number;
    createdAt: Date;
    user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        bankAccountNumber: string | null;
        branch: { name: string } | null;
        department: { name: string } | null;
        designation: { name: string } | null;
    };
};

interface ProcessedPayrollClientProps {
    data: ProcessedPayroll[];
}

export function ProcessedPayrollClient({ data }: ProcessedPayrollClientProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedMonth, setSelectedMonth] = useState<string>("all");
    const [selectedPayroll, setSelectedPayroll] = useState<ProcessedPayroll | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    // Get unique months from data
    const uniqueMonths = Array.from(new Set(data.map(p => p.month))).sort().reverse();

    // Filter data
    const filteredData = data.filter(payroll => {
        const matchesSearch = 
            payroll.user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            payroll.user.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            payroll.user.email.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesMonth = selectedMonth === "all" || payroll.month === selectedMonth;

        return matchesSearch && matchesMonth;
    });

    // Calculate summary stats
    const totalPaid = filteredData.reduce((sum, p) => sum + p.netAmount, 0);
    const totalEmployees = new Set(filteredData.map(p => p.user.id)).size;

    const formatMonth = (monthStr: string) => {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    };

    const handleViewDetails = (payroll: ProcessedPayroll) => {
        setSelectedPayroll(payroll);
        setIsDetailOpen(true);
    };

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{filteredData.length}</div>
                        <p className="text-xs text-muted-foreground">Salary payments processed</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Amount Paid</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">৳{totalPaid.toLocaleString("en-BD")}</div>
                        <p className="text-xs text-muted-foreground">Cumulative payroll</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Employees Paid</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalEmployees}</div>
                        <p className="text-xs text-muted-foreground">Unique employees</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by employee name or email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <SelectValue placeholder="Select month" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Months</SelectItem>
                                {uniqueMonths.map((month) => (
                                    <SelectItem key={month} value={month}>
                                        {formatMonth(month)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Payroll Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Processed Payroll Records</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="border rounded-md overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50">
                                    <TableHead>Employee</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Month</TableHead>
                                    <TableHead>Processed Date</TableHead>
                                    <TableHead className="text-right">Net Amount</TableHead>
                                    <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                                            No processed payroll records found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredData.map((payroll) => (
                                        <TableRow key={payroll.id} className="hover:bg-muted/30 transition-colors">
                                            <TableCell className="font-medium">
                                                {payroll.user.firstName && payroll.user.lastName
                                                    ? `${payroll.user.firstName} ${payroll.user.lastName}`
                                                    : "N/A"}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {payroll.user.email}
                                            </TableCell>
                                            <TableCell>
                                                {payroll.user.department?.name || "N/A"}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {formatMonth(payroll.month)}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {new Date(payroll.createdAt).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric'
                                                })}
                                            </TableCell>
                                            <TableCell className="text-right font-bold">
                                                ৳{payroll.netAmount.toLocaleString("en-BD")}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleViewDetails(payroll)}
                                                >
                                                    <Eye className="h-4 w-4 mr-1" />
                                                    Details
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Details Dialog */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Payroll Details</DialogTitle>
                        <DialogDescription>
                            Complete breakdown for {selectedPayroll?.user.firstName} {selectedPayroll?.user.lastName}
                        </DialogDescription>
                    </DialogHeader>
                    
                    {selectedPayroll && (
                        <div className="space-y-6">
                            {/* Employee Info */}
                            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                                <div>
                                    <p className="text-sm text-muted-foreground">Employee</p>
                                    <p className="font-medium">
                                        {selectedPayroll.user.firstName} {selectedPayroll.user.lastName}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Email</p>
                                    <p className="font-medium">{selectedPayroll.user.email}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Department</p>
                                    <p className="font-medium">{selectedPayroll.user.department?.name || "N/A"}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Designation</p>
                                    <p className="font-medium">{selectedPayroll.user.designation?.name || "N/A"}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Branch</p>
                                    <p className="font-medium">{selectedPayroll.user.branch?.name || "N/A"}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Bank Account</p>
                                    <p className="font-medium">{selectedPayroll.user.bankAccountNumber || "N/A"}</p>
                                </div>
                            </div>

                            {/* Payment Info */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-center pb-2 border-b">
                                    <span className="text-sm text-muted-foreground">Month</span>
                                    <span className="font-medium">{formatMonth(selectedPayroll.month)}</span>
                                </div>
                                <div className="flex justify-between items-center pb-2 border-b">
                                    <span className="text-sm text-muted-foreground">Processed Date</span>
                                    <span className="font-medium">
                                        {new Date(selectedPayroll.createdAt).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </span>
                                </div>
                            </div>

                            {/* Salary Breakdown */}
                            <div className="space-y-3">
                                <h4 className="font-semibold flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4" />
                                    Salary Breakdown
                                </h4>
                                
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-sm">Base Salary</span>
                                        <span className="font-medium">
                                            ৳{selectedPayroll.baseSalary.toLocaleString("en-BD")}
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between items-center py-2 text-green-600">
                                        <span className="text-sm">+ Allowances</span>
                                        <span className="font-medium">
                                            ৳{selectedPayroll.totalAllowances.toLocaleString("en-BD")}
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between items-center py-2 text-green-600">
                                        <span className="text-sm">+ Bonuses</span>
                                        <span className="font-medium">
                                            ৳{selectedPayroll.totalBonuses.toLocaleString("en-BD")}
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between items-center py-2 text-green-600">
                                        <span className="text-sm">+ Medical Reimbursement</span>
                                        <span className="font-medium">
                                            ৳{selectedPayroll.medicalReimbursement.toLocaleString("en-BD")}
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between items-center py-2 text-red-600">
                                        <span className="text-sm">− Loan Deduction</span>
                                        <span className="font-medium">
                                            ৳{selectedPayroll.loanDeduction.toLocaleString("en-BD")}
                                        </span>
                                    </div>
                                    
                                    {selectedPayroll.walletAdjustment !== 0 && (
                                        <div className={`flex justify-between items-center py-2 ${
                                            selectedPayroll.walletAdjustment > 0 ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                            <span className="text-sm">
                                                {selectedPayroll.walletAdjustment > 0 ? '+' : '−'} Wallet Adjustment
                                            </span>
                                            <span className="font-medium">
                                                ৳{Math.abs(selectedPayroll.walletAdjustment).toLocaleString("en-BD")}
                                            </span>
                                        </div>
                                    )}
                                    
                                    <div className="flex justify-between items-center py-3 border-t-2 border-gray-300 mt-2">
                                        <span className="font-bold">Net Amount</span>
                                        <span className="font-bold text-lg text-primary">
                                            ৳{selectedPayroll.netAmount.toLocaleString("en-BD")}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
