import nodemailer, { Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";
import { resolveEmailConfig } from "@/lib/email-config";
import { buildSmtpTransportOptions, mapSmtpError, type ResolvedEmailConfig } from "@/lib/smtp-shared";

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

  private getTransporter(config: ResolvedEmailConfig): Transporter {
    const fingerprint = `${config.smtpHost}:${config.smtpPort}:${config.secure}:${config.senderEmail}:${config.appPassword}`;

    if (this.transporter && this.fingerprint === fingerprint) {
      return this.transporter;
    }

    this.transporter = nodemailer.createTransport(buildSmtpTransportOptions(config));
    this.fingerprint = fingerprint;

    return this.transporter;
  }

  /**
   * Sends an email using the admin-configured SMTP settings. Callers only
   * provide content — SMTP config, transporter reuse, and error mapping are
   * handled here so future modules never touch SMTP details directly.
   */
  async sendMail(params: SendMailParams): Promise<SendMailResult> {
    const config = await resolveEmailConfig();
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
