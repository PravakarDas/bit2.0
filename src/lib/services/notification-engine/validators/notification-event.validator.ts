import type { CreateNotificationEventInput } from "../dto";
import { ValidationError, type ValidationIssue } from "../errors";
import { NOTIFICATION_ENGINE_LIMITS } from "../constants";

/**
 * Structural validation only — no business rules. Does not know whether a
 * given `eventType` is a real, recognized domain event, does not check
 * whether `dedupeKey` collides with an existing row (that's the repository's
 * unique-constraint concern, surfaced as a `RepositoryError`, not this
 * validator's job), and does not resolve `sourceDomain` against a known list.
 */
export class NotificationEventValidator {
  static validate(input: CreateNotificationEventInput): void {
    const issues: ValidationIssue[] = [];

    if (!input.eventType?.trim()) {
      issues.push({ field: "eventType", message: "must not be empty" });
    } else if (input.eventType.length > NOTIFICATION_ENGINE_LIMITS.maxEventTypeLength) {
      issues.push({
        field: "eventType",
        message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxEventTypeLength} characters`,
      });
    }

    if (!input.dedupeKey?.trim()) {
      issues.push({ field: "dedupeKey", message: "must not be empty" });
    } else if (input.dedupeKey.length > NOTIFICATION_ENGINE_LIMITS.maxDedupeKeyLength) {
      issues.push({
        field: "dedupeKey",
        message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxDedupeKeyLength} characters`,
      });
    }

    if (!input.sourceDomain?.trim()) {
      issues.push({ field: "sourceDomain", message: "must not be empty" });
    }

    if (issues.length > 0) {
      throw new ValidationError("Invalid NotificationEvent input", issues);
    }
  }
}
