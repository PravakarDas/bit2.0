import { prisma } from "@/lib/prisma";

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
