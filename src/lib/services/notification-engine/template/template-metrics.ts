export interface TemplateMetricsSnapshot {
  renderCount: number;
  previewCount: number;
  compileCount: number;
  cacheHits: number;
  cacheMisses: number;
  validationFailureCount: number;
  averageRenderTimeMs: number;
}

/**
 * Item 12 — in-memory only (same reasoning as `WorkerMetricsCollector`
 * (Phase 4): no new Prisma model this phase). Tracks render/preview/compile
 * counts, cache hit/miss rate (the direct signal that `TemplateCache` is
 * doing its job), and validation failures, plus average render latency.
 * Unlike `WorkerMetricsCollector`, this class has no "uptime" concept (not
 * one of this phase's requested metrics) and so has no need for an
 * injected clock — render duration is measured and passed in by the caller
 * (`TemplateEngine`), matching the simplest thing that satisfies the
 * requirement (KISS) rather than adding a dependency this class doesn't use.
 */
export class TemplateMetricsCollector {
  private renderCount = 0;
  private previewCount = 0;
  private compileCount = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private validationFailureCount = 0;
  private totalRenderTimeMs = 0;

  recordRender(durationMs: number): void {
    this.renderCount += 1;
    this.totalRenderTimeMs += durationMs;
  }

  recordPreview(): void {
    this.previewCount += 1;
  }

  recordCompile(): void {
    this.compileCount += 1;
  }

  recordCacheHit(): void {
    this.cacheHits += 1;
  }

  recordCacheMiss(): void {
    this.cacheMisses += 1;
  }

  recordValidationFailure(): void {
    this.validationFailureCount += 1;
  }

  getSnapshot(): TemplateMetricsSnapshot {
    return {
      renderCount: this.renderCount,
      previewCount: this.previewCount,
      compileCount: this.compileCount,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      validationFailureCount: this.validationFailureCount,
      averageRenderTimeMs: this.renderCount === 0 ? 0 : this.totalRenderTimeMs / this.renderCount,
    };
  }
}
