import { getLeaveBoardData } from "@/actions/leave-board.actions";
import { LeaveBoardTable } from "@/components/admin/LeaveBoardTable";

export default async function ManagerLeaveBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; branch?: string }>;
}) {
  const params = await searchParams;

  const data = await getLeaveBoardData({
    search: params.search ?? "",
    branchId: params.branch ?? "all",
  });

  return (
    <LeaveBoardTable
      title="Leave-board"
      description="Preview current-year leave balance for all employees, including absences from daily records."
      basePath="/manager/leave-board"
      data={data}
    />
  );
}