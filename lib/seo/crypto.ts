import crypto from "node:crypto";
import type { EncryptedSecret } from "./types";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export function getEncryptionKey() {
  const rawKey = process.env.SEO_SECRET_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error("SEO_SECRET_ENCRYPTION_KEY is required to store SEO secrets.");
  }

  if (/^[a-f0-9]{64}$/i.test(rawKey)) {
    return Buffer.from(rawKey, "hex");
  }

  const decoded = Buffer.from(rawKey, "base64");
  if (decoded.length === 32) {
    return decoded;
  }

  throw new Error("SEO_SECRET_ENCRYPTION_KEY must be 32 bytes as base64 or 64 hex characters.");
}

export function encryptSecret(secret: string | null | undefined): EncryptedSecret | null {
  if (!secret) {
    return null;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: ALGORITHM,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSecret(encryptedSecret: EncryptedSecret | null | undefined) {
  if (!encryptedSecret) {
    return null;
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(encryptedSecret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encryptedSecret.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedSecret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
