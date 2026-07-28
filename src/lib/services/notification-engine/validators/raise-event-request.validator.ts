import type { RaiseEventRequest } from "../dto";
import { ValidationError, type ValidationIssue } from "../errors";

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
 * Structural validation only, mirroring `NotificationJobValidator`'s channel
 * check. Does not know whether `eventType` is a recognized domain event and
 * does not check `NotificationPreference` opt-outs (no repository exists for
 * that model yet — see NotificationServiceReport.md's "Known Limitations").
 * `NotificationEventValidator`/`NotificationJobValidator` still validate the
 * derived event/job shapes downstream; this only guards the one thing
 * neither of those covers — that `recipients` itself is a non-empty array of
 * well-formed entries.
 */
export class RaiseEventRequestValidator {
  static validate(request: RaiseEventRequest): void {
    const issues: ValidationIssue[] = [];

    if (!request.eventType?.trim()) {
      issues.push({ field: "eventType", message: "must not be empty" });
    }

    if (!Array.isArray(request.recipients) || request.recipients.length === 0) {
      issues.push({ field: "recipients", message: "must be a non-empty array" });
    } else {
      request.recipients.forEach((recipient, index) => {
        if (!recipient.channel || !VALID_CHANNELS.has(recipient.channel)) {
          issues.push({
            field: `recipients[${index}].channel`,
            message: `must be one of: ${Array.from(VALID_CHANNELS).join(", ")}`,
          });
        }
        if (!recipient.recipientAddress?.trim()) {
          issues.push({ field: `recipients[${index}].recipientAddress`, message: "must not be empty" });
        }
      });
    }

    if (issues.length > 0) {
      throw new ValidationError("Invalid raiseEvent request", issues);
    }
  }
}
