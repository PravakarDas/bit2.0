"use client";

import { useEffect, useState } from "react";
import { getUnreadCount } from "@/actions/notification.actions";

interface NotificationBadgeProps {
  children: React.ReactNode;
}

export function NotificationWithBadge({ children }: NotificationBadgeProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnreadCount = async () => {
      const result = await getUnreadCount();
      if (result.success) {
        setUnreadCount(result.count);
      }
    };

    fetchUnreadCount();
    
    // Refresh count every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative inline-block">
      {children}
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center min-w-[1rem] z-10">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </div>
  );
}