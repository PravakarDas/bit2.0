import { SystemClock, type IClock } from "../../utils";
import type { ResolvedVariable, VariableResolverPlugin } from "./variable-resolver-plugin.interface";

/**
 * Resolves `{{today}}` (date only) and `{{now}}` (date + time) dynamically
 * at render time, independent of whatever the caller's `RenderContext`
 * contains — these two example variables from this phase's own
 * instructions aren't data the caller should have to supply. Injectable
 * `IClock` for deterministic tests (same pattern as `RetryScheduler`/
 * `NotificationJobFactory` from Phases 2-3).
 */
export class DateVariableResolverPlugin implements VariableResolverPlugin {
  readonly name = "date";

  constructor(private readonly clock: IClock = new SystemClock()) {}

  canResolve(path: string): boolean {
    return path === "today" || path === "now";
  }

  resolve(path: string): ResolvedVariable {
    const now = this.clock.now();
    if (path === "today") {
      return { found: true, value: now.toISOString().slice(0, 10) };
    }
    return { found: true, value: now.toISOString() };
  }
}
