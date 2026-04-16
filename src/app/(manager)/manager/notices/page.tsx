import { redirect } from "next/navigation";
import { getDbUser } from "@/actions/user.actions";
import { getBreakingNoticeFormOptions, getBreakingNoticeHistory } from "@/actions/breaking-notice.actions";
import { BreakingNoticeManagement } from "@/components/admin/BreakingNoticeManagement";

export default async function ManagerNoticesPage() {
  const user = await getDbUser();
  if (!user) {
    redirect("/sign-in");
  }

  if (user.role !== "EMPLOYEE" || !user.isManager) {
    redirect("/unauthorized");
  }

  const [options, notices] = await Promise.all([
    getBreakingNoticeFormOptions(),
    getBreakingNoticeHistory(),
  ]);

  return (
    <div className="container mx-auto space-y-6 p-6">
      <BreakingNoticeManagement
        notices={notices}
        branches={options.branches}
        employees={options.employees}
        panelTitle="Notice"
        panelDescription="Create and manage urgent notices with employee seen history."
      />
    </div>
  );
}
