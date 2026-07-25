import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "./provider-registry";
import { createProviderDescriptor, providerDescriptorFromDTO } from "./types/provider-descriptor";
import { ProviderPriority } from "./value-objects/provider-priority";
import { ProviderCapabilities } from "./value-objects/provider-capabilities";
import { FakeDeliveryProvider } from "./test-fakes/fake-delivery-provider";
import { FakeNotificationProviderRepository } from "./test-fakes/fake-notification-provider.repository";
import { NotificationChannel } from "../types/enums";

function descriptor(id: string, priority: number, overrides: Partial<{ isActive: boolean }> = {}) {
  return createProviderDescriptor({
    id,
    name: id,
    channel: NotificationChannel.EMAIL,
    priority: ProviderPriority.of(priority),
    isActive: overrides.isActive ?? true,
  });
}

describe("ProviderRegistry", () => {
  it("returns providers for a channel sorted ascending by priority", () => {
    const registry = new ProviderRegistry();
    registry.register(descriptor("smtp-b", 2), new FakeDeliveryProvider());
    registry.register(descriptor("smtp-a", 1), new FakeDeliveryProvider());
    registry.register(descriptor("smtp-c", 3), new FakeDeliveryProvider());

    const ids = registry.getByChannel(NotificationChannel.EMAIL).map((entry) => entry.descriptor.id);
    assert.deepEqual(ids, ["smtp-a", "smtp-b", "smtp-c"]);
  });

  it("keeps different channels independent", () => {
    const registry = new ProviderRegistry();
    registry.register(descriptor("smtp-a", 1), new FakeDeliveryProvider());
    registry.register(
      createProviderDescriptor({ id: "sms-a", name: "sms-a", channel: NotificationChannel.SMS, priority: ProviderPriority.of(1) }),
      new FakeDeliveryProvider()
    );

    assert.equal(registry.getByChannel(NotificationChannel.EMAIL).length, 1);
    assert.equal(registry.getByChannel(NotificationChannel.SMS).length, 1);
  });

  it("re-registering the same id replaces the entry instead of duplicating it", () => {
    const registry = new ProviderRegistry();
    registry.register(descriptor("smtp-a", 1), new FakeDeliveryProvider());
    registry.register(descriptor("smtp-a", 5), new FakeDeliveryProvider());

    const entries = registry.getByChannel(NotificationChannel.EMAIL);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].descriptor.priority.value, 5);
  });

  it("unregister removes the provider from both lookups", () => {
    const registry = new ProviderRegistry();
    registry.register(descriptor("smtp-a", 1), new FakeDeliveryProvider());
    registry.unregister("smtp-a");

    assert.equal(registry.getByChannel(NotificationChannel.EMAIL).length, 0);
    assert.equal(registry.getById("smtp-a"), undefined);
  });

  it("unregistering an unknown id is a harmless no-op", () => {
    const registry = new ProviderRegistry();
    assert.doesNotThrow(() => registry.unregister("nope"));
  });

  it("list() returns every registered provider across all channels", () => {
    const registry = new ProviderRegistry();
    registry.register(descriptor("smtp-a", 1), new FakeDeliveryProvider());
    registry.register(
      createProviderDescriptor({ id: "sms-a", name: "sms-a", channel: NotificationChannel.SMS, priority: ProviderPriority.of(1) }),
      new FakeDeliveryProvider()
    );
    assert.equal(registry.list().length, 2);
  });

  describe("initializeAll / shutdownAll", () => {
    it("calls initialize()/shutdown() on every provider that implements it", async () => {
      const registry = new ProviderRegistry();
      const a = new FakeDeliveryProvider();
      const b = new FakeDeliveryProvider();
      registry.register(descriptor("smtp-a", 1), a);
      registry.register(descriptor("smtp-b", 2), b);

      await registry.initializeAll();
      assert.equal(a.initializeCalled, true);
      assert.equal(b.initializeCalled, true);

      await registry.shutdownAll();
      assert.equal(a.shutdownCalled, true);
      assert.equal(b.shutdownCalled, true);
    });

    it("does not throw when a provider implements no lifecycle hooks", async () => {
      const registry = new ProviderRegistry();
      registry.register(descriptor("bare", 1), { deliver: async () => { throw new Error("unused"); } });
      await assert.doesNotReject(() => registry.initializeAll());
      await assert.doesNotReject(() => registry.shutdownAll());
    });
  });

  describe("providerDescriptorFromDTO", () => {
    it("builds a descriptor from a persisted NotificationProvider row, using the repository interface only (no real database)", async () => {
      const repository = new FakeNotificationProviderRepository();
      const dto = await repository.create({
        channel: NotificationChannel.EMAIL,
        name: "Primary Gmail SMTP",
        configEncrypted: "encrypted-blob",
        priority: 2,
      });

      const descriptor = providerDescriptorFromDTO(dto, ProviderCapabilities.of({ htmlEmail: true }));
      assert.equal(descriptor.id, dto.id);
      assert.equal(descriptor.name, "Primary Gmail SMTP");
      assert.equal(descriptor.priority.value, 2);
      assert.equal(descriptor.isActive, true);
      assert.equal(descriptor.capabilities.htmlEmail, true);
    });

    it("defaults capabilities to none() when not supplied", async () => {
      const repository = new FakeNotificationProviderRepository();
      const dto = await repository.create({ channel: NotificationChannel.EMAIL, name: "x", configEncrypted: "y" });
      const descriptor = providerDescriptorFromDTO(dto);
      assert.equal(descriptor.capabilities.htmlEmail, false);
    });
  });
});
