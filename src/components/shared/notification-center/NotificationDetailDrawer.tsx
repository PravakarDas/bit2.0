"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDateTime12 } from "@/lib/utils";
import { NotificationStatusBadge } from "./NotificationStatusBadge";
import type { AdminInboxDetail, InboxDetail } from "@/lib/services/notification-engine";

interface NotificationDetailDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    detail: InboxDetail | AdminInboxDetail | null;
    loading?: boolean;
    isAdmin?: boolean;
    retryPending?: boolean;
    onRetryNow?: (jobId: string) => void;
    onRequeueDeadLetter?: (jobId: string) => void;
}

function isAdminDetail(detail: InboxDetail | AdminInboxDetail): detail is AdminInboxDetail {
    return "deliveryAttempts" in detail;
}

export function NotificationDetailDrawer({
    open,
    onOpenChange,
    detail,
    loading,
    isAdmin,
    retryPending,
    onRetryNow,
    onRequeueDeadLetter,
}: NotificationDetailDrawerProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{detail?.title ?? (loading ? "Loading..." : "Notification")}</SheetTitle>
                    <SheetDescription>{detail ? formatDateTime12(detail.createdAt) : ""}</SheetDescription>
                </SheetHeader>

                {!detail ? (
                    <div className="px-4 text-sm text-muted-foreground">{loading ? "Loading notification..." : "Notification not found."}</div>
                ) : (
                    <div className="px-4 space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <NotificationStatusBadge status={detail.deliveryStatus} />
                            <Badge variant="outline">{detail.channel}</Badge>
                            <Badge variant="outline">{detail.eventType}</Badge>
                        </div>

                        <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Sent to</p>
                            <p className="text-sm">{detail.recipientAddress}</p>
                        </div>

                        <Separator />

                        <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Message</p>
                            {detail.renderedSubject || detail.renderedBodyHtml || detail.renderedBodyText ? (
                                <div className="rounded-md border p-3 space-y-2">
                                    {detail.renderedSubject && <p className="font-medium text-sm">{detail.renderedSubject}</p>}
                                    {detail.renderedBodyHtml ? (
                                        // Safe: TemplateRenderer (Phase 5) HTML-escapes every substituted
                                        // variable before this content is ever persisted/rendered — see
                                        // NotificationCenterReport.md's "Security" section.
                                        <div className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: detail.renderedBodyHtml }} />
                                    ) : detail.renderedBodyText ? (
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detail.renderedBodyText}</p>
                                    ) : null}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground italic">No preview available for this notification.</p>
                            )}
                        </div>

                        {isAdmin && isAdminDetail(detail) && (
                            <>
                                <Separator />
                                <div className="space-y-3">
                                    <p className="text-xs font-medium text-muted-foreground">Admin details</p>

                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Attempts</p>
                                            <p>
                                                {detail.attemptCount} / {detail.maxAttempts}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Next attempt</p>
                                            <p>{formatDateTime12(detail.nextAttemptAt)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Locked by (worker)</p>
                                            <p>{detail.lockedBy ?? "—"}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">Locked at</p>
                                            <p>{detail.lockedAt ? formatDateTime12(detail.lockedAt) : "—"}</p>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs text-muted-foreground mb-1">Raw payload</p>
                                        <pre className="rounded-md bg-muted p-2 text-xs overflow-x-auto max-h-40">
                                            {JSON.stringify(detail.payload, null, 2)}
                                        </pre>
                                    </div>

                                    <div>
                                        <p className="text-xs text-muted-foreground mb-1">Delivery attempts</p>
                                        {detail.deliveryAttempts.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No delivery attempts recorded yet.</p>
                                        ) : (
                                            <ul className="space-y-2">
                                                {detail.deliveryAttempts.map((attempt) => (
                                                    <li key={attempt.attemptNumber} className="rounded-md border p-2 text-xs space-y-0.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-medium">Attempt #{attempt.attemptNumber}</span>
                                                            <Badge variant={attempt.outcome === "SUCCESS" ? "outline" : "destructive"}>
                                                                {attempt.outcome}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-muted-foreground">{formatDateTime12(attempt.attemptedAt)}</p>
                                                        {attempt.providerName && <p>Provider: {attempt.providerName}</p>}
                                                        {attempt.errorMessage && <p className="text-red-600">{attempt.errorMessage}</p>}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {isAdmin && detail && (
                    <SheetFooter className="flex-row gap-2">
                        {detail.deliveryStatus === "RETRY_SCHEDULED" && onRetryNow && (
                            <Button size="sm" disabled={retryPending} onClick={() => onRetryNow(detail.jobId)}>
                                Retry now
                            </Button>
                        )}
                        {detail.deliveryStatus === "DEAD_LETTER" && onRequeueDeadLetter && (
                            <Button size="sm" variant="secondary" disabled={retryPending} onClick={() => onRequeueDeadLetter(detail.jobId)}>
                                Requeue
                            </Button>
                        )}
                    </SheetFooter>
                )}
            </SheetContent>
        </Sheet>
    );
}
