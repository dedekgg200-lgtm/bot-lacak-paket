import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { config } from "../config/environment.js";

const ALGORITHM = "aes-256-gcm";

function deriveKey(secret) {
  return createHash("sha256").update(secret).digest();
}

export class EncryptionService {
  encrypt(plainText) {
    const key = deriveKey(config.encryptionKey || "dev-insecure-key");
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
  }

  decrypt(payload) {
    const key = deriveKey(config.encryptionKey || "dev-insecure-key");
    const [ivB64, tagB64, dataB64] = payload.split(".");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(dataB64, "base64");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }
}

export const encryptionService = new EncryptionService();
