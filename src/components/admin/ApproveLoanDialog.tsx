"use client";

import { useState, useEffect, useCallback } from "react";
import { approveLoan, getLoanDetailsForApproval, declineLoan } from "@/actions/loan.actions";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
    User, 
    DollarSign, 
    Calendar, 
    Building, 
    Phone, 
    Mail,
    TrendingUp,
    AlertTriangle,
    CheckCircle,
    Clock,
    CreditCard,
    XCircle
} from "lucide-react";
import { format } from "date-fns";

interface LoanDetailsData {
    loan: {
        id: string;
        issuedAmount: number;
        gracePeriodMonths: number;
        totalMonths: number;
        reason: string;
        status: string;
        createdAt: Date;
        user: {
            id: string;
            firstName: string | null;
            lastName: string | null;
            email: string;
            phoneNumber: string | null;
            baseSalary: number;
            walletBalance: number;
            dateOfJoining: Date | null;
            department: { name: string } | null;
            designation: { name: string } | null;
            branch: { name: string } | null;
        };
    };
    existingLoans: unknown[];
    recentPayments: unknown[];
    financialMetrics: {
        totalExistingDebt: number;
        totalIssuedAmount: number;
        totalRepaidAmount: number;
        repaymentRatio: number;
        salaryCap: number;
        globalCap: number;
        remainingSalaryCap: number;
        remainingGlobalCap: number;
        maxAllowedLoan: number;
        meetsRepaymentRequirement: boolean;
    };
}

interface ApproveLoanDialogProps {
    loan: {
        id: string;
        issuedAmount: number;
        user: {
            email: string;
        };
    };
    onApprovalSuccess?: () => void;
}

