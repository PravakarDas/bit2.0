import { 
    getAllWalletRequests,
    getAllWalletTransactionsHistory,
    getAllEmployeeWalletBalances
} from "@/actions/wallet.actions";
import WalletManagementClient from "@/components/admin/WalletManagementClient";

export default async function AdminWalletPage() {
    const requests = await getAllWalletRequests();
    const pendingRequests = requests.filter(r => r.status === "PENDING");
    const allTransactionsData = await getAllWalletTransactionsHistory();
    const employeeWallets = await getAllEmployeeWalletBalances();

    return (
        <WalletManagementClient
            initialPendingRequests={pendingRequests}
            allTransactionsData={allTransactionsData}
            employeeWallets={employeeWallets}
        />
    );
}
