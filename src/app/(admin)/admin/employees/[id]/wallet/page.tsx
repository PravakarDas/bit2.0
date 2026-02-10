"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUserProfileById } from "@/actions/profile.actions";
import { getWalletTransactionsForUser, getWalletRequestsForUser, updateWalletRequestStatus } from "@/actions/wallet.actions";
import { User, WalletTransaction, WalletRequest } from "@prisma/client";
import { 
  ArrowLeft, 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  DollarSign,
  Plus,
  Minus,
  CreditCard,
  AlertCircle,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { WalletAdjustmentDialog } from "@/components/admin/WalletAdjustmentDialog";

type UserWithWallet = User & {
  branch?: {
    id: string;
    name: string;
    location: string;
  } | null;
  department?: {
    id: string;
    name: string;
  } | null;
  designation?: {
    id: string;
    name: string;
  } | null;
};

export default function EmployeeWalletPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  
  const [user, setUser] = useState<UserWithWallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [walletRequests, setWalletRequests] = useState<WalletRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [userResult, transactionsResult, requestsResult] = await Promise.all([
        getUserProfileById(userId),
        getWalletTransactionsForUser(userId),
        getWalletRequestsForUser(userId)
      ]);

      if (userResult.success && userResult.data) {
        setUser(userResult.data as UserWithWallet);
      } else {
        toast.error(userResult.error || "Failed to load employee profile");
      }

      setTransactions(transactionsResult);
      setWalletRequests(requestsResult);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [userId]);

  // Calculate monthly totals
  const thisMonthTransactions = transactions.filter(t => {
    const transactionDate = new Date(t.createdAt);
    const currentDate = new Date();
    return transactionDate.getMonth() === currentDate.getMonth() && 
           transactionDate.getFullYear() === currentDate.getFullYear();
  });

  const monthlyCredits = thisMonthTransactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  const monthlyDebits = thisMonthTransactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const netMonthlyAmount = monthlyCredits - monthlyDebits;

  // Get pending requests
  const pendingRequests = walletRequests.filter(r => r.status === "PENDING");

  // Format transaction type for display
  const getTransactionType = (amount: number, type: string) => {
    if (amount > 0) return "CREDIT";
    if (amount < 0) return "DEBIT";
    return type.toUpperCase();
  };

  const handleApproveRequest = async (requestId: string) => {
    setIsApproving(requestId);
    try {
      await updateWalletRequestStatus(requestId, "APPROVED");
      toast.success("Request approved successfully");
      fetchData(); // Refresh data
    } catch (error) {
      console.error(error);
      toast.error("Failed to approve request");
    } finally {
      setIsApproving(null);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    setIsApproving(requestId);
    try {
      await updateWalletRequestStatus(requestId, "REJECTED");
      toast.success("Request rejected successfully");
      fetchData(); // Refresh data
    } catch (error) {
      console.error(error);
      toast.error("Failed to reject request");
    } finally {
      setIsApproving(null);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/admin/employees/${userId}`}>
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Wallet className="h-8 w-8" />
              {user.firstName} {user.lastName} - Wallet
            </h1>
            <p className="text-muted-foreground">Manage wallet transactions and adjustments</p>
          </div>
        </div>
        <WalletAdjustmentDialog
          userId={user.id}
          currentBalance={user.walletBalance}
          onSuccess={fetchData}
        />
      </div>

      {/* Wallet Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">৳{user.walletBalance.toLocaleString("en-BD")}</div>
            <p className="text-xs text-muted-foreground">Available balance</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netMonthlyAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {netMonthlyAmount >= 0 ? '+' : ''}৳{netMonthlyAmount.toLocaleString("en-BD")}
            </div>
            <p className="text-xs text-muted-foreground">Net amount this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingRequests.length}</div>
            <p className="text-xs text-muted-foreground">Pending requests</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">All Transactions</TabsTrigger>
          <TabsTrigger value="requests">Pending Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Recent Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.slice(0, 5).map((transaction) => {
                    const transactionType = getTransactionType(transaction.amount, transaction.type);
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {transactionType === "CREDIT" ? (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            ) : transactionType === "DEBIT" ? (
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            ) : (
                              <DollarSign className="h-4 w-4 text-blue-600" />
                            )}
                            <span className="capitalize">{transactionType.toLowerCase()}</span>
                          </div>
                        </TableCell>
                        <TableCell>{transaction.description}</TableCell>
                        <TableCell className={`font-medium ${
                          transactionType === "CREDIT" ? "text-green-600" : 
                          transactionType === "DEBIT" ? "text-red-600" : "text-blue-600"
                        }`}>
                          {transactionType === "CREDIT" ? "+" : transactionType === "DEBIT" ? "-" : "±"}
                          ৳{Math.abs(transaction.amount).toLocaleString("en-BD")}
                        </TableCell>
                        <TableCell>{new Date(transaction.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant="default">COMPLETED</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No transactions found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pending Requests */}
          {pendingRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  Pending Approval Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pendingRequests.map((request) => (
                    <div key={request.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="font-medium">Wallet Request</div>
                        <div className="text-sm text-muted-foreground">{request.description}</div>
                        <div className="text-sm text-muted-foreground">
                          Amount: ৳{request.amount.toLocaleString("en-BD")} • 
                          {new Date(request.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-600 hover:bg-green-50"
                          onClick={() => handleApproveRequest(request.id)}
                          disabled={isApproving === request.id}
                        >
                          {isApproving === request.id ? (
                            <>
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              Approving...
                            </>
                          ) : (
                            "Approve"
                          )}
                        </Button>
                        <Button
                          size="sm" 
                          variant="outline"
                          className="text-red-600 border-red-600 hover:bg-red-50"
                          onClick={() => handleRejectRequest(request.id)}
                          disabled={isApproving === request.id}
                        >
                          {isApproving === request.id ? (
                            <>
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                              Rejecting...
                            </>
                          ) : (
                            "Reject"
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>All Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => {
                    const transactionType = getTransactionType(transaction.amount, transaction.type);
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="font-mono text-sm">{transaction.id.slice(-8).toUpperCase()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {transactionType === "CREDIT" ? (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            ) : transactionType === "DEBIT" ? (
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            ) : (
                              <DollarSign className="h-4 w-4 text-blue-600" />
                            )}
                            <span className="capitalize">{transactionType.toLowerCase()}</span>
                          </div>
                        </TableCell>
                        <TableCell>{transaction.description}</TableCell>
                        <TableCell className={`font-medium ${
                          transactionType === "CREDIT" ? "text-green-600" : 
                          transactionType === "DEBIT" ? "text-red-600" : "text-blue-600"
                        }`}>
                          {transactionType === "CREDIT" ? "+" : transactionType === "DEBIT" ? "-" : "±"}
                          ৳{Math.abs(transaction.amount).toLocaleString("en-BD")}
                        </TableCell>
                        <TableCell>{new Date(transaction.createdAt).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant="default">COMPLETED</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No transactions found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pending Approval Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p>No pending requests</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingRequests.map((request) => (
                    <Card key={request.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">WALLET REQUEST</Badge>
                              <span className="font-medium">৳{request.amount.toLocaleString("en-BD")}</span>
                            </div>
                            <div className="text-sm text-muted-foreground">{request.description}</div>
                            <div className="text-xs text-muted-foreground">
                              Requested on {new Date(request.createdAt).toLocaleString()}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleApproveRequest(request.id)}
                              disabled={isApproving === request.id}
                            >
                              {isApproving === request.id ? (
                                <>
                                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                  Approving...
                                </>
                              ) : (
                                "Approve"
                              )}
                            </Button>
                            <Button
                              size="sm" 
                              variant="outline"
                              className="text-red-600 border-red-600 hover:bg-red-50"
                              onClick={() => handleRejectRequest(request.id)}
                              disabled={isApproving === request.id}
                            >
                              {isApproving === request.id ? (
                                <>
                                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                  Rejecting...
                                </>
                              ) : (
                                "Reject"
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}