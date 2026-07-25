export type TemplateValidationIssueType =
  | "MALFORMED_PLACEHOLDER"
  | "DUPLICATE_PLACEHOLDER"
  | "UNKNOWN_VARIABLE"
  | "MISSING_VARIABLE"
  | "UNUSED_VARIABLE";

export type TemplateValidationSeverity = "ERROR" | "WARNING" | "INFO";

export interface TemplateValidationIssue {
  type: TemplateValidationIssueType;
  severity: TemplateValidationSeverity;
  message: string;
  /** Which rendered part this issue was found in — absent for issues that aren't part-specific (e.g. an unused variable never referenced anywhere). */
  part?: "subject" | "bodyHtml" | "bodyText";
  path?: string;
}

export interface TemplateValidationResult {
  /** `false` if any issue has severity `"ERROR"` — WARNING/INFO issues do not block. */
  isValid: boolean;
  issues: TemplateValidationIssue[];
}
