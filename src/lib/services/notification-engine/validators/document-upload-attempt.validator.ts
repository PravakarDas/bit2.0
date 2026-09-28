import type { CreateDocumentUploadAttemptInput } from "../dto";
import { ValidationError, type ValidationIssue } from "../errors";

const VALID_OUTCOMES = new Set(["SUCCESS", "FAILURE"]);

export class DocumentUploadAttemptValidator {
  static validate(input: CreateDocumentUploadAttemptInput): void {
    const issues: ValidationIssue[] = [];

    if (!input.documentId?.trim()) {
      issues.push({ field: "documentId", message: "must not be empty" });
    }

    if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) {
      issues.push({ field: "attemptNumber", message: "must be a positive integer" });
    }

    if (!input.outcome || !VALID_OUTCOMES.has(input.outcome)) {
      issues.push({ field: "outcome", message: "must be SUCCESS or FAILURE" });
    }

    if (issues.length > 0) {
      throw new ValidationError("Invalid DocumentUploadAttempt input", issues);
    }
  }
}
