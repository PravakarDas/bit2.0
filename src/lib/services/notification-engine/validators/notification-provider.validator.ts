import type { CreateNotificationProviderInput } from "../dto";
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

/** Structural validation only — does not verify `configEncrypted` actually decrypts to a usable credential; that is ProviderError's future domain. */
export class NotificationProviderValidator {
  static validate(input: CreateNotificationProviderInput): void {
    const issues: ValidationIssue[] = [];

    if (!input.channel || !VALID_CHANNELS.has(input.channel)) {
      issues.push({ field: "channel", message: `must be one of: ${Array.from(VALID_CHANNELS).join(", ")}` });
    }

    if (!input.name?.trim()) {
      issues.push({ field: "name", message: "must not be empty" });
    } else if (input.name.length > NOTIFICATION_ENGINE_LIMITS.maxProviderNameLength) {
      issues.push({
        field: "name",
        message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxProviderNameLength} characters`,
      });
    }

    if (!input.configEncrypted?.trim()) {
      issues.push({ field: "configEncrypted", message: "must not be empty" });
    }

    if (input.priority !== undefined && !Number.isInteger(input.priority)) {
      issues.push({ field: "priority", message: "must be an integer" });
    }

    if (issues.length > 0) {
      throw new ValidationError("Invalid NotificationProvider input", issues);
    }
  }
}
