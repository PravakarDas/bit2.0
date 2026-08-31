import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GoogleDriveService, mapDriveError, buildDriveClient } from "./google-drive-client";
import type { DriveClientFactory, ResolvedGoogleDriveConfig, ResolvedServiceAccountDriveConfig, ResolvedOAuthDriveConfig } from "./google-drive-client";

async function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function fakeConfig(overrides: Partial<ResolvedServiceAccountDriveConfig> = {}): ResolvedServiceAccountDriveConfig {
  return {
    authMethod: "SERVICE_ACCOUNT",
    serviceAccountEmail: "payroll-bot@my-project.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nTHIS-IS-A-FAKE-SECRET-KEY-NEVER-REAL\n-----END PRIVATE KEY-----\n",
    sharedDriveId: null,
    rootFolderId: "folder_abc123",
    rootFolderName: "Payroll",
    ...overrides,
  };
}

function fakeOAuthConfig(overrides: Partial<ResolvedOAuthDriveConfig> = {}): ResolvedGoogleDriveConfig {
  return {
    authMethod: "OAUTH2",
    clientId: "123-abc.apps.googleusercontent.com",
    clientSecret: "THIS-IS-A-FAKE-CLIENT-SECRET-NEVER-REAL",
    refreshToken: "THIS-IS-A-FAKE-REFRESH-TOKEN-NEVER-REAL",
    redirectUri: "https://hrm.example.com/api/google-drive/oauth/callback",
    sharedDriveId: null,
    rootFolderId: "folder_abc123",
    rootFolderName: "Payroll",
    ...overrides,
  };
}

/** Minimal fake of the `drive_v3.Drive` surface this service actually calls — `files.get` and `drives.get`. */
function fakeDriveClient(behavior: {
  filesGet?: () => Promise<{ data: { id?: string; name?: string; mimeType?: string; capabilities?: { canAddChildren?: boolean; canListChildren?: boolean } } }>;
  drivesGet?: () => Promise<unknown>;
}): DriveClientFactory {
  return () =>
    ({
      files: {
        get: behavior.filesGet ?? (async () => ({ data: {} })),
      },
      drives: {
        get: behavior.drivesGet ?? (async () => ({})),
      },
    }) as any;
}

