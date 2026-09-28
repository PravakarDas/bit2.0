import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TemplateMetricsCollector } from "./template-metrics";

describe("TemplateMetricsCollector", () => {
  it("starts at all zeros", () => {
    const snapshot = new TemplateMetricsCollector().getSnapshot();
    assert.deepEqual(snapshot, {
      renderCount: 0,
      previewCount: 0,
      compileCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      validationFailureCount: 0,
      averageRenderTimeMs: 0,
    });
  });

  it("records renders and computes average runtime", () => {
    const metrics = new TemplateMetricsCollector();
    metrics.recordRender(100);
    metrics.recordRender(200);
    const snapshot = metrics.getSnapshot();
    assert.equal(snapshot.renderCount, 2);
    assert.equal(snapshot.averageRenderTimeMs, 150);
  });

  it("records previews, compiles, cache hits/misses, and validation failures independently", () => {
    const metrics = new TemplateMetricsCollector();
    metrics.recordPreview();
    metrics.recordPreview();
    metrics.recordCompile();
    metrics.recordCacheHit();
    metrics.recordCacheMiss();
    metrics.recordCacheMiss();
    metrics.recordValidationFailure();

    const snapshot = metrics.getSnapshot();
    assert.equal(snapshot.previewCount, 2);
    assert.equal(snapshot.compileCount, 1);
    assert.equal(snapshot.cacheHits, 1);
    assert.equal(snapshot.cacheMisses, 2);
    assert.equal(snapshot.validationFailureCount, 1);
  });
});
