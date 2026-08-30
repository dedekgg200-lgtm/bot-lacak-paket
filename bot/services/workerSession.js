import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { encryptionService } from "./encryption.js";
import { config } from "../config/environment.js";

const DATA_DIR = config.dataDir || join(process.cwd(), "data");

export class WorkerSessionManager {
  ensureDir() {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  }

  save(accountIdentifier, session) {
    this.ensureDir();
    const encrypted = encryptionService.encrypt(session);
    const file = join(DATA_DIR, `${accountIdentifier}.session`);
    writeFileSync(file, encrypted, "utf8");
  }

  load(accountIdentifier) {
    const file = join(DATA_DIR, `${accountIdentifier}.session`);
    if (!existsSync(file)) return null;
    try {
      const encrypted = readFileSync(file, "utf8");
      return encryptionService.decrypt(encrypted);
    } catch {
      return null;
    }
  }

  has(accountIdentifier) {
    return existsSync(join(DATA_DIR, `${accountIdentifier}.session`));
  }

  remove(accountIdentifier) {
    const file = join(DATA_DIR, `${accountIdentifier}.session`);
    if (existsSync(file)) {
      try {
        unlinkSync(file);
      } catch {
        // abaikan
      }
    }
  }

  list() {
    if (!existsSync(DATA_DIR)) return [];
    const names = [];
    for (const f of readdirSync(DATA_DIR)) {
      if (f.endsWith(".session")) names.push(f.replace(/\.session$/, ""));
    }
    return names;
  }
}

export const workerSessionManager = new WorkerSessionManager();