describe("GoogleDriveService.testConnection", () => {
  it("reports not-configured (no network call) when config is null", async () => {
    const calls: string[] = [];
    const service = new GoogleDriveService(() => {
      calls.push("called");
      throw new Error("should never be called");
    });

    const result = await service.testConnection(null);

    assert.equal(result.success, false);
    assert.match(result.message, /not configured/i);
    assert.equal(calls.length, 0); // never attempted a network call
  });

  it("succeeds when the folder exists and the service account has full permission", async () => {
    const factory = fakeDriveClient({
      filesGet: async () => ({
        data: { id: "folder_abc123", name: "Payroll", mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: true, canListChildren: true } },
      }),
    });
    const service = new GoogleDriveService(factory);

    const result = await service.testConnection(fakeConfig());

    assert.equal(result.success, true);
    assert.match(result.message, /Connected successfully/);
    assert.match(result.message, /Payroll/);
  });

  it("also checks the Shared Drive when sharedDriveId is configured", async () => {
    let drivesGetCalled = false;
    const factory = fakeDriveClient({
      drivesGet: async () => {
        drivesGetCalled = true;
        return {};
      },
      filesGet: async () => ({
        data: { mimeType: "application/vnd.google-apps.folder", name: "Payroll", capabilities: { canAddChildren: true, canListChildren: true } },
      }),
    });
    const service = new GoogleDriveService(factory);

    await service.testConnection(fakeConfig({ sharedDriveId: "shared_drive_1" }));

    assert.equal(drivesGetCalled, true);
  });

  it("fails when the configured id does not point to a folder", async () => {
    const factory = fakeDriveClient({
      filesGet: async () => ({ data: { mimeType: "application/pdf", name: "not-a-folder.pdf" } }),
    });
    const service = new GoogleDriveService(factory);

    const result = await service.testConnection(fakeConfig());

    assert.equal(result.success, false);
    assert.match(result.message, /does not point to a folder/);
  });

  it("fails when the folder exists but the service account lacks write/list permission", async () => {
    const factory = fakeDriveClient({
      filesGet: async () => ({
        data: { mimeType: "application/vnd.google-apps.folder", name: "Payroll", capabilities: { canAddChildren: false, canListChildren: true } },
      }),
    });
    const service = new GoogleDriveService(factory);

    const result = await service.testConnection(fakeConfig());

    assert.equal(result.success, false);
    assert.match(result.message, /lacks permission/);
    assert.match(result.message, /Payroll/);
  });

  it("maps a thrown 401 to an authentication-failed message, not a raw exception", async () => {
    const factory: DriveClientFactory = () =>
      ({
        files: {
          get: async () => {
            throw Object.assign(new Error("invalid_grant"), { response: { status: 401 } });
          },
        },
        drives: { get: async () => ({}) },
      }) as any;
    const service = new GoogleDriveService(factory);

    const result = await service.testConnection(fakeConfig());

    assert.equal(result.success, false);
    assert.match(result.message, /Authentication failed/);
  });

  it("maps a thrown 403 to a permission-denied message", async () => {
    const factory: DriveClientFactory = () =>
      ({
        files: {
          get: async () => {
            throw Object.assign(new Error("forbidden"), { response: { status: 403, data: { error: { message: "insufficientPermissions" } } } });
          },
        },
        drives: { get: async () => ({}) },
      }) as any;
    const service = new GoogleDriveService(factory);

    const result = await service.testConnection(fakeConfig());

    assert.equal(result.success, false);
    assert.match(result.message, /Permission denied/);
  });

  it("maps a thrown 404 to a not-found message referencing the folder/Shared Drive id", async () => {
    const factory: DriveClientFactory = () =>
      ({
        files: {
          get: async () => {
            throw Object.assign(new Error("not found"), { response: { status: 404 } });
          },
        },
        drives: { get: async () => ({}) },
      }) as any;
    const service = new GoogleDriveService(factory);

    const result = await service.testConnection(fakeConfig());

    assert.equal(result.success, false);
    assert.match(result.message, /not found/i);
  });

  it("never includes the private key in any success or failure message (no secret leakage)", async () => {
    const secretMarker = "THIS-IS-A-FAKE-SECRET-KEY-NEVER-REAL";
    const config = fakeConfig();

    const failingFactory: DriveClientFactory = () =>
      ({
        files: {
          get: async () => {
            throw Object.assign(new Error(`failed for ${config.privateKey}`), { response: { status: 500 } });
          },
        },
        drives: { get: async () => ({}) },
      }) as any;

    const failResult = await new GoogleDriveService(failingFactory).testConnection(config);
    assert.equal(failResult.message.includes(secretMarker), false);

    const succeedingFactory = fakeDriveClient({
      filesGet: async () => ({ data: { mimeType: "application/vnd.google-apps.folder", name: "Payroll", capabilities: { canAddChildren: true, canListChildren: true } } }),
    });
    const successResult = await new GoogleDriveService(succeedingFactory).testConnection(config);
    assert.equal(successResult.message.includes(secretMarker), false);
  });
});

describe("mapDriveError", () => {
  it("falls back to the raw error message for an unrecognized status", async () => {
    const message = mapDriveError(new Error("something odd happened"));
    assert.equal(message, "something odd happened");
  });

  it("falls back to a generic message when nothing useful is present", async () => {
    const message = mapDriveError({});
    assert.equal(message, "Failed to connect to Google Drive.");
  });

  it("maps a 5xx status to a temporary-unavailability message", async () => {
    const message = mapDriveError({ response: { status: 503 } });
    assert.match(message, /temporarily unavailable/);
  });
});

