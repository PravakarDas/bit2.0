"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  updateGoogleDriveConfig,
  testGoogleDriveConnection,
  beginGoogleDriveOAuth,
  disconnectGoogleDrive,
} from "@/actions/google-drive-config.actions";

type GoogleDriveAuthMethod = "SERVICE_ACCOUNT" | "OAUTH2";

type GoogleDriveConfigState = {
  authenticationMethod: GoogleDriveAuthMethod;
  serviceAccountEmail: string;
  sharedDriveId: string | null;
  rootFolderId: string;
  rootFolderName: string;
  hasPrivateKey: boolean;
  oauthClientId: string;
  hasOauthClientSecret: boolean;
  hasOauthRefreshToken: boolean;
  oauthConnectedEmail: string | null;
  /** Read-only, computed from NEXT_PUBLIC_APP_URL. `null` means that env var isn't set yet. */
  oauthRedirectUri: string | null;
};

interface GoogleDriveConfigCardProps {
  initialConfig: GoogleDriveConfigState;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Maps the callback route's fixed `reason` codes (see `oauth/callback/route.ts`) to a human-readable message when no `message` param was sent. */
function describeOAuthFailureReason(reason: string | null): string {
  switch (reason) {
    case "access_denied":
      return "Google sign-in was cancelled or access was denied.";
    case "invalid_state":
      return "The connection attempt could not be verified (invalid or expired). Please try connecting again.";
    case "unauthorized":
      return "You are not authorized to manage Google Drive settings.";
    case "missing_code":
      return "Google did not return an authorization code. Please try again.";
    case "not_configured":
      return "The OAuth Client ID/Secret was not saved correctly. Please try again.";
    default:
      return "Failed to connect Google Drive. Please try again.";
  }
}

export default function GoogleDriveConfigCard({ initialConfig }: GoogleDriveConfigCardProps) {
  const [form, setForm] = useState({
    authenticationMethod: initialConfig.authenticationMethod,
    serviceAccountEmail: initialConfig.serviceAccountEmail,
    privateKey: "",
    sharedDriveId: initialConfig.sharedDriveId || "",
    rootFolderId: initialConfig.rootFolderId,
    rootFolderName: initialConfig.rootFolderName,
    oauthClientId: initialConfig.oauthClientId,
    oauthClientSecret: "",
  });
  const [hasPrivateKey, setHasPrivateKey] = useState(initialConfig.hasPrivateKey);
  const [hasOauthClientSecret, setHasOauthClientSecret] = useState(initialConfig.hasOauthClientSecret);
  const [isSaving, startSave] = useTransition();
  const [isTesting, startTest] = useTransition();
  const [isConnecting, startConnect] = useTransition();
  const [isDisconnecting, startDisconnect] = useTransition();

  // Shows a toast for the result of an OAuth round trip once the browser
  // lands back here from `/api/google-drive/oauth/callback`, then strips the
  // status params from the URL so a page refresh doesn't re-show it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("googleDriveOAuth");
    if (!status) {
      return;
    }

    if (status === "success") {
      toast.success("Google Drive account connected successfully.");
    } else {
      toast.error(params.get("message") || describeOAuthFailureReason(params.get("reason")));
    }

    params.delete("googleDriveOAuth");
    params.delete("reason");
    params.delete("message");
    const newSearch = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
  }, []);

  const isOAuth = form.authenticationMethod === "OAUTH2";
  const isConfigured = isOAuth
    ? initialConfig.hasOauthRefreshToken && !!form.rootFolderId
    : hasPrivateKey && !!form.serviceAccountEmail && !!form.rootFolderId;

  const handleSave = () => {
    if (!form.rootFolderId.trim()) {
      toast.error("Root Folder ID is required.");
      return;
    }
    if (isOAuth) {
      if (!form.oauthClientId.trim()) {
        toast.error("OAuth Client ID is required.");
        return;
      }
      if (!form.oauthClientSecret.trim() && !hasOauthClientSecret) {
        toast.error("OAuth Client Secret is required.");
        return;
      }
    } else {
      if (!EMAIL_REGEX.test(form.serviceAccountEmail.trim())) {
        toast.error("Service Account Email must be a valid email address.");
        return;
      }
      if (!form.privateKey.trim() && !hasPrivateKey) {
        toast.error("Service Account Private Key is required.");
        return;
      }
    }

    startSave(async () => {
      try {
        const result = await updateGoogleDriveConfig(form);
        if (result.success) {
          toast.success(result.message);
          if (form.privateKey.trim()) {
            setHasPrivateKey(true);
          }
          if (form.oauthClientSecret.trim()) {
            setHasOauthClientSecret(true);
          }
          setForm((prev) => ({ ...prev, privateKey: "", oauthClientSecret: "" }));
        } else {
          toast.error(result.message || "Failed to save Google Drive configuration");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save Google Drive configuration");
      }
    });
  };

  const handleTestConnection = () => {
    startTest(async () => {
      try {
        const result = await testGoogleDriveConnection();
        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(result.message || "Google Drive connection test failed");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Google Drive connection test failed");
      }
    });
  };

  const handleConnect = () => {
    if (!form.oauthClientId.trim()) {
      toast.error("OAuth Client ID is required.");
      return;
    }
    if (!form.oauthClientSecret.trim() && !hasOauthClientSecret) {
      toast.error("OAuth Client Secret is required.");
      return;
    }

    startConnect(async () => {
      try {
        // On success this never returns — `beginGoogleDriveOAuth` redirects
        // the browser straight to Google's consent screen. A returned value
        // here always means it failed before redirecting.
        const result = await beginGoogleDriveOAuth({ clientId: form.oauthClientId, clientSecret: form.oauthClientSecret });
        if (result && !result.success) {
          toast.error(result.message || "Failed to start the Google Drive connection.");
        }
      } catch (error) {
        // Next.js's `redirect()` surfaces as a thrown "NEXT_REDIRECT" signal
        // that the framework intercepts to perform the navigation — it is
        // not a real error and must not be shown to the admin as one.
        if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
          return;
        }
        toast.error(error instanceof Error ? error.message : "Failed to start the Google Drive connection.");
      }
    });
  };

  const handleDisconnect = () => {
    startDisconnect(async () => {
      try {
        const result = await disconnectGoogleDrive();
        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error("Failed to disconnect Google Drive.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to disconnect Google Drive.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Google Drive Configuration
          <Badge variant={isConfigured ? "default" : "outline"}>{isConfigured ? "Configured" : "Not configured"}</Badge>
        </CardTitle>
        <CardDescription>
          Configure how the app archives generated payslip PDFs to Google Drive. This is separate from email delivery —
          Google Drive archival never blocks payroll emails from being sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Storage Method</Label>
          <RadioGroup
            value={form.authenticationMethod}
            onValueChange={(value: string) => setForm((prev) => ({ ...prev, authenticationMethod: value as GoogleDriveAuthMethod }))}
            className="gap-3"
          >
            <div className="flex items-start gap-3 rounded-md border p-3">
              <RadioGroupItem value="SERVICE_ACCOUNT" id="gdrive-mode-service-account" className="mt-0.5" />
              <div className="space-y-0.5">
                <Label htmlFor="gdrive-mode-service-account" className="font-medium">
                  Service Account
                </Label>
                <p className="text-xs text-muted-foreground">
                  A Google Cloud service account with a folder shared to it. Requires Google Workspace or a Shared Drive
                  for storage quota.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-md border p-3">
              <RadioGroupItem value="OAUTH2" id="gdrive-mode-oauth" className="mt-0.5" />
              <div className="space-y-0.5">
                <Label htmlFor="gdrive-mode-oauth" className="font-medium">
                  OAuth 2.0 (Google account sign-in)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Connect a normal personal/free Gmail account. Uses that account&apos;s own Drive storage — no Google
                  Workspace or Shared Drive required.
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        <Separator />

        {!isOAuth && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="gdrive-service-account-email">Service Account Email</Label>
              <Input
                id="gdrive-service-account-email"
                type="email"
                value={form.serviceAccountEmail}
                onChange={(e) => setForm((prev) => ({ ...prev, serviceAccountEmail: e.target.value }))}
                placeholder="payroll-bot@your-project.iam.gserviceaccount.com"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="gdrive-private-key">Service Account Private Key</Label>
              <Textarea
                id="gdrive-private-key"
                value={form.privateKey}
                onChange={(e) => setForm((prev) => ({ ...prev, privateKey: e.target.value }))}
                placeholder={
                  hasPrivateKey ? "Leave blank to keep the current key" : "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
                }
                rows={4}
                className="font-mono text-xs"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                From the service account&apos;s JSON key file (the <code>private_key</code> field). Never displayed again
                after saving.
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="gdrive-shared-drive-id">Shared Drive ID (optional)</Label>
              <Input
                id="gdrive-shared-drive-id"
                value={form.sharedDriveId}
                onChange={(e) => setForm((prev) => ({ ...prev, sharedDriveId: e.target.value }))}
                placeholder="Leave blank unless the Root Folder lives inside a Shared Drive"
              />
            </div>
          </div>
        )}

        {isOAuth && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="gdrive-oauth-client-id">OAuth Client ID</Label>
              <Input
                id="gdrive-oauth-client-id"
                value={form.oauthClientId}
                onChange={(e) => setForm((prev) => ({ ...prev, oauthClientId: e.target.value }))}
                placeholder="1234567890-abc123.apps.googleusercontent.com"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="gdrive-oauth-client-secret">OAuth Client Secret</Label>
              <Input
                id="gdrive-oauth-client-secret"
                type="password"
                value={form.oauthClientSecret}
                onChange={(e) => setForm((prev) => ({ ...prev, oauthClientSecret: e.target.value }))}
                placeholder={hasOauthClientSecret ? "Leave blank to keep the current secret" : "GOCSPX-..."}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">From the OAuth Client's credentials page in Google Cloud Console. Never displayed again after saving.</p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="gdrive-oauth-redirect-uri">Authorized Redirect URI</Label>
              <Input id="gdrive-oauth-redirect-uri" readOnly value={initialConfig.oauthRedirectUri ?? ""} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground">
                {initialConfig.oauthRedirectUri
                  ? "Register this exact URL as an Authorized redirect URI on the OAuth Client in Google Cloud Console."
                  : "NEXT_PUBLIC_APP_URL is not configured in the environment yet — set it before connecting."}
              </p>
            </div>

            <div className="space-y-2 md:col-span-2 rounded-md border p-3">
              <Label>Connected Account</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={initialConfig.hasOauthRefreshToken ? "default" : "outline"}>
                  {initialConfig.hasOauthRefreshToken ? "Connected" : "Not Connected"}
                </Badge>
                {initialConfig.oauthConnectedEmail && <span className="text-sm text-muted-foreground">{initialConfig.oauthConnectedEmail}</span>}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="outline" onClick={handleConnect} disabled={isConnecting || isDisconnecting}>
                  {isConnecting ? "Connecting..." : initialConfig.hasOauthRefreshToken ? "Reconnect Google Drive" : "Connect Google Drive"}
                </Button>
                {initialConfig.hasOauthRefreshToken && (
                  <Button type="button" variant="ghost" onClick={handleDisconnect} disabled={isConnecting || isDisconnecting}>
                    {isDisconnecting ? "Disconnecting..." : "Disconnect"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gdrive-root-folder-id">Root Folder ID</Label>
            <Input
              id="gdrive-root-folder-id"
              value={form.rootFolderId}
              onChange={(e) => setForm((prev) => ({ ...prev, rootFolderId: e.target.value }))}
              placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz"
            />
            <p className="text-xs text-muted-foreground">
              {isOAuth
                ? "The Drive folder ID (from its URL) inside the connected account's own Drive. Create it there first, then paste its ID here."
                : "The Drive folder ID (from its URL) that has been shared with the service account as an Editor."}{" "}
              Payroll month/branch folders will be created inside this folder.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gdrive-root-folder-name">Root Folder Name</Label>
            <Input
              id="gdrive-root-folder-name"
              value={form.rootFolderName}
              onChange={(e) => setForm((prev) => ({ ...prev, rootFolderName: e.target.value }))}
              placeholder="Payroll"
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Google Drive Configuration"}
        </Button>

        <Separator />

        <div className="space-y-3">
          <Label>Test Connection</Label>
          <p className="text-xs text-muted-foreground">
            Verifies the saved credentials can reach the configured Root Folder and have permission to create and list
            files inside it. Save your settings first if you just changed them. This never creates, uploads, or
            deletes a file.
          </p>
          <Button variant="outline" onClick={handleTestConnection} disabled={isTesting}>
            {isTesting ? "Testing..." : "Test Connection"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
