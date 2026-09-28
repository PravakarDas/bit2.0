import type { Transporter } from "nodemailer";
import type { ResolvedEmailConfig } from "../../../../../smtp-shared";
import { SmtpTransportFactory } from "./smtp-transport-factory";

type CreateTransporter = (config: ResolvedEmailConfig) => Transporter;

/**
 * "SMTP Connection Manager" (item 2) — owns exactly one cached
 * `Transporter` at a time, keyed by a fingerprint of the resolved config
 * (same reuse-until-config-changes strategy `email.service.ts` already
 * used — extracted here as its own independent instance, not shared
 * mutable state with that class, since the two serve different call paths
 * with different lifecycles).
 *
 * `createTransporter` is injected (defaulting to the real
 * `SmtpTransportFactory`) purely so tests can substitute a fake transporter
 * with no real `nodemailer`/network involved — the same `IClock`/
 * `IQueueLogger`-style dependency-injection convention used throughout this
 * engine.
 */
export class SmtpConnectionManager {
  private transporter: Transporter | null = null;
  private fingerprint: string | null = null;

  constructor(
    private readonly createTransporter: CreateTransporter = (config) => new SmtpTransportFactory().create(config)
  ) {}

  /** Connection reuse: returns the cached transporter if the config hasn't changed since it was created. */
  getTransporter(config: ResolvedEmailConfig): Transporter {
    const fingerprint = SmtpConnectionManager.fingerprintOf(config);
    if (this.transporter && this.fingerprint === fingerprint) {
      return this.transporter;
    }

    this.invalidate();
    this.transporter = this.createTransporter(config);
    this.fingerprint = fingerprint;
    return this.transporter;
  }

  /** Health validation — opens a real SMTP handshake (via nodemailer's `verify()`) without sending a message. Never throws; a failed probe simply means "not healthy." */
  async verify(config: ResolvedEmailConfig): Promise<boolean> {
    try {
      await this.getTransporter(config).verify();
      return true;
    } catch {
      return false;
    }
  }

  /** Forces the next `getTransporter()` call to build a fresh connection — called after a failed send, mirroring `email.service.ts`'s existing "the connection might be stale" recovery behavior. */
  invalidate(): void {
    this.transporter?.close();
    this.transporter = null;
    this.fingerprint = null;
  }

  /** Graceful shutdown (`ProviderLifecycle.shutdown()`) — closes any pooled/idle connection. Safe to call even when nothing is connected. */
  async close(): Promise<void> {
    this.invalidate();
  }

  private static fingerprintOf(config: ResolvedEmailConfig): string {
    return `${config.smtpHost}:${config.smtpPort}:${config.secure}:${config.senderEmail}:${config.appPassword}`;
  }
}
