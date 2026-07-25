import type { RenderContext } from "../types";
import type { ResolvedVariable, VariableResolverPlugin } from "./variable-resolver-plugin.interface";

/**
 * The default, always-present fallback: looks up a dotted path (e.g.
 * `"employee.name"`) directly inside the render context object. Registered
 * last in `TemplateVariableResolver` so any more-specific plugin (e.g. the
 * date resolver below) gets first refusal.
 */
export class DotPathResolverPlugin implements VariableResolverPlugin {
  readonly name = "dot-path";

  /** Matches any syntactically valid path — this plugin is the catch-all, so it never itself rejects a path; "found" is decided by whether the lookup actually resolves. */
  canResolve(): boolean {
    return true;
  }

  resolve(path: string, context: RenderContext): ResolvedVariable {
    const segments = path.split(".");
    let current: unknown = context;

    for (const segment of segments) {
      if (current === null || current === undefined || typeof current !== "object") {
        return { found: false, value: undefined };
      }
      // `Object.prototype.hasOwnProperty` (not the `in` operator) deliberately —
      // `segment in current` would be true for `__proto__`/`constructor`/`toString`/
      // etc. (inherited from Object.prototype), letting a *template author* (not
      // just render-context data) walk the prototype chain via a placeholder like
      // `{{__proto__.constructor.name}}`. `__proto__` is a syntactically valid
      // identifier under this module's placeholder grammar, so this must be
      // enforced here, not by rejecting it at parse time. Only genuine own
      // properties of the context object resolve — everything inherited is
      // treated as simply "not found," the same as any other missing variable.
      if (!Object.prototype.hasOwnProperty.call(current, segment)) {
        return { found: false, value: undefined };
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return { found: current !== undefined, value: current };
  }
}
