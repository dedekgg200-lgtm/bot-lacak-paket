import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const FILE = join(DATA_DIR, "logs.json");

const MAX_LOGS = 500;

/**
 * Penyimpanan log request (best-effort di serverless). Simpan ke file JSON.
 */
export class LogStore {
  load() {
    try {
      if (!existsSync(FILE)) return [];
      const parsed = JSON.parse(readFileSync(FILE, "utf8"));
      return Array.isArray(parsed) ? parsed : Array.isArray(parsed.logs) ? parsed.logs : [];
    } catch {
      return [];
    }
  }

  add(entry) {
    const logs = this.load();
    logs.unshift({ ts: Date.now(), ...entry });
    // Batasi jumlah
    while (logs.length > MAX_LOGS) logs.pop();
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(FILE, JSON.stringify({ updatedAt: Date.now(), logs }, null, 2), "utf8");
    } catch {
      // File mungkin tidak bisa ditulis di serverless — abaikan.
    }
    return logs;
  }

  list(limit = 100) {
    const logs = this.load();
    return logs.slice(0, limit);
  }

  clear() {
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(FILE, JSON.stringify({ updatedAt: Date.now(), logs: [] }, null, 2), "utf8");
    } catch {
      // abaikan
    }
  }
}

export const logStore = new LogStore();
