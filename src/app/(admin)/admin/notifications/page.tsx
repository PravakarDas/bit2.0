"use client";

import { useState, useEffect } from "react";
import {
  Bell,
  Check,
  Eye,
  EyeOff,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);

  /* ===============================
     Fetch Functions
  ================================ */

  const fetchUnreadCount = async () => {
    const result = await getUnreadCount();
    if (result.success) {
      setUnreadCount(result.count);
    }
  };

  const fetchNotifications = async () => {
    const result = await getAllNotifications(1, 50);
    if (result.success) {
      setNotifications(result.notifications);
      setUnreadCount(
        result.notifications.filter(
          (n) => n.status === NotificationStatus.UNREAD
        ).length
      );
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
      await fetchNotifications();
      await fetchUnreadCount();
      toast.success("Notification deleted");
    } else {
      toast.error("Failed to delete notification");
    }
  };

  /* ===============================
     Effects
  ================================ */

  useEffect(() => {
    void (async () => {
      await fetchNotifications();
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

      <div className="space-y-3">
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
              } ${isProcessed ? "opacity-75" : ""}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">
                        {notification.title}
                      </h3>

                      {notification.status ===
                        NotificationStatus.UNREAD && (
                        <Badge className="bg-blue-100 text-blue-800 text-xs">
                          New
                        </Badge>
                      )}

                      {isProcessed && (
                        <Badge className="text-xs bg-green-50 border-green-200 text-green-700">
                          {metadata?.action === "approve"
                            ? "Approved"
                            : "Declined"}
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground mb-2">
                      {notification.message}
                    </p>

                    {metadata?.adminNote && (
                      <p className="text-xs italic bg-gray-50 p-2 rounded">
                        Admin note: {metadata.adminNote}
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {new Date(
                        notification.createdAt
                      ).toLocaleString()}

                      {metadata?.processedAt && (
                        <span className="ml-2">
                          • Processed:{" "}
                          {new Date(
                            metadata.processedAt
                          ).toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
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
      </div>
    </div>
  );
}
