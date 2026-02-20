"use client";

import { useState, useEffect } from "react";
import { Bell, Check, X, Eye, EyeOff, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area"; 
import { Separator } from "@/components/ui/separator";
import type { AdminNotification } from "@prisma/client";
import { NotificationStatus } from "@prisma/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  getUnreadCount, 
  getAllNotifications, 
  markNotificationAsRead,
  markNotificationAsUnread,
  markAllNotificationsAsRead,
  deleteNotification,
  handleNotificationAction
} from "@/actions/notification.actions";

type NotificationType = 'TIMELINE_GENERATION_FAILED' | 'TIMELINE_BACKFILL_COMPLETED' | 'PROFILE_UPDATE_REQUEST' | 'LEAVE_APPLICATION_PENDING' | 'INCREMENT_REMINDER' | 'WALLET_REQUEST_PENDING' | 'LOAN_APPLICATION_PENDING' | 'EMPLOYEE_REGISTRATION_PENDING' | 'PAYROLL_NOTIFICATION' | 'SYSTEM_ALERT' | 'DEADLINE_REMINDER' | 'OVERTIME_REQUEST_PENDING';


export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
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
    }
    setLoading(false);
  };

  // Handle notification actions
  const handleAction = async (notificationId: string, action: 'approve' | 'decline') => {
    setActionLoading(true);
    const result = await handleNotificationAction(notificationId, action);
    
    if (result.success) {
      toast.success(`Request ${action}d successfully`);
      await fetchNotifications();
      await fetchUnreadCount();
    } else {
      toast.error(result.error || `Failed to ${action} request`);
    }
    setActionLoading(false);
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
  const handleMarkAllRead = async () => {
    const result = await markAllNotificationsAsRead();
    if (result.success) {
      await fetchNotifications();
      await fetchUnreadCount();
      toast.success('All notifications marked as read');
    } else {
      toast.error('Failed to mark all as read');
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

  // Get notification icon and color
  const getNotificationIcon = (type: NotificationType) => {
    const iconMap = {
      PROFILE_UPDATE_REQUEST: '👤',
      LEAVE_APPLICATION_PENDING: '📅', 
      INCREMENT_REMINDER: '🎉',
      WALLET_REQUEST_PENDING: '💰',
      LOAN_APPLICATION_PENDING: '🏦',
      EMPLOYEE_REGISTRATION_PENDING: '👥',
      PAYROLL_NOTIFICATION: '💸',
      SYSTEM_ALERT: '⚠️',
      DEADLINE_REMINDER: '⏰',
      TIMELINE_GENERATION_FAILED: '❌',
      TIMELINE_BACKFILL_COMPLETED: '✅',
      OVERTIME_REQUEST_PENDING: '⏱️'
    };
    return iconMap[type] || '📢';
  };

  // Auto refresh every 30 seconds
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch notifications when sheet opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Check if notification allows actions
  const allowsActions = (type: NotificationType) => {
    return ['PROFILE_UPDATE_REQUEST', 'LEAVE_APPLICATION_PENDING', 'LOAN_APPLICATION_PENDING', 'WALLET_REQUEST_PENDING'].includes(type);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge 
                variant="destructive" 
                className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>Notifications</SheetTitle>
              {notifications.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllRead}
                  disabled={loading}
                >
                  Mark all read
                </Button>
              )}
            </div>
            <SheetDescription>
              Manage requests and system alerts
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No notifications</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-200px)]">
                <div className="space-y-4">
                  {notifications.map((notification) => (
                    <Card key={notification.id} className={notification.status === NotificationStatus.UNREAD ? 'bg-blue-50 border-blue-200' : ''}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-2">
                            <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                            <div className="flex-1">
                              <CardTitle className="text-sm">{notification.title}</CardTitle>
                              <CardDescription className="text-xs">
                                {new Date(notification.createdAt).toLocaleDateString()} at {new Date(notification.createdAt).toLocaleTimeString()}
                              </CardDescription>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            {notification.status === NotificationStatus.UNREAD && (
                              <Badge variant="secondary" className="text-xs">New</Badge>
                            )}
                            
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
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleDelete(notification.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="pt-0">
                        <p className="text-sm text-muted-foreground mb-3">
                          {notification.message}
                        </p>
                        
                        {allowsActions(notification.type) && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleAction(notification.id, 'approve')}
                              disabled={actionLoading}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Check className="mr-1 h-3 w-3" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleAction(notification.id, 'decline')}
                              disabled={actionLoading}
                            >
                              <X className="mr-1 h-3 w-3" />
                              Decline
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedNotification(notification)}
                            >
                              View Details
                            </Button>
                          </div>
                        )}
                        
                        {!allowsActions(notification.type) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedNotification(notification)}
                          >
                            View Details
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Notification Details Dialog */}
      {selectedNotification && (
        <Dialog open={!!selectedNotification} onOpenChange={() => setSelectedNotification(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>{getNotificationIcon(selectedNotification.type)}</span>
                {selectedNotification.title}
              </DialogTitle>
              <DialogDescription>
                {selectedNotification.message}
              </DialogDescription>
            </DialogHeader>
            
            {selectedNotification.metadata && (
              <div className="py-4">
                <h4 className="text-sm font-semibold mb-2">Additional Information:</h4>
                <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                  {JSON.stringify(selectedNotification.metadata, null, 2)}
                </pre>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedNotification(null)}>
                Close
              </Button>
              {allowsActions(selectedNotification.type) && (
                <>
                  <Button
                    onClick={() => {
                      handleAction(selectedNotification.id, 'approve');
                      setSelectedNotification(null);
                    }}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={() => {
                      handleAction(selectedNotification.id, 'decline');
                      setSelectedNotification(null);
                    }}
                    variant="destructive"
                  >
                    Decline
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}