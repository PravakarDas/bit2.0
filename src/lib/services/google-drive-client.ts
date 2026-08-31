import { Readable } from "stream";
import { google, drive_v3 } from "googleapis";

/**
 * Pure Drive-API client logic — no Prisma import anywhere in this file, so
 * it's safely testable by the dependency-free `node --test` harness (a fake
 * `DriveClientFactory` can be injected in place of the real `googleapis`
 * client). Mirrors this Notification Engine's established split between a
 * pure delivery implementation (`smtp-delivery-provider.ts`) and its
 * Prisma-touching production wiring (`register-smtp-provider.ts`,
 * `google-drive.service.ts` here) — `google-drive.service.ts` composes this
 * class with the real, Prisma-backed config resolver; nothing here reads
 * credentials from the database directly.
 */
export interface ResolvedGoogleDriveConfig {
  serviceAccountEmail: string;
  privateKey: string;
  sharedDriveId: string | null;
  rootFolderId: string;
  rootFolderName: string;
}

/**
 * `drive.file` scope was considered and rejected: it only grants access to
 * files/folders the app itself created (or that were opened via an
 * interactive picker) — a folder a human admin shares with the service
 * account from outside the app is not reliably covered by it. The broader
 * `drive` scope is the minimum that reliably works for "operate inside a
 * folder someone else shared with this service account," which is exactly
 * this feature's access pattern (see PayrollEmailFlowReport.md §12.1).
 */
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

export type DriveClientFactory = (config: ResolvedGoogleDriveConfig) => drive_v3.Drive;

export function buildDriveClient(config: ResolvedGoogleDriveConfig): drive_v3.Drive {
  const auth = new google.auth.JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: DRIVE_SCOPES,
  });
  return google.drive({ version: "v3", auth });
}

/**
 * Maps a googleapis/Gaxios error into a human-readable message. Only ever
 * reads the error's status/message fields — never touches or logs
 * `config.privateKey` (not even in scope here).
 */
export function mapDriveError(error: unknown): string {
  const err = error as
    | { code?: number | string; response?: { status?: number; data?: { error?: { message?: string } } }; message?: string }
    | null;
  const status = err?.response?.status ?? (typeof err?.code === "number" ? err.code : undefined);
  const apiMessage = err?.response?.data?.error?.message;

  if (status === 401) {
    return "Authentication failed — check the service account email and private key.";
  }
  if (status === 403) {
    return apiMessage
      ? `Permission denied: ${apiMessage}`
      : "Permission denied — the service account does not have access to this folder/Shared Drive.";
  }
  if (status === 404) {
    return "Root Folder ID (or Shared Drive ID) not found — check the ID and confirm it's been shared with the service account.";
  }
  if (typeof status === "number" && status >= 500) {
    return "Google Drive API is temporarily unavailable. Try again shortly.";
  }

  return apiMessage || err?.message || "Failed to connect to Google Drive.";
}

export interface DriveConnectionTestResult {
  success: boolean;
  message: string;
}

export interface DriveFolder {
  id: string;
  name: string;
}

export interface UploadDriveFileInput {
  /** The Drive folder this file is uploaded into (the branch-level folder — see `findOrCreateFolder`). */
  parentFolderId: string;
  /** The exact filename to store (caller is responsible for sanitizing — see `@/lib/payslip-filename.ts`). */
  filename: string;
  content: Buffer;
  /** Defaults to `application/pdf` — the only content type this feature currently uploads. */
  mimeType?: string;
}

export interface UploadedDriveFile {
  id: string;
  name: string;
  parentFolderId: string;
  webViewLink: string | null;
}

