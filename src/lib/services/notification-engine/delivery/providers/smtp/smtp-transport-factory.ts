import nodemailer, { type Transporter } from "nodemailer";
import { buildSmtpTransportOptions, type ResolvedEmailConfig } from "../../../../../smtp-shared";

/**
 * "SMTP Transport Factory" (item 3) — the one place that calls
 * `nodemailer.createTransport(...)`. Delegates the actual options shape to
 * `buildSmtpTransportOptions()` (`../../../../../smtp-shared.ts`) so this factory and
 * `email.service.ts`'s own transporter build the exact same way — no SMTP
 * options object is duplicated between the two.
 */
export class SmtpTransportFactory {
  create(config: ResolvedEmailConfig): Transporter {
    return nodemailer.createTransport(buildSmtpTransportOptions(config));
  }
}
