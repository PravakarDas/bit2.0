import { Suspense } from "react";
import { getMyTimelineModificationRequests } from "@/actions/timeline-modification-request.actions";
import { TimelineModificationRequestsClient } from "./TimelineModificationRequestsClient";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Timeline Modification Requests",
  description: "Request and track check-in/check-out/break-time corrections",
};

async function TimelineModificationRequestsContent() {
  const result = await getMyTimelineModificationRequests();
  return <TimelineModificationRequestsClient initialRequests={result.data || []} />;
}

export default function TimelineModificationRequestsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Timeline Modification Requests</h1>
        <p className="text-muted-foreground">
          Submit and track your check-in/check-out and break-time correction requests
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
        <TimelineModificationRequestsContent />
      </Suspense>
    </div>
  );
}
