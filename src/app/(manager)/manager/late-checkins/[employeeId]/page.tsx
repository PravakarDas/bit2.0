import { EmployeeLateCheckinDetail } from "@/components/late-checkin/EmployeeLateCheckinDetail";
import { getEmployeeLateCheckinData } from "@/actions/late-checkin.actions";

export default async function ManagerEmployeeLateCheckinDetailPage({
  params,
  searchParams,
}: {
  params: { employeeId: string };
  searchParams: { from?: string; to?: string };
}) {
  const routeParams = await params;
  const queryParams = await searchParams;

  const fromDate = queryParams.from ?? "";
  const toDate = queryParams.to ?? "";

  const data = await getEmployeeLateCheckinData(routeParams.employeeId, {
    fromDate,
    toDate,
  });

  return (
    <EmployeeLateCheckinDetail
      title="Employee Late Check-In Details"
      description="Detailed late check-in records with per-day deduction data."
      data={data}
      basePath={`/manager/late-checkins/${routeParams.employeeId}`}
      backHref="/manager/late-checkins"
      initialFilters={{
        fromDate,
        toDate,
      }}
    />
  );
}