describe("GoogleDriveService.findOrCreateFolder", () => {
  it("reuses an existing folder instead of creating a duplicate (month level, e.g. 'February 2026')", async () => {
    let createCalls = 0;
    const factory: DriveClientFactory = () =>
      ({
        files: {
          list: async () => ({ data: { files: [{ id: "month_folder_1", name: "February 2026" }] } }),
          create: async () => {
            createCalls++;
            throw new Error("should never be called — folder already exists");
          },
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    const folder = await service.findOrCreateFolder(fakeConfig(), "root_1", "February 2026");

    assert.equal(folder.id, "month_folder_1");
    assert.equal(folder.name, "February 2026");
    assert.equal(createCalls, 0);
  });

  it("creates the folder when none exists yet", async () => {
    const factory: DriveClientFactory = () =>
      ({
        files: {
          list: async () => ({ data: { files: [] } }),
          create: async () => ({ data: { id: "month_folder_new", name: "February 2026" } }),
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    const folder = await service.findOrCreateFolder(fakeConfig(), "root_1", "February 2026");

    assert.equal(folder.id, "month_folder_new");
    assert.equal(folder.name, "February 2026");
  });

  it("reuses an existing branch folder nested inside a month folder", async () => {
    let createCalls = 0;
    const factory: DriveClientFactory = () =>
      ({
        files: {
          list: async () => ({ data: { files: [{ id: "branch_folder_1", name: "Dhaka Main" }] } }),
          create: async () => {
            createCalls++;
            throw new Error("should never be called");
          },
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    const folder = await service.findOrCreateFolder(fakeConfig(), "month_folder_1", "Dhaka Main");

    assert.equal(folder.id, "branch_folder_1");
    assert.equal(createCalls, 0);
  });

  it("creates a missing branch folder inside the month folder", async () => {
    const factory: DriveClientFactory = () =>
      ({
        files: {
          list: async () => ({ data: { files: [] } }),
          create: async () => ({ data: { id: "branch_folder_new", name: "Dhaka Main" } }),
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    const folder = await service.findOrCreateFolder(fakeConfig(), "month_folder_1", "Dhaka Main");

    assert.equal(folder.id, "branch_folder_new");
  });

  it("handles the 'Unassigned' branch folder exactly like any other branch name — no special-casing needed", async () => {
    const factory: DriveClientFactory = () =>
      ({
        files: {
          list: async () => ({ data: { files: [] } }),
          create: async ({ requestBody }: any) => ({ data: { id: "unassigned_folder", name: requestBody.name } }),
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    const folder = await service.findOrCreateFolder(fakeConfig(), "month_folder_1", "Unassigned");

    assert.equal(folder.id, "unassigned_folder");
    assert.equal(folder.name, "Unassigned");
  });

  it("does not create a duplicate when the same folder is requested twice in a row (idempotent re-processing)", async () => {
    let createCalls = 0;
    let existing: { id: string; name: string } | null = null;
    const factory: DriveClientFactory = () =>
      ({
        files: {
          list: async () => ({ data: { files: existing ? [existing] : [] } }),
          create: async ({ requestBody }: any) => {
            createCalls++;
            existing = { id: "created_once", name: requestBody.name };
            return { data: existing };
          },
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    const first = await service.findOrCreateFolder(fakeConfig(), "root_1", "February 2026");
    const second = await service.findOrCreateFolder(fakeConfig(), "root_1", "February 2026");

    assert.equal(first.id, second.id);
    assert.equal(createCalls, 1); // only the first call actually created anything
  });

  it("never deletes or modifies anything — no delete/update method is ever invoked", async () => {
    let deleteCalled = false;
    const factory: DriveClientFactory = () =>
      ({
        files: {
          list: async () => ({ data: { files: [] } }),
          create: async () => ({ data: { id: "f1", name: "February 2026" } }),
          delete: async () => {
            deleteCalled = true;
          },
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    await service.findOrCreateFolder(fakeConfig(), "root_1", "February 2026");

    assert.equal(deleteCalled, false);
  });

  it("propagates a mapped, human-readable error when the Drive API rejects the lookup (same mapDriveError pattern as testConnection)", async () => {
    const factory: DriveClientFactory = () =>
      ({
        files: {
          list: async () => {
            throw Object.assign(new Error("forbidden"), { response: { status: 403 } });
          },
          create: async () => {
            throw new Error("should not reach create");
          },
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    await assert.rejects(
      () => service.findOrCreateFolder(fakeConfig(), "root_1", "February 2026"),
      (error: Error) => {
        assert.match(error.message, /Permission denied/);
        return true;
      },
    );
  });

  it("never includes the private key in a thrown folder-creation error message", async () => {
    const config = fakeConfig();
    const factory: DriveClientFactory = () =>
      ({
        files: {
          list: async () => {
            throw Object.assign(new Error(`failed for ${config.privateKey}`), { response: { status: 500 } });
          },
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    await assert.rejects(
      () => service.findOrCreateFolder(config, "root_1", "February 2026"),
      (error: Error) => {
        assert.equal(error.message.includes("THIS-IS-A-FAKE-SECRET-KEY-NEVER-REAL"), false);
        return true;
      },
    );
  });
});

describe("GoogleDriveService.uploadFile", () => {
  it("uploads with the application/pdf MIME type by default", async () => {
    let capturedMimeType: string | undefined;
    const factory: DriveClientFactory = () =>
      ({
        files: {
          create: async ({ media }: any) => {
            capturedMimeType = media.mimeType;
            return { data: { id: "file_1", name: "payslip.pdf", webViewLink: "https://drive.google.com/file/d/file_1/view" } };
          },
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    await service.uploadFile(fakeConfig(), {
      parentFolderId: "branch_folder_1",
      filename: "cmn123456_Abdul_Kader_February_2026.pdf",
      content: Buffer.from("fake pdf bytes"),
    });

    assert.equal(capturedMimeType, "application/pdf");
  });

  it("returns the Drive file id, name, parent folder id, and webViewLink", async () => {
    const factory: DriveClientFactory = () =>
      ({
        files: {
          create: async () => ({
            data: { id: "file_42", name: "cmn123456_Abdul_Kader_February_2026.pdf", webViewLink: "https://drive.google.com/file/d/file_42/view" },
          }),
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    const result = await service.uploadFile(fakeConfig(), {
      parentFolderId: "branch_folder_1",
      filename: "cmn123456_Abdul_Kader_February_2026.pdf",
      content: Buffer.from("fake pdf bytes"),
    });

    assert.deepEqual(result, {
      id: "file_42",
      name: "cmn123456_Abdul_Kader_February_2026.pdf",
      parentFolderId: "branch_folder_1",
      webViewLink: "https://drive.google.com/file/d/file_42/view",
    });
  });

  it("returns webViewLink: null when Drive does not return one", async () => {
    const factory: DriveClientFactory = () =>
      ({
        files: {
          create: async () => ({ data: { id: "file_1", name: "payslip.pdf" } }),
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    const result = await service.uploadFile(fakeConfig(), {
      parentFolderId: "branch_folder_1",
      filename: "payslip.pdf",
      content: Buffer.from("fake pdf bytes"),
    });

    assert.equal(result.webViewLink, null);
  });

  it("uploads the exact buffer content supplied by the caller, unmodified", async () => {
    const original = Buffer.from("%PDF-1.4 fake payslip content");
    let uploaded: Buffer | null = null;
    const factory: DriveClientFactory = () =>
      ({
        files: {
          create: async ({ media }: any) => {
            uploaded = await collectStream(media.body);
            return { data: { id: "file_1", name: "payslip.pdf" } };
          },
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    await service.uploadFile(fakeConfig(), { parentFolderId: "branch_folder_1", filename: "payslip.pdf", content: original });

    assert.ok(uploaded);
    assert.equal(Buffer.compare(uploaded as unknown as Buffer, original), 0);
  });

  it("propagates a mapped, human-readable error when the upload fails (same mapDriveError pattern as testConnection)", async () => {
    const factory: DriveClientFactory = () =>
      ({
        files: {
          create: async () => {
            throw Object.assign(new Error("quota exceeded"), { response: { status: 403, data: { error: { message: "storageQuotaExceeded" } } } });
          },
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    await assert.rejects(
      () => service.uploadFile(fakeConfig(), { parentFolderId: "branch_folder_1", filename: "payslip.pdf", content: Buffer.from("x") }),
      (error: Error) => {
        assert.match(error.message, /Permission denied/);
        return true;
      },
    );
  });

  it("never includes the private key or PDF content in a thrown upload error message", async () => {
    const config = fakeConfig();
    const pdfMarker = "%PDF-1.4 super secret payslip numbers";
    const factory: DriveClientFactory = () =>
      ({
        files: {
          create: async () => {
            throw Object.assign(new Error(`upload failed for key ${config.privateKey}`), { response: { status: 500 } });
          },
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    await assert.rejects(
      () => service.uploadFile(config, { parentFolderId: "branch_folder_1", filename: "payslip.pdf", content: Buffer.from(pdfMarker) }),
      (error: Error) => {
        assert.equal(error.message.includes("THIS-IS-A-FAKE-SECRET-KEY-NEVER-REAL"), false);
        assert.equal(error.message.includes(pdfMarker), false);
        return true;
      },
    );
  });
});

describe("buildDriveClient — auth method dispatcher (Phase 19)", () => {
  it("builds a client without throwing for a SERVICE_ACCOUNT config (JWT branch)", () => {
    const drive = buildDriveClient(fakeConfig() as ResolvedServiceAccountDriveConfig);
    assert.ok(drive);
  });

  it("builds a client without throwing for an OAUTH2 config (OAuth2 branch) — no network call happens at construction time", () => {
    const drive = buildDriveClient(fakeOAuthConfig() as ResolvedOAuthDriveConfig);
    assert.ok(drive);
  });
});

describe("GoogleDriveService — identical behavior for OAuth2 as for Service Account (auth-method-agnostic)", () => {
  it("testConnection succeeds with an OAuth2-shaped config using the exact same code path as Service Account", async () => {
    const factory = fakeDriveClient({
      filesGet: async () => ({
        data: { id: "folder_abc123", name: "Payroll", mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: true, canListChildren: true } },
      }),
    });
    const service = new GoogleDriveService(factory);

    const result = await service.testConnection(fakeOAuthConfig());

    assert.equal(result.success, true);
    assert.match(result.message, /Connected successfully/);
  });

  it("findOrCreateFolder creates a missing folder with an OAuth2-shaped config", async () => {
    const factory: DriveClientFactory = () =>
      ({
        files: {
          list: async () => ({ data: { files: [] } }),
          create: async () => ({ data: { id: "month_folder_new", name: "February 2026" } }),
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    const folder = await service.findOrCreateFolder(fakeOAuthConfig(), "root_1", "February 2026");

    assert.equal(folder.id, "month_folder_new");
  });

  it("uploadFile uploads the exact buffer with an OAuth2-shaped config", async () => {
    const original = Buffer.from("%PDF-1.4 fake payslip content");
    let uploaded: Buffer | null = null;
    const factory: DriveClientFactory = () =>
      ({
        files: {
          create: async ({ media }: any) => {
            uploaded = await collectStream(media.body);
            return { data: { id: "file_1", name: "payslip.pdf" } };
          },
        },
      }) as any;
    const service = new GoogleDriveService(factory);

    await service.uploadFile(fakeOAuthConfig(), { parentFolderId: "branch_folder_1", filename: "payslip.pdf", content: original });

    assert.ok(uploaded);
    assert.equal(Buffer.compare(uploaded as unknown as Buffer, original), 0);
  });

  it("never includes the OAuth client secret or refresh token in any error message (no secret leakage)", async () => {
    const config = fakeOAuthConfig();
    const secretMarker = "THIS-IS-A-FAKE-CLIENT-SECRET-NEVER-REAL";
    const tokenMarker = "THIS-IS-A-FAKE-REFRESH-TOKEN-NEVER-REAL";
    const factory: DriveClientFactory = () =>
      ({
        files: {
          get: async () => {
            throw Object.assign(new Error(`failed for ${(config as ResolvedOAuthDriveConfig).clientSecret} / ${(config as ResolvedOAuthDriveConfig).refreshToken}`), {
              response: { status: 500 },
            });
          },
        },
        drives: { get: async () => ({}) },
      }) as any;

    const result = await new GoogleDriveService(factory).testConnection(config);

    assert.equal(result.message.includes(secretMarker), false);
    assert.equal(result.message.includes(tokenMarker), false);
  });
});

describe("mapDriveError — OAuth token-endpoint error shapes", () => {
  it("maps invalid_grant to an expired/revoked-authorization message", () => {
    const message = mapDriveError({ response: { data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } } });
    assert.match(message, /expired or been revoked/);
    assert.match(message, /Reconnect/);
  });

  it("maps invalid_client to an invalid-credentials message", () => {
    const message = mapDriveError({ response: { data: { error: "invalid_client" } } });
    assert.match(message, /Invalid OAuth Client ID or Client Secret/);
  });

  it("maps access_denied to a denied-request message", () => {
    const message = mapDriveError({ response: { data: { error: "access_denied" } } });
    assert.match(message, /denied this OAuth request/);
  });

  it("still maps Drive-API-shaped errors (object error.message) correctly alongside the new OAuth string-error handling", () => {
    const message = mapDriveError({ response: { status: 403, data: { error: { message: "insufficientPermissions" } } } });
    assert.match(message, /Permission denied: insufficientPermissions/);
  });
});
