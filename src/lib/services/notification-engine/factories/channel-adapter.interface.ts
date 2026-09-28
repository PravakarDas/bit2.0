import type { NotificationChannel, AttemptOutcome } from "../types/enums";
import type { NotificationJobDTO } from "../dto";

/**
 * A single delivery-ready attachment — file bytes already resolved (Phase
 * 18b: `DocumentAttachmentResolver`, see worker/document-attachment-resolver.ts),
 * never a reference the provider would need to look up itself. Field names
 * deliberately match nodemailer's own `Attachment` shape 1:1 (`filename`,
 * `content`, `contentType`) so `SmtpDeliveryProvider` can forward this array
 * straight into `transporter.sendMail({ attachments: ... })` with no mapping.
 */
export interface NotificationAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface RenderedNotificationContent {
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  /**
   * Phase 18b addition — additive and optional, so every pre-existing
   * `RenderedNotificationContent` value (literal `{}`, template-engine
   * output, every existing test fixture) remains valid without change.
   * An array to match nodemailer's own attachment shape, but today's
   * `NotificationJob.documentId` is a single optional FK (not a join
   * table), so exactly zero or one element is ever populated by this
   * engine — see document-attachment-resolver.ts.
   */
  attachments?: NotificationAttachment[];
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
