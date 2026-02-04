"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, Calendar, Check, Clock } from "lucide-react";
import { format } from "date-fns";
import { getEmployeeNotifications, markNotificationAsRead } from "@/actions/leave-automation.actions";
import { toast } from "sonner";

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    relatedDate?: Date | null;
    isRead: boolean;
    createdAt: Date;
}

interface NotificationPanelProps {
    userId: string;
}

export function NotificationPanel({ userId }: NotificationPanelProps) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadNotifications();
    }, [userId]);

    const loadNotifications = async () => {
        try {
            const data = await getEmployeeNotifications(userId);
            setNotifications(data as Notification[]);
        } catch (error) {
            console.error("Failed to load notifications:", error);
            toast.error("Failed to load notifications");
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsRead = async (notificationId: string) => {
        try {
            await markNotificationAsRead(notificationId);
            setNotifications(prev => 
                prev.map(notif => 
                    notif.id === notificationId 
                        ? { ...notif, isRead: true }
                        : notif
                )
            );
        } catch (error) {
            console.error("Failed to mark notification as read:", error);
            toast.error("Failed to mark notification as read");
        }
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case "AUTO_LEAVE_DEDUCTION":
                return <Calendar className="h-4 w-4 text-orange-500" />;
            case "WEEKLY_OFF_SET":
                return <Clock className="h-4 w-4 text-blue-500" />;
            case "ABSENT_WITHOUT_LEAVE":
                return <Bell className="h-4 w-4 text-red-500" />;
            default:
                return <Bell className="h-4 w-4 text-gray-500" />;
        }
    };

    const getNotificationColor = (type: string) => {
        switch (type) {
            case "AUTO_LEAVE_DEDUCTION":
                return "border-l-orange-500";
            case "WEEKLY_OFF_SET":
                return "border-l-blue-500";
            case "ABSENT_WITHOUT_LEAVE":
                return "border-l-red-500";
            default:
                return "border-l-gray-500";
        }
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        Notifications
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-center py-8">
                        <div className="text-muted-foreground">Loading notifications...</div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bell className="h-5 w-5" />
                        Notifications
                    </div>
                    {unreadCount > 0 && (
                        <Badge variant="destructive" className="ml-2">
                            {unreadCount} unread
                        </Badge>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {notifications.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        No notifications yet
                    </div>
                ) : (
                    <ScrollArea className="h-[400px]">
                        <div className="space-y-3">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`p-4 border rounded-lg border-l-4 ${getNotificationColor(notification.type)} ${
                                        !notification.isRead ? "bg-blue-50/50" : "bg-gray-50/50"
                                    }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3 flex-1">
                                            {getNotificationIcon(notification.type)}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-medium text-sm">
                                                        {notification.title}
                                                    </h4>
                                                    {!notification.isRead && (
                                                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    {notification.message}
                                                </p>
                                                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                                    <span>
                                                        {format(new Date(notification.createdAt), "MMM d, yyyy 'at' h:mm a")}
                                                    </span>
                                                    {notification.relatedDate && (
                                                        <span>
                                                            Related Date: {format(new Date(notification.relatedDate), "MMM d, yyyy")}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        {!notification.isRead && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleMarkAsRead(notification.id)}
                                                className="ml-2"
                                            >
                                                <Check className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    );
}