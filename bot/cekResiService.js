import { getCSRFData, encryptTimers, getResiTracking } from "../../function.js";
import { proxyManager } from "../../lib/proxyManager.js";

/**
 * Cek resi LANGSUNG via scraper function.js (sama server, bukan HTTP eksternal).
 * Ini menjamin bisa akses cekresi.com karena berjalan di server biasa (Pterodactyl),
 * bukan serverless Vercel.
 *
 * Strategi proxy:
 *  - Coba IP asli dulu, lalu coba beberapa proxy (rotasi) dari lib/proxyManager.
 *  - Proxy 401 otomatis dibuang dari pool.
 */
export class CekResiService {
  constructor() {
    this.cache = new Map();
    this.cacheTtlMs = 10 * 60 * 1000;
    this.attemptTimeoutMs = 12_000;
    this.maxProxyAttempts = 4;
  }

  async fetch(noResi, timeoutMs = 40_000) {
    const key = noResi.toUpperCase();

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.ts < this.cacheTtlMs) {
      console.log(`[CEK-RESI] Cache hit untuk ${key}`);
      return cached.data;
    }

    console.log(`[CEK-RESI] Fetch ${noResi}, proxy pool: ${proxyManager.count()}`);
    const data = await this.fetchWithRetries(noResi, timeoutMs);
    const result = data ?? null;
    this.cache.set(key, { ts: Date.now(), data: result });
    console.log(`[CEK-RESI] ${noResi} hasil: ${result ? "ADA" : "NULL"}`);
    return result;
  }

  async fetchWithRetries(noResi, timeoutMs) {
    // Coba IP asli dulu.
    const direct = await this.attempt(noResi, null);
    if (direct.ok) {
      console.log(`[CEK-RESI] ${noResi} -> OK (tanpa proxy)`);
      return direct.data;
    }

    // Coba proxy (rotasi).
    for (let i = 0; i < this.maxProxyAttempts; i++) {
      const proxy = proxyManager.getNext();
      if (!proxy) break;

      const result = await this.attempt(noResi, proxy);
      if (result.ok) {
        console.log(`[CEK-RESI] ${noResi} -> OK via proxy ${proxy}`);
        return result.data;
      }
      if (result.badProxy) {
        proxyManager.remove(proxy);
      }
      console.log(`[CEK-RESI] ${noResi} -> proxy ${proxy} gagal (${result.reason})`);
    }

    return null;
  }

  async attempt(noResi, proxy) {
    const doFetch = async () => {
      try {
        const csrf = await getCSRFData(noResi, proxy);
        const timers = await encryptTimers(noResi);
        const trackingData = await getResiTracking(noResi, csrf, timers, proxy);
        if (trackingData?.valid && trackingData?.data) {
          return { ok: true, data: trackingData.data };
        }
        return { ok: false, reason: "null-data", badProxy: false };
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          return { ok: false, reason: `HTTP ${status}`, badProxy: true };
        }
        return { ok: false, reason: err?.message || "error", badProxy: false };
      }
    };

    return Promise.race([
      doFetch(),
      new Promise((resolve) =>
        setTimeout(() => resolve({ ok: false, reason: "timeout", badProxy: false }), this.attemptTimeoutMs)
      ),
    ]);
  }
}

export const cekResiService = new CekResiService();
