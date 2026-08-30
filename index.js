import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getCSRFData, encryptTimers, getResiTracking } from "./function.js";
import { proxyManager } from "./lib/proxyManager.js";
import { logStore } from "./lib/logStore.js";
import { validatePassword, checkAuth, authToken } from "./lib/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new Hono();

// ===== Dashboard =====
app.get("/", (c) => {
  const html = readFileSync(join(__dirname, "public", "index.html"), "utf8");
  return c.html(html);
});

// ===== Auth =====
app.post("/api/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = validatePassword(body?.password);
  if (result.ok) {
    return c.json({ ok: true, token: authToken() });
  }
  return c.json({ ok: false, message: "Password salah" }, 401);
});

// ===== Stats =====
app.get("/api/stats", async (c) => {
  if (!checkAuth(c.req.header("x-auth-token"))) return c.json({ error: "Unauthorized" }, 401);
  const logs = logStore.list(1000);
  const total = logs.length;
  const success = logs.filter((l) => l.status === "success").length;
  const fail = logs.filter((l) => l.status === "fail").length;
  return c.json({ proxyCount: proxyManager.count(), total, success, fail });
});

// ===== Logs =====
app.get("/api/logs", (c) => {
  if (!checkAuth(c.req.header("x-auth-token"))) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ logs: logStore.list(100) });
});

// ===== Proxy management =====
app.get("/api/proxy", (c) => {
  if (!checkAuth(c.req.header("x-auth-token"))) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ proxies: proxyManager.list() });
});

app.post("/api/proxy", async (c) => {
  if (!checkAuth(c.req.header("x-auth-token"))) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const result = proxyManager.add(body?.proxy);
  if (!result.ok) return c.json(result, 400);
  return c.json(result);
});

app.post("/api/proxy/validate", async (c) => {
  if (!checkAuth(c.req.header("x-auth-token"))) return c.json({ error: "Unauthorized" }, 401);
  const result = await proxyManager.validateAll();
  return c.json(result);
});

app.delete("/api/proxy", async (c) => {
  if (!checkAuth(c.req.header("x-auth-token"))) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  if (body?.all) {
    proxyManager.clear();
    return c.json({ ok: true, message: "Semua proxy dihapus" });
  }
  const removed = proxyManager.remove(body?.proxy);
  return c.json({ ok: removed });
});

// ===== Cek Resi (publik) =====
app.get("/cek-resi/:number", async (c) => {
  const number = c.req.param("number");
  if (!number || number.trim() === "") {
    return c.json({ error: "Nomor resi tidak boleh kosong" }, 400);
  }

  const start = Date.now();
  // Proxy opsional dari query, atau ambil dari pool (rotasi).
  const queryProxy = c.req.query("proxy") || null;
  const proxy = queryProxy || proxyManager.getNext();

  try {
    const csrf = await getCSRFData(number, proxy);
    const timers = await encryptTimers(number);
    const trackingData = await getResiTracking(number, csrf, timers, proxy);
    const ms = Date.now() - start;

    if (trackingData?.valid && trackingData?.data) {
      logStore.add({ noResi: number, status: "success", proxy: proxy || "direct", ms });
      return c.json({ status: 200, data: trackingData });
    }
    logStore.add({ noResi: number, status: "fail", proxy: proxy || "direct", ms, message: "Data tidak ditemukan" });
    return c.json({ status: 200, data: trackingData });
  } catch (error) {
    const ms = Date.now() - start;
    const msg = error?.message || (error?.error ? String(error.error) : "Unknown error");
    logStore.add({ noResi: number, status: "fail", proxy: proxy || "direct", ms, message: msg });
    console.error("Error:", msg);
    return c.json({
      status: 200,
      data: { valid: false, message: msg },
    });
  }
});

app.notFound((c) => c.json({ error: "Halaman yang kamu akses tidak ada" }, 404));
app.onError((c) => c.json({ error: "Terjadi kesalahan pada server" }, 500));

// Handler untuk Vercel (serverless).
export default app;

// Jalankan server lokal bila file dijalankan langsung (bukan di Vercel / bukan import).
const isDirectRun =
  process.argv[1] &&
  !process.env.VERCEL &&
  (process.argv[1].endsWith("index.js") || process.argv[1].endsWith("index"));
if (isDirectRun) {
  const { serve } = await import("@hono/node-server");
  const port = process.env.PORT || 3000;
  console.log(`Server running on http://localhost:${port}`);
  serve({ fetch: app.fetch, port: Number(port) });
}
