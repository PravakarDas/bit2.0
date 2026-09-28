"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
    NotificationFiltersBar,
    DEFAULT_NOTIFICATION_FILTERS,
    type NotificationFiltersState,
} from "@/components/shared/notification-center/NotificationFiltersBar";
import { NotificationTable, type NotificationRow } from "@/components/shared/notification-center/NotificationTable";
import { NotificationPagination } from "@/components/shared/notification-center/NotificationPagination";
import { NotificationDetailDrawer } from "@/components/shared/notification-center/NotificationDetailDrawer";
import { NotificationPreferencesDialog } from "@/components/shared/notification-center/NotificationPreferencesDialog";
import type { InboxDetail } from "@/lib/services/notification-engine";
import {
    getMyNotifications,
    getMyNotificationDetail,
    getMyNotificationCounts,
    markNotificationRead,
    markAllNotificationsRead,
    archiveNotification,
    unarchiveNotification,
    deleteArchivedNotification,
} from "@/actions/notification-inbox.actions";

const PAGE_SIZE = 20;

export default function EmployeeNotificationCenterPage() {
    const [filters, setFilters] = useState<NotificationFiltersState>(DEFAULT_NOTIFICATION_FILTERS);
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<NotificationRow[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [counts, setCounts] = useState({ unread: 0, read: 0, archived: 0, total: 0 });

    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [detail, setDetail] = useState<InboxDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [preferencesOpen, setPreferencesOpen] = useState(false);

    const loadCounts = useCallback(async () => {
        const result = await getMyNotificationCounts();
        if (result.success) {
            setCounts(result.counts);
        }
    }, []);

    const loadNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getMyNotifications(
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
        void loadCounts();
    }, [loadCounts]);

    const openDetail = async (jobId: string) => {
        setSelectedJobId(jobId);
        setDetailLoading(true);
        const result = await getMyNotificationDetail(jobId);
        setDetailLoading(false);
        if (result.success) {
            setDetail(result.notification);
            if (!result.notification.isRead) {
                await markNotificationRead(jobId);
                void loadNotifications();
                void loadCounts();
            }
        } else {
            toast.error(result.error);
            setDetail(null);
        }
    };

    const handleToggleRead = async (row: NotificationRow) => {
        const result = await markNotificationRead(row.jobId);
        if (result.success) {
            void loadNotifications();
            void loadCounts();
        } else {
            toast.error(result.error);
        }
    };

    const handleToggleArchive = async (row: NotificationRow) => {
        const result = row.isArchived ? await unarchiveNotification(row.jobId) : await archiveNotification(row.jobId);
        if (result.success) {
            toast.success(row.isArchived ? "Notification restored" : "Notification archived");
            void loadNotifications();
            void loadCounts();
        } else {
            toast.error(result.error);
        }
    };

    const handleDelete = async (row: NotificationRow) => {
        const result = await deleteArchivedNotification(row.jobId);
        if (result.success) {
            toast.success("Notification deleted");
            void loadNotifications();
            void loadCounts();
        } else {
            toast.error(result.error);
        }
    };

    const handleMarkAllRead = async () => {
        const result = await markAllNotificationsRead();
        if (result.success) {
            toast.success("All notifications marked as read");
            void loadNotifications();
            void loadCounts();
        } else {
            toast.error(result.error);
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Bell className="h-8 w-8" />
                    <div>
                        <h1 className="text-3xl font-bold">Notification Center</h1>
                        <p className="text-muted-foreground">
                            {counts.unread > 0 ? `${counts.unread} unread notification${counts.unread > 1 ? "s" : ""}` : "All caught up!"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPreferencesOpen(true)}>
                        <Settings className="h-4 w-4 mr-2" />
                        Preferences
                    </Button>
                    {counts.unread > 0 && (
                        <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
                            <CheckCheck className="h-4 w-4 mr-2" />
                            Mark All as Read
                        </Button>
                    )}
                </div>
            </div>

            <NotificationFiltersBar value={filters} onChange={setFilters} />

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading notifications...</p>
            ) : (
                <NotificationTable
                    items={items}
                    onView={openDetail}
                    onToggleRead={handleToggleRead}
                    onToggleArchive={handleToggleArchive}
                    onDelete={handleDelete}
                />
            )}

            <NotificationPagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

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
            />

            <NotificationPreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen} />
        </div>
    );
}
