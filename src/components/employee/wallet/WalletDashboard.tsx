"use client";

import { WalletRequest, WalletTransaction } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WalletRequestForm } from "./WalletRequestForm";
import { WalletRequestList } from "./WalletRequestList";
import { WalletTransactionList } from "./WalletTransactionList";

import { BlurAmount } from "@/components/employee/BlurAmount";
interface WalletDashboardProps {
    balance: number;
    requests: WalletRequest[];
    transactions: WalletTransaction[];
}

export function WalletDashboard({ balance, requests, transactions }: WalletDashboardProps) {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <BlurAmount amount={balance} amountClassName="text-2xl font-bold" blurred={true} />
                        <p className="text-xs text-muted-foreground">Current available funds</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="transactions" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="transactions">History</TabsTrigger>
                    <TabsTrigger value="requests">My Requests</TabsTrigger>
                    <TabsTrigger value="new-request">New Request</TabsTrigger>
                </TabsList>

                <TabsContent value="transactions" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Transaction History</CardTitle>
                            <CardDescription>Recent activity in your wallet</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <WalletTransactionList transactions={transactions} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="requests" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reimbursement Requests</CardTitle>
                            <CardDescription>Status of your submitted claims</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <WalletRequestList requests={requests} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="new-request" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Submit Expense Claim</CardTitle>
                            <CardDescription>Request reimbursement for company expenses</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <WalletRequestForm />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
