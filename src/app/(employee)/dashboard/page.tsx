import { getEmployeeDashboardData } from "@/actions/dashboard.actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SalaryChart } from "@/components/employee/SalaryChart";
import { Badge } from "@/components/ui/badge";
import {
    Wallet,
    Banknote,
    Stethoscope,
    ArrowUpRight,
    ArrowDownLeft,
    Clock,
    CircleDollarSign
} from "lucide-react";

export default async function EmployeeDashboardPage() {
    const data = await getEmployeeDashboardData();

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-indigo-950">Employee Dashboard</h1>
                <p className="text-muted-foreground">Welcome back! Here's an overview of your financial standing.</p>
            </div>

            {/* Quick Stats */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Wallet Balance</CardTitle>
                        <Wallet className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-green-700">₹{data.walletBalance.toLocaleString()}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 font-medium">Available for instant withdrawal</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Remaining Loan</CardTitle>
                        <Banknote className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-blue-700">₹{data.remainingLoan.toLocaleString()}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 font-medium">Total outstanding principal</p>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-indigo-500 shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Medical Entitlement</CardTitle>
                        <Stethoscope className="h-4 w-4 text-indigo-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-indigo-700">₹{data.remainingMedical.toLocaleString()}</div>
                        <p className="text-[10px] text-muted-foreground mt-1 font-medium">Available reimbursement for {new Date().getFullYear()}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-7">
                {/* Salary History Chart */}
                <Card className="lg:col-span-4 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <CircleDollarSign className="h-5 w-5 text-indigo-600" />
                            Net Pay History
                        </CardTitle>
                        <CardDescription>Your last 6 months of take-home salary.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <SalaryChart data={data.salaryHistory} />
                    </CardContent>
                </Card>

                {/* Recent Transactions */}
                <Card className="lg:col-span-3 shadow-sm border-t-4 border-t-indigo-600">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Clock className="h-5 w-5 text-indigo-600" />
                            Recent Transactions
                        </CardTitle>
                        <CardDescription>Latest movements in your wallet.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {data.recentTransactions.length === 0 ? (
                                <div className="text-sm text-center py-8 text-muted-foreground italic">
                                    No transactions found.
                                </div>
                            ) : (
                                data.recentTransactions.map((tx: any) => (
                                    <div key={tx.id} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-full ${tx.type.includes('CREDIT') || tx.type.includes('REIMBURSEMENT')
                                                ? 'bg-green-100/50 text-green-700'
                                                : 'bg-red-100/50 text-red-700'
                                                }`}>
                                                {tx.type.includes('CREDIT') || tx.type.includes('REIMBURSEMENT')
                                                    ? <ArrowDownLeft className="h-4 w-4" />
                                                    : <ArrowUpRight className="h-4 w-4" />}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-900">{tx.description}</p>
                                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                                                    {new Date(tx.createdAt).toLocaleDateString(undefined, {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric'
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                        <div className={`text-sm font-bold tabular-nums ${tx.type.includes('CREDIT') || tx.type.includes('REIMBURSEMENT')
                                            ? 'text-green-600'
                                            : 'text-red-600'
                                            }`}>
                                            {tx.type.includes('CREDIT') || tx.type.includes('REIMBURSEMENT') ? '+' : '-'}₹{tx.amount.toLocaleString()}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
