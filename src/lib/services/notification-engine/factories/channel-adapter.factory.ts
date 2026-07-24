import type { NotificationChannel } from "../types/enums";
import type { NotificationChannelAdapter } from "./channel-adapter.interface";
import { ProviderError } from "../errors";

/**
 * EMPTY factory implementation, as required by this phase's scope: NO email,
 * SMS, WhatsApp, Push, Slack, or Teams adapter is implemented here — every
 * channel is registered as "not yet available." This factory exists so a
 * later phase can register a real `NotificationChannelAdapter` per channel
 * (starting with email) without changing this factory's shape or any of its
 * callers — that's the whole point of depending on the `NotificationChannelAdapter`
 * interface (Open/Closed Principle: open for extension via `register`,
 * closed for modification of `getAdapter`'s contract).
 */
export class ChannelAdapterFactory {
  private readonly adapters = new Map<NotificationChannel, NotificationChannelAdapter>();

  /** Registration point for a future phase — not called anywhere in this phase. */
  register(adapter: NotificationChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  getAdapter(channel: NotificationChannel): NotificationChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new ProviderError(`No channel adapter is registered for "${channel}" yet — not implemented in this phase.`);
    }
    return adapter;
  }
}
