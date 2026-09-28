import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { normalizePrivateKeyLineBreaks } from "@/lib/google-drive-config";
import { buildGoogleDriveOAuthRedirectUri } from "@/lib/google-drive-oauth";
import { GoogleDriveService, mapDriveError, type ResolvedGoogleDriveConfig } from "./google-drive-client";

export type { ResolvedGoogleDriveConfig, DriveConnectionTestResult } from "./google-drive-client";

function getDefaults() {
  return {
    authenticationMethod: "SERVICE_ACCOUNT" as const,
    serviceAccountEmail: "",
    privateKeyEncrypted: "",
    oauthClientId: "",
    oauthClientSecretEncrypted: "",
    oauthRefreshTokenEncrypted: "",
    oauthConnectedEmail: null,
    sharedDriveId: null,
    rootFolderId: "",
    rootFolderName: "Payroll",
  };
}

/**
 * Reads the app's public origin from `NEXT_PUBLIC_APP_URL` (no existing
 * base-URL convention was found elsewhere in this codebase — see
 * GoogleDriveOAuthStage1Report.md). Returns `null` when unset so callers
 * (the "Connect" action, the System Control UI) can show a clear
 * configuration error instead of building a broken redirect URI.
 */
export function getGoogleDriveOAuthRedirectUri(): string | null {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return null;
  }
  return buildGoogleDriveOAuthRedirectUri(appUrl);
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
 * Reads the `GoogleDriveConfig` singleton row and decrypts whichever
 * secret(s) apply to the stored `authenticationMethod` into a ready-to-use,
 * discriminated-union config — the exact same shape as `resolveEmailConfig()`
 * in `@/lib/email-config.ts`. Returns `null` if required fields for that mode
 * are missing or a stored secret fails to decrypt (never throws for a
 * missing/bad config, matching that file's own behavior). Callers
 * (`GoogleDriveService`, payroll) never need to know which branch fired.
 */
export async function resolveGoogleDriveConfig(): Promise<ResolvedGoogleDriveConfig | null> {
  const record = await prisma.googleDriveConfig.findUnique({ where: { id: "global" } });
  if (!record || !record.rootFolderId) {
    return null;
  }

  if (record.authenticationMethod === "OAUTH2") {
    if (!record.oauthClientId || !record.oauthClientSecretEncrypted || !record.oauthRefreshTokenEncrypted) {
      return null;
    }

    const redirectUri = getGoogleDriveOAuthRedirectUri();
    if (!redirectUri) {
      console.error(`[resolveGoogleDriveConfig] ${new Date().toISOString()} - NEXT_PUBLIC_APP_URL is not set; cannot build the OAuth redirect URI`);
      return null;
    }

    let clientSecret: string;
    let refreshToken: string;
    try {
      clientSecret = decryptSecret(record.oauthClientSecretEncrypted);
      refreshToken = decryptSecret(record.oauthRefreshTokenEncrypted);
    } catch {
      console.error(`[resolveGoogleDriveConfig] ${new Date().toISOString()} - Failed to decrypt stored Google Drive OAuth credentials`);
      return null;
    }

    return {
      authMethod: "OAUTH2",
      clientId: record.oauthClientId,
      clientSecret,
      refreshToken,
      redirectUri,
      sharedDriveId: record.sharedDriveId,
      rootFolderId: record.rootFolderId,
      rootFolderName: record.rootFolderName,
    };
  }

  if (!record.serviceAccountEmail || !record.privateKeyEncrypted) {
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
    authMethod: "SERVICE_ACCOUNT",
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

export interface ExchangeGoogleOAuthCodeInput {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}

export interface ExchangeGoogleOAuthCodeResult {
  refreshToken: string;
  connectedEmail: string | null;
}

/**
 * Exchanges an authorization `code` for tokens and requires a `refresh_token`
 * to come back — if Google omits one (it only issues a fresh one during an
 * actual consent grant; `prompt=consent` on the authorize URL is what makes
 * this reliable, but a defensive check here still fails clearly instead of
 * silently storing an unusable connection). Never logs the code, the
 * exchanged tokens, or the client secret — only ever a `mapDriveError`-safe
 * message on failure.
 */
/**
 * Isolated so the call to `getToken(code)` (a single string argument) is
 * resolved against its `Promise<GetTokenResponse>` overload right at the
 * call site — extracting that overload's return type indirectly (e.g. via
 * `ReturnType<typeof oauth2Client.getToken>`) instead picks
 * `google-auth-library`'s other, callback-based overload and infers `void`.
 */
async function getOAuthTokenResponse(oauth2Client: InstanceType<typeof google.auth.OAuth2>, code: string) {
  try {
    return await oauth2Client.getToken(code);
  } catch (error) {
    throw new Error(mapDriveError(error));
  }
}

export async function exchangeGoogleOAuthCode(input: ExchangeGoogleOAuthCodeInput): Promise<ExchangeGoogleOAuthCodeResult> {
  const oauth2Client = new google.auth.OAuth2(input.clientId, input.clientSecret, input.redirectUri);

  const tokenResponse = await getOAuthTokenResponse(oauth2Client, input.code);
  const tokens = tokenResponse.tokens;

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not grant a refresh token for this connection. In your Google Account's third-party access settings (myaccount.google.com/permissions), remove this app's existing access, then try connecting again.",
    );
  }

  const connectedEmail = await resolveConnectedEmail(oauth2Client, tokens, input.clientId);

  return { refreshToken: tokens.refresh_token, connectedEmail };
}

/**
 * Prefers the signed `id_token` (present because the authorization URL
 * requests the `openid` scope) — verified against Google's own certs and
 * this app's `clientId` as audience, so the email can't be spoofed by a
 * tampered response. Falls back to the OAuth2 v2 `userinfo` endpoint (using
 * the just-issued access token) only if no `id_token` came back, so a
 * missing email never fails the whole connection.
 */
async function resolveConnectedEmail(
  oauth2Client: InstanceType<typeof google.auth.OAuth2>,
  tokens: { id_token?: string | null; access_token?: string | null },
  clientId: string,
): Promise<string | null> {
  if (tokens.id_token) {
    try {
      const ticket = await oauth2Client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
      const email = ticket.getPayload()?.email;
      if (email) {
        return email;
      }
    } catch {
      // Falls through to the userinfo lookup below.
    }
  }

  if (tokens.access_token) {
    try {
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
      const { data } = await oauth2.userinfo.get();
      return data.email ?? null;
    } catch {
      return null;
    }
  }

  return null;
}

export interface SaveGoogleDriveOAuthConnectionInput {
  refreshToken: string;
  connectedEmail: string | null;
  updatedById: string;
  updatedByEmail: string;
  updatedByRole: string;
}

/** Persists the result of a successful OAuth exchange — refresh token encrypted, never the access token. Called only from the callback route. */
export async function saveGoogleDriveOAuthConnection(input: SaveGoogleDriveOAuthConnectionInput): Promise<void> {
  await prisma.googleDriveConfig.update({
    where: { id: "global" },
    data: {
      oauthRefreshTokenEncrypted: encryptSecret(input.refreshToken),
      oauthConnectedEmail: input.connectedEmail,
      updatedById: input.updatedById,
      updatedByEmail: input.updatedByEmail,
      updatedByRole: input.updatedByRole,
    },
  });
}

/**
 * Clears the stored OAuth connection (refresh token + connected email) —
 * never touches `rootFolderId`/`rootFolderName`/`sharedDriveId`, and never
 * deletes anything in the user's actual Google Drive. `oauthClientId`/
 * `oauthClientSecretEncrypted` are deliberately left in place so
 * "Reconnect" doesn't require retyping them.
 *
 * Best-effort revokes the token with Google first (per Google's OAuth2
 * revoke endpoint); a revoke failure (network error, already-revoked token,
 * Google outage) is swallowed — disconnecting the app's own stored
 * connection must always succeed even if Google's revoke call doesn't.
 */
export async function disconnectGoogleDriveOAuth(actor: { updatedById: string; updatedByEmail: string; updatedByRole: string }): Promise<void> {
  const record = await prisma.googleDriveConfig.findUnique({ where: { id: "global" } });

  if (record?.oauthRefreshTokenEncrypted) {
    try {
      const refreshToken = decryptSecret(record.oauthRefreshTokenEncrypted);
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      });
    } catch (error) {
      console.error(`[disconnectGoogleDriveOAuth] ${new Date().toISOString()} - Google token revocation call failed (continuing to clear local state)`, error instanceof Error ? error.message : error);
    }
  }

  await prisma.googleDriveConfig.update({
    where: { id: "global" },
    data: {
      oauthRefreshTokenEncrypted: "",
      oauthConnectedEmail: null,
      updatedById: actor.updatedById,
      updatedByEmail: actor.updatedByEmail,
      updatedByRole: actor.updatedByRole,
    },
  });
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
