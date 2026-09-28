import { Badge } from "@/components/ui/badge";
import type { NotificationJobStatus } from "@prisma/client";

const STATUS_STYLES: Record<NotificationJobStatus, string> = {
    QUEUED: "bg-slate-100 text-slate-700 border-slate-200",
    PROCESSING: "bg-blue-100 text-blue-800 border-blue-200",
    SENT: "bg-emerald-100 text-emerald-800 border-emerald-200",
    RETRY_SCHEDULED: "bg-amber-100 text-amber-800 border-amber-200",
    FAILED: "bg-orange-100 text-orange-800 border-orange-200",
    DEAD_LETTER: "bg-red-100 text-red-800 border-red-200",
    COMPLETED: "bg-green-100 text-green-800 border-green-200",
};

const STATUS_LABELS: Record<NotificationJobStatus, string> = {
    QUEUED: "Queued",
    PROCESSING: "Processing",
    SENT: "Sent",
    RETRY_SCHEDULED: "Retry Scheduled",
    FAILED: "Failed",
    DEAD_LETTER: "Dead Letter",
    COMPLETED: "Completed",
};

export function NotificationStatusBadge({ status }: { status: NotificationJobStatus }) {
    return (
        <Badge variant="outline" className={STATUS_STYLES[status]}>
            {STATUS_LABELS[status]}
        </Badge>
    );
}
