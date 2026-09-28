import { TemplateParser } from "./template-parser";
import { TemplateParseError } from "./errors";
import type { CompiledSegment, CompiledTemplate, CompiledTemplatePart, TemplateSource } from "./types";

/**
 * Item 4 — turns raw `TemplateSource` text into a `CompiledTemplate` (a
 * token list per part), throwing `TemplateParseError` if any part contains
 * malformed placeholder syntax. Compiling is deliberately separate from
 * validating (`TemplateValidator`, a different class): compiling is a hard
 * pass/fail gate a render can't proceed without: validating additionally
 * reports non-blocking findings (duplicates, unused variables) a caller may
 * want to see without necessarily failing.
 */
export class TemplateCompiler {
  compile(source: TemplateSource, templateKey?: string): CompiledTemplate {
    return {
      subject: this.compilePart(source.subjectTemplate, templateKey),
      bodyHtml: this.compilePart(source.bodyTemplateHtml, templateKey),
      bodyText: this.compilePart(source.bodyTemplateText, templateKey),
    };
  }

  private compilePart(text: string | null | undefined, templateKey?: string): CompiledTemplatePart | undefined {
    if (text === null || text === undefined || text.length === 0) {
      return undefined;
    }

    const { placeholders, issues } = TemplateParser.scan(text);
    if (issues.length > 0) {
      throw new TemplateParseError(templateKey, issues);
    }

    const segments: CompiledSegment[] = [];
    const variablePaths: string[] = [];
    const seenPaths = new Set<string>();
    let cursor = 0;

    for (const placeholder of placeholders) {
      if (placeholder.position > cursor) {
        segments.push({ type: "literal", value: text.slice(cursor, placeholder.position) });
      }
      segments.push({ type: "variable", path: placeholder.path });
      if (!seenPaths.has(placeholder.path)) {
        seenPaths.add(placeholder.path);
        variablePaths.push(placeholder.path);
      }
      cursor = placeholder.position + placeholder.raw.length;
    }
    if (cursor < text.length) {
      segments.push({ type: "literal", value: text.slice(cursor) });
    }

    return { segments, variablePaths };
  }
}
