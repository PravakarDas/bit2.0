import crypto from "crypto";

/**
 * Pure OAuth 2.0 flow logic (state generation/validation, authorization URL,
 * redirect URI construction) — no Prisma, no `next/headers`, no `googleapis`
 * network calls, so it's testable by the dependency-free `node --test`
 * harness. The actual cookie read/write and the code-for-token exchange
 * live in the callback route and `google-drive.service.ts` respectively,
 * since those need Next.js request/response APIs and real network calls.
 */

/**
 * Reuses `DRIVE_SCOPES` (see `google-drive-client.ts`) plus the minimum
 * additional scopes needed to identify which Google account was connected:
 * `openid` + `userinfo.email` — deliberately NOT a Gmail API scope, and
 * nothing broader than "read the connected account's own email address."
 */
export const GOOGLE_OAUTH_SCOPES = ["https://www.googleapis.com/auth/drive", "openid", "https://www.googleapis.com/auth/userinfo.email"];

export const OAUTH_STATE_COOKIE_NAME = "gdrive_oauth_state";

/** The state cookie's `maxAge` — a short-lived window is what makes an unused/old authorization attempt naturally rejected as "expired" once the cookie is gone. */
export const OAUTH_STATE_MAX_AGE_SECONDS = 600;

/** Cryptographically secure, unguessable per-attempt CSRF token. */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Constant-time comparison so a mismatched/forged state can't be detected
 * faster than a matching one via timing. Both "missing cookie" and "missing
 * query param" (covers Google redirecting back with no `state` at all) are
 * treated as invalid, not as a crash.
 */
export function isValidOAuthState(cookieValue: string | undefined | null, receivedState: string | undefined | null): boolean {
  if (!cookieValue || !receivedState) {
    return false;
  }
  const cookieBuf = Buffer.from(cookieValue);
  const receivedBuf = Buffer.from(receivedState);
  if (cookieBuf.length !== receivedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(cookieBuf, receivedBuf);
}

/** Strips any trailing slash from the configured app origin before appending the callback path, so `NEXT_PUBLIC_APP_URL` can be entered with or without one. */
export function buildGoogleDriveOAuthRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/google-drive/oauth/callback`;
}

export interface BuildAuthorizationUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
}

/**
 * `access_type=offline` + `prompt=consent` together are what make Google
 * reliably return a `refresh_token` on every connect/reconnect — not just
 * the very first authorization a Google account ever grants this app.
 * Without `prompt=consent`, a user reconnecting after a prior connection
 * (even one that was later disconnected app-side) may get no `refresh_token`
 * back at all, since Google only issues one during an actual consent grant.
 */
export function buildGoogleAuthorizationUrl(input: BuildAuthorizationUrlInput): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_OAUTH_SCOPES.join(" "),
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
