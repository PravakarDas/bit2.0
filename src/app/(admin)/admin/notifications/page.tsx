"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Bell,
  Check,
  Eye,
  EyeOff,
  Trash2,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { AdminNotification } from "@prisma/client";
import { NotificationStatus } from "@prisma/client";
import {
  getAllNotifications,
  getUnreadCount,
  deleteNotification,
  markNotificationAsRead,
  markNotificationAsUnread,
  markAllNotificationsAsRead,
} from "@/actions/notification.actions";

/* ===============================
   ✅ Proper Metadata Type
================================ */
type NotificationMetadata = {
  processed?: boolean;
  status?: string;
  action?: "approve" | "decline";
  adminNote?: string;
  processedAt?: string | Date;
};

export default function NotificationsPage() {
  const PAGE_SIZE = 20;
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [specificDate, setSpecificDate] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedNotification, setSelectedNotification] =
    useState<AdminNotification | null>(null);

  /* ===============================
     Fetch Functions
  ================================ */

  const fetchUnreadCount = async () => {
    const result = await getUnreadCount();
    if (result.success) {
      setUnreadCount(result.count);
    }
  };

  const fetchNotifications = async (
    page = currentPage,
    filters?: { specificDate?: string; fromDate?: string; toDate?: string }
  ) => {
    const selectedSpecificDate = filters?.specificDate ?? specificDate;
    const selectedFromDate = filters?.fromDate ?? fromDate;
    const selectedToDate = filters?.toDate ?? toDate;

    const effectiveFromDate = selectedSpecificDate || selectedFromDate || undefined;
    const effectiveToDate = selectedSpecificDate || selectedToDate || undefined;

    const result = await getAllNotifications(
      page,
      PAGE_SIZE,
      undefined,
      effectiveFromDate,
      effectiveToDate
    );

    if (result.success) {
      if (page > result.pagination.total) {
        await fetchNotifications(result.pagination.total);
        return;
      }

      setNotifications(result.notifications);
      setCurrentPage(result.pagination.current);
      setTotalPages(result.pagination.total);
      setTotalCount(result.pagination.count);
    }
  };

  /* ===============================
     Actions
  ================================ */

  const toggleReadStatus = async (
    notificationId: string,
    currentStatus: NotificationStatus
  ) => {
    const action =
      currentStatus === NotificationStatus.UNREAD
        ? markNotificationAsRead
        : markNotificationAsUnread;

    const result = await action(notificationId);

    if (result.success) {
      await fetchNotifications();
      await fetchUnreadCount();
      toast.success(
        `Marked as ${
          currentStatus === NotificationStatus.UNREAD ? "read" : "unread"
        }`
      );
    } else {
      toast.error("Failed to update notification");
    }
  };

  const markAllAsRead = async () => {
    const result = await markAllNotificationsAsRead();
    if (result.success) {
      await fetchNotifications();
      await fetchUnreadCount();
      toast.success("All notifications marked as read");
    } else {
      toast.error("Failed to mark all notifications as read");
    }
  };

  const handleDelete = async (notificationId: string) => {
    const result = await deleteNotification(notificationId);
    if (result.success) {
      await fetchNotifications(currentPage);
      await fetchUnreadCount();
      toast.success("Notification deleted");
    } else {
      toast.error("Failed to delete notification");
    }
  };

  const applyDateFilters = async () => {
    if (!specificDate && fromDate && toDate && fromDate > toDate) {
      toast.error("From date cannot be after To date");
      return;
    }

    await fetchNotifications(1);
  };

  const clearDateFilters = async () => {
    setSpecificDate("");
    setFromDate("");
    setToDate("");
    await fetchNotifications(1, { specificDate: "", fromDate: "", toDate: "" });
  };

  const pageNumbers = useMemo(() => {
    if (totalPages <= 1) return [];

    const windowSize = 5;
    let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
    let end = Math.min(totalPages, start + windowSize - 1);

    if (end - start + 1 < windowSize) {
      start = Math.max(1, end - windowSize + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, idx) => start + idx);
  }, [currentPage, totalPages]);

  const openNotificationDetails = (notification: AdminNotification) => {
    setSelectedNotification(notification);
  };

  /* ===============================
     Effects
  ================================ */

  useEffect(() => {
    void (async () => {
      await fetchNotifications(1);
      await fetchUnreadCount();
    })();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  /* ===============================
     Helpers
  ================================ */

  /* ===============================
     UI
  ================================ */

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Bell className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">Notifications</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread notification${
                    unreadCount > 1 ? "s" : ""
                  }`
                : "All caught up!"}
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <Button onClick={markAllAsRead} variant="outline" size="sm">
            <Check className="h-4 w-4 mr-2" />
            Mark All as Read
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Card>
          <CardContent className="p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-sm font-medium mb-1">Specific Date</p>
                <Input
                  type="date"
                  value={specificDate}
                  onChange={(event) => setSpecificDate(event.target.value)}
                />
              </div>
              <div>
                <p className="text-sm font-medium mb-1">From Date</p>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  disabled={Boolean(specificDate)}
                />
              </div>
              <div>
                <p className="text-sm font-medium mb-1">To Date</p>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  disabled={Boolean(specificDate)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <Button size="sm" onClick={applyDateFilters}>
                Apply Filters
              </Button>
              <Button size="sm" variant="outline" onClick={clearDateFilters}>
                Clear Filters
              </Button>
              <p className="text-sm text-muted-foreground ml-auto">
                Total: {totalCount}
              </p>
            </div>
          </CardContent>
        </Card>

        {notifications.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No notifications found for the selected page/filter.
            </CardContent>
          </Card>
        ) : null}

        {notifications.map((notification) => {
          const metadata =
            notification.metadata as NotificationMetadata | null;

          const isProcessed = metadata?.processed === true;

          return (
            <Card
              key={notification.id}
              className={`transition-all ${
                notification.status === NotificationStatus.UNREAD
                  ? "bg-blue-50 border-blue-200"
                  : ""
              } ${isProcessed ? "opacity-75" : ""} rounded-md`}
            >
              <CardContent className="px-2 py-0 h-11 flex items-center">
                <div className="flex items-center justify-between gap-1.5 w-full">
                  <button
                    type="button"
                    onClick={() => openNotificationDetails(notification)}
                    className="flex-1 min-w-0 text-left rounded px-2 h-8 flex items-center hover:bg-muted/70"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="font-medium text-sm leading-none truncate">
                        {notification.title}
                      </h3>

                      {notification.status === NotificationStatus.UNREAD && (
                        <Badge className="bg-blue-100 text-blue-800 text-[9px] h-4 px-1.5 leading-none">
                          New
                        </Badge>
                      )}

                      {isProcessed && (
                        <Badge className="text-[9px] h-4 px-1.5 leading-none bg-green-50 border-green-200 text-green-700">
                          {metadata?.action === "approve" ? "Approved" : "Declined"}
                        </Badge>
                      )}
                    </div>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() =>
                          toggleReadStatus(
                            notification.id,
                            notification.status
                          )
                        }
                      >
                        {notification.status ===
                        NotificationStatus.UNREAD ? (
                          <>
                            <Eye className="mr-2 h-4 w-4" />
                            Mark as read
                          </>
                        ) : (
                          <>
                            <EyeOff className="mr-2 h-4 w-4" />
                            Mark as unread
                          </>
                        )}
                      </DropdownMenuItem>

                      <Separator className="my-1" />

                      <DropdownMenuItem
                        onClick={() =>
                          handleDelete(notification.id)
                        }
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        })}

        <Dialog
          open={Boolean(selectedNotification)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedNotification(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="pr-8">
                {selectedNotification?.title}
              </DialogTitle>
              <DialogDescription>
                {selectedNotification
                  ? new Date(selectedNotification.createdAt).toLocaleString()
                  : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {selectedNotification?.message}
              </p>

              {selectedNotification?.metadata && (
                <div className="text-xs text-muted-foreground space-y-1">
                  {(selectedNotification.metadata as NotificationMetadata).adminNote ? (
                    <p>
                      Admin note: {(selectedNotification.metadata as NotificationMetadata).adminNote}
                    </p>
                  ) : null}
                  {(selectedNotification.metadata as NotificationMetadata).processedAt ? (
                    <p>
                      Processed: {new Date((selectedNotification.metadata as NotificationMetadata).processedAt as string | Date).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </p>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => void fetchNotifications(currentPage - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {pageNumbers.map((page) => (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  onClick={() => void fetchNotifications(page)}
                >
                  {page}
                </Button>
              ))}

              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => void fetchNotifications(currentPage + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