export function ApproveLoanDialog({ loan, onApprovalSuccess }: ApproveLoanDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [loanDetails, setLoanDetails] = useState<LoanDetailsData | null>(null);
    const [declineReason, setDeclineReason] = useState('');
    const [formData, setFormData] = useState({
        issuedAmount: loan.issuedAmount,
        gracePeriodMonths: 6,
        totalMonths: 12,
        adminComments: '',
    });

    // Load detailed loan information when dialog opens
    const loadLoanDetails = useCallback(async () => {
        setDetailsLoading(true);
        try {
            const details = await getLoanDetailsForApproval(loan.id);
            setLoanDetails(details);
            
            // Pre-populate form with employee's original request
            setFormData({
                issuedAmount: details.loan.issuedAmount,
                gracePeriodMonths: details.loan.gracePeriodMonths,
                totalMonths: details.loan.totalMonths,
                adminComments: '',
            });
        } catch (error) {
            console.error("Failed to load loan details:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to load loan details. Please try again.";
            toast.error(errorMessage);
        } finally {
            setDetailsLoading(false);
        }
    }, [loan.id]);

    useEffect(() => {
        if (isOpen && !loanDetails) {
            void loadLoanDetails();
        }
    }, [isOpen, loanDetails, loadLoanDetails]);

    const handleApprove = async () => {
        if (!loanDetails) return;
        
        setLoading(true);
        try {
            await approveLoan(loan.id, formData);
            toast.success("Loan approved and initialized successfully");
            setIsOpen(false);
            onApprovalSuccess?.();
        } catch (error) {
            console.error("Failed to approve loan:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to approve loan. Please try again.";
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleDecline = async () => {
        if (!declineReason.trim()) {
            toast.error("Please provide a reason for declining the loan");
            return;
        }
        
        setLoading(true);
        try {
            await declineLoan(loan.id, declineReason);
            toast.success("Loan declined successfully");
            setIsOpen(false);
            setDeclineReason('');
            onApprovalSuccess?.();
        } catch (error) {
            console.error("Failed to decline loan:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to decline loan. Please try again.";
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const getEmployeeName = (user: LoanDetailsData["loan"]["user"]) => {
        return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    };

    const calculateEMI = () => {
        if (formData.totalMonths <= formData.gracePeriodMonths) return 0;
        const emiMonths = formData.totalMonths - formData.gracePeriodMonths;
        return Math.round(formData.issuedAmount / emiMonths);
    };

    const isValidApproval = () => {
        if (!loanDetails) return false;
        
        const { financialMetrics } = loanDetails;
        return formData.issuedAmount <= financialMetrics.maxAllowedLoan &&
               financialMetrics.meetsRepaymentRequirement;
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button size="sm">Review & Approve</Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Loan Approval Review
                    </DialogTitle>
                </DialogHeader>
                
                {detailsLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                            <p className="mt-2 text-sm text-muted-foreground">Loading employee details...</p>
                        </div>
                    </div>
                ) : loanDetails ? (
                    <ScrollArea className="max-h-[calc(90vh-120px)]">
                        <div className="grid gap-6 p-1">
                            {/* Employee Information */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <User className="h-4 w-4" />
                                        Employee Information
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <User className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">{getEmployeeName(loanDetails.loan.user)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Mail className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm">{loanDetails.loan.user.email}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Phone className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm">{loanDetails.loan.user.phoneNumber || 'N/A'}</span>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <Building className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm">{loanDetails.loan.user.department?.name || 'N/A'} - {loanDetails.loan.user.designation?.name || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm">
                                                    Joined: {loanDetails.loan.user.dateOfJoining 
                                                        ? format(new Date(loanDetails.loan.user.dateOfJoining), 'MMM dd, yyyy') 
                                                        : 'Not set'
                                                    }
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm">Branch: {loanDetails.loan.user.branch?.name || 'N/A'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="grid gap-6 md:grid-cols-2">
                                {/* Employee's Original Request */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Clock className="h-4 w-4" />
                                            Employee&apos;s Request
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Requested Amount</Label>
                                                    <div className="text-lg font-semibold text-primary">
                                                        ৳{loanDetails.loan.issuedAmount.toLocaleString('en-BD')}
                                                    </div>
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Grace Period</Label>
                                                    <div className="text-lg font-semibold">
                                                        {loanDetails.loan.gracePeriodMonths} months
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Total Duration</Label>
                                                    <div className="text-lg font-semibold">
                                                        {loanDetails.loan.totalMonths} months
                                                    </div>
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Applied On</Label>
                                                    <div className="text-sm">
                                                        {format(new Date(loanDetails.loan.createdAt), 'MMM dd, yyyy')}
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <Label className="text-xs text-muted-foreground">Reason</Label>
                                                <div className="mt-1 p-2 bg-muted rounded text-sm">
                                                    {loanDetails.loan.reason || 'No reason provided'}
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Financial Summary */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <TrendingUp className="h-4 w-4" />
                                            Financial Summary
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Base Salary</Label>
                                                    <div className="text-lg font-semibold text-green-600">
                                                        ৳{loanDetails.loan.user.baseSalary.toLocaleString('en-BD')}
                                                    </div>
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Wallet Balance</Label>
                                                    <div className="text-lg font-semibold">
                                                        ৳{loanDetails.loan.user.walletBalance.toLocaleString('en-BD')}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Existing Debt</Label>
                                                    <div className="text-lg font-semibold text-orange-600">
                                                        ৳{loanDetails.financialMetrics.totalExistingDebt.toLocaleString('en-BD')}
                                                    </div>
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-muted-foreground">Max Allowed</Label>
                                                    <div className="text-lg font-semibold text-blue-600">
                                                        ৳{loanDetails.financialMetrics.maxAllowedLoan.toLocaleString('en-BD')}
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <Label className="text-xs text-muted-foreground">Repayment History</Label>
                                                <div className="flex items-center gap-2 mt-1">
                                                    {loanDetails.financialMetrics.meetsRepaymentRequirement ? (
                                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                                    ) : (
                                                        <AlertTriangle className="h-4 w-4 text-red-500" />
                                                    )}
                                                    <span className={`text-sm font-medium ${
                                                        loanDetails.financialMetrics.meetsRepaymentRequirement 
                                                            ? 'text-green-600' 
                                                            : 'text-red-600'
                                                    }`}>
                                                        {(loanDetails.financialMetrics.repaymentRatio * 100).toFixed(1)}% repaid
                                                        {loanDetails.financialMetrics.meetsRepaymentRequirement ? ' (✓ Eligible)' : ' (✗ Needs 75%)'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            <Separator />

                            {/* Approval Form */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>Manual Approval Settings</CardTitle>
                                    <p className="text-sm text-muted-foreground">
                                        Review and adjust loan terms as needed
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid gap-6 md:grid-cols-2">
                                        <div className="space-y-4">
                                            <div className="grid gap-2">
                                                <Label htmlFor="issuedAmount">Approved Amount</Label>
                                                <Input
                                                    id="issuedAmount"
                                                    type="number"
                                                    value={formData.issuedAmount}
                                                    onChange={(e) =>
                                                        setFormData({ ...formData, issuedAmount: Number(e.target.value) })
                                                    }
                                                />
                                                <div className="text-xs text-muted-foreground">
                                                    Max allowed: ৳{loanDetails.financialMetrics.maxAllowedLoan.toLocaleString('en-BD')}
                                                </div>
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="gracePeriodMonths">Grace Period (Months)</Label>
                                                <Input
                                                    id="gracePeriodMonths"
                                                    type="number"
                                                    min="0"
                                                    max="12"
                                                    value={formData.gracePeriodMonths}
                                                    onChange={(e) =>
                                                        setFormData({
                                                            ...formData,
                                                            gracePeriodMonths: Number(e.target.value),
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="totalMonths">Total Duration (Months)</Label>
                                                <Input
                                                    id="totalMonths"
                                                    type="number"
                                                    min="1"
                                                    max="60"
                                                    value={formData.totalMonths}
                                                    onChange={(e) =>
                                                        setFormData({ ...formData, totalMonths: Number(e.target.value) })
                                                    }
                                                />
                                            </div>
                                            <div className="grid gap-2">
                                                <Label htmlFor="adminComments">Admin Comments (Optional)</Label>
                                                <Input
                                                    id="adminComments"
                                                    placeholder="Add notes about this approval..."
                                                    value={formData.adminComments}
                                                    onChange={(e) =>
                                                        setFormData({ ...formData, adminComments: e.target.value })
                                                    }
                                                />
                                                <div className="text-xs text-muted-foreground">
                                                    Notes visible to other admins for audit purposes
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-4">
                                            <div className="p-4 bg-muted/50 rounded-lg">
                                                <h4 className="font-medium mb-3">Loan Preview</h4>
                                                <div className="space-y-2 text-sm">
                                                    <div className="flex justify-between">
                                                        <span>Monthly EMI:</span>
                                                        <span className="font-medium">৳{calculateEMI().toLocaleString('en-BD')}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Payment starts after:</span>
                                                        <span className="font-medium">{formData.gracePeriodMonths} months</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>EMI months:</span>
                                                        <span className="font-medium">{Math.max(0, formData.totalMonths - formData.gracePeriodMonths)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            {!isValidApproval() && (
                                                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                                                    <div className="flex items-center gap-2 text-red-600">
                                                        <AlertTriangle className="h-4 w-4" />
                                                        <span className="font-medium">Validation Issues</span>
                                                    </div>
                                                    <ul className="mt-2 text-xs text-red-600 list-disc list-inside space-y-1">
                                                        {formData.issuedAmount > loanDetails.financialMetrics.maxAllowedLoan && (
                                                            <li>Amount exceeds maximum allowed limit</li>
                                                        )}
                                                        {!loanDetails.financialMetrics.meetsRepaymentRequirement && (
                                                            <li>Employee hasn&#39;t repaid 75% of existing loans</li>
                                                        )}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-end gap-3 mt-6">
                                        <Button variant="outline" onClick={() => setIsOpen(false)}>
                                            Cancel
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive">
                                                    <XCircle className="mr-2 h-4 w-4" />
                                                    Decline Loan
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Decline Loan Application</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Please provide a reason for declining this loan application. This will be communicated to the employee.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <div className="grid gap-2 py-4">
                                                    <Label htmlFor="decline-reason">Decline Reason</Label>
                                                    <Textarea
                                                        id="decline-reason"
                                                        placeholder="Enter reason for declining the loan..."
                                                        value={declineReason}
                                                        onChange={(e) => setDeclineReason(e.target.value)}
                                                        rows={4}
                                                    />
                                                </div>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel onClick={() => setDeclineReason('')}>
                                                        Cancel
                                                    </AlertDialogCancel>
                                                    <AlertDialogAction 
                                                        onClick={handleDecline}
                                                        disabled={loading || !declineReason.trim()}
                                                        className="bg-destructive hover:bg-destructive/90"
                                                    >
                                                        {loading ? "Declining..." : "Decline Loan"}
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                        <Button 
                                            onClick={handleApprove} 
                                            disabled={loading || !isValidApproval()}
                                            className="min-w-32"
                                        >
                                            {loading ? "Approving..." : "Approve Loan"}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </ScrollArea>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">
                        Failed to load loan details. Please try again.
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
