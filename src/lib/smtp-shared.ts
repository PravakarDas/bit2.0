import type { TransportOptions } from "nodemailer";

/**
 * The shape of a fully-resolved, decrypted SMTP configuration — what you get
 * after reading the `EmailConfig` singleton row and decrypting its app
 * password. Deliberately has zero dependency on Prisma or `@/lib/crypto`
 * itself (see `resolveEmailConfig()` in `email-config.ts` for the part that
 * actually touches the database) — this file only shapes an
 * already-resolved value, so it can safely be imported as a *value* from
 * anywhere, including code under `node --test` (which cannot resolve the
 * `@/` path alias `@/lib/prisma` uses — see notification-engine's Queue/
 * Worker/Template/Delivery reports for the same constraint applied to
 * repository interfaces).
 */
export interface ResolvedEmailConfig {
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  senderEmail: string;
  appPassword: string;
}

/**
 * Builds the exact `nodemailer.createTransport(...)` options this project
 * has always used (see `email.service.ts`'s original `getTransporter`) —
 * extracted here, unchanged, so both the existing `EmailService` (System
 * Control's test-email feature) and the new `SmtpDeliveryProvider`
 * (notification-engine's Delivery Framework) build a transporter the exact
 * same way. Nothing about these options changed in this extraction.
 */
export function buildSmtpTransportOptions(config: ResolvedEmailConfig): TransportOptions {
  return {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.secure,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
    auth: {
      user: config.senderEmail,
      pass: config.appPassword,
    },
  } as TransportOptions;
}

/**
 * The 8 buckets nodemailer/SMTP errors fall into for this project's
 * purposes — extracted from `email.service.ts`'s original `mapSmtpError`
 * switch so both the human-readable message (`mapSmtpError`, below,
 * byte-for-byte unchanged output) and the Delivery Framework's
 * retryable/permanent classification (`smtp-retry-classification.ts`) are
 * derived from the exact same categorization instead of two independently
 * maintained switch statements.
 */
export type SmtpErrorCategory =
  | "AUTH"
  | "DNS"
  | "CONNECTION"
  | "TIMEOUT"
  | "ENVELOPE"
  | "MESSAGE"
  | "SERVER_REJECTED"
  | "UNKNOWN";

export function classifySmtpErrorCategory(error: unknown): SmtpErrorCategory {
  const err = error as { code?: string; responseCode?: number } | null | undefined;

  switch (err?.code) {
    case "EAUTH":
      return "AUTH";
    case "ENOTFOUND":
    case "EDNS":
      return "DNS";
    case "ECONNECTION":
    case "ECONNREFUSED":
      return "CONNECTION";
    case "ETIMEDOUT":
    case "ESOCKET":
      return "TIMEOUT";
    case "EENVELOPE":
      return "ENVELOPE";
    case "EMESSAGE":
      return "MESSAGE";
    default:
      break;
  }

  if (err?.responseCode && err.responseCode >= 500) {
    return "SERVER_REJECTED";
  }

  return "UNKNOWN";
}

/** Identical output to the original `email.service.ts` `mapSmtpError` for every input — a pure refactor, not a behavior change. */
export function mapSmtpError(error: unknown): string {
  switch (classifySmtpErrorCategory(error)) {
    case "AUTH":
      return "Authentication failed. Check the sender email and app password.";
    case "DNS":
      return "Invalid SMTP host. Please check the host address.";
    case "CONNECTION":
      return "Could not connect to the SMTP server. Check the host and port.";
    case "TIMEOUT":
      return "Connection to the SMTP server timed out.";
    case "ENVELOPE":
      return "Invalid sender or recipient email address.";
    case "MESSAGE":
      return "SMTP server rejected the message.";
    case "SERVER_REJECTED":
      return "SMTP server rejected the request.";
    case "UNKNOWN":
      return "Failed to send email. Please verify your SMTP configuration.";
  }
}
