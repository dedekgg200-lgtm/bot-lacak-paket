/**
 * Session sementara per user (in-memory). Dipakai untuk alur input bertahap,
 * misal menambahkan worker: /addworker <nomer> -> masukkan OTP -> (2FA).
 */

class UserSession {
  constructor() {
    this.sessions = new Map();
  }

  set(userId, state, data = {}) {
    const key = String(userId);
    this.sessions.set(key, { state, data, updatedAt: Date.now() });
  }

  get(userId) {
    return this.sessions.get(String(userId)) ?? null;
  }

  updateData(userId, data) {
    const key = String(userId);
    const existing = this.sessions.get(key);
    if (existing) {
      existing.data = { ...existing.data, ...data };
      existing.updatedAt = Date.now();
    }
  }

  clear(userId) {
    this.sessions.delete(String(userId));
  }
}

export const userSession = new UserSession();
