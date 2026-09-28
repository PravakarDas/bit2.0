import { NotificationError, NotificationErrorCode } from "./notification-error";

export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Thrown by validators for purely structural problems (missing required
 * field, wrong shape, invalid enum member, non-positive number where a
 * positive one is required). Never thrown for a business rule — validators
 * in this module deliberately do not know about business rules yet.
 */
export class ValidationError extends NotificationError {
  readonly code: NotificationErrorCode = "VALIDATION_ERROR";
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = [], options?: { cause?: unknown }) {
    super(message, options);
    this.issues = issues;
  }
}
