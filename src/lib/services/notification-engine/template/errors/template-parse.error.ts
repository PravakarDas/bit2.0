import { TemplateError } from "../../errors";
import type { ParseIssue } from "../types/parse-issue";

/** Thrown by `TemplateCompiler.compile` when the source contains malformed placeholder syntax. Extends the frozen Phase 2 `TemplateError` additively. */
export class TemplateParseError extends TemplateError {
  constructor(
    templateKey: string | undefined,
    readonly issues: ParseIssue[],
    options?: { cause?: unknown }
  ) {
    super(
      `Template ${templateKey ? `"${templateKey}" ` : ""}has ${issues.length} placeholder syntax error(s): ${issues
        .map((i) => i.message)
        .join("; ")}`,
      templateKey,
      options
    );
  }
}
