export type ParseIssueType = "UNCLOSED_PLACEHOLDER" | "EMPTY_PLACEHOLDER" | "INVALID_SYNTAX";

export interface ParseIssue {
  type: ParseIssueType;
  /** Character offset into the source string where the offending `{{` begins. */
  position: number;
  /** The raw, offending text (e.g. `"{{123abc}}"` or `"{{unclosed"`). */
  raw: string;
  message: string;
}

export interface FoundPlaceholder {
  /** The normalized dotted path, e.g. `"employee.name"`. */
  path: string;
  /** Character offset where this placeholder's `{{` begins. */
  position: number;
  /** The raw matched text, e.g. `"{{ employee.name }}"`. */
  raw: string;
}

export interface ScanResult {
  placeholders: FoundPlaceholder[];
  issues: ParseIssue[];
}
