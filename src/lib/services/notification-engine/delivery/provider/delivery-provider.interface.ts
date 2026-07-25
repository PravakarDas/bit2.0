import type { NotificationJobDTO } from "../../dto";
import type { RenderedNotificationContent } from "../../factories";
import type { ProviderResult } from "../types/provider-result";
import type { ProviderContext } from "./provider-context";
import type { ProviderLifecycle } from "./provider-lifecycle.interface";

/**
 * The one contract every future channel provider — SMTP, SMS, WhatsApp,
 * Push, In-App — must implement. "No provider-specific logic may leak
 * outside the framework": `deliver()` takes an already-rendered
 * `RenderedNotificationContent` (Phase 2's frozen shape, reused verbatim —
 * rendering happened upstream via `TemplateEngine`, a separate phase) and
 * returns a normalized `ProviderResult`; nothing about SMTP envelopes, SMS
 * gateway payloads, or push tokens is visible at this layer.
 *
 * Extends `ProviderLifecycle` (all hooks optional) rather than composing it
 * as a second constructor argument — a provider that needs lifecycle
 * management implements those methods too; one implementing only `deliver`
 * is still a complete, valid `DeliveryProvider`.
 */
export interface DeliveryProvider extends ProviderLifecycle {
  deliver(job: NotificationJobDTO, content: RenderedNotificationContent, context: ProviderContext): Promise<ProviderResult>;
}
