import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProviderMetricsCollector } from "./provider-metrics";

describe("ProviderMetricsCollector", () => {
  it("returns a zeroed snapshot for a provider never recorded", () => {
    const metrics = new ProviderMetricsCollector();
    assert.deepEqual(metrics.snapshot("prov-1"), { requests: 0, success: 0, failure: 0, retry: 0, averageLatencyMs: 0 });
  });

  it("tracks requests/success/failure/retry independently", () => {
    const metrics = new ProviderMetricsCollector();
    metrics.recordRequest("prov-1");
    metrics.recordRequest("prov-1");
    metrics.recordRetry("prov-1");
    metrics.recordSuccess("prov-1", 100);
    metrics.recordFailure("prov-1", 200);

    const snapshot = metrics.snapshot("prov-1");
    assert.equal(snapshot.requests, 2);
    assert.equal(snapshot.retry, 1);
    assert.equal(snapshot.success, 1);
    assert.equal(snapshot.failure, 1);
  });

  it("averages latency across success + failure samples", () => {
    const metrics = new ProviderMetricsCollector();
    metrics.recordSuccess("prov-1", 100);
    metrics.recordFailure("prov-1", 300);
    assert.equal(metrics.snapshot("prov-1").averageLatencyMs, 200);
  });

  it("keeps per-provider counters fully independent", () => {
    const metrics = new ProviderMetricsCollector();
    metrics.recordSuccess("prov-1", 100);
    metrics.recordFailure("prov-2", 50);
    assert.equal(metrics.snapshot("prov-1").success, 1);
    assert.equal(metrics.snapshot("prov-1").failure, 0);
    assert.equal(metrics.snapshot("prov-2").success, 0);
    assert.equal(metrics.snapshot("prov-2").failure, 1);
  });

  it("snapshotAll returns every recorded provider", () => {
    const metrics = new ProviderMetricsCollector();
    metrics.recordRequest("prov-1");
    metrics.recordRequest("prov-2");
    const all = metrics.snapshotAll();
    assert.equal(all.size, 2);
    assert.equal(all.get("prov-1")?.requests, 1);
    assert.equal(all.get("prov-2")?.requests, 1);
  });
});
