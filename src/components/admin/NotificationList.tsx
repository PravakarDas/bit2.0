"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
    Bell, 
    CheckCircle, 
    AlertTriangle, 
    Info, 
    X,
    Clock,
    User,
    FileText
} from "lucide-react";

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    status: "READ" | "UNREAD";
    createdAt: Date | string;
    metadata?: any;
}

interface NotificationListProps {
    notifications: Notification[];
    markAsReadAction: (notificationId: string) => Promise<any>;
    markAllAsReadAction: () => Promise<any>;
}

export function NotificationList({ 
    notifications, 
    markAsReadAction, 
    markAllAsReadAction 
}: NotificationListProps) {
    const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
    const [markingReadIds, setMarkingReadIds] = useState<Set<string>>(new Set());

    const unreadCount = notifications.filter(n => n.status === "UNREAD").length;

    const handleMarkAsRead = async (notificationId: string) => {
        setMarkingReadIds(prev => new Set([...prev, notificationId]));
        try {
            await markAsReadAction(notificationId);
        } catch (error) {
            console.error("Failed to mark notification as read:", error);
        } finally {
            setMarkingReadIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(notificationId);
                return newSet;
            });
        }
    };

    const handleMarkAllAsRead = async () => {
        setIsMarkingAllRead(true);
        try {
            await markAllAsReadAction();
        } catch (error) {
            console.error("Failed to mark all notifications as read:", error);
        } finally {
            setIsMarkingAllRead(false);
        }
    };

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'TIMELINE_GENERATION_FAILED':
            case 'SYSTEM_ALERT':
                return <AlertTriangle className="h-4 w-4 text-red-600" />;
            case 'TIMELINE_BACKFILL_COMPLETED':
            case 'PAYROLL_NOTIFICATION':
                return <CheckCircle className="h-4 w-4 text-green-600" />;
            case 'PROFILE_UPDATE_REQUEST':
            case 'EMPLOYEE_REGISTRATION_PENDING':
                return <User className="h-4 w-4 text-blue-600" />;
            case 'LEAVE_APPLICATION_PENDING':
            case 'LOAN_APPLICATION_PENDING':
            case 'WALLET_REQUEST_PENDING':
                return <FileText className="h-4 w-4 text-orange-600" />;
            case 'INCREMENT_REMINDER':
            case 'DEADLINE_REMINDER':
                return <Clock className="h-4 w-4 text-purple-600" />;
            default:
                return <Info className="h-4 w-4 text-gray-600" />;
        }
    };

    const getNotificationTypeBadge = (type: string) => {
        const typeMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
            'TIMELINE_GENERATION_FAILED': { label: 'Timeline Error', variant: 'destructive' },
            'TIMELINE_BACKFILL_COMPLETED': { label: 'Timeline Complete', variant: 'default' },
            'PROFILE_UPDATE_REQUEST': { label: 'Profile Request', variant: 'secondary' },
            'LEAVE_APPLICATION_PENDING': { label: 'Leave Pending', variant: 'outline' },
            'INCREMENT_REMINDER': { label: 'Reminder', variant: 'secondary' },
            'WALLET_REQUEST_PENDING': { label: 'Wallet Request', variant: 'outline' },
            'LOAN_APPLICATION_PENDING': { label: 'Loan Request', variant: 'outline' },
            'EMPLOYEE_REGISTRATION_PENDING': { label: 'New Employee', variant: 'secondary' },
            'PAYROLL_NOTIFICATION': { label: 'Payroll', variant: 'default' },
            'SYSTEM_ALERT': { label: 'System Alert', variant: 'destructive' },
            'DEADLINE_REMINDER': { label: 'Deadline', variant: 'outline' },
        };

        const config = typeMap[type] || { label: type, variant: 'outline' as const };
        return <Badge variant={config.variant}>{config.label}</Badge>;
    };

    const formatDate = (dateInput: Date | string) => {
        const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
        const now = new Date();
        const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

        if (diffInHours < 1) {
            return 'Just now';
        } else if (diffInHours < 24) {
            return `${diffInHours}h ago`;
        } else {
            return date.toLocaleDateString();
        }
    };

    return (
        <div className="space-y-4">
            {/* Header with stats and actions */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Bell className="h-5 w-5" />
                            <div>
                                <CardTitle>Notifications</CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    {unreadCount} unread of {notifications.length} total
                                </p>
                            </div>
                        </div>
                        {unreadCount > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleMarkAllAsRead}
                                disabled={isMarkingAllRead}
                            >
                                {isMarkingAllRead ? "Marking..." : "Mark All Read"}
                            </Button>
                        )}
                    </div>
                </CardHeader>
            </Card>

            {/* Notifications List */}
            <Card>
                <CardContent className="p-0">
                    <ScrollArea className="h-[600px]">
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold">No notifications</h3>
                                <p className="text-muted-foreground">
                                    You&apos;re all caught up! No new notifications at this time.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y">
                                {notifications.map((notification, index) => (
                                    <div
                                        key={notification.id}
                                        className={`p-4 transition-colors hover:bg-muted/50 ${
                                            notification.status === "UNREAD" ? "bg-blue-50/50 border-l-4 border-l-blue-500" : ""
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    {getNotificationIcon(notification.type)}
                                                    <h4 className="font-medium text-sm">{notification.title}</h4>
                                                    {getNotificationTypeBadge(notification.type)}
                                                    {notification.status === "UNREAD" && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            New
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground">
                                                    {notification.message}
                                                </p>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-muted-foreground">
                                                        {formatDate(notification.createdAt)}
                                                    </span>
                                                    {notification.status === "UNREAD" && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleMarkAsRead(notification.id)}
                                                            disabled={markingReadIds.has(notification.id)}
                                                            className="text-xs"
                                                        >
                                                            {markingReadIds.has(notification.id) ? (
                                                                "Marking..."
                                                            ) : (
                                                                <>
                                                                    <CheckCircle className="h-3 w-3 mr-1" />
                                                                    Mark as Read
                                                                </>
                                                            )}
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}