import { encryptSecret } from "./crypto";

/**
 * Normalizes a private key whose line breaks are literal `\n`/`\r\n`
 * ESCAPE SEQUENCES (the two characters backslash + "n") instead of real
 * newline bytes — the single reproducible root cause of Node's
 * `error:1E08010C:DECODER routines::unsupported` when handing the key to
 * `google.auth.JWT` (confirmed by direct reproduction against `googleapis`:
 * a key with real newlines always parses; the identical key with literal
 * `\n` text always fails with exactly this error).
 *
 * This is the well-known "pasted the raw JSON `private_key` field verbatim"
 * mistake: a service-account JSON key file necessarily stores its PEM with
 * `\n` escapes (JSON strings cannot contain a literal newline byte) —
 * `JSON.parse` un-escapes that automatically, but pasting the field's raw
 * text (quotes and escapes included) instead of the already-unescaped
 * value skips that step.
 *
 * Deliberately conservative: if the input already contains ANY real newline
 * character, it is assumed to already be correctly formatted and is
 * returned completely untouched — this function only ever fires for a
 * single-line string, so a correctly multi-line-pasted key can never be
 * altered by it.
 */
export function normalizePrivateKeyLineBreaks(key: string): string {
  if (key.includes("\n")) {
    return key;
  }
  return key.replace(/\\r\\n|\\n/g, "\n");
}

/**
 * Pure logic extracted from `google-drive-config.actions.ts` — that file is
 * `"use server"` and imports `@/lib/prisma`, so it (like every Server
 * Action in this codebase) cannot be exercised by the dependency-free
 * `node --test` harness. Everything here has zero Prisma/Clerk dependency
 * and mirrors the equivalent inline logic already used by
 * `email-config.actions.ts` — same authorization rule, same "only encrypt/
 * overwrite a secret when a new one is actually submitted" rule, same
 * "never return the secret itself, only whether one exists" masking rule.
 */

export interface GoogleDriveConfigActor {
  role: "SUPERADMIN" | "HR" | "EMPLOYEE";
}

/** Matches `canManageEmailConfig` in `email-config.actions.ts` exactly — same rule, per this feature's explicit requirement. */
export function canManageGoogleDriveConfig(user: GoogleDriveConfigActor | null | undefined): user is GoogleDriveConfigActor {
  return !!user && (user.role === "SUPERADMIN" || user.role === "HR");
}

export interface GoogleDriveConfigRecord {
  serviceAccountEmail: string;
  privateKeyEncrypted: string;
  sharedDriveId: string | null;
  rootFolderId: string;
  rootFolderName: string;
  updatedAt: Date;
}

export interface GoogleDriveConfigView {
  serviceAccountEmail: string;
  sharedDriveId: string | null;
  rootFolderId: string;
  rootFolderName: string;
  hasPrivateKey: boolean;
  updatedAt: Date;
}

/** Masks the stored record for the browser — the encrypted (or plaintext) private key is never included, only whether one is set. */
export function maskGoogleDriveConfig(record: GoogleDriveConfigRecord): GoogleDriveConfigView {
  return {
    serviceAccountEmail: record.serviceAccountEmail,
    sharedDriveId: record.sharedDriveId,
    rootFolderId: record.rootFolderId,
    rootFolderName: record.rootFolderName,
    hasPrivateKey: !!record.privateKeyEncrypted,
    updatedAt: record.updatedAt,
  };
}

export interface GoogleDriveConfigUpdateInput {
  serviceAccountEmail: string;
  sharedDriveId: string | null;
  rootFolderId: string;
  rootFolderName: string;
  /** Plaintext, submitted from the form. Empty/undefined means "keep the existing key unchanged." */
  privateKey?: string;
}

export interface GoogleDriveConfigUpdateData {
  serviceAccountEmail: string;
  sharedDriveId: string | null;
  rootFolderId: string;
  rootFolderName: string;
  privateKeyEncrypted?: string;
}

/**
 * Builds the Prisma update payload. `privateKeyEncrypted` is only present on
 * the returned object when a new plaintext key was actually submitted —
 * mirrors `updateEmailConfig`'s exact `if (newPassword) data.appPasswordEncrypted
 * = encryptSecret(newPassword)` rule, so saving the form without retyping
 * the key leaves whatever is already stored untouched.
 */
export function buildGoogleDriveConfigUpdateData(input: GoogleDriveConfigUpdateInput): GoogleDriveConfigUpdateData {
  const data: GoogleDriveConfigUpdateData = {
    serviceAccountEmail: input.serviceAccountEmail,
    sharedDriveId: input.sharedDriveId,
    rootFolderId: input.rootFolderId,
    rootFolderName: input.rootFolderName,
  };

  const trimmedKey = input.privateKey?.trim();
  if (trimmedKey) {
    data.privateKeyEncrypted = encryptSecret(normalizePrivateKeyLineBreaks(trimmedKey));
  }

  return data;
}

export interface GoogleDriveConfigValidationInput {
  serviceAccountEmail: string;
  rootFolderId: string;
  privateKey?: string;
  hasExistingPrivateKey: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateGoogleDriveConfigInput(input: GoogleDriveConfigValidationInput): string[] {
  const errors: string[] = [];

  if (!input.serviceAccountEmail.trim() || !EMAIL_REGEX.test(input.serviceAccountEmail.trim())) {
    errors.push("Service Account Email must be a valid email address.");
  }
  if (!input.rootFolderId.trim()) {
    errors.push("Root Folder ID is required.");
  }
  if (!input.privateKey?.trim() && !input.hasExistingPrivateKey) {
    errors.push("Service Account Private Key is required.");
  }

  return errors;
}
