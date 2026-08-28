"use server";

import { prisma } from "@/lib/prisma";
import { getDbUser } from "./user.actions";
import { notificationEngineContainer } from "@/lib/services/notification-engine";
import type { NotificationChannel, NotificationPreferenceViewModel } from "@/lib/services/notification-engine";
import { ValidationError } from "@/lib/services/notification-engine";

/**
 * SUPERADMIN/HR-facing Notification Preference management (Phase 14) — view
 * and override any employee's preferences, plus reset to default. Same
 * SUPERADMIN-or-HR "administrator" convention `notification-admin.actions.ts`
 * (Phase 12) already uses for the rest of the admin Notification Center; no
 * new authorization system, no manager access (deliberate — see
 * AdminPreferenceManagementReport.md).
 *
 * Every action re-checks the caller's role itself (never relies on the admin
 * layout gate) and independently verifies the target employee exists before
 * touching their data — the `employeeId` is always treated as untrusted
 * client input. All read/write logic still lives in
 * `NotificationPreferenceService` (Phase 13, unchanged) — these are thin
 * wrappers, same shape as `notification-preferences.actions.ts`'s
 * self-service actions, just targeting an arbitrary employee instead of the
 * caller.
 */

function isAdminOrHr(user: { role: string } | null): boolean {
  return !!user && (user.role === "SUPERADMIN" || user.role === "HR");
}

async function resolveTargetEmployee(employeeId: string) {
  return prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
}

function employeeLabel(employee: { firstName: string | null; lastName: string | null; email: string }): string {
  return `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() || employee.email;
}

function preferenceValueLabel(entry: NotificationPreferenceViewModel | undefined): string {
  if (!entry || !entry.isExplicit) return "default (enabled)";
  return entry.isEnabled ? "explicitly enabled" : "explicitly disabled";
}

/**
 * Writes a change-log row for an admin/HR preference override or reset.
 * Reuses the existing generic `AuditLog` table the same direct way
 * `profile.actions.ts`/`loan.actions.ts`/`medical.actions.ts` already do for
 * non-loan SUPERADMIN/HR actions (`oldEmi`/`newEmi` left null, the actual
 * record living in `changeReason`) — no new audit table, per this phase's
 * explicit instruction. Deliberately does NOT fan out `createAdminNotification`:
 * that helper is reserved for *manager*-privileged actions elevated to
 * admin-equivalent (see CLAUDE.md); this is a routine SUPERADMIN/HR action,
 * not one other admins need to be alerted about. Never logs credentials —
 * this table only ever holds preference true/false state.
 */
async function logPreferenceChange(params: {
  actorId: string;
  actorName: string;
  employeeId: string;
  employeeName: string;
  notificationType: string;
  channel: NotificationChannel;
  previousValue: string;
  newValue: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.actorId,
        oldEmi: null,
        newEmi: null,
        changeReason: `Notification preference override: ${params.actorName} changed ${params.notificationType}/${params.channel} for ${params.employeeName} (${params.employeeId}) from "${params.previousValue}" to "${params.newValue}"`,
      },
    });
  } catch (error) {
    console.error("Failed to write notification preference audit log:", error);
  }
}

export async function getEmployeeNotificationPreferences(
  employeeId: string
): Promise<{ success: true; preferences: NotificationPreferenceViewModel[] } | { success: false; error: string }> {
  try {
    const admin = await getDbUser();
    if (!isAdminOrHr(admin)) {
      return { success: false, error: "Unauthorized" };
    }

    const employee = await resolveTargetEmployee(employeeId);
    if (!employee) {
      return { success: false, error: "Employee not found" };
    }

    const preferences = await notificationEngineContainer.preferenceService.listForUser(employee.id);
    return { success: true, preferences };
  } catch (error) {
    console.error("getEmployeeNotificationPreferences failed:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to load employee notification preferences" };
  }
}

export async function setEmployeeNotificationPreference(
  employeeId: string,
  notificationType: string,
  channel: NotificationChannel,
  isEnabled: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const admin = await getDbUser();
    if (!isAdminOrHr(admin)) {
      return { success: false, error: "Unauthorized" };
    }

    const employee = await resolveTargetEmployee(employeeId);
    if (!employee) {
      return { success: false, error: "Employee not found" };
    }

    const before = await notificationEngineContainer.preferenceService.listForUser(employee.id);
    const previousEntry = before.find((item) => item.notificationType === notificationType && item.channel === channel);

    await notificationEngineContainer.preferenceService.setForUser(employee.id, notificationType, channel, isEnabled);

    await logPreferenceChange({
      actorId: admin!.id,
      actorName: employeeLabel(admin!),
      employeeId: employee.id,
      employeeName: employeeLabel(employee),
      notificationType,
      channel,
      previousValue: preferenceValueLabel(previousEntry),
      newValue: isEnabled ? "explicitly enabled" : "explicitly disabled",
    });

    return { success: true };
  } catch (error) {
    console.error("setEmployeeNotificationPreference failed:", error);
    if (error instanceof ValidationError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to update employee notification preference" };
  }
}

export async function resetEmployeeNotificationPreference(
  employeeId: string,
  notificationType: string,
  channel: NotificationChannel
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const admin = await getDbUser();
    if (!isAdminOrHr(admin)) {
      return { success: false, error: "Unauthorized" };
    }

    const employee = await resolveTargetEmployee(employeeId);
    if (!employee) {
      return { success: false, error: "Employee not found" };
    }

    const before = await notificationEngineContainer.preferenceService.listForUser(employee.id);
    const previousEntry = before.find((item) => item.notificationType === notificationType && item.channel === channel);

    await notificationEngineContainer.preferenceService.resetForUser(employee.id, notificationType, channel);

    await logPreferenceChange({
      actorId: admin!.id,
      actorName: employeeLabel(admin!),
      employeeId: employee.id,
      employeeName: employeeLabel(employee),
      notificationType,
      channel,
      previousValue: preferenceValueLabel(previousEntry),
      newValue: "default (enabled)",
    });

    return { success: true };
  } catch (error) {
    console.error("resetEmployeeNotificationPreference failed:", error);
    if (error instanceof ValidationError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: error instanceof Error ? error.message : "Failed to reset employee notification preference" };
  }
}
