"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getDbUser } from "./user.actions";
import { encryptSecret } from "@/lib/crypto";
import { getOrCreateEmailConfig } from "@/lib/email-config";
import { emailService } from "@/lib/services/email.service";
import { looksLikeSenderEmailMistake } from "@/lib/smtp-shared";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function canManageEmailConfig(user: NonNullable<Awaited<ReturnType<typeof getDbUser>>>) {
  return user.role === "SUPERADMIN" || user.role === "HR";
}

type UpdatePayload = {
  provider: string;
  smtpHost: string;
  smtpPort: number;
  secure: boolean;
  senderEmail: string;
  appPassword?: string;
};

export async function getEmailConfig() {
  const user = await getDbUser();
  if (!user || !canManageEmailConfig(user)) {
    throw new Error("Unauthorized");
  }

  const config = await getOrCreateEmailConfig();

  return {
    provider: config.provider,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    secure: config.secure,
    senderEmail: config.senderEmail,
    hasAppPassword: !!config.appPasswordEncrypted,
    updatedAt: config.updatedAt,
  };
}

export async function updateEmailConfig(payload: UpdatePayload) {
  const user = await getDbUser();
  if (!user || !canManageEmailConfig(user)) {
    throw new Error("Unauthorized");
  }

  const smtpHost = (payload.smtpHost || "").trim();
  const senderEmail = (payload.senderEmail || "").trim();
  const provider = (payload.provider || "CUSTOM").trim().toUpperCase();
  const smtpPort = Number(payload.smtpPort);
  const newPassword = (payload.appPassword || "").trim();

  const errors: string[] = [];

  if (!smtpHost) errors.push("SMTP Host is required.");
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    errors.push("SMTP Port must be a whole number between 1 and 65535.");
  }
  if (!senderEmail || !EMAIL_REGEX.test(senderEmail)) {
    errors.push("Sender Email must be a valid email address.");
  }
  if (newPassword && senderEmail && looksLikeSenderEmailMistake(newPassword, senderEmail)) {
    errors.push(
      "The password/API key must not be the same as the Sender Email Address. Enter your actual SMTP password or app password (e.g. a Google App Password), not the email address."
    );
  }

  const current = await getOrCreateEmailConfig();
  if (!newPassword && !current.appPasswordEncrypted) {
    errors.push("Google App Password is required.");
  }

  if (errors.length > 0) {
    return { success: false, message: errors.join(" ") };
  }

  const data: {
    provider: string;
    smtpHost: string;
    smtpPort: number;
    secure: boolean;
    senderEmail: string;
    updatedById: string;
    updatedByEmail: string | null;
    updatedByRole: string;
    appPasswordEncrypted?: string;
  } = {
    provider,
    smtpHost,
    smtpPort,
    secure: !!payload.secure,
    senderEmail,
    updatedById: user.id,
    updatedByEmail: user.email,
    updatedByRole: user.role,
  };

  if (newPassword) {
    data.appPasswordEncrypted = encryptSecret(newPassword);
  }

  await prisma.emailConfig.update({
    where: { id: "global" },
    data,
  });

  revalidatePath("/admin/system-control");

  return { success: true, message: "Email configuration saved successfully." };
}

export async function sendTestEmail(receiverEmail: string) {
  const user = await getDbUser();
  if (!user || !canManageEmailConfig(user)) {
    throw new Error("Unauthorized");
  }

  const trimmed = (receiverEmail || "").trim();
  if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
    return { success: false, message: "Please enter a valid receiver email address." };
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString();

  const html = `
    <p>Hello,</p>
    <p>This is a test email from the HRM Email Notification System.</p>
    <p>Your email configuration has been successfully verified.</p>
    <p><strong>Date:</strong> ${dateStr}<br/><strong>Time:</strong> ${timeStr}</p>
    <p>If you received this email, your SMTP configuration is working correctly.</p>
    <p>Regards,<br/>HRM System</p>
  `.trim();

  const text = [
    "Hello,",
    "",
    "This is a test email from the HRM Email Notification System.",
    "Your email configuration has been successfully verified.",
    "",
    `Date: ${dateStr}`,
    `Time: ${timeStr}`,
    "",
    "If you received this email, your SMTP configuration is working correctly.",
    "",
    "Regards,",
    "HRM System",
  ].join("\n");

  return emailService.sendMail({
    to: trimmed,
    subject: "Test Email from HRM System",
    html,
    text,
  });
}
