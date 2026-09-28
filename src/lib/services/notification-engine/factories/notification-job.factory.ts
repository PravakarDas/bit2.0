import type { NotificationChannel } from "../types/enums";
import type { CreateNotificationJobInput } from "../dto";
import { DedupeKey, IdempotencyKey, ChannelAddress } from "../value-objects";
import { NOTIFICATION_ENGINE_DEFAULTS } from "../constants";
import { SystemClock, type IClock } from "../utils";

export interface BuildNotificationJobParams {
  eventId: string;
  dedupeKey: string;
  channel: NotificationChannel;
  recipientAddress: string;
  recipientUserId?: string | null;
  documentId?: string | null;
  maxAttempts?: number;
  /** Injectable for testability (Dependency Inversion) — defaults to the real system clock. */
  clock?: IClock;
}

/**
 * Builds a well-formed `CreateNotificationJobInput` (constructing the
 * idempotency key per Design §17, applying the same retry defaults declared
 * in `NotificationSettings`). Does NOT persist anything and does NOT decide
 * *which* recipients/channels a given event should fan out to — that
 * resolution is business logic reserved for a later phase (Design §6).
 * Callers already know the one recipient/channel pair they want a job for.
 */
export class NotificationJobFactory {
  static build(params: BuildNotificationJobParams): CreateNotificationJobInput {
    const dedupeKey = DedupeKey.from(params.dedupeKey);
    const recipientAddress = ChannelAddress.from(params.recipientAddress);
    const idempotencyKey = IdempotencyKey.build(dedupeKey, params.channel, params.recipientUserId ?? null);
    const clock = params.clock ?? new SystemClock();

    return {
      eventId: params.eventId,
      channel: params.channel,
      recipientAddress: recipientAddress.value,
      recipientUserId: params.recipientUserId ?? undefined,
      idempotencyKey: idempotencyKey.value,
      maxAttempts: params.maxAttempts ?? NOTIFICATION_ENGINE_DEFAULTS.retry.maxAttempts,
      nextAttemptAt: clock.now(),
      documentId: params.documentId ?? undefined,
      status: "QUEUED",
    };
  }
}
