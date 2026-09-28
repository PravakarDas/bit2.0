import { prisma } from "@/lib/prisma";
import type { NotificationSettings } from "@prisma/client";

/**
 * Same singleton-row upsert pattern as `src/lib/system-control.ts`'s
 * `getOrCreateSystemControlSettings()` (`SystemControlSettings`/`EmailConfig`
 * precedent) — the `NotificationSettings` model (Phase 1, frozen) has had no
 * repository/reader anywhere in this engine until now. Item 11 ("Configuration
 * through existing NotificationSettings where appropriate") — see
 * production-worker.ts for what this actually feeds into
 * (`workerPollIntervalSeconds` -> `WorkerConfig.pollIntervalMs`,
 * `retry*` -> `QueueEngine`'s `RetrySchedulerOptions`, `emailChannelEnabled`
 * -> whether the production runtime wires a real `DeliveryManagerChannelAdapter`
 * for EMAIL at all).
 */
const NOTIFICATION_SETTINGS_DEFAULTS = {
  workerPollIntervalSeconds: 10,
  workerBatchSize: 20,
  retryBaseDelaySeconds: 30,
  retryMaxDelaySeconds: 3600,
  retryMaxAttempts: 5,
  retryJitterRatio: 0.2,
  completedRetentionDays: 90,
  deadLetterRetentionDays: 180,
  emailChannelEnabled: true,
  smsChannelEnabled: false,
  whatsappChannelEnabled: false,
  pushChannelEnabled: false,
  slackChannelEnabled: false,
  teamsChannelEnabled: false,
};

export async function getOrCreateNotificationSettings(): Promise<NotificationSettings> {
  return prisma.notificationSettings.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      ...NOTIFICATION_SETTINGS_DEFAULTS,
    },
  });
}
