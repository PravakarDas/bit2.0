import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const secret = process.env.EMAIL_SECRET_KEY;
  if (!secret) {
    throw new Error("EMAIL_SECRET_KEY environment variable is not set");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext secret for storage. Format: iv:authTag:ciphertext (all hex).
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return "";

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(cipherText: string): string {
  if (!cipherText) return "";

  const [ivHex, authTagHex, dataHex] = cipherText.split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Invalid encrypted secret format");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);

  return decrypted.toString("utf8");
}
