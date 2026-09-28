import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DeliveryManager } from "./delivery-manager";
import { ProviderRegistry } from "./provider-registry";
import { ProviderResolver } from "./provider-resolver";
import { ProviderHealthMonitor } from "./provider-health-monitor";
import { ProviderMetricsCollector } from "./provider-metrics";
import { createProviderDescriptor } from "./types/provider-descriptor";
import { ProviderPriority } from "./value-objects/provider-priority";
import { ProviderCapabilities } from "./value-objects/provider-capabilities";
import { FakeDeliveryProvider } from "./test-fakes/fake-delivery-provider";
import { fakeJob } from "./test-fakes/fake-job";
import { NotificationChannel } from "../types/enums";

function buildManager() {
  const registry = new ProviderRegistry();
  const health = new ProviderHealthMonitor(3);
  const metrics = new ProviderMetricsCollector();
  const resolver = new ProviderResolver(registry, health);
  const manager = new DeliveryManager(resolver, health, metrics);
  return { registry, health, metrics, manager };
}

function register(
  registry: ProviderRegistry,
  id: string,
  priority: number,
  provider: FakeDeliveryProvider,
  capabilities: ProviderCapabilities = ProviderCapabilities.none()
) {
  registry.register(
    createProviderDescriptor({ id, name: id, channel: NotificationChannel.EMAIL, priority: ProviderPriority.of(priority), capabilities }),
    provider
  );
}

describe("DeliveryManager", () => {
  it("returns NO_PROVIDER_AVAILABLE when nothing is registered for the channel", async () => {
    const { manager } = buildManager();
    const outcome = await manager.deliver(fakeJob(), {});
    assert.equal(outcome.kind, "NO_PROVIDER_AVAILABLE");
  });

  it("delivers successfully via the single registered provider", async () => {
    const { registry, manager } = buildManager();
    const provider = new FakeDeliveryProvider("success");
    register(registry, "smtp-a", 1, provider);

    const outcome = await manager.deliver(fakeJob(), { subject: "hi" });
    assert.equal(outcome.kind, "SUCCESS");
    if (outcome.kind === "SUCCESS") assert.equal(outcome.providerId, "smtp-a");
    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].content.subject, "hi");
  });

  it("fails over from a temporarily-failing provider to the next by priority", async () => {
    const { registry, manager, metrics } = buildManager();
    const a = new FakeDeliveryProvider("temporary-failure");
    const b = new FakeDeliveryProvider("success");
    register(registry, "smtp-a", 1, a);
    register(registry, "smtp-b", 2, b);

    const outcome = await manager.deliver(fakeJob(), {});
    assert.equal(outcome.kind, "SUCCESS");
    if (outcome.kind === "SUCCESS") assert.equal(outcome.providerId, "smtp-b");
    assert.equal(a.calls.length, 1);
    assert.equal(b.calls.length, 1);
    assert.equal(metrics.snapshot("smtp-b").retry, 1); // 2nd provider tried this delivery counts as a retry
    assert.equal(metrics.snapshot("smtp-a").retry, 0); // first attempt is not itself a retry
  });

  it("stops immediately on PERMANENT_FAILURE and does not try the next provider", async () => {
    const { registry, manager } = buildManager();
    const a = new FakeDeliveryProvider("permanent-failure");
    const b = new FakeDeliveryProvider("success");
    register(registry, "smtp-a", 1, a);
    register(registry, "smtp-b", 2, b);

    const outcome = await manager.deliver(fakeJob(), {});
    assert.equal(outcome.kind, "PERMANENT_FAILURE");
    assert.equal(a.calls.length, 1);
    assert.equal(b.calls.length, 0);
  });

  it("a permanent failure does not penalize the provider's health (business failure, not infra failure)", async () => {
    const { registry, manager, health } = buildManager();
    register(registry, "smtp-a", 1, new FakeDeliveryProvider("permanent-failure"));

    await manager.deliver(fakeJob(), {});
    assert.equal(health.getState("smtp-a"), "UNKNOWN");
  });

  it("a temporary failure degrades the provider's health", async () => {
    const { registry, manager, health } = buildManager();
    register(registry, "smtp-a", 1, new FakeDeliveryProvider("temporary-failure"));

    await manager.deliver(fakeJob(), {});
    assert.equal(health.getState("smtp-a"), "DEGRADED");
  });

  it("returns overall TEMPORARY_FAILURE when every candidate fails transiently", async () => {
    const { registry, manager } = buildManager();
    register(registry, "smtp-a", 1, new FakeDeliveryProvider("temporary-failure"));
    register(registry, "smtp-b", 2, new FakeDeliveryProvider("temporary-failure"));

    const outcome = await manager.deliver(fakeJob(), {});
    assert.equal(outcome.kind, "TEMPORARY_FAILURE");
    assert.equal(outcome.attempts.length, 2);
  });

  it("a provider that throws is mapped to a retryable temporary failure and does not crash the delivery", async () => {
    const { registry, manager, metrics } = buildManager();
    const throwing = new FakeDeliveryProvider("throw");
    const fallback = new FakeDeliveryProvider("success");
    register(registry, "smtp-a", 1, throwing);
    register(registry, "smtp-b", 2, fallback);

    const outcome = await manager.deliver(fakeJob(), {});
    assert.equal(outcome.kind, "SUCCESS");
    assert.equal(metrics.snapshot("smtp-a").failure, 1);
  });

  it("respects requiredCapabilities when resolving candidates", async () => {
    const { registry, manager } = buildManager();
    register(registry, "plain", 1, new FakeDeliveryProvider("success"), ProviderCapabilities.none());
    register(registry, "html", 2, new FakeDeliveryProvider("success"), ProviderCapabilities.of({ htmlEmail: true }));

    const outcome = await manager.deliver(fakeJob(), {}, { requiredCapabilities: { htmlEmail: true } });
    assert.equal(outcome.kind, "SUCCESS");
    if (outcome.kind === "SUCCESS") assert.equal(outcome.providerId, "html");
  });

  it("an OFFLINE provider (after repeated failures) is skipped on the next delivery", async () => {
    const { registry, manager, health } = buildManager();
    register(registry, "smtp-a", 1, new FakeDeliveryProvider("temporary-failure"));
    register(registry, "smtp-b", 2, new FakeDeliveryProvider("success"));

    // Threshold is 3 (see buildManager) — 3 temporary failures push smtp-a to OFFLINE.
    await manager.deliver(fakeJob(), {});
    await manager.deliver(fakeJob(), {});
    await manager.deliver(fakeJob(), {});
    assert.equal(health.getState("smtp-a"), "OFFLINE");

    const outcome = await manager.deliver(fakeJob(), {});
    assert.equal(outcome.kind, "SUCCESS");
    if (outcome.kind === "SUCCESS") assert.equal(outcome.providerId, "smtp-b");
  });

  it("records ProviderMetrics requests/success/failure across a delivery", async () => {
    const { registry, manager, metrics } = buildManager();
    register(registry, "smtp-a", 1, new FakeDeliveryProvider("success"));

    await manager.deliver(fakeJob(), {});
    const snapshot = metrics.snapshot("smtp-a");
    assert.equal(snapshot.requests, 1);
    assert.equal(snapshot.success, 1);
    assert.equal(snapshot.failure, 0);
  });
});
