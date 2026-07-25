import type { RenderContext } from "../types";

export interface ResolvedVariable {
  found: boolean;
  value: unknown;
}

/**
 * One pluggable strategy for resolving a variable path. `TemplateVariableResolver`
 * tries every registered plugin (most-recently-registered first) before
 * falling back to generic dot-path lookup — this is the "variable
 * resolution must be extensible" requirement: a future phase (or business
 * module) can register a plugin for its own namespace (e.g. `loan.*`)
 * without touching this file.
 */
export interface VariableResolverPlugin {
  /** A short, human-readable name for diagnostics (e.g. in TemplateMetrics or logs). */
  readonly name: string;
  canResolve(path: string): boolean;
  resolve(path: string, context: RenderContext): ResolvedVariable;
}
