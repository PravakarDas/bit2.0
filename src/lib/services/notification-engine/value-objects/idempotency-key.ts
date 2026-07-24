import type { NotificationChannel } from "../types/enums";
import { ValidationError } from "../errors";
import { NOTIFICATION_ENGINE_LIMITS } from "../constants";
import { DedupeKey } from "./dedupe-key";

/**
 * Wraps `NotificationJob.idempotencyKey`. Implements exactly the construction
 * rule already fixed by NotificationEngineDesign.md §17:
 *
 *   idempotencyKey = `${dedupeKey}:${channel}:${recipientUserId}`
 *
 * This is a structural convention the design already specifies, not a new
 * business decision — the value object exists so every future call site
 * builds the key the same way instead of re-deriving the format by hand.
 */
export class IdempotencyKey {
  private constructor(private readonly raw: string) {}

  static from(value: string): IdempotencyKey {
    const trimmed = value?.trim() ?? "";

    if (trimmed.length < NOTIFICATION_ENGINE_LIMITS.minStringLength) {
      throw new ValidationError("idempotencyKey must not be empty", [
        { field: "idempotencyKey", message: "must not be empty" },
      ]);
    }

    if (trimmed.length > NOTIFICATION_ENGINE_LIMITS.maxIdempotencyKeyLength) {
      throw new ValidationError("idempotencyKey exceeds maximum length", [
        {
          field: "idempotencyKey",
          message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxIdempotencyKeyLength} characters`,
        },
      ]);
    }

    return new IdempotencyKey(trimmed);
  }

  /** Builds the key per Design §17's exact format. `recipientUserId` may be absent (e.g. a webhook-room target, Design §29). */
  static build(dedupeKey: DedupeKey, channel: NotificationChannel, recipientUserId: string | null): IdempotencyKey {
    return IdempotencyKey.from(`${dedupeKey.value}:${channel}:${recipientUserId ?? "none"}`);
  }

  get value(): string {
    return this.raw;
  }

  equals(other: IdempotencyKey): boolean {
    return this.raw === other.raw;
  }

  toString(): string {
    return this.raw;
  }
}
