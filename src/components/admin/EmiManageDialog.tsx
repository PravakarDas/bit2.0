import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Settings, AlertCircle, CheckCircle2, FileText, Info } from "lucide-react";
import { toggleEmiCollection, skipEmiForMonth, recordManualPayment, getLoanActivityHistory } from "@/actions/loan.actions";
import { toast } from "sonner";
import { formatCurrency, formatDateTime12 } from "@/lib/utils";

type LoanActivityHistory = Awaited<ReturnType<typeof getLoanActivityHistory>>;
type LoanPayment = NonNullable<LoanActivityHistory["payments"]>[number];
type LoanAuditLog = NonNullable<LoanActivityHistory["auditLogs"]>[number];

interface EmiManageDialogProps {
  loan: {
    id: string;
    issuedAmount: number;
    remainingPrincipal: number;
    totalMonths: number;
    gracePeriodMonths: number;
    emiStartMonth: number | null;
    emiStartYear: number | null;
    reason: string;
    adminComments?: string | null | undefined;
    status: string;
    createdAt: Date;
    emiState: {
      currentEmi: number;
      carryForward: number;
    } | null;
    user: {
      firstName: string;
      lastName: string;
    };
  };
}

export function EmiManageDialog({ loan }: EmiManageDialogProps) {
  const [open, setOpen] = useState(false);
  const [skipMonth, setSkipMonth] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [emiEnabled, setEmiEnabled] = useState(true);
  const [disableReason, setDisableReason] = useState("");
  const [activityHistory, setActivityHistory] = useState<LoanActivityHistory | null>(null);
  const [loading, setLoading] = useState(false);

  // Calculate loan timeline information
  const loanStartDate = new Date(loan.createdAt);
  const loanEndDate = new Date(loanStartDate);
  loanEndDate.setMonth(loanEndDate.getMonth() + loan.totalMonths);
  
  const graceEndDate = new Date(loanStartDate);
  graceEndDate.setMonth(graceEndDate.getMonth() + loan.gracePeriodMonths);
  
  const emiStartDate = loan.emiStartMonth && loan.emiStartYear 
    ? new Date(loan.emiStartYear, loan.emiStartMonth - 1, 1)
    : graceEndDate;
  
  const currentDate = new Date();
  const isInGracePeriod = currentDate <= graceEndDate;
  
  // Calculate progress and remaining time
  const monthsPassed = Math.max(0, Math.floor(
    (currentDate.getTime() - loanStartDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)
  ));
  const remainingMonths = Math.max(0, loan.totalMonths - monthsPassed);
  const progressPercentage = Math.min(100, (monthsPassed / loan.totalMonths) * 100);
  
  // Calculate total paid amount
  const totalPaidAmount = loan.issuedAmount - loan.remainingPrincipal;
  const repaymentPercentage = loan.issuedAmount > 0 ? (totalPaidAmount / loan.issuedAmount) * 100 : 0;

  const handleToggleEmi = async () => {
    if (loading) return;
    
    setLoading(true);
    try {
      await toggleEmiCollection(loan.id, emiEnabled, disableReason);
      toast.success(
        emiEnabled ? "EMI collection enabled" : "EMI collection disabled"
      );
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update EMI");
    } finally {
      setLoading(false);
    }
  };

  const handleSkipEmi = async () => {
    if (!skipMonth || !skipReason || loading) return;
    
    setLoading(true);
    try {
      await skipEmiForMonth(loan.id, skipMonth, skipReason);
      toast.success("EMI skipped successfully");
      setSkipMonth("");
      setSkipReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to skip EMI");
    } finally {
      setLoading(false);
    }
  };

  const handleManualPayment = async () => {
    if (!manualAmount || !manualReason || loading) return;
    
    const amount = parseFloat(manualAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    
    setLoading(true);
    try {
      await recordManualPayment(loan.id, amount, manualReason);
      toast.success("Manual payment recorded successfully");
      setManualAmount("");
      setManualReason("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record payment");
    } finally {
      setLoading(false);
    }
  };

  const loadActivityHistory = async () => {
    if (activityHistory) {
      setActivityHistory(null);
      return;
    }
    
    setLoading(true);
    try {
      const history = await getLoanActivityHistory(loan.id);
      setActivityHistory(history);
    } catch {
      toast.error("Failed to load activity history");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4 mr-2" />
          EMI Controls
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw]! max-w-[95vw]! h-[95vh]! max-h-[95vh]! overflow-y-auto p-4!">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            EMI Management - {loan.user.firstName} {loan.user.lastName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Loan Timeline & Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="w-5 h-5 text-blue-600" />
                Loan Timeline & Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Loan Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Loan Reason</Label>
                  <p className="font-medium">{loan.reason || "Personal"}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Total Duration</Label>
                  <p className="font-medium">{loan.totalMonths} months</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Grace Period</Label>
                  <p className="font-medium">{loan.gracePeriodMonths} months</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Remaining Months</Label>
                  <p className="font-medium text-blue-600">{remainingMonths} months</p>
                </div>
              </div>
              
              {/* Progress Indicators */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Loan Timeline Progress</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-muted rounded-full h-3">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all" 
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">{Math.round(progressPercentage)}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{monthsPassed} of {loan.totalMonths} months elapsed</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Repayment Progress</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-muted rounded-full h-3">
                      <div 
                        className="bg-green-600 h-3 rounded-full transition-all" 
                        style={{ width: `${repaymentPercentage}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">{Math.round(repaymentPercentage)}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatCurrency(totalPaidAmount)} of {formatCurrency(loan.issuedAmount)} repaid</p>
                </div>
              </div>
              
              {/* Timeline Dates */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Loan Start Date</Label>
                  <p className="font-medium">{loanStartDate.toLocaleDateString()}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">EMI Start Date</Label>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{emiStartDate.toLocaleDateString()}</p>
                    {isInGracePeriod && (
                      <Badge variant="outline" className="text-xs">Grace Period</Badge>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Expected End Date</Label>
                  <p className="font-medium">{loanEndDate.toLocaleDateString()}</p>
                </div>
              </div>
              
              {/* Financial Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Total Loan</Label>
                  <p className="font-semibold text-lg">{formatCurrency(loan.issuedAmount)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Total Paid</Label>
                  <p className="font-semibold text-lg text-green-600">{formatCurrency(totalPaidAmount)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Remaining</Label>
                  <p className="font-semibold text-lg text-blue-600">{formatCurrency(loan.remainingPrincipal)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Current EMI</Label>
                  <p className="font-semibold text-lg">{formatCurrency(loan.emiState?.currentEmi || 0)}</p>
                </div>
              </div>
              
              {/* Admin Comments */}
              {loan.adminComments && (
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Admin Comments</Label>
                  <p className="text-sm p-3 bg-muted rounded-lg">{loan.adminComments}</p>
                </div>
              )}
              
              {/* Grace Period Status */}
              {isInGracePeriod && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-blue-800">
                    This loan is currently in grace period. EMI deductions will start on {emiStartDate.toLocaleDateString()}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Current EMI Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                EMI Status & Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Carry Forward Amount</Label>
                  <p className="font-medium text-red-600">{formatCurrency(loan.emiState?.carryForward || 0)}</p>
                  {(loan.emiState?.carryForward || 0) > 0 && (
                    <p className="text-xs text-red-500">Will be added to next EMI deduction</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-sm text-muted-foreground">Loan Status</Label>
                  <Badge variant={loan.status === "ACTIVE" ? "default" : "secondary"} className="w-fit">
                    {loan.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* EMI Controls */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Toggle EMI Collection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                  EMI Collection Control
                </CardTitle>
                <CardDescription>
                  Enable or disable EMI collection for this loan
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="emi-toggle"
                    checked={emiEnabled}
                    onCheckedChange={setEmiEnabled}
                  />
                  <Label htmlFor="emi-toggle">
                    {emiEnabled ? "Enable EMI Collection" : "Disable EMI Collection"}
                  </Label>
                </div>
                {!emiEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="disable-reason">Reason for disabling</Label>
                    <Input
                      id="disable-reason"
                      placeholder="Enter reason..."
                      value={disableReason}
                      onChange={(e) => setDisableReason(e.target.value)}
                    />
                  </div>
                )}
                <Button 
                  onClick={handleToggleEmi} 
                  disabled={loading || (!emiEnabled && !disableReason)}
                  className="w-full"
                >
                  {loading ? "Processing..." : (emiEnabled ? "Enable EMI" : "Disable EMI")}
                </Button>
              </CardContent>
            </Card>

            {/* Skip EMI for Specific Month */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  Skip EMI for Month
                </CardTitle>
                <CardDescription>
                  Skip EMI collection for a specific month
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="skip-month">Month (YYYY-MM)</Label>
                  <Input
                    id="skip-month"
                    placeholder="e.g., 2024-12"
                    value={skipMonth}
                    onChange={(e) => setSkipMonth(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="skip-reason">Reason</Label>
                  <Textarea
                    id="skip-reason"
                    placeholder="Enter reason for skipping EMI..."
                    value={skipReason}
                    onChange={(e) => setSkipReason(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button 
                  onClick={handleSkipEmi}
                  disabled={loading || !skipMonth || !skipReason}
                  className="w-full"
                >
                  {loading ? "Processing..." : "Skip EMI"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Manual Payment Recording */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-green-500" />
                Record Manual Payment
              </CardTitle>
              <CardDescription>
                Record a manual payment made outside of regular EMI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="manual-amount">Payment Amount (৳)</Label>
                  <Input
                    id="manual-amount"
                    type="number"
                    placeholder="0.00"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-reason">Payment Reason</Label>
                  <Textarea
                    id="manual-reason"
                    placeholder="Enter reason for manual payment..."
                    value={manualReason}
                    onChange={(e) => setManualReason(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              <Button 
                onClick={handleManualPayment}
                disabled={loading || !manualAmount || !manualReason}
                className="w-full mt-4"
              >
                {loading ? "Processing..." : "Record Payment"}
              </Button>
            </CardContent>
          </Card>

          {/* Activity History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-500" />
                Loan Activity History
              </CardTitle>
              <CardDescription>
                View payment history and admin actions for this loan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={loadActivityHistory}
                disabled={loading}
                variant="outline"
                className="w-full"
              >
                {loading ? "Loading..." : activityHistory ? "Hide History" : "Show History"}
              </Button>
              
              {activityHistory && (
                <div className="mt-4 space-y-4">
                  {/* Recent Payments */}
                  {activityHistory.payments.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Recent Payments</h4>
                      <div className="space-y-2">
                        {activityHistory.payments.slice(0, 5).map((payment: LoanPayment) => (
                          <div key={payment.id} className="flex justify-between p-2 bg-muted rounded">
                            <div>
                              <span className="font-medium">{formatCurrency(payment.amount)}</span>
                              <Badge variant="outline" className="ml-2">{payment.type}</Badge>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {payment.payrollMonth}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Admin Actions */}
                  {activityHistory.auditLogs.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Admin Actions</h4>
                      <div className="space-y-2">
                        {activityHistory.auditLogs.slice(0, 5).map((log: LoanAuditLog) => (
                          <div key={log.id} className="p-2 bg-muted rounded">
                            <p className="text-sm">{log.changeReason}</p>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime12(log.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}