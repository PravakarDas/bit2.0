"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { getDbUser } from "./user.actions";
import { createAdminNotification } from "./notification.actions";
import { getOrCreateSystemControlSettings, normalizeCronPart } from "@/lib/system-control";

type UpdatePayload = {
  appTimezone?: string;
  timelineCronEnabled?: boolean;
  timelineCronHour?: number;
  timelineCronMinute?: number;
  zktecoCronEnabled?: boolean;
  zktecoCronHour?: number;
  zktecoCronMinute?: number;
  leaveAutomationCronEnabled?: boolean;
  leaveAutomationCronHour?: number;
  leaveAutomationCronMinute?: number;
  zktecoBaseUrl?: string;
  zktecoUsername?: string;
  zktecoPassword?: string;
};

const SENSITIVE_HISTORY_FIELDS = new Set(["zktecoUsername", "zktecoPassword"]);

function canManageSystemControl(user: NonNullable<Awaited<ReturnType<typeof getDbUser>>>) {
  return user.role === "SUPERADMIN" || user.role === "HR" || (user.role === "EMPLOYEE" && user.isManager);
}

function canEditSensitiveZkteco(user: NonNullable<Awaited<ReturnType<typeof getDbUser>>>) {
  return user.role === "SUPERADMIN" || user.role === "HR";
}

function sanitizePayload(user: NonNullable<Awaited<ReturnType<typeof getDbUser>>>, payload: UpdatePayload) {
  const sanitized: Record<string, unknown> = {};
  const changedFields: string[] = [];

  const set = (field: keyof UpdatePayload, value: unknown) => {
    (sanitized as Record<string, unknown>)[field] = value;
    changedFields.push(field);
  };

  if (typeof payload.appTimezone === "string") set("appTimezone", payload.appTimezone.trim() || "Asia/Dhaka");
  if (typeof payload.timelineCronEnabled === "boolean") set("timelineCronEnabled", payload.timelineCronEnabled);
  if (typeof payload.timelineCronHour === "number") set("timelineCronHour", normalizeCronPart(payload.timelineCronHour, 0, 23, 1));
  if (typeof payload.timelineCronMinute === "number") set("timelineCronMinute", normalizeCronPart(payload.timelineCronMinute, 0, 59, 24));

  if (typeof payload.zktecoCronEnabled === "boolean") set("zktecoCronEnabled", payload.zktecoCronEnabled);
  if (typeof payload.zktecoCronHour === "number") set("zktecoCronHour", normalizeCronPart(payload.zktecoCronHour, 0, 23, 11));
  if (typeof payload.zktecoCronMinute === "number") set("zktecoCronMinute", normalizeCronPart(payload.zktecoCronMinute, 0, 59, 0));

  if (typeof payload.leaveAutomationCronEnabled === "boolean") set("leaveAutomationCronEnabled", payload.leaveAutomationCronEnabled);
  if (typeof payload.leaveAutomationCronHour === "number") set("leaveAutomationCronHour", normalizeCronPart(payload.leaveAutomationCronHour, 0, 23, 23));
  if (typeof payload.leaveAutomationCronMinute === "number") set("leaveAutomationCronMinute", normalizeCronPart(payload.leaveAutomationCronMinute, 0, 59, 43));

  if (typeof payload.zktecoBaseUrl === "string") set("zktecoBaseUrl", payload.zktecoBaseUrl.trim());

  if (canEditSensitiveZkteco(user)) {
    if (typeof payload.zktecoUsername === "string") set("zktecoUsername", payload.zktecoUsername.trim());
    if (typeof payload.zktecoPassword === "string") set("zktecoPassword", payload.zktecoPassword);
  }

  return { sanitized, changedFields };
}

export async function getSystemControlConfig() {
  const user = await getDbUser();
  if (!user || !canManageSystemControl(user)) {
    throw new Error("Unauthorized");
  }

  const settings = await getOrCreateSystemControlSettings();
  const canEditSensitive = canEditSensitiveZkteco(user);

  return {
    settings: {
      ...settings,
      zktecoPassword: canEditSensitive ? settings.zktecoPassword : "",
      zktecoUsername: canEditSensitive ? settings.zktecoUsername : "",
    },
    permissions: {
      canEditSensitive,
      isManager: user.role === "EMPLOYEE" && user.isManager,
    },
  };
}

export async function updateSystemControlConfig(payload: UpdatePayload) {
  const user = await getDbUser();
  if (!user || !canManageSystemControl(user)) {
    throw new Error("Unauthorized");
  }

  const current = await getOrCreateSystemControlSettings();
  const { sanitized, changedFields } = sanitizePayload(user, payload);

  if (changedFields.length === 0) {
    return { success: true, message: "No changes submitted" };
  }

  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const key of changedFields) {
    previousValues[key] = (current as unknown as Record<string, unknown>)[key];
    newValues[key] = (sanitized as unknown as Record<string, unknown>)[key];
  }

  await prisma.$transaction(async (tx) => {
    await (tx as any).systemControlSettings.update({
      where: { id: "global" },
      data: {
        ...sanitized,
        updatedById: user.id,
        updatedByEmail: user.email,
        updatedByRole: user.role,
      },
    });

    await (tx as any).systemControlChangeLog.create({
      data: {
        actorId: user.id,
        actorName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
        actorEmail: user.email,
        actorRole: user.role,
        actorIsManager: user.role === "EMPLOYEE" && user.isManager,
        changedFields,
        previousValues: previousValues as Prisma.InputJsonValue,
        newValues: newValues as Prisma.InputJsonValue,
      },
    });
  });

  if (user.role === "EMPLOYEE" && user.isManager) {
    await createAdminNotification({
      type: "SYSTEM_ALERT",
      title: "System Control Updated By Manager",
      message: `Manager ${user.firstName || ""} ${user.lastName || ""} updated system control settings (${changedFields.join(", ")}).`,
      metadata: {
        managerId: user.id,
        changedFields,
      },
    });
  }

  revalidatePath("/admin/system-control");
  revalidatePath("/manager/system-control");

  return { success: true, message: "System control updated successfully" };
}

export async function getSystemControlChangeLog(limit = 50) {
  const user = await getDbUser();
  if (!user || !canManageSystemControl(user)) {
    throw new Error("Unauthorized");
  }

  const includeSensitive = user.role === "SUPERADMIN" || user.role === "HR";
  const logs = await (prisma as any).systemControlChangeLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  if (includeSensitive) {
    return logs;
  }

  return logs.filter((log: { changedFields: string[] }) => !log.changedFields?.some((field) => SENSITIVE_HISTORY_FIELDS.has(field)));
}

export async function checkZktecoServer(baseUrl: string) {
  const user = await getDbUser();
  if (!user || !canManageSystemControl(user)) {
    throw new Error("Unauthorized");
  }

  const trimmed = (baseUrl || "").trim();
  if (!trimmed) {
    return { ok: false, message: "Base URL is empty" };
  }

  const normalized = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  const url = `${normalized}/api-token-auth/`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);

  try {
    const response = await fetch(url, {
      method: "OPTIONS",
      cache: "no-store",
      signal: controller.signal,
    });

    if (response.status < 500) {
      return { ok: true, message: "ZKTeco server looks reachable" };
    }

    return { ok: false, message: `Server responded with status ${response.status}` };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, message: "ZKTeco server check timed out (3s)" };
    }
    return { ok: false, message: "ZKTeco server is unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}
