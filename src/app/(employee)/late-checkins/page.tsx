import { EmployeeLateCheckinDetail } from "@/components/late-checkin/EmployeeLateCheckinDetail";
import { getCurrentUserLateCheckinData } from "@/actions/late-checkin.actions";

export default async function EmployeeLateCheckinPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const params = await searchParams;
  const fromDate = params.from ?? "";
  const toDate = params.to ?? "";

  const data = await getCurrentUserLateCheckinData({
    fromDate,
    toDate,
  });

  return (
    <EmployeeLateCheckinDetail
      title="My Late Check-Ins"
      description="Review your late check-in minutes and penalty deductions by date."
      data={data}
      basePath="/late-checkins"
      initialFilters={{
        fromDate,
        toDate,
      }}
    />
  );
}