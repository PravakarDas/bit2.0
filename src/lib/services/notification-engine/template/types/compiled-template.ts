/** One piece of a compiled template: either verbatim text, or a variable reference to substitute at render time. */
export type CompiledSegment = { type: "literal"; value: string } | { type: "variable"; path: string };

export interface CompiledTemplatePart {
  segments: CompiledSegment[];
  /** Every distinct variable path referenced in this part, in first-seen order — avoids re-deriving it from `segments` on every render. */
  variablePaths: string[];
}

/**
 * The output of `TemplateCompiler.compile` and what `TemplateCache` actually
 * caches — a template parsed into a token list ONCE, so `TemplateRenderer`
 * never re-scans the raw string on every render call. Absent parts (e.g. a
 * channel with no HTML body) are simply `undefined`, matching
 * `TemplateSource`'s own optionality.
 */
export interface CompiledTemplate {
  subject?: CompiledTemplatePart;
  bodyHtml?: CompiledTemplatePart;
  bodyText?: CompiledTemplatePart;
}
