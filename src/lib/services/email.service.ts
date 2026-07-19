import nodemailer, { Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

interface ResolvedEmailConfig {
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  senderEmail: string;
  appPassword: string;
}

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendMailResult {
  success: boolean;
  message: string;
}

function mapSmtpError(error: unknown): string {
  const err = error as { code?: string; responseCode?: number };

  switch (err?.code) {
    case "EAUTH":
      return "Authentication failed. Check the sender email and app password.";
    case "ENOTFOUND":
    case "EDNS":
      return "Invalid SMTP host. Please check the host address.";
    case "ECONNECTION":
    case "ECONNREFUSED":
      return "Could not connect to the SMTP server. Check the host and port.";
    case "ETIMEDOUT":
    case "ESOCKET":
      return "Connection to the SMTP server timed out.";
    case "EENVELOPE":
      return "Invalid sender or recipient email address.";
    case "EMESSAGE":
      return "SMTP server rejected the message.";
    default:
      break;
  }

  if (err?.responseCode && err.responseCode >= 500) {
    return "SMTP server rejected the request.";
  }

  return "Failed to send email. Please verify your SMTP configuration.";
}

async function logAttempt(status: "SUCCESS" | "FAILED", details: string) {
  try {
    await prisma.systemAudit.create({
      data: { action: "EMAIL_SEND", status, details },
    });
  } catch {
    // Logging must never break the send flow.
  }
}

class EmailService {
  private transporter: Transporter | null = null;
  private fingerprint: string | null = null;

  private async resolveConfig(): Promise<ResolvedEmailConfig | null> {
    const record = await prisma.emailConfig.findUnique({ where: { id: "global" } });
    if (!record || !record.smtpHost || !record.senderEmail || !record.appPasswordEncrypted) {
      return null;
    }

    let appPassword: string;
    try {
      appPassword = decryptSecret(record.appPasswordEncrypted);
    } catch {
      console.error(`[EmailService] ${new Date().toISOString()} - Failed to decrypt stored SMTP credentials`);
      return null;
    }

    return {
      smtpHost: record.smtpHost,
      smtpPort: record.smtpPort,
      secure: record.secure,
      senderEmail: record.senderEmail,
      appPassword,
    };
  }

  private getTransporter(config: ResolvedEmailConfig): Transporter {
    const fingerprint = `${config.smtpHost}:${config.smtpPort}:${config.secure}:${config.senderEmail}:${config.appPassword}`;

    if (this.transporter && this.fingerprint === fingerprint) {
      return this.transporter;
    }

    this.transporter = nodemailer.createTransport({
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
    });
    this.fingerprint = fingerprint;

    return this.transporter;
  }

  /**
   * Sends an email using the admin-configured SMTP settings. Callers only
   * provide content — SMTP config, transporter reuse, and error mapping are
   * handled here so future modules never touch SMTP details directly.
   */
  async sendMail(params: SendMailParams): Promise<SendMailResult> {
    const config = await this.resolveConfig();
    if (!config) {
      await logAttempt("FAILED", `No SMTP configuration set. Attempted send to ${params.to}.`);
      return { success: false, message: "Email is not configured yet. Please set up SMTP in System Control." };
    }

    try {
      const transporter = this.getTransporter(config);
      await transporter.sendMail({
        from: config.senderEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      await logAttempt("SUCCESS", `Email sent to ${params.to} ("${params.subject}").`);
      return { success: true, message: "Email sent successfully" };
    } catch (error) {
      // Force transporter recreation on the next attempt in case the connection is stale.
      this.transporter = null;
      this.fingerprint = null;

      const reason = mapSmtpError(error);
      await logAttempt("FAILED", `Failed to send to ${params.to} ("${params.subject}"): ${reason}`);
      return { success: false, message: reason };
    }
  }
}

export const emailService = new EmailService();
