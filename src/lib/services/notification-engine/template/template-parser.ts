import type { FoundPlaceholder, ParseIssue, ScanResult } from "./types";

/** `employee.name`, `today` — one or more segments, each starting with a letter/underscore, dot-separated. No leading/trailing/double dots, no digit-leading segments, no characters outside `[A-Za-z0-9_]`. */
const VALID_PATH_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/**
 * Item 9 — scans raw template text for `{{ path }}` placeholders using an
 * explicit position-based scan (not a single greedy regex), so triple
 * braces, unclosed placeholders, and stray closing braces are all handled
 * unambiguously (see the class doc below for exactly how each malformed
 * case is detected). Pure, stateless, no I/O.
 */
export class TemplateParser {
  static scan(text: string): ScanResult {
    const placeholders: FoundPlaceholder[] = [];
    const issues: ParseIssue[] = [];
    let cursor = 0;

    while (cursor < text.length) {
      const openIdx = text.indexOf("{{", cursor);
      if (openIdx === -1) {
        break;
      }

      const closeIdx = text.indexOf("}}", openIdx + 2);
      if (closeIdx === -1) {
        issues.push({
          type: "UNCLOSED_PLACEHOLDER",
          position: openIdx,
          raw: text.slice(openIdx),
          message: `Unclosed placeholder starting at position ${openIdx}: "${text.slice(openIdx, Math.min(openIdx + 30, text.length))}${text.length - openIdx > 30 ? "..." : ""}"`,
        });
        break; // nothing further can be scanned meaningfully once unclosed
      }

      const raw = text.slice(openIdx, closeIdx + 2);
      const inner = text.slice(openIdx + 2, closeIdx);
      const trimmed = inner.trim();

      if (trimmed.length === 0) {
        issues.push({
          type: "EMPTY_PLACEHOLDER",
          position: openIdx,
          raw,
          message: `Empty placeholder at position ${openIdx}: "${raw}"`,
        });
      } else if (!VALID_PATH_PATTERN.test(trimmed)) {
        // Also covers triple-brace forms like "{{{foo}}" or "{{foo}}}" — the
        // extra brace becomes part of `trimmed` (or trailing literal text,
        // for a trailing "}"), and an extra "{"/"}" character always fails
        // VALID_PATH_PATTERN, so no separate triple-brace special-case is needed.
        issues.push({
          type: "INVALID_SYNTAX",
          position: openIdx,
          raw,
          message: `Invalid placeholder syntax at position ${openIdx}: "${raw}" (path must look like "employee.name")`,
        });
      } else {
        placeholders.push({ path: trimmed, position: openIdx, raw });
      }

      cursor = closeIdx + 2;
    }

    return { placeholders, issues };
  }

  /** Groups `scan()`'s found placeholders by path, returning only paths that appear more than once. */
  static findDuplicates(placeholders: readonly FoundPlaceholder[]): Map<string, FoundPlaceholder[]> {
    const byPath = new Map<string, FoundPlaceholder[]>();
    for (const placeholder of placeholders) {
      const existing = byPath.get(placeholder.path);
      if (existing) {
        existing.push(placeholder);
      } else {
        byPath.set(placeholder.path, [placeholder]);
      }
    }
    for (const [path, occurrences] of byPath) {
      if (occurrences.length < 2) {
        byPath.delete(path);
      }
    }
    return byPath;
  }
}
