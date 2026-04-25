import { getEmployeeAllBreakingNotices } from "@/actions/breaking-notice.actions";
import { EmployeeNoticesList } from "@/components/employee/EmployeeNoticesList";

export const metadata = {
  title: "Notices",
  description: "View all notices sent to you",
};

export default async function EmployeeNoticesPage() {
  const notices = await getEmployeeAllBreakingNotices();

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100">
      <div className="space-y-4 p-3 sm:p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Notices</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            View all notices sent to you, organized by date.
          </p>
        </div>

        {/* Notices List */}
        <div className="max-w-3xl mx-auto">
          <EmployeeNoticesList notices={notices} />
        </div>
      </div>
    </div>
  );
}
