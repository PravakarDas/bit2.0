"use server";

import { prisma } from "@/lib/prisma";
import { createAdminNotification } from "./notification.actions";

export async function logManagerOrganizationAction(params: {
  actorId: string;
  actorName: string;
  action: "CREATED" | "UPDATED" | "DELETED" | "ACTIVATED" | "DEACTIVATED";
  entityType: string;
  entityId: string;
  entityName: string;
  details?: string;
}) {
  try {
    const detailsSuffix = params.details ? `, details: ${params.details}` : "";

    await prisma.auditLog.create({
      data: {
        userId: params.actorId,
        oldEmi: null,
        newEmi: null,
        changeReason: `Manager organization ${params.entityType} ${params.action.toLowerCase()}: ${params.entityName} (${params.entityId})${detailsSuffix}`,
      },
    });

    await createAdminNotification({
      type: "SYSTEM_ALERT",
      title: `Manager ${params.entityType} ${params.action}`,
      message: `${params.actorName} ${params.action.toLowerCase()} ${params.entityType} \"${params.entityName}\"`,
      metadata: {
        actorId: params.actorId,
        actorName: params.actorName,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        entityName: params.entityName,
        details: params.details ?? null,
        source: "organization_settings",
      },
    });
  } catch (error) {
    console.error("Failed to log manager organization action:", error);
  }
}