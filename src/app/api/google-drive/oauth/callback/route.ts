import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { getDbUser } from "@/actions/user.actions";
import { canManageGoogleDriveConfig } from "@/lib/google-drive-config";
import { isValidOAuthState, OAUTH_STATE_COOKIE_NAME } from "@/lib/google-drive-oauth";
import { getGoogleDriveOAuthRedirectUri, exchangeGoogleOAuthCode, saveGoogleDriveOAuthConnection } from "@/lib/services/google-drive.service";

/**
 * Google redirects the admin's browser here with a plain top-level GET after
 * the consent screen — this must be a Route Handler, not a Server Action
 * (Google has no way to invoke one). Every branch redirects back to System
 * Control with only a status code in the query string — never a token,
 * secret, or raw error object. See GoogleDriveOAuthPlan.md §"Callback".
 */
const SYSTEM_CONTROL_PATH = "/admin/system-control";

function redirectWithStatus(origin: string, status: "success" | "error", reason?: string, message?: string) {
  const url = new URL(SYSTEM_CONTROL_PATH, origin);
  url.searchParams.set("googleDriveOAuth", status);
  if (reason) {
    url.searchParams.set("reason", reason);
  }
  if (message) {
    url.searchParams.set("message", message);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  // Behind a reverse proxy (Traefik in production) `request.nextUrl.origin`
  // is the container's own bind address (`localhost:3000`), not the public
  // domain — so redirect back via the same configured public origin that
  // the OAuth redirect URI is built from.
  const origin = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : request.nextUrl.origin;
  const searchParams = request.nextUrl.searchParams;

  // Read-then-clear immediately, before any other branch — makes the state
  // cookie strictly one-time-use: a second request replaying the same
  // `state` value (whether from a real retry or an attacker) always fails
  // `isValidOAuthState` below because the cookie is already gone.
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE_NAME)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE_NAME);

  const googleError = searchParams.get("error");
  if (googleError) {
    // Most commonly `access_denied` — the admin declined consent on Google's screen.
    return redirectWithStatus(origin, "error", "access_denied");
  }

  const receivedState = searchParams.get("state");
  if (!isValidOAuthState(cookieState, receivedState)) {
    return redirectWithStatus(origin, "error", "invalid_state");
  }

  // Re-check authorization on the callback itself — never trust that the
  // session which started the flow is still the same, still authenticated,
  // or still privileged by the time Google redirects back.
  const user = await getDbUser();
  if (!user || !canManageGoogleDriveConfig(user)) {
    return redirectWithStatus(origin, "error", "unauthorized");
  }

  const code = searchParams.get("code");
  if (!code) {
    return redirectWithStatus(origin, "error", "missing_code");
  }

  const record = await prisma.googleDriveConfig.findUnique({ where: { id: "global" } });
  if (!record?.oauthClientId || !record.oauthClientSecretEncrypted) {
    return redirectWithStatus(origin, "error", "not_configured");
  }

  const redirectUri = getGoogleDriveOAuthRedirectUri();
  if (!redirectUri) {
    return redirectWithStatus(origin, "error", "not_configured");
  }

  let clientSecret: string;
  try {
    clientSecret = decryptSecret(record.oauthClientSecretEncrypted);
  } catch {
    return redirectWithStatus(origin, "error", "not_configured");
  }

  try {
    const { refreshToken, connectedEmail } = await exchangeGoogleOAuthCode({
      clientId: record.oauthClientId,
      clientSecret,
      redirectUri,
      code,
    });

    // Nothing here — nor anything it calls — ever logs `refreshToken`,
    // `clientSecret`, or the raw `code`.
    await saveGoogleDriveOAuthConnection({
      refreshToken,
      connectedEmail,
      updatedById: user.id,
      updatedByEmail: user.email,
      updatedByRole: user.role,
    });

    return redirectWithStatus(origin, "success");
  } catch (error) {
    // `error.message` here is always a `mapDriveError`-safe string or the
    // fixed "did not grant a refresh token" message from
    // `exchangeGoogleOAuthCode` — never a token, secret, or raw Gaxios body.
    const message = error instanceof Error ? error.message : "Failed to complete the Google Drive connection.";
    console.error(`[google-drive-oauth-callback] ${new Date().toISOString()} - OAuth code exchange failed: ${message}`);
    return redirectWithStatus(origin, "error", "exchange_failed", message);
  }
}
