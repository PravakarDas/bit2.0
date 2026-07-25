import { TemplateParser } from "./template-parser";
import { TemplateVariableResolver } from "./template-variable-resolver";
import type {
  RenderContext,
  TemplateSource,
  TemplateValidationIssue,
  TemplateValidationResult,
} from "./types";

export interface TemplateValidationOptions {
  /** If given, "unknown variable" is checked: any placeholder whose root segment isn't in this list is flagged. Omit to skip this check entirely — there is no global hardcoded namespace list (variable resolution is extensible, see TemplateVariableResolver). */
  knownNamespaces?: string[];
  /** If given, "missing variable" is checked: each found placeholder is resolved against this sample context and flagged if it resolves to nothing. */
  sampleContext?: RenderContext;
  /** If given, "unused variable" is checked: any path in this list that is never referenced by any placeholder is flagged. */
  expectedVariables?: string[];
  variableResolver?: TemplateVariableResolver;
}

const PARTS: Array<{ key: keyof TemplateSource; label: "subject" | "bodyHtml" | "bodyText" }> = [
  { key: "subjectTemplate", label: "subject" },
  { key: "bodyTemplateHtml", label: "bodyHtml" },
  { key: "bodyTemplateText", label: "bodyText" },
];

/**
 * Item 3 — content validation covering every check this phase's "Validation"
 * section lists: missing variables, unknown variables, unused variables,
 * malformed placeholders, duplicate placeholders, invalid syntax. Distinct
 * from Phase 2's `NotificationTemplateValidator` (which only checks the DTO's
 * own fields — key/channel/version — never template *content*); this class
 * is the "TemplateError's future domain" that file's own doc comment
 * pointed to. Pure — no I/O, no repository dependency.
 *
 * Only MALFORMED_PLACEHOLDER is always `ERROR` severity (blocking).
 * DUPLICATE_PLACEHOLDER is `INFO` (referencing the same variable twice in
 * one template is completely normal, e.g. "Hi {{name}}... bye {{name}}!").
 * UNKNOWN_VARIABLE and MISSING_VARIABLE are `WARNING` — only checked at all
 * if the caller opts in by supplying `knownNamespaces`/`sampleContext`.
 * UNUSED_VARIABLE is `WARNING`, only checked if `expectedVariables` is given.
 */
export class TemplateValidator {
  validate(source: TemplateSource, options: TemplateValidationOptions = {}): TemplateValidationResult {
    const issues: TemplateValidationIssue[] = [];
    const resolver = options.variableResolver ?? new TemplateVariableResolver();
    const allPaths = new Set<string>();

    for (const { key, label } of PARTS) {
      const text = source[key];
      if (text === null || text === undefined || text.length === 0) {
        continue;
      }

      const { placeholders, issues: parseIssues } = TemplateParser.scan(text);

      for (const parseIssue of parseIssues) {
        issues.push({
          type: "MALFORMED_PLACEHOLDER",
          severity: "ERROR",
          message: parseIssue.message,
          part: label,
        });
      }

      const duplicates = TemplateParser.findDuplicates(placeholders);
      for (const [path, occurrences] of duplicates) {
        issues.push({
          type: "DUPLICATE_PLACEHOLDER",
          severity: "INFO",
          message: `Variable "${path}" is referenced ${occurrences.length} times in ${label}.`,
          part: label,
          path,
        });
      }

      for (const placeholder of placeholders) {
        allPaths.add(placeholder.path);

        if (options.knownNamespaces) {
          const rootNamespace = placeholder.path.split(".")[0];
          if (!options.knownNamespaces.includes(rootNamespace)) {
            issues.push({
              type: "UNKNOWN_VARIABLE",
              severity: "WARNING",
              message: `"${placeholder.path}" in ${label} does not belong to any known namespace (${options.knownNamespaces.join(", ")}).`,
              part: label,
              path: placeholder.path,
            });
          }
        }

        if (options.sampleContext) {
          const resolved = resolver.resolve(placeholder.path, options.sampleContext);
          if (!resolved.found) {
            issues.push({
              type: "MISSING_VARIABLE",
              severity: "WARNING",
              message: `"${placeholder.path}" in ${label} did not resolve against the supplied sample context.`,
              part: label,
              path: placeholder.path,
            });
          }
        }
      }
    }

    if (options.expectedVariables) {
      for (const expected of options.expectedVariables) {
        if (!allPaths.has(expected)) {
          issues.push({
            type: "UNUSED_VARIABLE",
            severity: "WARNING",
            message: `Expected variable "${expected}" is never referenced by this template.`,
            path: expected,
          });
        }
      }
    }

    return {
      isValid: !issues.some((issue) => issue.severity === "ERROR"),
      issues,
    };
  }
}
