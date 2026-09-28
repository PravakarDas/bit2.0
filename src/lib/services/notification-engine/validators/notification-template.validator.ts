import type { CreateNotificationTemplateInput } from "../dto";
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

/** Structural validation only — does not render or lint template placeholder syntax; that is TemplateError's future domain. */
export class NotificationTemplateValidator {
  static validate(input: CreateNotificationTemplateInput): void {
    const issues: ValidationIssue[] = [];

    if (!input.key?.trim()) {
      issues.push({ field: "key", message: "must not be empty" });
    } else if (input.key.length > NOTIFICATION_ENGINE_LIMITS.maxTemplateKeyLength) {
      issues.push({
        field: "key",
        message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxTemplateKeyLength} characters`,
      });
    }

    if (!input.channel || !VALID_CHANNELS.has(input.channel)) {
      issues.push({ field: "channel", message: `must be one of: ${Array.from(VALID_CHANNELS).join(", ")}` });
    }

    if (input.version !== undefined && (!Number.isInteger(input.version) || input.version < 1)) {
      issues.push({ field: "version", message: "must be a positive integer" });
    }

    if (issues.length > 0) {
      throw new ValidationError("Invalid NotificationTemplate input", issues);
    }
  }
}
