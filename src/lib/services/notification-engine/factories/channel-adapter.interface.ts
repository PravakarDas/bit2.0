import type { NotificationChannel, AttemptOutcome } from "../types/enums";
import type { NotificationJobDTO } from "../dto";

export interface RenderedNotificationContent {
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
}

export interface ChannelDeliveryOutcome {
  outcome: AttemptOutcome;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * The channel-adapter contract described in NotificationEngineDesign.md
 * §7/§22/§33 — one implementation per channel (email now planned, then SMS,
 * WhatsApp, Push, Slack, Teams). No implementation of this interface exists
 * yet in this phase; see ChannelAdapterFactory.
 */
export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  send(job: NotificationJobDTO, content: RenderedNotificationContent): Promise<ChannelDeliveryOutcome>;
}
