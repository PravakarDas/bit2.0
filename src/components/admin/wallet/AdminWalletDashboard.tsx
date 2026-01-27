"use client";

import { WalletRequest, User } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WalletRequestApprovalTable } from "./WalletRequestApprovalTable";
import { ManualAdjustmentForm } from "./ManualAdjustmentForm";

interface WalletRequestWithUser extends WalletRequest {
    user: User;
}

interface AdminWalletDashboardProps {
    pendingRequests: WalletRequestWithUser[];
    users: User[];
}

export function AdminWalletDashboard({ pendingRequests, users }: AdminWalletDashboardProps) {
    return (
        <div className="space-y-6">
            <Tabs defaultValue="pending" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="pending">Pending Requests ({pendingRequests.length})</TabsTrigger>
                    <TabsTrigger value="adjustment">Manual Adjustment</TabsTrigger>
                </TabsList>

                <TabsContent value="pending">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reimbursement Requests</CardTitle>
                            <CardDescription>Review and approve employee expense claims.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <WalletRequestApprovalTable requests={pendingRequests} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="adjustment">
                    <Card>
                        <CardHeader>
                            <CardTitle>Manual Wallet Adjustment</CardTitle>
                            <CardDescription>Add or remove funds from an employee's wallet.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ManualAdjustmentForm users={users} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
