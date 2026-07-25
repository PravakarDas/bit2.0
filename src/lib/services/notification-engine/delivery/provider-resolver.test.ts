import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "./provider-registry";
import { ProviderHealthMonitor } from "./provider-health-monitor";
import { ProviderResolver } from "./provider-resolver";
import { createProviderDescriptor } from "./types/provider-descriptor";
import { ProviderPriority } from "./value-objects/provider-priority";
import { ProviderCapabilities } from "./value-objects/provider-capabilities";
import { FakeDeliveryProvider } from "./test-fakes/fake-delivery-provider";
import { NotificationChannel } from "../types/enums";

function register(
  registry: ProviderRegistry,
  id: string,
  priority: number,
  options: { isActive?: boolean; capabilities?: ProviderCapabilities } = {}
) {
  registry.register(
    createProviderDescriptor({
      id,
      name: id,
      channel: NotificationChannel.EMAIL,
      priority: ProviderPriority.of(priority),
      isActive: options.isActive ?? true,
      capabilities: options.capabilities ?? ProviderCapabilities.none(),
    }),
    new FakeDeliveryProvider()
  );
}

describe("ProviderResolver", () => {
  it("returns all active, healthy, capability-matching providers for a channel", () => {
    const registry = new ProviderRegistry();
    const health = new ProviderHealthMonitor();
    register(registry, "a", 1);
    register(registry, "b", 2);
    const resolver = new ProviderResolver(registry, health);

    const resolved = resolver.resolve(NotificationChannel.EMAIL);
    assert.deepEqual(resolved.map((r) => r.descriptor.id), ["a", "b"]);
  });

  it("excludes providers whose descriptor.isActive is false", () => {
    const registry = new ProviderRegistry();
    const health = new ProviderHealthMonitor();
    register(registry, "a", 1, { isActive: false });
    register(registry, "b", 2);
    const resolver = new ProviderResolver(registry, health);

    assert.deepEqual(resolver.resolve(NotificationChannel.EMAIL).map((r) => r.descriptor.id), ["b"]);
  });

  it("excludes providers the health monitor considers unusable (OFFLINE/MAINTENANCE)", () => {
    const registry = new ProviderRegistry();
    const health = new ProviderHealthMonitor();
    register(registry, "a", 1);
    register(registry, "b", 2);
    health.setState("a", "OFFLINE");
    const resolver = new ProviderResolver(registry, health);

    assert.deepEqual(resolver.resolve(NotificationChannel.EMAIL).map((r) => r.descriptor.id), ["b"]);
  });

  it("excludes providers that don't satisfy required capabilities", () => {
    const registry = new ProviderRegistry();
    const health = new ProviderHealthMonitor();
    register(registry, "plain", 1, { capabilities: ProviderCapabilities.none() });
    register(registry, "html", 2, { capabilities: ProviderCapabilities.of({ htmlEmail: true }) });
    const resolver = new ProviderResolver(registry, health);

    const resolved = resolver.resolve(NotificationChannel.EMAIL, { htmlEmail: true });
    assert.deepEqual(resolved.map((r) => r.descriptor.id), ["html"]);
  });

  it("returns an empty list for a channel with nothing registered", () => {
    const resolver = new ProviderResolver(new ProviderRegistry(), new ProviderHealthMonitor());
    assert.deepEqual(resolver.resolve(NotificationChannel.WHATSAPP), []);
  });
});
