import type { Transporter } from "nodemailer";

export type FakeTransporterMode = "success" | "throw-on-send" | "throw-on-verify";

/**
 * A fully in-memory stand-in for a `nodemailer.Transporter` — no real
 * network, no real `nodemailer` transport involved. Implements only the
 * three methods this module's code actually calls (`sendMail`, `verify`,
 * `close`); cast to `Transporter` since nodemailer's real interface is much
 * larger (connection pooling internals, event emitter surface, etc.) that
 * nothing here uses. Standard "mock the slice of a third-party interface
 * you actually call" practice for a library type this wide.
 */
export class FakeTransporter {
  sendMailCalls: unknown[] = [];
  verifyCalls = 0;
  closeCalls = 0;

  constructor(private mode: FakeTransporterMode = "success") {}

  setMode(mode: FakeTransporterMode): void {
    this.mode = mode;
  }

  async sendMail(options: unknown): Promise<{ messageId: string }> {
    this.sendMailCalls.push(options);
    if (this.mode === "throw-on-send") {
      throw Object.assign(new Error("simulated SMTP send failure"), { code: "ECONNECTION" });
    }
    return { messageId: "fake-message-id" };
  }

  async verify(): Promise<true> {
    this.verifyCalls += 1;
    if (this.mode === "throw-on-verify") {
      throw Object.assign(new Error("simulated SMTP verify failure"), { code: "ETIMEDOUT" });
    }
    return true;
  }

  close(): void {
    this.closeCalls += 1;
  }

  asTransporter(): Transporter {
    return this as unknown as Transporter;
  }
}
