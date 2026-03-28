import { EmployeeLateCheckinDetail } from "@/components/late-checkin/EmployeeLateCheckinDetail";
import { getCurrentUserLateCheckinData } from "@/actions/late-checkin.actions";
import { getDbUser } from "@/actions/user.actions";
import { redirect } from "next/navigation";

export default async function EmployeeLateCheckinPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const user = await getDbUser();
  if (!user) redirect("/sign-in");
  if (user.isManager) redirect("/unauthorized");

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