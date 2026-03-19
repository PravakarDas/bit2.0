import { getManagerDashboardData, getAllBranches } from "@/actions/manager.actions";
import { ManagerDashboard } from "@/components/manager/ManagerDashboard";

export default async function ManagerDashboardPage({
    searchParams
}: {
    searchParams: { branch?: string, from?: string, to?: string }
}) {
    const params = await searchParams;
    
    const branchId = params.branch;
    const fromDate = params.from;
    const toDate = params.to;

    const [data, branches] = await Promise.all([
        getManagerDashboardData(branchId, fromDate, toDate),
        getAllBranches()
    ]);

    return (
        <ManagerDashboard 
            initialData={data} 
            branches={branches} 
        />
    );
}