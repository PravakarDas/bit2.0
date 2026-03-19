import { getLateCheckinBranches, getLateCheckinDashboardData } from "@/actions/late-checkin.actions";
import { LateCheckinDashboard } from "@/components/late-checkin/LateCheckinDashboard";

export default async function ManagerLateCheckinPage({
  searchParams,
}: {
  searchParams: { branch?: string; from?: string; to?: string; search?: string };
}) {
  const params = await searchParams;

  const branchId = params.branch ?? "all";
  const fromDate = params.from ?? "";
  const toDate = params.to ?? "";
  const employeeSearch = params.search ?? "";

  const [branches, data] = await Promise.all([
    getLateCheckinBranches(),
    getLateCheckinDashboardData({
      branchId,
      fromDate,
      toDate,
      employeeSearch,
    }),
  ]);

  return (
    <LateCheckinDashboard
      title="Late Check-In Monitoring"
      description="Track team late check-in counts, affected employees, and branch-level trends."
      initialData={data}
      branches={branches}
      basePath="/manager/late-checkins"
      employeeDetailPath="/manager/late-checkins"
      hideTimeMetrics
      initialFilters={{
        branchId,
        fromDate,
        toDate,
        employeeSearch,
      }}
    />
  );
}