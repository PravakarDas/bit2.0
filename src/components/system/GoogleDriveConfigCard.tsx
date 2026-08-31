"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { updateGoogleDriveConfig, testGoogleDriveConnection } from "@/actions/google-drive-config.actions";

type GoogleDriveConfigState = {
  serviceAccountEmail: string;
  sharedDriveId: string | null;
  rootFolderId: string;
  rootFolderName: string;
  hasPrivateKey: boolean;
};

interface GoogleDriveConfigCardProps {
  initialConfig: GoogleDriveConfigState;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function GoogleDriveConfigCard({ initialConfig }: GoogleDriveConfigCardProps) {
  const [form, setForm] = useState({
    serviceAccountEmail: initialConfig.serviceAccountEmail,
    privateKey: "",
    sharedDriveId: initialConfig.sharedDriveId || "",
    rootFolderId: initialConfig.rootFolderId,
    rootFolderName: initialConfig.rootFolderName,
  });
  const [hasPrivateKey, setHasPrivateKey] = useState(initialConfig.hasPrivateKey);
  const [isSaving, startSave] = useTransition();
  const [isTesting, startTest] = useTransition();

  const isConfigured = hasPrivateKey && !!form.serviceAccountEmail && !!form.rootFolderId;

  const handleSave = () => {
    if (!EMAIL_REGEX.test(form.serviceAccountEmail.trim())) {
      toast.error("Service Account Email must be a valid email address.");
      return;
    }
    if (!form.rootFolderId.trim()) {
      toast.error("Root Folder ID is required.");
      return;
    }
    if (!form.privateKey.trim() && !hasPrivateKey) {
      toast.error("Service Account Private Key is required.");
      return;
    }

    startSave(async () => {
      try {
        const result = await updateGoogleDriveConfig(form);
        if (result.success) {
          toast.success(result.message);
          if (form.privateKey.trim()) {
            setHasPrivateKey(true);
          }
          setForm((prev) => ({ ...prev, privateKey: "" }));
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Google Drive Configuration
          <Badge variant={isConfigured ? "default" : "outline"}>
            {isConfigured ? "Configured" : "Not configured"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Configure the service account used to archive generated payslip PDFs to Google Drive. This is separate from
          email delivery — Google Drive archival never blocks payroll emails from being sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
                hasPrivateKey
                  ? "Leave blank to keep the current key"
                  : "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
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

          <div className="space-y-2">
            <Label htmlFor="gdrive-root-folder-id">Root Folder ID</Label>
            <Input
              id="gdrive-root-folder-id"
              value={form.rootFolderId}
              onChange={(e) => setForm((prev) => ({ ...prev, rootFolderId: e.target.value }))}
              placeholder="1AbCdEfGhIjKlMnOpQrStUvWxYz"
            />
            <p className="text-xs text-muted-foreground">
              The Drive folder ID (from its URL) that has been shared with the service account as an Editor. Payroll
              month/branch folders will be created inside this folder.
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
