"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Create admin notification
export async function createAdminNotification(data: {
  type: 'TIMELINE_GENERATION_FAILED' | 'TIMELINE_BACKFILL_COMPLETED';
  title: string;
  message: string;
  metadata?: any;
}) {
  try {
    const notification = await prisma.adminNotification.create({
      data: {
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: data.metadata || null
      }
    });
    
    revalidatePath('/admin');
    return { success: true, notification };
  } catch (error) {
    console.error('Error creating admin notification:', error);
    return { success: false, error: 'Failed to create notification' };
  }
}

// Get unread notifications for admin
export async function getUnreadNotifications() {
  try {
    const notifications = await prisma.adminNotification.findMany({
      where: {
        status: 'UNREAD'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    return { success: true, notifications };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return { success: false, error: 'Failed to fetch notifications' };
  }
}

// Mark notification as read
export async function markNotificationAsRead(notificationId: string) {
  try {
    await prisma.adminNotification.update({
      where: { id: notificationId },
      data: { status: 'READ' }
    });
    
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return { success: false, error: 'Failed to mark notification as read' };
  }
}

// Mark all notifications as read
export async function markAllNotificationsAsRead() {
  try {
    await prisma.adminNotification.updateMany({
      where: { status: 'UNREAD' },
      data: { status: 'READ' }
    });
    
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return { success: false, error: 'Failed to mark notifications as read' };
  }
}