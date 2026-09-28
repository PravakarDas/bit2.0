import { TemplateError } from "../../errors";
import type { TemplateValidationIssue } from "../types/template-validation-issue";

/** Thrown by `TemplateEngine.register` when content validation finds a blocking (`ERROR` severity) issue. Extends the frozen Phase 2 `TemplateError` additively. */
export class TemplateValidationFailedError extends TemplateError {
  constructor(
    templateKey: string,
    readonly issues: TemplateValidationIssue[],
    options?: { cause?: unknown }
  ) {
    const blocking = issues.filter((i) => i.severity === "ERROR");
    super(
      `Template "${templateKey}" failed validation with ${blocking.length} blocking issue(s): ${blocking
        .map((i) => i.message)
        .join("; ")}`,
      templateKey,
      options
    );
  }
}
