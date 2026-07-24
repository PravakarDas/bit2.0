import type { CreateNotificationJobInput } from "../dto";
import { ValidationError, type ValidationIssue } from "../errors";
import { NOTIFICATION_ENGINE_LIMITS } from "../constants";

const VALID_CHANNELS = new Set([
  "EMAIL",
  "SMS",
  "WHATSAPP",
  "PUSH",
  "SLACK",
  "TEAMS",
  "IN_APP_ADMIN",
  "IN_APP_EMPLOYEE",
]);

/**
 * Structural validation only. Does not decide whether the recipient is
 * allowed to receive this channel (that's `NotificationPreference`, a
 * business-rule check reserved for a later phase), and does not compute
 * `nextAttemptAt`/`maxAttempts` defaults itself — see NotificationJobFactory
 * for construction, this validator only checks whatever it's handed.
 */
export class NotificationJobValidator {
  static validate(input: CreateNotificationJobInput): void {
    const issues: ValidationIssue[] = [];

    if (!input.eventId?.trim()) {
      issues.push({ field: "eventId", message: "must not be empty" });
    }

    if (!input.channel || !VALID_CHANNELS.has(input.channel)) {
      issues.push({ field: "channel", message: `must be one of: ${Array.from(VALID_CHANNELS).join(", ")}` });
    }

    if (!input.recipientAddress?.trim()) {
      issues.push({ field: "recipientAddress", message: "must not be empty" });
    } else if (input.recipientAddress.length > NOTIFICATION_ENGINE_LIMITS.maxRecipientAddressLength) {
      issues.push({
        field: "recipientAddress",
        message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxRecipientAddressLength} characters`,
      });
    }

    if (!input.idempotencyKey?.trim()) {
      issues.push({ field: "idempotencyKey", message: "must not be empty" });
    } else if (input.idempotencyKey.length > NOTIFICATION_ENGINE_LIMITS.maxIdempotencyKeyLength) {
      issues.push({
        field: "idempotencyKey",
        message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxIdempotencyKeyLength} characters`,
      });
    }

    if (input.maxAttempts !== undefined && (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1)) {
      issues.push({ field: "maxAttempts", message: "must be a positive integer" });
    }

    if (issues.length > 0) {
      throw new ValidationError("Invalid NotificationJob input", issues);
    }
  }
}
