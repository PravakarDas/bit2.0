import type { CreateDocumentInput } from "../dto";
import { ValidationError, type ValidationIssue } from "../errors";
import { NOTIFICATION_ENGINE_LIMITS } from "../constants";

/** Structural validation only — does not know how to generate a PDF or upload to Drive; that is DocumentError's future domain. */
export class DocumentValidator {
  static validate(input: CreateDocumentInput): void {
    const issues: ValidationIssue[] = [];

    if (!input.type?.trim()) {
      issues.push({ field: "type", message: "must not be empty" });
    } else if (input.type.length > NOTIFICATION_ENGINE_LIMITS.maxDocumentTypeLength) {
      issues.push({
        field: "type",
        message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxDocumentTypeLength} characters`,
      });
    }

    if (!input.sourceEntityId?.trim()) {
      issues.push({ field: "sourceEntityId", message: "must not be empty" });
    } else if (input.sourceEntityId.length > NOTIFICATION_ENGINE_LIMITS.maxSourceEntityIdLength) {
      issues.push({
        field: "sourceEntityId",
        message: `must be at most ${NOTIFICATION_ENGINE_LIMITS.maxSourceEntityIdLength} characters`,
      });
    }

    if (issues.length > 0) {
      throw new ValidationError("Invalid Document input", issues);
    }
  }
}
