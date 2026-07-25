import type { NotificationChannel } from "../types/enums";
import { ProviderPriority } from "./value-objects/provider-priority";
import type { ProviderDescriptor, RegisteredProvider } from "./types";
import type { DeliveryProvider } from "./provider";

/**
 * In-memory registry of every provider available to the framework — the
 * multi-provider-per-channel counterpart to Phase 2's `ChannelAdapterFactory`
 * (which only ever holds one adapter per channel). Example from this
 * phase's own prompt: EMAIL -> [SMTP-A, SMTP-B, SMTP-C], each with its own
 * priority. Deliberately separate from `ChannelAdapterFactory` — that
 * factory still backs `JobDispatcher`'s existing, frozen dispatch pipeline
 * (see WorkerRuntimeReport.md); this registry is the new framework's own
 * bookkeeping and does not replace it (see DeliveryFrameworkReport.md
 * "Worker Integration").
 */
export class ProviderRegistry {
  private readonly byChannel = new Map<NotificationChannel, RegisteredProvider[]>();
  private readonly byId = new Map<string, RegisteredProvider>();

  /** Registering a `descriptor.id` that already exists replaces it in place (re-registration, e.g. after a config reload). */
  register(descriptor: ProviderDescriptor, provider: DeliveryProvider): void {
    this.byId.set(descriptor.id, { descriptor, provider });

    const existing = this.byChannel.get(descriptor.channel) ?? [];
    const withoutOldEntry = existing.filter((entry) => entry.descriptor.id !== descriptor.id);
    withoutOldEntry.push({ descriptor, provider });
    withoutOldEntry.sort((a, b) => ProviderPriority.compare(a.descriptor.priority, b.descriptor.priority));
    this.byChannel.set(descriptor.channel, withoutOldEntry);
  }

  unregister(providerId: string): void {
    const entry = this.byId.get(providerId);
    if (!entry) return;

    this.byId.delete(providerId);
    const remaining = (this.byChannel.get(entry.descriptor.channel) ?? []).filter(
      (candidate) => candidate.descriptor.id !== providerId
    );
    this.byChannel.set(entry.descriptor.channel, remaining);
  }

  /** Returns every registered provider for the channel, sorted ascending by priority ("lower = tried first"). */
  getByChannel(channel: NotificationChannel): RegisteredProvider[] {
    return [...(this.byChannel.get(channel) ?? [])];
  }

  getById(providerId: string): RegisteredProvider | undefined {
    return this.byId.get(providerId);
  }

  list(): RegisteredProvider[] {
    return [...this.byId.values()];
  }

  /**
   * Orchestration surface for `ProviderLifecycle` (item 15) — calls
   * `initialize()` on every registered provider that implements it.
   * Nothing in this phase calls this method itself (no worker startup, no
   * instrumentation.ts wiring, per the STOP conditions); it exists so a
   * future bootstrap phase has one place to bring every provider up.
   */
  async initializeAll(): Promise<void> {
    await Promise.all(this.list().map((entry) => entry.provider.initialize?.()));
  }

  async shutdownAll(): Promise<void> {
    await Promise.all(this.list().map((entry) => entry.provider.shutdown?.()));
  }
}
