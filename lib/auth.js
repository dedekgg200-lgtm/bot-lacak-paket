import { createHash, randomBytes } from "node:crypto";

// Token admin sederhana berbasis hash dari password + session id.
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "admin123";

function hashToken(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

/** Buat token admin baru (dipakai setelah login). */
export function createSessionToken() {
  const token = randomBytes(24).toString("hex");
  return token;
}

/** Validasi password dashboard. Return token baru jika benar. */
export function validatePassword(password) {
  if (password === DASHBOARD_PASSWORD) {
    return { ok: true, token: createSessionToken() };
  }
  return { ok: false };
}

/**
 * Middleware sederhana: cek token admin dari cookie/header.
 * Gunakan token statis (hash password) sebagai pengganti session persist,
 * karena serverless tidak punya session store.
 */
export function authToken() {
  return hashToken("menvora-dashboard-" + DASHBOARD_PASSWORD);
}

export function checkAuth(token) {
  return token === authToken();
}
