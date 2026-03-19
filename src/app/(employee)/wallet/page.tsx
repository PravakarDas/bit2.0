import { WalletDashboard } from "@/components/employee/wallet/WalletDashboard";
import { getMyWalletRequests, getMyWalletTransactions } from "@/actions/wallet.actions";
import { getDbUser } from "@/actions/user.actions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
    const user = await getDbUser();
    if (!user) {
        redirect("/sign-in");
    }

    const requests = await getMyWalletRequests();
    const transactions = await getMyWalletTransactions();

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Wallet</h2>
            </div>
            <WalletDashboard
                balance={user.walletBalance}
                requests={requests}
                transactions={transactions}
            />
        </div>
    );
}
