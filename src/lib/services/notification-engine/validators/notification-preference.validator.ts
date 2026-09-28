import type { UpsertNotificationPreferenceInput } from "../dto";
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

/** Structural validation only — does not know whether `notificationType` is a real, recognized event type (same posture as `NotificationEventValidator`). */
export class NotificationPreferenceValidator {
  static validate(input: UpsertNotificationPreferenceInput): void {
    const issues: ValidationIssue[] = [];

    if (!input.userId?.trim()) {
      issues.push({ field: "userId", message: "must not be empty" });
    }

    if (!input.notificationType?.trim()) {
      issues.push({ field: "notificationType", message: "must not be empty" });
    } else if (input.notificationType.length > NOTIFICATION_ENGINE_LIMITS.maxEventTypeLength) {
      issues.push({
        field: "notificationType",
        message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxEventTypeLength} characters`,
      });
    }

    if (!input.channel || !VALID_CHANNELS.has(input.channel)) {
      issues.push({ field: "channel", message: `must be one of: ${Array.from(VALID_CHANNELS).join(", ")}` });
    }

    if (typeof input.isEnabled !== "boolean") {
      issues.push({ field: "isEnabled", message: "must be a boolean" });
    }

    if (issues.length > 0) {
      throw new ValidationError("Invalid NotificationPreference input", issues);
    }
  }
}
