import type { RenderContext } from "./types";
import { DotPathResolverPlugin } from "./variable-resolvers/dot-path-resolver.plugin";
import { DateVariableResolverPlugin } from "./variable-resolvers/date-variable-resolver.plugin";
import type { ResolvedVariable, VariableResolverPlugin } from "./variable-resolvers/variable-resolver-plugin.interface";

/**
 * Item 5 — the extensible resolution orchestrator. Ships with two plugins
 * (`DateVariableResolverPlugin` for `{{today}}`/`{{now}}`,
 * `DotPathResolverPlugin` as the always-present fallback for everything
 * else, e.g. `{{employee.name}}`); `register()` lets a caller add more
 * without modifying this class (Open/Closed).
 */
export class TemplateVariableResolver {
  private readonly plugins: VariableResolverPlugin[] = [];
  private readonly fallback: VariableResolverPlugin = new DotPathResolverPlugin();

  constructor(plugins: VariableResolverPlugin[] = [new DateVariableResolverPlugin()]) {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  /** Custom plugins take priority over the built-ins — last registered is tried first. */
  register(plugin: VariableResolverPlugin): void {
    this.plugins.unshift(plugin);
  }

  resolve(path: string, context: RenderContext): ResolvedVariable {
    for (const plugin of this.plugins) {
      if (plugin.canResolve(path)) {
        return plugin.resolve(path, context);
      }
    }
    return this.fallback.resolve(path, context);
  }
}
