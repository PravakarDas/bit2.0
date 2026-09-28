import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { ResolvedEmailConfig } from "@/lib/smtp-shared";

function getDefaults() {
  return {
    provider: "GMAIL",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    secure: false,
    senderEmail: "",
    appPasswordEncrypted: "",
  };
}

export async function getOrCreateEmailConfig() {
  return prisma.emailConfig.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      ...getDefaults(),
    },
  });
}

/**
 * Reads the `EmailConfig` singleton row and decrypts its app password into a
 * ready-to-use `ResolvedEmailConfig` — moved here from `email.service.ts`'s
 * former private `resolveConfig()` method (Phase 7 of the Notification
 * Engine) so both `EmailService` (System Control's test-email feature) and
 * the new `SmtpDeliveryProvider` resolve SMTP config the exact same way,
 * instead of one duplicating the other. Behavior is unchanged from the
 * original: returns `null` if the row is missing required fields, and
 * `null` (logging to console) if the stored password fails to decrypt.
 */
export async function resolveEmailConfig(): Promise<ResolvedEmailConfig | null> {
  const record = await prisma.emailConfig.findUnique({ where: { id: "global" } });
  if (!record || !record.smtpHost || !record.senderEmail || !record.appPasswordEncrypted) {
    return null;
  }

  let appPassword: string;
  try {
    appPassword = decryptSecret(record.appPasswordEncrypted);
  } catch {
    console.error(`[resolveEmailConfig] ${new Date().toISOString()} - Failed to decrypt stored SMTP credentials`);
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
