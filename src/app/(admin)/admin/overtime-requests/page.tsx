import { Suspense } from "react";
import { getOvertimeRequests } from "@/actions/overtime-request.actions";
import { OvertimeRequestsAdminClient } from "./OvertimeRequestsAdminClient";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Overtime Requests Management",
  description: "Manage employee overtime requests",
};

async function OvertimeRequestsContent() {
  const result = await getOvertimeRequests();

  return <OvertimeRequestsAdminClient initialRequests={result.data || []} />;
}

export default function AdminOvertimeRequestsPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overtime Requests</h1>
        <p className="text-muted-foreground">
          Review and manage employee overtime approval requests
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-[100px] w-full" />
            <Skeleton className="h-[500px] w-full" />
          </div>
        }
      >
        <OvertimeRequestsContent />
      </Suspense>
    </div>
  );
}
