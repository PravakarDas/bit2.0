import type { ChannelAdapterFactory } from "../../factories";
import { NotificationChannel } from "../../types/enums";
import { StubChannelAdapter } from "./stub-channel.adapter";

/**
 * Registers a `StubChannelAdapter` for every `NotificationChannel` value
 * into the given `ChannelAdapterFactory` (Phase 2, previously empty —
 * "nothing in this phase registers to it yet"). After this call,
 * `factory.getAdapter(anyChannel)` throws the specific
 * `ProviderNotImplementedError` instead of the generic `ProviderError` an
 * unregistered channel would throw — a clearer signal for `JobDispatcher`
 * to act on. Does not touch `ChannelAdapterFactory` itself (its `register`
 * extension point already existed, unused, since Phase 2).
 */
export function registerStubChannelAdapters(factory: ChannelAdapterFactory): void {
  for (const channel of Object.values(NotificationChannel)) {
    factory.register(new StubChannelAdapter(channel));
  }
}
