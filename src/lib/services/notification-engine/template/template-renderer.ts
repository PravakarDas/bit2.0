import type { RenderedNotificationContent } from "../factories";
import { TemplateVariableResolver } from "./template-variable-resolver";
import { escapeHtml } from "./html-escape";
import type { CompiledTemplate, CompiledTemplatePart, RenderContext } from "./types";

export type MissingVariableStrategy = "empty" | "keep-placeholder";

export interface RenderOptions {
  /** What to substitute when a variable doesn't resolve — defaults to `"empty"` (never throws; validation is a separate, explicit step via `TemplateValidator`). */
  onMissingVariable?: MissingVariableStrategy;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

/**
 * Item 2 — walks a `CompiledTemplate`'s segments, substituting each
 * `variable` segment via `TemplateVariableResolver` and concatenating with
 * the surrounding `literal` segments. Output type is Phase 2's already-frozen
 * `RenderedNotificationContent` (`{ subject?, bodyHtml?, bodyText? }`) —
 * reused verbatim, not duplicated, since it's exactly the shape a channel
 * adapter's `send()` already expects (see NotificationChannelAdapter).
 *
 * Rendering never throws on a missing variable (that would make `render()`
 * unreliable for already-compiled, already-validated templates) — a
 * genuinely malformed template already failed at `compile()` time.
 */
export class TemplateRenderer {
  constructor(private readonly variableResolver: TemplateVariableResolver = new TemplateVariableResolver()) {}

  render(compiled: CompiledTemplate, context: RenderContext, options: RenderOptions = {}): RenderedNotificationContent {
    return {
      subject: this.renderPart(compiled.subject, context, options, false),
      bodyHtml: this.renderPart(compiled.bodyHtml, context, options, true),
      bodyText: this.renderPart(compiled.bodyText, context, options, false),
    };
  }

  private renderPart(
    part: CompiledTemplatePart | undefined,
    context: RenderContext,
    options: RenderOptions,
    escapeForHtml: boolean
  ): string | undefined {
    if (!part) {
      return undefined;
    }

    const strategy = options.onMissingVariable ?? "empty";
    let output = "";

    for (const segment of part.segments) {
      if (segment.type === "literal") {
        output += segment.value;
        continue;
      }

      const resolved = this.variableResolver.resolve(segment.path, context);
      if (!resolved.found) {
        output += strategy === "keep-placeholder" ? `{{${segment.path}}}` : "";
        continue;
      }

      const stringValue = stringifyValue(resolved.value);
      output += escapeForHtml ? escapeHtml(stringValue) : stringValue;
    }

    return output;
  }
}
