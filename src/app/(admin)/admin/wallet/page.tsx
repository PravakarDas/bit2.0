import { getAllWalletRequests } from "@/actions/wallet.actions";
import { AdminWalletDashboard } from "@/components/admin/wallet/AdminWalletDashboard";
import { prisma } from "@/lib/prisma";

export default async function AdminWalletPage() {
    const requests = await getAllWalletRequests();
    const pendingRequests = requests.filter(r => r.status === "PENDING");

    // Fetch users for dropdown
    const users = await prisma.user.findMany({
        orderBy: { email: 'asc' }
    });

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Wallet Management</h2>
            </div>
            <AdminWalletDashboard
                pendingRequests={pendingRequests}
                users={users}
            />
        </div>
    );
}
