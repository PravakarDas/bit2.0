import { 
    getAllWalletRequests,
    getAllWalletTransactionsHistory,
    getAllEmployeeWalletBalances
} from "@/actions/wallet.actions";
import WalletManagementClient from "@/components/admin/WalletManagementClient";
import { prisma } from "@/lib/prisma";

export default async function AdminWalletPage() {
    const requests = await getAllWalletRequests();
    const pendingRequests = requests.filter(r => r.status === "PENDING");
    const allTransactionsData = await getAllWalletTransactionsHistory();
    const employeeWallets = await getAllEmployeeWalletBalances();

    // Fetch users for dropdown
    const users = await prisma.user.findMany({
        where: {
            role: "EMPLOYEE",
            isArchived: false
        },
        select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
        },
        orderBy: { email: 'asc' }
    });

    return (
        <WalletManagementClient
            initialPendingRequests={pendingRequests}
            allTransactionsData={allTransactionsData}
            employeeWallets={employeeWallets}
            users={users}
        />
    );
}
