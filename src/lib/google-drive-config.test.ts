// EMAIL_SECRET_KEY must be set before `crypto.ts` is imported (this file runs
// in its own `node --test` process, so it can't rely on crypto.test.ts having
// set this in a different process) — a fixed, arbitrary test-only value,
// never a real production secret. Matches crypto.test.ts's own pattern.
process.env.EMAIL_SECRET_KEY = "test-only-secret-key-not-a-real-credential";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decryptSecret } from "./crypto";
import {
  canManageGoogleDriveConfig,
  maskGoogleDriveConfig,
  buildGoogleDriveConfigUpdateData,
  validateGoogleDriveConfigInput,
  normalizePrivateKeyLineBreaks,
} from "./google-drive-config";
import type { GoogleDriveConfigActor, GoogleDriveConfigRecord } from "./google-drive-config";

function actor(overrides: Partial<GoogleDriveConfigActor> = {}): GoogleDriveConfigActor {
  return { role: "EMPLOYEE", ...overrides };
}

describe("canManageGoogleDriveConfig — matches the SMTP config authorization rule exactly", () => {
  it("SUPERADMIN is authorized", () => {
    assert.equal(canManageGoogleDriveConfig(actor({ role: "SUPERADMIN" })), true);
  });

  it("HR is authorized", () => {
    assert.equal(canManageGoogleDriveConfig(actor({ role: "HR" })), true);
  });

  it("a plain EMPLOYEE is not authorized (unauthorized read/save/test connection all gate through this)", () => {
    assert.equal(canManageGoogleDriveConfig(actor({ role: "EMPLOYEE" })), false);
  });

  it("null/undefined (no signed-in user resolved) is not authorized", () => {
    assert.equal(canManageGoogleDriveConfig(null), false);
    assert.equal(canManageGoogleDriveConfig(undefined), false);
  });
});

