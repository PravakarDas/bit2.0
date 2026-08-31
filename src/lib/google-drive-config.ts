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

export type GoogleDriveAuthMethod = "SERVICE_ACCOUNT" | "OAUTH2";

export interface GoogleDriveConfigRecord {
  authenticationMethod: GoogleDriveAuthMethod;
  serviceAccountEmail: string;
  privateKeyEncrypted: string;
  oauthClientId: string;
  oauthClientSecretEncrypted: string;
  oauthRefreshTokenEncrypted: string;
  oauthConnectedEmail: string | null;
  sharedDriveId: string | null;
  rootFolderId: string;
  rootFolderName: string;
  updatedAt: Date;
}

export interface GoogleDriveConfigView {
  authenticationMethod: GoogleDriveAuthMethod;
  serviceAccountEmail: string;
  hasPrivateKey: boolean;
  oauthClientId: string;
  hasOauthClientSecret: boolean;
  /** Whether an OAuth connection is currently established — the UI's "Connected"/"Not Connected" indicator. Never the refresh token itself. */
  hasOauthRefreshToken: boolean;
  oauthConnectedEmail: string | null;
  sharedDriveId: string | null;
  rootFolderId: string;
  rootFolderName: string;
  updatedAt: Date;
}

/** Masks the stored record for the browser — no encrypted or plaintext secret (private key, OAuth client secret, refresh token) is ever included, only whether each is set. */
export function maskGoogleDriveConfig(record: GoogleDriveConfigRecord): GoogleDriveConfigView {
  return {
    authenticationMethod: record.authenticationMethod,
    serviceAccountEmail: record.serviceAccountEmail,
    hasPrivateKey: !!record.privateKeyEncrypted,
    oauthClientId: record.oauthClientId,
    hasOauthClientSecret: !!record.oauthClientSecretEncrypted,
    hasOauthRefreshToken: !!record.oauthRefreshTokenEncrypted,
    oauthConnectedEmail: record.oauthConnectedEmail,
    sharedDriveId: record.sharedDriveId,
    rootFolderId: record.rootFolderId,
    rootFolderName: record.rootFolderName,
    updatedAt: record.updatedAt,
  };
}

export interface GoogleDriveConfigUpdateInput {
  authenticationMethod: GoogleDriveAuthMethod;
  serviceAccountEmail: string;
  sharedDriveId: string | null;
  rootFolderId: string;
  rootFolderName: string;
  /** Plaintext, submitted from the form. Empty/undefined means "keep the existing key unchanged." */
  privateKey?: string;
  oauthClientId?: string;
  /** Plaintext, submitted from the form. Empty/undefined means "keep the existing secret unchanged." Never the refresh token — that is only ever set by the OAuth connect/callback flow, never typed by hand. */
  oauthClientSecret?: string;
}

export interface GoogleDriveConfigUpdateData {
  authenticationMethod: GoogleDriveAuthMethod;
  serviceAccountEmail: string;
  sharedDriveId: string | null;
  rootFolderId: string;
  rootFolderName: string;
  privateKeyEncrypted?: string;
  oauthClientId?: string;
  oauthClientSecretEncrypted?: string;
}

/**
 * Builds the Prisma update payload for the general "Save" form (both auth
 * modes' non-connection fields). `privateKeyEncrypted`/`oauthClientSecretEncrypted`
 * are only present on the returned object when a new plaintext value was
 * actually submitted — mirrors `updateEmailConfig`'s exact `if (newPassword)
 * data.appPasswordEncrypted = encryptSecret(newPassword)` rule, so saving the
 * form without retyping a secret leaves whatever is already stored untouched.
 *
 * Deliberately has no `oauthRefreshTokenEncrypted`/`oauthConnectedEmail`
 * fields at all — those are set only by the OAuth connect/callback flow
 * (`beginGoogleDriveOAuth`/the callback route), never by hand-typing a token
 * into this form.
 */
export function buildGoogleDriveConfigUpdateData(input: GoogleDriveConfigUpdateInput): GoogleDriveConfigUpdateData {
  const data: GoogleDriveConfigUpdateData = {
    authenticationMethod: input.authenticationMethod,
    serviceAccountEmail: input.serviceAccountEmail,
    sharedDriveId: input.sharedDriveId,
    rootFolderId: input.rootFolderId,
    rootFolderName: input.rootFolderName,
  };

  const trimmedKey = input.privateKey?.trim();
  if (trimmedKey) {
    data.privateKeyEncrypted = encryptSecret(normalizePrivateKeyLineBreaks(trimmedKey));
  }

  if (input.oauthClientId !== undefined) {
    data.oauthClientId = input.oauthClientId.trim();
  }

  const trimmedClientSecret = input.oauthClientSecret?.trim();
  if (trimmedClientSecret) {
    data.oauthClientSecretEncrypted = encryptSecret(trimmedClientSecret);
  }

  return data;
}

export interface GoogleDriveConfigValidationInput {
  authenticationMethod: GoogleDriveAuthMethod;
  serviceAccountEmail: string;
  rootFolderId: string;
  privateKey?: string;
  hasExistingPrivateKey: boolean;
  oauthClientId?: string;
  oauthClientSecret?: string;
  hasExistingOauthClientSecret?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only the fields relevant to the selected `authenticationMethod` are validated — a SERVICE_ACCOUNT save doesn't require OAuth fields to be filled in, and vice versa. */
export function validateGoogleDriveConfigInput(input: GoogleDriveConfigValidationInput): string[] {
  const errors: string[] = [];

  if (!input.rootFolderId.trim()) {
    errors.push("Root Folder ID is required.");
  }

  if (input.authenticationMethod === "OAUTH2") {
    if (!input.oauthClientId?.trim()) {
      errors.push("OAuth Client ID is required.");
    }
    if (!input.oauthClientSecret?.trim() && !input.hasExistingOauthClientSecret) {
      errors.push("OAuth Client Secret is required.");
    }
  } else {
    if (!input.serviceAccountEmail.trim() || !EMAIL_REGEX.test(input.serviceAccountEmail.trim())) {
      errors.push("Service Account Email must be a valid email address.");
    }
    if (!input.privateKey?.trim() && !input.hasExistingPrivateKey) {
      errors.push("Service Account Private Key is required.");
    }
  }

  return errors;
}
