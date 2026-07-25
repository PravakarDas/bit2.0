import type { NotificationChannel } from "../types/enums";
import type { CompiledTemplate } from "./types";

/** Builds the one canonical cache key format — every caller goes through this, so the key shape only needs to change in one place. */
export function buildTemplateCacheKey(key: string, channel: NotificationChannel, version: number): string {
  return `${key}::${channel}::v${version}`;
}

/**
 * Item 7 — in-memory cache of already-compiled templates, keyed by
 * key+channel+version (locale is already folded into `key` by
 * `TemplateLocaleKey` before this cache ever sees it — see
 * template-locale.ts). Plain `Map`, matching this project's zero-Redis
 * convention (Design's own "In-process interval loops instead of a job
 * queue" decision applies equally here — no external cache infra for a
 * single-process app).
 */
export class TemplateCache {
  private readonly store = new Map<string, CompiledTemplate>();

  get(cacheKey: string): CompiledTemplate | undefined {
    return this.store.get(cacheKey);
  }

  set(cacheKey: string, compiled: CompiledTemplate): void {
    this.store.set(cacheKey, compiled);
  }

  /**
   * Invalidates every cached *version* of one exact key+channel — used
   * after `register()`/`unregister()`, since a stale compiled version must
   * never be served again. `key` here is whatever `TemplateRegistry` actually
   * persisted (already locale-composite, e.g. `"LOAN_APPROVED@bn-BD"`, if a
   * locale was given) — this does NOT cascade to other locale variants of
   * the same base key, since registering one locale's content has no
   * bearing on another locale's already-cached, unrelated content.
   */
  invalidate(key: string, channel: NotificationChannel): void {
    const prefix = `${key}::${channel}::`;
    for (const cacheKey of this.store.keys()) {
      if (cacheKey.startsWith(prefix)) {
        this.store.delete(cacheKey);
      }
    }
  }

  invalidateAll(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
