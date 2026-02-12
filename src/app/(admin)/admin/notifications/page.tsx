"use client";

import { useState, useEffect } from "react";
import { Bell, Check, X, Eye, EyeOff, Trash2, MoreHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  handleNotificationAction
} from "@/actions/notification.actions";

type NotificationType = 'TIMELINE_GENERATION_FAILED' | 'TIMELINE_BACKFILL_COMPLETED' | 'PROFILE_UPDATE_REQUEST' | 'LEAVE_APPLICATION_PENDING' | 'INCREMENT_REMINDER' | 'WALLET_REQUEST_PENDING' | 'LOAN_APPLICATION_PENDING' | 'EMPLOYEE_REGISTRATION_PENDING' | 'PAYROLL_NOTIFICATION' | 'SYSTEM_ALERT' | 'DEADLINE_REMINDER';

export default function NotificationsPage() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AdminNotification | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch unread count
  const fetchUnreadCount = async () => {
    const result = await getUnreadCount();
    if (result.success) {
      setUnreadCount(result.count);
    }
  };

  // Fetch all notifications
  const fetchNotifications = async () => {
    setLoading(true);
    const result = await getAllNotifications(1, 50);
    if (result.success) {
      setNotifications(result.notifications);
      setUnreadCount(result.notifications.filter(n => n.status === NotificationStatus.UNREAD).length);
    }
    setLoading(false);
  };

  // Mark as read/unread
  const toggleReadStatus = async (notificationId: string, currentStatus: NotificationStatus) => {
    const action = currentStatus === NotificationStatus.UNREAD ? markNotificationAsRead : markNotificationAsUnread;
    const result = await action(notificationId);
    
    if (result.success) {
      await fetchNotifications();
      await fetchUnreadCount();
      toast.success(`Marked as ${currentStatus === NotificationStatus.UNREAD ? 'read' : 'unread'}`);
    } else {
      toast.error('Failed to update notification');
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    const result = await markAllNotificationsAsRead();
    if (result.success) {
      await fetchNotifications();
      await fetchUnreadCount();
      toast.success('All notifications marked as read');
    } else {
      toast.error('Failed to mark all notifications as read');
    }
  };

  // Delete notification
  const handleDelete = async (notificationId: string) => {
    const result = await deleteNotification(notificationId);
    if (result.success) {
      await fetchNotifications();
      await fetchUnreadCount();
      toast.success('Notification deleted');
    } else {
      toast.error('Failed to delete notification');
    }
  };

  // Handle notification action (approve/decline)
  const handleAction = async (notificationId: string, action: 'approve' | 'decline', adminNote: string = '') => {
    setActionLoading(true);
    const result = await handleNotificationAction(notificationId, action, adminNote);
    
    if (result.success) {
      await fetchNotifications();
      await fetchUnreadCount();
      setSelectedNotification(null);
      toast.success(`Request ${action}d successfully`);
    } else {
      toast.error(result.error || `Failed to ${action} request`);
    }
    setActionLoading(false);
  };

  // Auto refresh every 30 seconds
  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Check if notification allows actions
  const allowsActions = (type: NotificationType) => {
    return ['PROFILE_UPDATE_REQUEST', 'LEAVE_APPLICATION_PENDING', 'LOAN_APPLICATION_PENDING', 'WALLET_REQUEST_PENDING'].includes(type);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Bell className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">Notifications</h1>
            <p className="text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => fetchNotifications()} variant="outline" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
          
          {unreadCount > 0 && (
            <Button onClick={markAllAsRead} variant="outline">
              <Check className="h-4 w-4 mr-2" />
              Mark All as Read
            </Button>
          )}
        </div>
      </div>

      {loading && notifications.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No notifications yet</h3>
            <p className="text-muted-foreground">You'll see notifications when there are updates to review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <Card key={notification.id} className={notification.status === NotificationStatus.UNREAD ? 'bg-blue-50 border-blue-200' : ''}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{notification.title}</h3>
                      {notification.status === NotificationStatus.UNREAD && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>

                    {/* Action Buttons for actionable notifications */}
                    {allowsActions(notification.type as NotificationType) && (
                      <div className="flex gap-2 mt-4">
                        <Button 
                          size="sm" 
                          onClick={() => setSelectedNotification(notification)}
                          variant="default"
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleAction(notification.id, 'decline')}
                          disabled={actionLoading}
                        >
                          <X className="h-3 w-3 mr-1" />
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => toggleReadStatus(notification.id, notification.status)}
                        >
                          {notification.status === NotificationStatus.UNREAD ? (
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
                          onClick={() => handleDelete(notification.id)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approval Dialog */}
      <Dialog open={selectedNotification !== null} onOpenChange={(open) => !open && setSelectedNotification(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Request</DialogTitle>
            <DialogDescription>
              You are about to approve this request. Add an optional note below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea 
              placeholder="Add an optional admin note..."
              id="adminNote"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedNotification(null)}>
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  const adminNote = (document.getElementById('adminNote') as HTMLTextAreaElement)?.value || '';
                  if (selectedNotification) {
                    handleAction(selectedNotification.id, 'approve', adminNote);
                  }
                }}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}