function fakeRecord(overrides: Partial<GoogleDriveConfigRecord> = {}): GoogleDriveConfigRecord {
  return {
    serviceAccountEmail: "payroll-bot@my-project.iam.gserviceaccount.com",
    privateKeyEncrypted: "iv:tag:cipher",
    sharedDriveId: null,
    rootFolderId: "folder_abc123",
    rootFolderName: "Payroll",
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

describe("maskGoogleDriveConfig — secret masking", () => {
  it("never includes the encrypted private key value in the returned view", () => {
    const view = maskGoogleDriveConfig(fakeRecord());
    assert.deepEqual(Object.keys(view).sort(), ["hasPrivateKey", "rootFolderId", "rootFolderName", "serviceAccountEmail", "sharedDriveId", "updatedAt"]);
    assert.equal((view as unknown as Record<string, unknown>).privateKeyEncrypted, undefined);
  });

  it("reports hasPrivateKey: true when a key is stored", () => {
    const view = maskGoogleDriveConfig(fakeRecord({ privateKeyEncrypted: "iv:tag:cipher" }));
    assert.equal(view.hasPrivateKey, true);
  });

  it("reports hasPrivateKey: false when no key is stored yet", () => {
    const view = maskGoogleDriveConfig(fakeRecord({ privateKeyEncrypted: "" }));
    assert.equal(view.hasPrivateKey, false);
  });

  it("passes through the non-secret fields unchanged", () => {
    const view = maskGoogleDriveConfig(fakeRecord({ serviceAccountEmail: "x@y.iam.gserviceaccount.com", rootFolderId: "f1", rootFolderName: "Payslips", sharedDriveId: "sd1" }));
    assert.equal(view.serviceAccountEmail, "x@y.iam.gserviceaccount.com");
    assert.equal(view.rootFolderId, "f1");
    assert.equal(view.rootFolderName, "Payslips");
    assert.equal(view.sharedDriveId, "sd1");
  });
});

describe("buildGoogleDriveConfigUpdateData — encryption + preserving an existing secret", () => {
  it("encrypts a newly submitted private key (real encryptSecret, real round-trip via decryptSecret)", () => {
    const plaintext = "-----BEGIN PRIVATE KEY-----\nSOME-REAL-LOOKING-KEY-MATERIAL\n-----END PRIVATE KEY-----\n";
    const data = buildGoogleDriveConfigUpdateData({
      serviceAccountEmail: "bot@x.iam.gserviceaccount.com",
      sharedDriveId: null,
      rootFolderId: "f1",
      rootFolderName: "Payroll",
      privateKey: plaintext,
    });

    assert.ok(data.privateKeyEncrypted);
    assert.notEqual(data.privateKeyEncrypted, plaintext); // never stored in plaintext
    // `buildGoogleDriveConfigUpdateData` trims the submitted key before encrypting
    // (same normalization as `serviceAccountEmail`/`rootFolderId`/`rootFolderName`
    // — a textarea paste commonly carries an incidental leading/trailing blank
    // line) — so the correctly-recoverable value is the trimmed key, not the
    // original untrimmed input. Internal line breaks within the key body are
    // untouched by `.trim()`, so a real multi-line PEM key is unaffected.
    assert.equal(decryptSecret(data.privateKeyEncrypted as string), plaintext.trim());
  });

  it("omits privateKeyEncrypted entirely when no new key is submitted — preserves whatever is already stored", () => {
    const data = buildGoogleDriveConfigUpdateData({
      serviceAccountEmail: "bot@x.iam.gserviceaccount.com",
      sharedDriveId: null,
      rootFolderId: "f1",
      rootFolderName: "Payroll",
      // no privateKey field at all
    });

    assert.equal(Object.prototype.hasOwnProperty.call(data, "privateKeyEncrypted"), false);
  });

  it("omits privateKeyEncrypted when the submitted key is blank/whitespace-only", () => {
    const data = buildGoogleDriveConfigUpdateData({
      serviceAccountEmail: "bot@x.iam.gserviceaccount.com",
      sharedDriveId: null,
      rootFolderId: "f1",
      rootFolderName: "Payroll",
      privateKey: "   ",
    });

    assert.equal(Object.prototype.hasOwnProperty.call(data, "privateKeyEncrypted"), false);
  });

  it("always includes the non-secret fields regardless of whether a key was submitted", () => {
    const data = buildGoogleDriveConfigUpdateData({
      serviceAccountEmail: "bot@x.iam.gserviceaccount.com",
      sharedDriveId: "sd1",
      rootFolderId: "f1",
      rootFolderName: "Custom Folder",
    });

    assert.equal(data.serviceAccountEmail, "bot@x.iam.gserviceaccount.com");
    assert.equal(data.sharedDriveId, "sd1");
    assert.equal(data.rootFolderId, "f1");
    assert.equal(data.rootFolderName, "Custom Folder");
  });
});

describe("validateGoogleDriveConfigInput", () => {
  it("requires a valid service account email", () => {
    const errors = validateGoogleDriveConfigInput({ serviceAccountEmail: "not-an-email", rootFolderId: "f1", privateKey: "k", hasExistingPrivateKey: false });
    assert.ok(errors.some((e) => /Service Account Email/.test(e)));
  });

  it("requires a Root Folder ID", () => {
    const errors = validateGoogleDriveConfigInput({ serviceAccountEmail: "a@b.iam.gserviceaccount.com", rootFolderId: "", privateKey: "k", hasExistingPrivateKey: false });
    assert.ok(errors.some((e) => /Root Folder ID/.test(e)));
  });

  it("requires a private key on first save (no existing key, none submitted)", () => {
    const errors = validateGoogleDriveConfigInput({ serviceAccountEmail: "a@b.iam.gserviceaccount.com", rootFolderId: "f1", privateKey: "", hasExistingPrivateKey: false });
    assert.ok(errors.some((e) => /Private Key/.test(e)));
  });

  it("does not require a private key when one is already stored and none is resubmitted", () => {
    const errors = validateGoogleDriveConfigInput({ serviceAccountEmail: "a@b.iam.gserviceaccount.com", rootFolderId: "f1", privateKey: "", hasExistingPrivateKey: true });
    assert.equal(errors.length, 0);
  });

  it("passes with a complete, valid input", () => {
    const errors = validateGoogleDriveConfigInput({ serviceAccountEmail: "a@b.iam.gserviceaccount.com", rootFolderId: "f1", privateKey: "key", hasExistingPrivateKey: false });
    assert.equal(errors.length, 0);
  });
});

describe("normalizePrivateKeyLineBreaks — fixes 'error:1E08010C:DECODER routines::unsupported'", () => {
  // A fake-but-realistically-shaped PEM (safe placeholder text, never a real credential —
  // same convention as this file's other fixtures). All test values below are derived from
  // this single fixture in its two equivalent input shapes: real newlines vs. literal
  // backslash-n escape sequences (as a raw service-account JSON `private_key` field, before
  // JSON.parse would normally unescape it, looks like).
  const realNewlineKey =
    "-----BEGIN PRIVATE KEY-----\nFAKE-TEST-KEY-LINE-ONE\nFAKE-TEST-KEY-LINE-TWO\n-----END PRIVATE KEY-----\n";
  const literalEscapedKey =
    "-----BEGIN PRIVATE KEY-----\\nFAKE-TEST-KEY-LINE-ONE\\nFAKE-TEST-KEY-LINE-TWO\\n-----END PRIVATE KEY-----\\n";

  it("leaves an already-correctly-formatted key (real newline characters) completely untouched", () => {
    assert.equal(normalizePrivateKeyLineBreaks(realNewlineKey), realNewlineKey);
  });

  it("converts literal \\n escape sequences into real newlines when the key has no real newline at all", () => {
    const result = normalizePrivateKeyLineBreaks(literalEscapedKey);
    assert.equal(result, realNewlineKey);
    assert.equal(result.includes("\\n"), false); // no literal escape sequences survive
    assert.equal(result.split("\n").length, 5); // 4 real line breaks -> 5 lines
  });

  it("converts literal \\r\\n escape sequences into real newlines too", () => {
    const crlfEscaped = literalEscapedKey.replace(/\\n/g, "\\r\\n");
    const result = normalizePrivateKeyLineBreaks(crlfEscaped);
    assert.equal(result, realNewlineKey);
  });

  it("never touches a key that already has real newlines, even if a literal backslash-n substring also appears inside it (e.g. as part of a comment) — the presence of any real newline is the deciding signal", () => {
    const mixed = `-----BEGIN PRIVATE KEY-----\nline-with-a-literal-\\n-inside-it\n-----END PRIVATE KEY-----\n`;
    assert.equal(normalizePrivateKeyLineBreaks(mixed), mixed);
  });

  it("round-trips correctly through the real save path even when submitted with literal backslash-n escapes — proving the exact bug report's scenario is now handled end to end", () => {
    const data = buildGoogleDriveConfigUpdateData({
      serviceAccountEmail: "bot@x.iam.gserviceaccount.com",
      sharedDriveId: null,
      rootFolderId: "f1",
      rootFolderName: "Payroll",
      privateKey: literalEscapedKey,
    });

    assert.ok(data.privateKeyEncrypted);
    // What actually gets stored (encrypted) is the real-newline form, not the
    // literal-escaped form that was submitted — this is what `google.auth.JWT`
    // requires; confirmed by direct reproduction against the real `googleapis`
    // client (a literal-escaped key throws exactly
    // "error:1E08010C:DECODER routines::unsupported"; the normalized form does not).
    assert.equal(decryptSecret(data.privateKeyEncrypted as string), realNewlineKey);
  });
});
