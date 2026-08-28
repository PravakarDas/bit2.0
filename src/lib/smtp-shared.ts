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
    // Forces the underlying socket to connect over IPv4. Without this,
    // Node's default DNS resolution can hand nodemailer an IPv6 address
    // first (e.g. smtp.gmail.com resolves both A and AAAA records) — on a
    // host/network with no IPv6 route, that connection attempt fails
    // (ENETUNREACH) with no automatic fallback to the IPv4 address, and
    // surfaces as the same generic connection error every other socket
    // failure produces. Gmail (and every provider this project targets)
    // fully supports IPv4, so this removes an entire class of
    // environment-dependent failures with no downside.
    family: 4,
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
  | "TLS_MISMATCH"
  | "ENVELOPE"
  | "MESSAGE"
  | "SERVER_REJECTED"
  | "UNKNOWN";

/**
 * OpenSSL's stable, version-independent error string for "a TLS ClientHello
 * was sent to a server that replied in plaintext" — the exact signature of a
 * `secure`/port mismatch (e.g. `secure: true` on STARTTLS port 587, or
 * `secure: false` on implicit-TLS port 465). Nodemailer reports this under
 * the same generic `code: "ESOCKET"` as an actual dead/unreachable
 * connection, so without this check a config mismatch and a real timeout are
 * indistinguishable — this was found and confirmed against a real Gmail
 * connection while diagnosing a "Connection timed out" report that was
 * actually this exact mismatch.
 */
function isTlsProtocolMismatch(err: { message?: string } | null | undefined): boolean {
  return /wrong version number/i.test(err?.message ?? "");
}

export function classifySmtpErrorCategory(error: unknown): SmtpErrorCategory {
  const err = error as { code?: string; responseCode?: number; message?: string } | null | undefined;

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
      return "TIMEOUT";
    case "ESOCKET":
      return isTlsProtocolMismatch(err) ? "TLS_MISMATCH" : "TIMEOUT";
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

/**
 * Guards against a real, confirmed production mistake: saving the sender
 * email address itself into the password/API-key field (most likely a
 * copy-paste or browser-autofill slip on the adjacent form field). Saving
 * this silently "succeeds" — nothing about it is structurally invalid — and
 * only fails much later, opaquely, when Gmail (or any provider) rejects the
 * real SMTP AUTH attempt. Case-insensitive because email addresses are
 * matched case-insensitively by every provider that matters here.
 */
export function looksLikeSenderEmailMistake(password: string, senderEmail: string): boolean {
  const trimmedPassword = password.trim();
  const trimmedEmail = senderEmail.trim();
  if (!trimmedPassword || !trimmedEmail) return false;
  return trimmedPassword.toLowerCase() === trimmedEmail.toLowerCase();
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
    case "TLS_MISMATCH":
      return 'SSL/TLS handshake failed. The "Secure (SSL/TLS)" setting likely doesn\'t match the port — turn it OFF for port 587 (STARTTLS) or ON for port 465 (implicit TLS).';
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
