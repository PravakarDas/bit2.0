import { getTimelineModificationRequests } from "@/actions/timeline-modification-request.actions";
import { TimelineModificationReviewClient } from "@/components/timeline-modification/TimelineModificationReviewClient";

export const dynamic = "force-dynamic";

export default async function ManagerTimelineModificationRequestsPage() {
  const result = await getTimelineModificationRequests();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Timeline Modification Requests</h1>
        <p className="text-muted-foreground">
          Review and process employee timeline correction requests
        </p>
      </div>

      <TimelineModificationReviewClient initialRequests={result.data || []} />
    </div>
  );
}
