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
import { User } from "@prisma/client";
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
  AlertCircle
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

// Mock data - replace with actual API calls
const mockTransactions = [
  {
    id: "1",
    type: "CREDIT",
    amount: 50000,
    description: "Salary Credit - January 2026",
    date: "2026-01-31T10:00:00Z",
    status: "COMPLETED",
    reference: "SAL-JAN-2026"
  },
  {
    id: "2", 
    type: "DEBIT",
    amount: 15000,
    description: "Loan Deduction",
    date: "2026-01-31T10:00:00Z",
    status: "COMPLETED",
    reference: "LOAN-001"
  },
  {
    id: "3",
    type: "ADJUSTMENT",
    amount: 5000,
    description: "Bonus Adjustment",
    date: "2026-01-25T14:30:00Z",
    status: "PENDING",
    reference: "ADJ-001"
  }
];

const mockPendingRequests = [
  {
    id: "1",
    type: "WITHDRAWAL",
    amount: 10000,
    reason: "Medical Emergency",
    date: "2026-02-09T09:00:00Z",
    status: "PENDING"
  },
  {
    id: "2", 
    type: "ADVANCE",
    amount: 25000,
    reason: "House Rent Payment",
    date: "2026-02-08T16:30:00Z", 
    status: "PENDING"
  }
];

export default function EmployeeWalletPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  
  const [user, setUser] = useState<UserWithWallet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const result = await getUserProfileById(userId);
      if (result.success && result.data) {
        setUser(result.data as UserWithWallet);
      } else {
        toast.error(result.error || "Failed to load employee profile");
      }
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

  const handleApproveRequest = (requestId: string) => {
    toast.success("Request approved successfully");
    // Implement actual approval logic
  };

  const handleRejectRequest = (requestId: string) => {
    toast.success("Request rejected successfully");
    // Implement actual rejection logic
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
            <div className="text-2xl font-bold text-green-600">৳35,000</div>
            <p className="text-xs text-muted-foreground">Net credits this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{mockPendingRequests.length}</div>
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
                  {mockTransactions.slice(0, 5).map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {transaction.type === "CREDIT" ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : transaction.type === "DEBIT" ? (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          ) : (
                            <DollarSign className="h-4 w-4 text-blue-600" />
                          )}
                          <span className="capitalize">{transaction.type.toLowerCase()}</span>
                        </div>
                      </TableCell>
                      <TableCell>{transaction.description}</TableCell>
                      <TableCell className={`font-medium ${
                        transaction.type === "CREDIT" ? "text-green-600" : 
                        transaction.type === "DEBIT" ? "text-red-600" : "text-blue-600"
                      }`}>
                        {transaction.type === "CREDIT" ? "+" : transaction.type === "DEBIT" ? "-" : "±"}
                        ৳{transaction.amount.toLocaleString("en-BD")}
                      </TableCell>
                      <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant={transaction.status === "COMPLETED" ? "default" : "secondary"}>
                          {transaction.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pending Requests */}
          {mockPendingRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  Pending Approval Requests
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockPendingRequests.map((request) => (
                    <div key={request.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <div className="font-medium">{request.type} Request</div>
                        <div className="text-sm text-muted-foreground">{request.reason}</div>
                        <div className="text-sm text-muted-foreground">
                          Amount: ৳{request.amount.toLocaleString("en-BD")} • 
                          {new Date(request.date).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-600 hover:bg-green-50"
                          onClick={() => handleApproveRequest(request.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm" 
                          variant="outline"
                          className="text-red-600 border-red-600 hover:bg-red-50"
                          onClick={() => handleRejectRequest(request.id)}
                        >
                          Reject
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
                  {mockTransactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-mono text-sm">{transaction.reference}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {transaction.type === "CREDIT" ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : transaction.type === "DEBIT" ? (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          ) : (
                            <DollarSign className="h-4 w-4 text-blue-600" />
                          )}
                          <span className="capitalize">{transaction.type.toLowerCase()}</span>
                        </div>
                      </TableCell>
                      <TableCell>{transaction.description}</TableCell>
                      <TableCell className={`font-medium ${
                        transaction.type === "CREDIT" ? "text-green-600" : 
                        transaction.type === "DEBIT" ? "text-red-600" : "text-blue-600"
                      }`}>
                        {transaction.type === "CREDIT" ? "+" : transaction.type === "DEBIT" ? "-" : "±"}
                        ৳{transaction.amount.toLocaleString("en-BD")}
                      </TableCell>
                      <TableCell>{new Date(transaction.date).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={transaction.status === "COMPLETED" ? "default" : "secondary"}>
                          {transaction.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
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
              {mockPendingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p>No pending requests</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {mockPendingRequests.map((request) => (
                    <Card key={request.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{request.type}</Badge>
                              <span className="font-medium">৳{request.amount.toLocaleString("en-BD")}</span>
                            </div>
                            <div className="text-sm text-muted-foreground">{request.reason}</div>
                            <div className="text-xs text-muted-foreground">
                              Requested on {new Date(request.date).toLocaleString()}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleApproveRequest(request.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm" 
                              variant="outline"
                              className="text-red-600 border-red-600 hover:bg-red-50"
                              onClick={() => handleRejectRequest(request.id)}
                            >
                              Reject
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