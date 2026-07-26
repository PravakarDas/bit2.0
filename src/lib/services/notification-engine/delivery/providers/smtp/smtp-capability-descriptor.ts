import { ProviderCapabilities } from "../../value-objects/provider-capabilities";

/**
 * "SMTP Capability Descriptor" (item 6). Only `htmlEmail` is claimed today —
 * `SmtpDeliveryProvider.deliver()` genuinely sends `RenderedNotificationContent
 * .bodyHtml`/`.bodyText`/`.subject`, nothing more.
 *
 * `attachments`/`inlineImages` stay `false` even though "Delivery: ...
 * Generate ... attachments (architecture only)" was requested: nodemailer's
 * mail options (built in `smtp-transport-factory.ts`/`smtp-delivery-
 * provider.ts`) already have a documented extension point for an
 * `attachments` array once one exists, but Phase 2's frozen
 * `RenderedNotificationContent` (`subject?`, `bodyHtml?`, `bodyText?`) has
 * no field to carry attachment data at all yet. A `ProviderCapabilities`
 * flag is read by `ProviderResolver` to decide real eligibility for a real
 * delivery (Phase 6) — claiming `attachments: true` here would be false
 * advertising with nothing behind it. The "architecture only" instruction
 * is satisfied by the transport plumbing being attachment-ready, not by the
 * capability flag lying about current behavior; the flag flips to `true`
 * the moment a future phase adds attachment data upstream.
 */
export function buildSmtpCapabilities(): ProviderCapabilities {
  return ProviderCapabilities.of({ htmlEmail: true });
}
