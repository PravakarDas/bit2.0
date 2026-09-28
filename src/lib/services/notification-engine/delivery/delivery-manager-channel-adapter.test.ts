import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DeliveryManagerChannelAdapter } from "./delivery-manager-channel-adapter";
import { DeliveryManager } from "./delivery-manager";
import { ProviderRegistry } from "./provider-registry";
import { ProviderResolver } from "./provider-resolver";
import { ProviderHealthMonitor } from "./provider-health-monitor";
import { ProviderMetricsCollector } from "./provider-metrics";
import { createProviderDescriptor } from "./types/provider-descriptor";
import { ProviderPriority } from "./value-objects/provider-priority";
import { FakeDeliveryProvider } from "./test-fakes/fake-delivery-provider";
import { fakeJob } from "./test-fakes/fake-job";
import { NotificationChannel } from "../types/enums";
import { ChannelAdapterFactory } from "../factories";
import { JobDispatcher } from "../worker/job-dispatcher";
import { ExecutionContext } from "../worker/execution-context";

function buildDeliveryManager(provider: FakeDeliveryProvider) {
  const registry = new ProviderRegistry();
  registry.register(
    createProviderDescriptor({ id: "smtp-primary", name: "Primary SMTP", channel: NotificationChannel.EMAIL, priority: ProviderPriority.of(1) }),
    provider
  );
  const health = new ProviderHealthMonitor();
  const resolver = new ProviderResolver(registry, health);
  return new DeliveryManager(resolver, health, new ProviderMetricsCollector());
}

describe("DeliveryManagerChannelAdapter", () => {
  it("maps a SUCCESS DeliveryOutcome to a SUCCESS ChannelDeliveryOutcome", async () => {
    const deliveryManager = buildDeliveryManager(new FakeDeliveryProvider("success"));
    const adapter = new DeliveryManagerChannelAdapter(NotificationChannel.EMAIL, deliveryManager);

    const outcome = await adapter.send(fakeJob(), { subject: "hi" });
    assert.deepEqual(outcome, { outcome: "SUCCESS" });
  });

  it("maps a PERMANENT_FAILURE DeliveryOutcome to a FAILURE with the provider's error details", async () => {
    const deliveryManager = buildDeliveryManager(new FakeDeliveryProvider("permanent-failure"));
    const adapter = new DeliveryManagerChannelAdapter(NotificationChannel.EMAIL, deliveryManager);

    const outcome = await adapter.send(fakeJob(), {});
    assert.equal(outcome.outcome, "FAILURE");
    assert.equal(outcome.errorCode, "PERM");
  });

  it("maps a TEMPORARY_FAILURE DeliveryOutcome (every provider exhausted) to FAILURE using the last attempt's details", async () => {
    const deliveryManager = buildDeliveryManager(new FakeDeliveryProvider("temporary-failure"));
    const adapter = new DeliveryManagerChannelAdapter(NotificationChannel.EMAIL, deliveryManager);

    const outcome = await adapter.send(fakeJob(), {});
    assert.equal(outcome.outcome, "FAILURE");
    assert.equal(outcome.errorCode, "TEMP");
  });

  it("maps NO_PROVIDER_AVAILABLE to a FAILURE with a descriptive error", async () => {
    const registry = new ProviderRegistry();
    const health = new ProviderHealthMonitor();
    const deliveryManager = new DeliveryManager(new ProviderResolver(registry, health), health, new ProviderMetricsCollector());
    const adapter = new DeliveryManagerChannelAdapter(NotificationChannel.EMAIL, deliveryManager);

    const outcome = await adapter.send(fakeJob(), {});
    assert.equal(outcome.outcome, "FAILURE");
    assert.equal(outcome.errorCode, "NO_PROVIDER_AVAILABLE");
  });
});

describe("Integration: JobDispatcher (Phase 4, unmodified) driving DeliveryManager via DeliveryManagerChannelAdapter", () => {
  it("proves NotificationWorker's existing dispatch pipeline can route EMAIL through DeliveryManager instead of StubChannelAdapter, with zero changes to JobDispatcher itself", async () => {
    const deliveryManager = buildDeliveryManager(new FakeDeliveryProvider("success"));
    const channelAdapterFactory = new ChannelAdapterFactory();
    channelAdapterFactory.register(new DeliveryManagerChannelAdapter(NotificationChannel.EMAIL, deliveryManager));

    const dispatcher = new JobDispatcher(channelAdapterFactory);
    const job = fakeJob({ channel: "EMAIL" });
    const dispatchOutcome = await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));

    assert.equal(dispatchOutcome.kind, "SUCCESS");
    if (dispatchOutcome.kind === "SUCCESS") {
      assert.deepEqual(dispatchOutcome.result, { outcome: "SUCCESS" });
    }
  });

  it("a delivery failure surfaces as a normal (non-thrown) FAILURE result through JobDispatcher, not a dispatch-level error", async () => {
    const deliveryManager = buildDeliveryManager(new FakeDeliveryProvider("permanent-failure"));
    const channelAdapterFactory = new ChannelAdapterFactory();
    channelAdapterFactory.register(new DeliveryManagerChannelAdapter(NotificationChannel.EMAIL, deliveryManager));

    const dispatcher = new JobDispatcher(channelAdapterFactory);
    const job = fakeJob({ channel: "EMAIL" });
    const dispatchOutcome = await dispatcher.dispatch(job, new ExecutionContext(job, "worker-1"));

    assert.equal(dispatchOutcome.kind, "SUCCESS"); // the adapter call itself didn't throw
    if (dispatchOutcome.kind === "SUCCESS") {
      assert.equal(dispatchOutcome.result.outcome, "FAILURE");
    }
  });
});
