import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import pkg from "https-proxy-agent";

const { HttpsProxyAgent } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const FILE = join(DATA_DIR, "proxy.json");

const TEST_URL = "https://cekresi.com";

// Ubah format "host:port[:user:pass]" menjadi URL proxy agent.
function toProxyUrl(proxy) {
  const p = proxy.replace(/^(?:http|https|socks4|socks5):\/\//i, "");
  const parts = p.split(":");
  if (parts.length < 2) return null;
  const host = parts[0];
  const port = parts[1];
  if (parts.length >= 4) {
    const user = parts[2];
    const pass = parts.slice(3).join(":");
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  return `http://${host}:${port}`;
}

/**
 * Manajemen proxy di sisi API.
 * Menyimpan daftar proxy (host:port[:user:pass]) ke data/proxy.json (best-effort,
 * karena Vercel serverless tidak menjamin persist file). Sediakan rotasi + validasi.
 */
export class ProxyManager {
  constructor() {
    this.proxies = []; // array string proxy
    this.rotator = 0;
    this.loaded = false;
  }

  init() {
    if (this.loaded) return;
    this.proxies = this.loadFromFile();
    this.loaded = true;
  }

  loadFromFile() {
    try {
      if (!existsSync(FILE)) return [];
      const parsed = JSON.parse(readFileSync(FILE, "utf8"));
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.proxies) ? parsed.proxies : [];
      return arr.map((p) => (typeof p === "string" ? p : p?.proxy)).filter(Boolean);
    } catch {
      return [];
    }
  }

  saveToFile() {
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(FILE, JSON.stringify({ updatedAt: Date.now(), proxies: this.proxies }, null, 2), "utf8");
    } catch {
      // File mungkin tidak bisa ditulis di serverless — abaikan.
    }
  }

  list() {
    this.init();
    return this.proxies.slice();
  }

  count() {
    this.init();
    return this.proxies.length;
  }

  /** Dapatkan proxy berikutnya (rotasi round-robin). */
  getNext() {
    this.init();
    if (this.proxies.length === 0) return null;
    const p = this.proxies[this.rotator % this.proxies.length];
    this.rotator += 1;
    return p;
  }

  /** Tambah proxy manual. Return hasil. */
  add(proxyStr) {
    this.init();
    const proxy = this.normalize(proxyStr);
    if (!proxy) return { ok: false, message: "Format proxy tidak valid. Contoh: host:port atau host:port:user:pass" };
    if (this.proxies.includes(proxy)) return { ok: false, message: `Proxy ${proxy} sudah ada.` };
    this.proxies.push(proxy);
    this.saveToFile();
    return { ok: true, proxy };
  }

  /** Hapus proxy. */
  remove(proxyStr) {
    this.init();
    const before = this.proxies.length;
    this.proxies = this.proxies.filter((p) => p !== proxyStr);
    this.saveToFile();
    return this.proxies.length < before;
  }

  clear() {
    this.init();
    this.proxies = [];
    this.saveToFile();
  }

  normalize(line) {
    const l = (line ?? "").trim();
    if (!l) return null;
    const p = l.replace(/^(?:http|https|socks4|socks5):\/\//i, "");
    const parts = p.split(":");

    if (parts.length === 2) {
      // host:port
      if (!/^\d+$/.test(parts[1])) return null;
      return `${parts[0]}:${parts[1]}`;
    }

    if (parts.length >= 4) {
      // Deteksi urutan: cari bagian yang port (angka).
      // Format host:port:user:pass  → parts[1] angka
      // Format user:pass:host:port  → bagian terakhir angka (port di akhir)
      const portIndex = parts.findIndex((seg) => /^\d+$/.test(seg) && parts.indexOf(seg) !== 0);
      if (portIndex === -1) return null;

      if (portIndex === 1) {
        // host:port:user:pass
        const host = parts[0];
        const port = parts[1];
        const user = parts[2] ?? "";
        const pass = parts.slice(3).join(":") ?? "";
        return pass ? `${host}:${port}:${user}:${pass}` : `${host}:${port}:${user}`;
      }
      // user:pass:host:port  (port di posisi terakhir)
      const host = parts[parts.length - 2];
      const port = parts[parts.length - 1];
      const user = parts[0];
      const pass = parts.slice(1, parts.length - 2).join(":");
      return `${host}:${port}:${user}:${pass}`;
    }

    return null;
  }

  /** Validasi satu proxy terhadap cekresi.com. */
  async validateOne(proxyStr) {
    const url = toProxyUrl(proxyStr);
    if (!url) return { proxy: proxyStr, valid: false, latencyMs: 0, reason: "format" };
    const start = Date.now();
    try {
      const agent = new HttpsProxyAgent(url);
      await axios.get(TEST_URL, { httpsAgent: agent, proxy: false, timeout: 8000, maxRedirects: 2 });
      return { proxy: proxyStr, valid: true, latencyMs: Date.now() - start, reason: "ok" };
    } catch (err) {
      const status = err?.response?.status;
      return { proxy: proxyStr, valid: false, latencyMs: Date.now() - start, reason: status ? `HTTP ${status}` : err?.code || "error" };
    }
  }

  /** Validasi semua proxy (paralel terbatas). Kembalikan hasil + simpan hanya yang valid. */
  async validateAll({ maxParallel = 5 } = {}) {
    this.init();
    const list = this.proxies.slice();
    const results = [];
    const queue = [...list];

    const self = this;
    async function workerB() {
      while (queue.length > 0) {
        const p = queue.shift();
        results.push(await self.validateOne(p));
      }
    }

    const runners = Array.from({ length: Math.min(maxParallel, list.length || 1) }, () => workerB());
    await Promise.all(runners);

    const valid = results.filter((r) => r.valid).map((r) => r.proxy);
    const validResults = results.filter((r) => r.valid);
    this.proxies = valid;
    this.saveToFile();
    return { total: list.length, valid: validResults.length, results: validResults };
  }
}

export const proxyManager = new ProxyManager();
