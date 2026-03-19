import { getAdminDashboardData, getAllBranches } from "@/actions/dashboard.actions";
import { EnhancedDashboard } from "@/components/admin/EnhancedDashboard";

export default async function AdminDashboard({
    searchParams
}: {
    searchParams: { branch?: string, from?: string, to?: string }
}) {
    const params = await searchParams;
    
    const branchId = params.branch;
    const fromDate = params.from;
    const toDate = params.to;

    const [data, branches] = await Promise.all([
        getAdminDashboardData(branchId, fromDate, toDate),
        getAllBranches()
    ]);

    return (
        <div className="container mx-auto space-y-6 p-6">
            <EnhancedDashboard 
                initialData={data as unknown as Parameters<typeof EnhancedDashboard>[0]["initialData"]} 
                branches={branches} 
            />
        </div>
    );
}
