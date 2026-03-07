import { redirect } from "next/navigation";
import { getDbUser } from "@/actions/user.actions";
import { getAllNotifications, markAllNotificationsAsRead, markNotificationAsRead } from "@/actions/notification.actions";
import { NotificationList } from "@/components/admin/NotificationList";

export default async function ManagerNotificationsPage() {
    const user = await getDbUser();
    
    if (!user) {
        redirect("/sign-in");
    }
    
    if (!["SUPERADMIN", "MANAGER"].includes(user.role)) {
        redirect("/unauthorized");
    }

    const notificationsResponse = await getAllNotifications(1, 50);
    const notifications = notificationsResponse.success ? notificationsResponse.notifications : [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
                    <p className="text-muted-foreground">
                        Stay updated with important system alerts and updates
                    </p>
                </div>
            </div>

            <NotificationList 
                notifications={notifications}
                markAsReadAction={markNotificationAsRead}
                markAllAsReadAction={markAllNotificationsAsRead}
            />
        </div>
    );
}