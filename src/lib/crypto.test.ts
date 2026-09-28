import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// EMAIL_SECRET_KEY must be set before `crypto.ts` is imported, since
// `getKey()` reads it lazily on every call (not at module load) — a fixed,
// arbitrary test-only value, never a real production secret.
process.env.EMAIL_SECRET_KEY = "test-only-secret-key-not-a-real-credential";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a value unchanged, byte-for-byte", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const original = "abcd efgh ijkl mnop"; // shape of a real Gmail App Password as Google displays it
    const encrypted = encryptSecret(original);
    assert.equal(decryptSecret(encrypted), original);
  });

  it("round-trips an email-shaped value unchanged (guards against any future crypto-layer corruption masquerading as the sender-email bug)", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const original = "officepravakar@gmail.com";
    const encrypted = encryptSecret(original);
    assert.equal(decryptSecret(encrypted), original);
  });

  it("produces a different ciphertext each time (random IV) but always decrypts back to the same plaintext", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const original = "s3cr3t-app-password";
    const first = encryptSecret(original);
    const second = encryptSecret(original);
    assert.notEqual(first, second);
    assert.equal(decryptSecret(first), original);
    assert.equal(decryptSecret(second), original);
  });

  it("stores as iv:authTag:ciphertext (all hex) — the exact format decryptSecret expects", async () => {
    const { encryptSecret } = await import("./crypto");
    const encrypted = encryptSecret("some-password");
    const parts = encrypted.split(":");
    assert.equal(parts.length, 3);
    for (const part of parts) {
      assert.match(part, /^[0-9a-f]+$/);
    }
  });

  it("throws (does not silently return garbage) when the encryption key changes between encrypt and decrypt", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const encrypted = encryptSecret("a-real-password");
    const savedKey = process.env.EMAIL_SECRET_KEY;
    process.env.EMAIL_SECRET_KEY = "a-different-key-entirely";
    try {
      assert.throws(() => decryptSecret(encrypted));
    } finally {
      process.env.EMAIL_SECRET_KEY = savedKey;
    }
  });

  it("empty string round-trips to empty string without attempting real encryption", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    assert.equal(encryptSecret(""), "");
    assert.equal(decryptSecret(""), "");
  });
});
