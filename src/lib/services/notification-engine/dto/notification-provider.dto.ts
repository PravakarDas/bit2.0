import type { NotificationProvider } from "@prisma/client";

export type NotificationProviderDTO = NotificationProvider;

export type CreateNotificationProviderInput = Pick<NotificationProvider, "channel" | "name" | "configEncrypted"> &
  Partial<Pick<NotificationProvider, "priority" | "isActive">>;

/** Data-layer field update only — the circuit-breaker/cooldown *decision* logic belongs to a later phase (Design §10). */
export type UpdateNotificationProviderHealthInput = Partial<
  Pick<NotificationProvider, "healthStatus" | "consecutiveFailures" | "lastFailureAt">
>;
