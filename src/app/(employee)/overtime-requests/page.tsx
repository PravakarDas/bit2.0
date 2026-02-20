import { Suspense } from "react";
import { getMyOvertimeRequests } from "@/actions/overtime-request.actions";
import { OvertimeRequestsClient } from "./OvertimeRequestsClient";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Overtime Requests",
  description: "Request and track your overtime approvals",
};

async function OvertimeRequestsContent() {
  const result = await getMyOvertimeRequests();

  return <OvertimeRequestsClient initialRequests={result.data || []} />;
}

export default function OvertimeRequestsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overtime Requests</h1>
        <p className="text-muted-foreground">
          Submit and manage your overtime approval requests
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-[400px] w-full" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        }
      >
        <OvertimeRequestsContent />
      </Suspense>
    </div>
  );
}
