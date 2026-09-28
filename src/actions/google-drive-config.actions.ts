"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDbUser } from "./user.actions";
import {
  getOrCreateGoogleDriveConfig,
  googleDriveService,
  getGoogleDriveOAuthRedirectUri,
  disconnectGoogleDriveOAuth,
} from "@/lib/services/google-drive.service";
import {
  canManageGoogleDriveConfig,
  maskGoogleDriveConfig,
  buildGoogleDriveConfigUpdateData,
  validateGoogleDriveConfigInput,
  type GoogleDriveAuthMethod,
} from "@/lib/google-drive-config";
import { generateOAuthState, buildGoogleAuthorizationUrl, OAUTH_STATE_COOKIE_NAME, OAUTH_STATE_MAX_AGE_SECONDS } from "@/lib/google-drive-oauth";

type UpdatePayload = {
  authenticationMethod: GoogleDriveAuthMethod;
  serviceAccountEmail: string;
  privateKey?: string;
  sharedDriveId?: string;
  rootFolderId: string;
  rootFolderName: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
};

export async function getGoogleDriveConfig() {
  const user = await getDbUser();
  if (!user || !canManageGoogleDriveConfig(user)) {
    throw new Error("Unauthorized");
  }

  const config = await getOrCreateGoogleDriveConfig();
  return {
    ...maskGoogleDriveConfig(config),
    // Read-only, computed from NEXT_PUBLIC_APP_URL — shown in the UI for the
    // admin to register in Google Cloud Console. `null` means the env var
    // isn't set yet, surfaced as a configuration warning, not a crash.
    oauthRedirectUri: getGoogleDriveOAuthRedirectUri(),
  };
}

export async function updateGoogleDriveConfig(payload: UpdatePayload) {
  const user = await getDbUser();
  if (!user || !canManageGoogleDriveConfig(user)) {
    throw new Error("Unauthorized");
  }

  const authenticationMethod: GoogleDriveAuthMethod = payload.authenticationMethod === "OAUTH2" ? "OAUTH2" : "SERVICE_ACCOUNT";
  const serviceAccountEmail = (payload.serviceAccountEmail || "").trim();
  const rootFolderId = (payload.rootFolderId || "").trim();
  const rootFolderName = (payload.rootFolderName || "").trim() || "Payroll";
  const sharedDriveId = (payload.sharedDriveId || "").trim() || null;
  const privateKey = payload.privateKey || "";
  const oauthClientId = (payload.oauthClientId || "").trim();
  const oauthClientSecret = payload.oauthClientSecret || "";

  const current = await getOrCreateGoogleDriveConfig();

  const errors = validateGoogleDriveConfigInput({
    authenticationMethod,
    serviceAccountEmail,
    rootFolderId,
    privateKey,
    hasExistingPrivateKey: !!current.privateKeyEncrypted,
    oauthClientId,
    oauthClientSecret,
    hasExistingOauthClientSecret: !!current.oauthClientSecretEncrypted,
  });

  if (errors.length > 0) {
    return { success: false, message: errors.join(" ") };
  }

  const data = buildGoogleDriveConfigUpdateData({
    authenticationMethod,
    serviceAccountEmail,
    sharedDriveId,
    rootFolderId,
    rootFolderName,
    privateKey,
    oauthClientId,
    oauthClientSecret,
  });

  await prisma.googleDriveConfig.update({
    where: { id: "global" },
    data: {
      ...data,
      updatedById: user.id,
      updatedByEmail: user.email,
      updatedByRole: user.role,
    },
  });

  revalidatePath("/admin/system-control");

  return { success: true, message: "Google Drive configuration saved successfully." };
}

/**
 * Permission-check-only — see `google-drive-client.ts`'s `testConnection()`
 * doc comment. Never uploads, creates, or deletes a file; works identically
 * for both authentication methods since `resolveGoogleDriveConfig()` already
 * resolves whichever mode is stored.
 */
export async function testGoogleDriveConnection() {
  const user = await getDbUser();
  if (!user || !canManageGoogleDriveConfig(user)) {
    throw new Error("Unauthorized");
  }

  return googleDriveService.testConnection();
}

/**
 * Starts the OAuth 2.0 Authorization Code flow: saves the submitted Client
 * ID/Secret (so the callback route can read them back to exchange the code
 * — no secret is ever carried through the browser redirect itself), issues
 * a short-lived CSRF state cookie, then redirects the browser straight to
 * Google's consent screen. `redirect()` works with an absolute external URL
 * from inside a Server Action — Next.js's router follows it like any other.
 */
export async function beginGoogleDriveOAuth(input: { clientId: string; clientSecret?: string }) {
  const user = await getDbUser();
  if (!user || !canManageGoogleDriveConfig(user)) {
    throw new Error("Unauthorized");
  }

  const clientId = input.clientId.trim();
  const clientSecret = (input.clientSecret || "").trim();

  const current = await getOrCreateGoogleDriveConfig();
  if (!clientId) {
    return { success: false, message: "OAuth Client ID is required." };
  }
  if (!clientSecret && !current.oauthClientSecretEncrypted) {
    return { success: false, message: "OAuth Client Secret is required." };
  }

  const redirectUri = getGoogleDriveOAuthRedirectUri();
  if (!redirectUri) {
    return { success: false, message: "NEXT_PUBLIC_APP_URL is not configured. Set it in the environment before connecting Google Drive." };
  }

  const data = buildGoogleDriveConfigUpdateData({
    authenticationMethod: "OAUTH2",
    serviceAccountEmail: current.serviceAccountEmail,
    sharedDriveId: current.sharedDriveId,
    rootFolderId: current.rootFolderId,
    rootFolderName: current.rootFolderName,
    oauthClientId: clientId,
    oauthClientSecret: clientSecret,
  });

  await prisma.googleDriveConfig.update({
    where: { id: "global" },
    data: {
      ...data,
      updatedById: user.id,
      updatedByEmail: user.email,
      updatedByRole: user.role,
    },
  });

  const state = generateOAuthState();
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
  });

  revalidatePath("/admin/system-control");

  redirect(buildGoogleAuthorizationUrl({ clientId, redirectUri, state }));
}

/**
 * Clears the stored OAuth connection. Does not touch the Root Folder ID,
 * the user's actual Drive files/folders, or (deliberately) the saved
 * Client ID/Secret, so "Reconnect" is a single click.
 */
export async function disconnectGoogleDrive() {
  const user = await getDbUser();
  if (!user || !canManageGoogleDriveConfig(user)) {
    throw new Error("Unauthorized");
  }

  await disconnectGoogleDriveOAuth({ updatedById: user.id, updatedByEmail: user.email, updatedByRole: user.role });

  revalidatePath("/admin/system-control");

  return { success: true, message: "Google Drive account disconnected." };
}
