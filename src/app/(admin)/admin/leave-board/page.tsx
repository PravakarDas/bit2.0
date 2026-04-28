import { getLeaveBoardData } from "@/actions/leave-board.actions";
import { LeaveBoardTable } from "@/components/admin/LeaveBoardTable";

export default async function AdminLeaveBoardPage({
  searchParams,
}: {
  searchParams: { search?: string; branch?: string };
}) {
  const params = await searchParams;

  const data = await getLeaveBoardData({
    search: params.search ?? "",
    branchId: params.branch ?? "all",
  });

  return (
    <LeaveBoardTable
      title="Leave-board"
      description="Preview current-year leave balance across employees with branch and name filters."
      basePath="/admin/leave-board"
      data={data}
    />
  );
}