/** Escapes a value for safe interpolation into a Drive API `q` string (single quotes and backslashes only — the two characters the query grammar treats specially). */
function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class GoogleDriveService {
  /** Injectable for testability — defaults to the real `googleapis`-backed client. */
  constructor(private readonly buildClient: DriveClientFactory = buildDriveClient) {}

  /**
   * Permission-check-only connection test (no file is created or deleted —
   * see PayrollEmailFlowReport.md §12.7 for why this is sufficient): Drive
   * API's `files.get(...).capabilities` field reports the caller's actual
   * permissions on a resource (`canAddChildren`, `canListChildren`) without
   * requiring a write to find out. Confirms, in order: (1) the credentials
   * authenticate at all, (2) the configured Shared Drive (if any) is
   * reachable, (3) the configured root folder exists and really is a
   * folder, (4) the service account can both create and list files inside
   * it — exactly the two operations the real payroll upload flow needs.
   */
  async testConnection(config: ResolvedGoogleDriveConfig | null): Promise<DriveConnectionTestResult> {
    if (!config) {
      return { success: false, message: "Google Drive is not configured yet. Save the service account credentials and a Root Folder ID first." };
    }

    try {
      const drive = this.buildClient(config);

      if (config.sharedDriveId) {
        await drive.drives.get({ driveId: config.sharedDriveId });
      }

      const folder = await drive.files.get({
        fileId: config.rootFolderId,
        fields: "id, name, mimeType, capabilities(canAddChildren, canListChildren)",
        supportsAllDrives: true,
      });

      if (folder.data.mimeType !== "application/vnd.google-apps.folder") {
        return { success: false, message: "The configured Root Folder ID does not point to a folder." };
      }

      const capabilities = folder.data.capabilities;
      if (!capabilities?.canAddChildren || !capabilities?.canListChildren) {
        return {
          success: false,
          message: `Connected, but the service account lacks permission to create and list files inside "${folder.data.name}". Share this folder with the service account as an Editor.`,
        };
      }

      return {
        success: true,
        message: `Connected successfully. The service account can create and list files inside "${folder.data.name}".`,
      };
    } catch (error) {
      return { success: false, message: mapDriveError(error) };
    }
  }

  /**
   * Finds a folder named `name` directly inside `parentId`, creating it only
   * if no such folder exists yet. Reused for both the month level
   * ("February 2026") and the branch level ("Branch Name" / "Unassigned")
   * of the `Payroll/{Month Year}/{Branch}/` structure — see
   * `PayrollEmailImplementationPlan.md` §11–§12.
   *
   * The list-then-create sequence (rather than create-and-catch-conflict) is
   * what makes repeated payroll runs against the same month/branch
   * idempotent: re-processing never creates a duplicate folder, and nothing
   * here ever deletes or modifies an existing folder.
   *
   * `trashed = false` excludes folders a human later deleted from Drive —
   * without it, a trashed folder would still satisfy the lookup and new
   * files would silently land in the trash.
   */
  async findOrCreateFolder(config: ResolvedGoogleDriveConfig, parentId: string, name: string): Promise<DriveFolder> {
    try {
      const drive = this.buildClient(config);

      const listParams: drive_v3.Params$Resource$Files$List = {
        q: `'${escapeDriveQueryValue(parentId)}' in parents and name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name)",
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      };
      if (config.sharedDriveId) {
        listParams.corpora = "drive";
        listParams.driveId = config.sharedDriveId;
      }

      const existing = await drive.files.list(listParams);
      const found = existing.data.files?.[0];
      if (found?.id) {
        return { id: found.id, name: found.name ?? name };
      }

      const created = await drive.files.create({
        requestBody: {
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId],
        },
        fields: "id, name",
        supportsAllDrives: true,
      });
      if (!created.data.id) {
        throw new Error("Google Drive did not return an id for the newly created folder.");
      }

      return { id: created.data.id, name: created.data.name ?? name };
    } catch (error) {
      throw new Error(mapDriveError(error));
    }
  }

  /**
   * Uploads file content into an already-resolved folder (from
   * `findOrCreateFolder`) using the exact filename supplied by the caller.
   * Does not check for or overwrite an existing file of the same name —
   * duplicate-upload prevention for a re-processed payroll run is a
   * `Document`-row-level decision made by the caller (payroll wiring
   * stage), not this client's concern; this method's own idempotency
   * guarantee is limited to "never deletes anything."
   */
  async uploadFile(config: ResolvedGoogleDriveConfig, input: UploadDriveFileInput): Promise<UploadedDriveFile> {
    try {
      const drive = this.buildClient(config);

      const created = await drive.files.create({
        requestBody: {
          name: input.filename,
          parents: [input.parentFolderId],
        },
        media: {
          mimeType: input.mimeType ?? "application/pdf",
          body: Readable.from(input.content),
        },
        fields: "id, name, webViewLink",
        supportsAllDrives: true,
      });

      if (!created.data.id) {
        throw new Error("Google Drive did not return an id for the uploaded file.");
      }

      return {
        id: created.data.id,
        name: created.data.name ?? input.filename,
        parentFolderId: input.parentFolderId,
        webViewLink: created.data.webViewLink ?? null,
      };
    } catch (error) {
      throw new Error(mapDriveError(error));
    }
  }
}
