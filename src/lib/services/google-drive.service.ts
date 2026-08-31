import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { normalizePrivateKeyLineBreaks } from "@/lib/google-drive-config";
import { GoogleDriveService, type ResolvedGoogleDriveConfig } from "./google-drive-client";

export type { ResolvedGoogleDriveConfig, DriveConnectionTestResult } from "./google-drive-client";

function getDefaults() {
  return {
    serviceAccountEmail: "",
    privateKeyEncrypted: "",
    sharedDriveId: null,
    rootFolderId: "",
    rootFolderName: "Payroll",
  };
}

export async function getOrCreateGoogleDriveConfig() {
  return prisma.googleDriveConfig.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      ...getDefaults(),
    },
  });
}

/**
 * Reads the `GoogleDriveConfig` singleton row and decrypts its private key
 * into a ready-to-use config — the exact same shape as `resolveEmailConfig()`
 * in `@/lib/email-config.ts`. Returns `null` if required fields are missing
 * or the stored key fails to decrypt (never throws for a missing/bad
 * config, matching that file's own behavior).
 */
export async function resolveGoogleDriveConfig(): Promise<ResolvedGoogleDriveConfig | null> {
  const record = await prisma.googleDriveConfig.findUnique({ where: { id: "global" } });
  if (!record || !record.serviceAccountEmail || !record.privateKeyEncrypted || !record.rootFolderId) {
    return null;
  }

  let privateKey: string;
  try {
    privateKey = decryptSecret(record.privateKeyEncrypted);
  } catch {
    console.error(`[resolveGoogleDriveConfig] ${new Date().toISOString()} - Failed to decrypt stored Google Drive credentials`);
    return null;
  }

  return {
    serviceAccountEmail: record.serviceAccountEmail,
    // Safety net for a row saved before this normalization existed (or by
    // any other path that stored a literal-\n-escaped key) — see
    // `normalizePrivateKeyLineBreaks`'s own doc comment. A no-op for a
    // correctly-stored, already-multi-line key.
    privateKey: normalizePrivateKeyLineBreaks(privateKey),
    sharedDriveId: record.sharedDriveId,
    rootFolderId: record.rootFolderId,
    rootFolderName: record.rootFolderName,
  };
}

/**
 * Real singleton — the pure `GoogleDriveService` (see `./google-drive-client.ts`)
 * composed with the real, Prisma-backed config resolver above. `testConnection()`
 * here always resolves the currently-saved config itself, matching
 * `sendTestEmail()`'s "uses the saved SMTP configuration" behavior.
 */
class GoogleDriveServiceWithResolution {
  constructor(private readonly inner: GoogleDriveService = new GoogleDriveService()) {}

  async testConnection() {
    const config = await resolveGoogleDriveConfig();
    return this.inner.testConnection(config);
  }
}

export const googleDriveService = new GoogleDriveServiceWithResolution();
