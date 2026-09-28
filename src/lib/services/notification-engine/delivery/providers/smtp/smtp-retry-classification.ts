import { classifySmtpErrorCategory } from "../../../../../smtp-shared";

/**
 * "SMTP Retry Classification" (item 8). Maps the same `SmtpErrorCategory`
 * `mapSmtpError()` (`../../../../../smtp-shared.ts`) uses for its human-readable
 * message into a PERMANENT/TEMPORARY decision for the Delivery Framework —
 * one categorization function feeding both concerns, per Design's own
 * "don't duplicate SMTP logic" instruction.
 *
 * - ENVELOPE (invalid sender/recipient address) and SERVER_REJECTED (SMTP
 *   5xx — RFC 5321's "Permanent Negative Completion" class) are the
 *   recipient/content-is-the-problem cases: no amount of retrying, on this
 *   provider or a sibling one, will fix a malformed address or a rejected
 *   message. Classified PERMANENT.
 * - AUTH, DNS, CONNECTION, TIMEOUT, and UNKNOWN are infrastructure/unknown
 *   problems — potentially resolved by retrying, and specifically by
 *   `DeliveryManager` failing over to a sibling EMAIL provider with
 *   different credentials/network path. Classified TEMPORARY, matching
 *   `DeliveryExceptionMapper`'s own conservative default (Phase 6).
 */
export function isPermanentSmtpError(error: unknown): boolean {
  const category = classifySmtpErrorCategory(error);
  return category === "ENVELOPE" || category === "SERVER_REJECTED";
}
