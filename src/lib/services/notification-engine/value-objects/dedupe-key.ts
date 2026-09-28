import { ValidationError } from "../errors";
import { NOTIFICATION_ENGINE_LIMITS } from "../constants";

/**
 * Wraps `NotificationEvent.dedupeKey` (Design §6/§17 — "first layer of duplicate
 * prevention"). A thin immutable wrapper, not a business decision: it only
 * guarantees the value is a non-empty, bounded-length string — it does not
 * decide what a dedupe key *should* look like for any given domain event
 * (that convention belongs to whichever future service raises the event).
 */
export class DedupeKey {
  private constructor(private readonly raw: string) {}

  static from(value: string): DedupeKey {
    const trimmed = value?.trim() ?? "";

    if (trimmed.length < NOTIFICATION_ENGINE_LIMITS.minStringLength) {
      throw new ValidationError("dedupeKey must not be empty", [
        { field: "dedupeKey", message: "must not be empty" },
      ]);
    }

    if (trimmed.length > NOTIFICATION_ENGINE_LIMITS.maxDedupeKeyLength) {
      throw new ValidationError("dedupeKey exceeds maximum length", [
        { field: "dedupeKey", message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxDedupeKeyLength} characters` },
      ]);
    }

    return new DedupeKey(trimmed);
  }

  get value(): string {
    return this.raw;
  }

  equals(other: DedupeKey): boolean {
    return this.raw === other.raw;
  }

  toString(): string {
    return this.raw;
  }
}
