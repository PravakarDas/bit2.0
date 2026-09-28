import type { CreateNotificationDeliveryAttemptInput } from "../dto";
import { ValidationError, type ValidationIssue } from "../errors";

const VALID_OUTCOMES = new Set(["SUCCESS", "FAILURE"]);

export class NotificationDeliveryAttemptValidator {
  static validate(input: CreateNotificationDeliveryAttemptInput): void {
    const issues: ValidationIssue[] = [];

    if (!input.jobId?.trim()) {
      issues.push({ field: "jobId", message: "must not be empty" });
    }

    if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) {
      issues.push({ field: "attemptNumber", message: "must be a positive integer" });
    }

    if (!input.outcome || !VALID_OUTCOMES.has(input.outcome)) {
      issues.push({ field: "outcome", message: "must be SUCCESS or FAILURE" });
    }

    if (issues.length > 0) {
      throw new ValidationError("Invalid NotificationDeliveryAttempt input", issues);
    }
  }
}
