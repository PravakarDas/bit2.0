import type {
  ChannelDeliveryOutcome,
  NotificationChannelAdapter,
  RenderedNotificationContent,
} from "../../factories";
import type { NotificationChannel } from "../../types/enums";
import type { NotificationJobDTO } from "../../dto";
import { ProviderNotImplementedError } from "../errors";

/**
 * "Create only the abstraction... every adapter should throw
 * ProviderNotImplementedError until later phases" — one generic
 * implementation of Phase 2's frozen `NotificationChannelAdapter`
 * interface, parameterized by channel, rather than 8 near-identical
 * per-channel classes with no actual per-channel logic yet (DRY — there is
 * nothing channel-specific to differentiate until a real SMTP/SMS/etc.
 * adapter exists). See registerStubChannelAdapters() for how all 8
 * `NotificationChannel` values get one of these registered into
 * `ChannelAdapterFactory`.
 */
export class StubChannelAdapter implements NotificationChannelAdapter {
  constructor(readonly channel: NotificationChannel) {}

  async send(_job: NotificationJobDTO, _content: RenderedNotificationContent): Promise<ChannelDeliveryOutcome> {
    throw new ProviderNotImplementedError(this.channel);
  }
}
