import type { NotificationChannel } from "../types/enums";
import type { NotificationEventDTO } from "./notification-event.dto";
import type { NotificationJobDTO } from "./notification-job.dto";

/**
 * One (recipient x channel) target for a raised event's fan-out. Business
 * modules already know this — "the employee", "their manager", "all
 * SUPERADMINs" is a domain decision the module itself makes (Design §6's
 * "resolveRecipients" mapping), never something `NotificationService` derives
 * from `eventType` alone. Requiring it here keeps the derivation of *who*
 * gets notified out of the engine, matching this phase's "NotificationService
 * must NOT contain business logic" rule — see NotificationServiceReport.md's
 * "Design Decisions" section for the full reasoning.
 */
export interface RaiseEventRecipient {
  channel: NotificationChannel;
  recipientAddress: string;
  recipientUserId?: string | null;
  documentId?: string | null;
}

/**
 * The entire public surface a business module needs to know to raise a
 * notification — see NotificationServiceReport.md's "Public API" section.
 * `dedupeKey`/`sourceDomain` are optional because `NotificationEvent`'s
 * existing (Phase 1, frozen) schema already requires both — when omitted,
 * `NotificationService` derives them deterministically rather than forcing
 * every call site to understand the engine's own dedupe convention.
 */
export interface RaiseEventRequest {
  eventType: string;
  payload?: Record<string, unknown> | null;
  recipients: RaiseEventRecipient[];
  dedupeKey?: string;
  sourceDomain?: string;
  triggeredByUserId?: string | null;
  /** Item 9 — Scheduling support: delays every fanned-out job's first attempt until this time instead of "now". */
  scheduledAt?: Date;
  maxAttempts?: number;
}

export interface RaiseEventResult {
  event: NotificationEventDTO;
  jobs: NotificationJobDTO[];
  /** True when this call matched an already-recorded event (by `dedupeKey`) and no new fan-out occurred. */
  deduplicated: boolean;
}
