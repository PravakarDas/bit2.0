"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    NotificationFiltersBar,
    DEFAULT_NOTIFICATION_FILTERS,
    type NotificationFiltersState,
} from "@/components/shared/notification-center/NotificationFiltersBar";
import { NotificationTable, type NotificationRow } from "@/components/shared/notification-center/NotificationTable";
import { NotificationPagination } from "@/components/shared/notification-center/NotificationPagination";
import { NotificationDetailDrawer } from "@/components/shared/notification-center/NotificationDetailDrawer";
import { EmployeeNotificationPreferencesPanel } from "@/components/admin/EmployeeNotificationPreferencesPanel";
import type { AdminInboxDetail, QueueStatistics } from "@/lib/services/notification-engine";
import {
    getAllNotifications,
    getNotificationDetailForAdmin,
    getNotificationQueueStatus,
    retryNotificationNow,
    requeueDeadLetterNotification,
} from "@/actions/notification-admin.actions";
import { getUsers } from "@/actions/user.actions";

const PAGE_SIZE = 20;

export default function AdminNotificationCenterPage() {
    const [filters, setFilters] = useState<NotificationFiltersState>(DEFAULT_NOTIFICATION_FILTERS);
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<NotificationRow[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [queueStatus, setQueueStatus] = useState<QueueStatistics | null>(null);

    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [detail, setDetail] = useState<AdminInboxDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [actionPending, setActionPending] = useState(false);

    const [users, setUsers] = useState<Awaited<ReturnType<typeof getUsers>>>([]);

    const loadQueueStatus = useCallback(async () => {
        const result = await getNotificationQueueStatus();
        if (result.success) {
            setQueueStatus(result.statistics);
        }
    }, []);

    const loadNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getAllNotifications(
                {
                    readStatus: filters.tab === "unread" ? "UNREAD" : filters.tab === "read" ? "READ" : undefined,
                    archived: filters.tab === "archived",
                    channel: filters.channel === "ALL" ? undefined : filters.channel,
                    deliveryStatus: filters.deliveryStatus === "ALL" ? undefined : filters.deliveryStatus,
                    createdAfter: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
                    createdBefore: filters.dateTo ? new Date(filters.dateTo) : undefined,
                    search: filters.search || undefined,
                },
                { page, pageSize: PAGE_SIZE }
            );

            if (result.success) {
                setItems(
                    result.items.map((item) => ({
                        jobId: item.jobId,
                        title: item.title,
                        channel: item.channel,
                        deliveryStatus: item.deliveryStatus,
                        isRead: item.isRead,
                        isArchived: item.isArchived,
                        createdAt: item.createdAt,
                        recipientLabel: item.recipientName,
                    }))
                );
                setTotal(result.total);
                setTotalPages(result.totalPages);
            } else {
                toast.error(result.error);
            }
        } finally {
            setLoading(false);
        }
    }, [filters, page]);

    useEffect(() => {
        setPage(1);
    }, [filters.tab, filters.channel, filters.deliveryStatus, filters.dateFrom, filters.dateTo, filters.search]);

    useEffect(() => {
        void loadNotifications();
    }, [loadNotifications]);

    useEffect(() => {
        void loadQueueStatus();
    }, [loadQueueStatus]);

    useEffect(() => {
        void getUsers().then(setUsers);
    }, []);

    const openDetail = async (jobId: string) => {
        setSelectedJobId(jobId);
        setDetailLoading(true);
        const result = await getNotificationDetailForAdmin(jobId);
        setDetailLoading(false);
        if (result.success) {
            setDetail(result.notification);
        } else {
            toast.error(result.error);
            setDetail(null);
        }
    };

    const handleRetryNow = async (jobId: string) => {
        setActionPending(true);
        const result = await retryNotificationNow(jobId);
        setActionPending(false);
        if (result.success) {
            toast.success("Notification queued for immediate retry");
            void openDetail(jobId);
            void loadNotifications();
            void loadQueueStatus();
        } else {
            toast.error(result.error);
        }
    };

    const handleRequeue = async (jobId: string) => {
        setActionPending(true);
        const result = await requeueDeadLetterNotification(jobId);
        setActionPending(false);
        if (result.success) {
            toast.success("Notification requeued");
            void openDetail(jobId);
            void loadNotifications();
            void loadQueueStatus();
        } else {
            toast.error(result.error);
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-4">
            <div className="flex items-center gap-4">
                <Bell className="h-8 w-8" />
                <div>
                    <h1 className="text-3xl font-bold">Notification Center</h1>
                    <p className="text-muted-foreground">Every notification sent by the Notification Engine, across every employee.</p>
                </div>
            </div>

            <Tabs defaultValue="all-notifications" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="all-notifications">All Notifications</TabsTrigger>
                    <TabsTrigger value="employee-preferences">Employee Preferences</TabsTrigger>
                </TabsList>

                <TabsContent value="all-notifications" className="space-y-4">
                    {queueStatus && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Queue Status</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                                {Object.entries(queueStatus).map(([status, count]) => (
                                    <div key={status} className="rounded-md border p-2 text-center">
                                        <p className="text-2xl font-semibold">{count}</p>
                                        <p className="text-xs text-muted-foreground">{status.replace(/_/g, " ")}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    <NotificationFiltersBar value={filters} onChange={setFilters} />

                    {loading ? (
                        <p className="text-sm text-muted-foreground">Loading notifications...</p>
                    ) : (
                        <NotificationTable items={items} showRecipient onView={openDetail} />
                    )}

                    <NotificationPagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
                </TabsContent>

                <TabsContent value="employee-preferences">
                    <EmployeeNotificationPreferencesPanel users={users} />
                </TabsContent>
            </Tabs>

            <NotificationDetailDrawer
                open={Boolean(selectedJobId)}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedJobId(null);
                        setDetail(null);
                    }
                }}
                detail={detail}
                loading={detailLoading}
                isAdmin
                retryPending={actionPending}
                onRetryNow={handleRetryNow}
                onRequeueDeadLetter={handleRequeue}
            />
        </div>
    );
}
