import { ValidationError } from "../errors";
import { NOTIFICATION_ENGINE_LIMITS } from "../constants";

/**
 * Wraps `NotificationJob.recipientAddress` — deliberately a free-form string
 * (an email address, phone number, or webhook URL depending on channel, per
 * Design §29), so this value object only guarantees non-empty/bounded-length.
 * It intentionally does NOT validate email/phone/URL format — format
 * validation is channel-specific business logic reserved for the future
 * per-channel adapters (Design §22), not this infrastructure layer.
 */
export class ChannelAddress {
  private constructor(private readonly raw: string) {}

  static from(value: string): ChannelAddress {
    const trimmed = value?.trim() ?? "";

    if (trimmed.length < NOTIFICATION_ENGINE_LIMITS.minStringLength) {
      throw new ValidationError("recipientAddress must not be empty", [
        { field: "recipientAddress", message: "must not be empty" },
      ]);
    }

    if (trimmed.length > NOTIFICATION_ENGINE_LIMITS.maxRecipientAddressLength) {
      throw new ValidationError("recipientAddress exceeds maximum length", [
        {
          field: "recipientAddress",
          message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxRecipientAddressLength} characters`,
        },
      ]);
    }

    return new ChannelAddress(trimmed);
  }

  get value(): string {
    return this.raw;
  }

  toString(): string {
    return this.raw;
  }
}
