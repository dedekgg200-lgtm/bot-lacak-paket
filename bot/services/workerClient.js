import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TelegramClient } from "telegram";
import { config } from "../config/environment.js";
import { encryptionService } from "./encryption.js";

const require = createRequire(import.meta.url);
const Api = (await import("telegram")).Api;

const SESSION_DIR = config.dataDir || join(process.cwd(), "data");

export class TelegramWorkerClient {
  constructor(accountIdentifier) {
    this.accountIdentifier = accountIdentifier;
    this.client = null;
    this.connected = false;
    this.phoneCodeHash = null;
    this.pending = [];
    this.targetPeerId = null;
    this.bestEdit = null;
    this.editDebounceTimer = null;
    this.lastResolvedText = null;
  }

  stringSession() {
    const { StringSession } = require("telegram/sessions");
    return StringSession;
  }

  ensureSessionDir() {
    if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });
  }

  loadSession() {
    const file = join(SESSION_DIR, `${this.accountIdentifier}.session`);
    if (!existsSync(file)) return "";
    try {
      return encryptionService.decrypt(readFileSync(file, "utf8"));
    } catch {
      return "";
    }
  }

  persistSession() {
    if (!this.client) return;
    this.ensureSessionDir();
    const file = join(SESSION_DIR, `${this.accountIdentifier}.session`);
    const saved = this.client.session.save();
    writeFileSync(file, encryptionService.encrypt(String(saved)), "utf8");
  }

  async connect() {
    const StringSession = this.stringSession();
    const stringSession = new StringSession(this.loadSession());

    const client = new TelegramClient(stringSession, Number(config.telegramApiId), config.telegramApiHash, {
      connectionRetries: 3,
    });

    this.client = client;

    try {
      const { LogLevel } = require("telegram/extensions/Logger");
      client._log?.setLevel?.(LogLevel.ERROR);
    } catch {
      // biarkan default
    }

    const { NewMessage, Raw } = require("telegram/events");
    // Tangkap pesan baru (NewMessage) DAN hasil edit pesan (Raw/UpdateEditMessage),
    // karena Res Bot sering mengubah pesan "Mengecek data..." menjadi hasil resi.
    client.addEventHandler((event) => this.handleEvent(event), new NewMessage({}));
    client.addEventHandler((event) => this.handleRawUpdate(event), new Raw({}));

    await client.connect();
    this.connected = true;
  }

  isConnected() {
    return this.connected;
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // abaikan
      }
    }
    this.connected = false;
  }

  async isAuthorized() {
    if (!this.client) return false;
    try {
      for (let i = 0; i < 3; i++) {
        try {
          if (await this.client.checkAuthorization()) return true;
        } catch {
          // coba lagi
        }
        await new Promise((r) => setTimeout(r, 800));
      }
      return false;
    } catch {
      return false;
    }
  }

  async sendCode(phoneNumber) {
    if (!this.client) throw new Error("Client belum di-connect.");
    try {
      const result = await this.client.invoke(
        new Api.auth.SendCode({
          phoneNumber,
          apiId: Number(config.telegramApiId),
          apiHash: config.telegramApiHash,
          settings: new Api.CodeSettings({}),
        })
      );
      this.phoneCodeHash = result.phoneCodeHash;
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already|authorized/i.test(msg)) return false;
      throw err;
    }
  }

  async signIn(phoneNumber, phoneCode) {
    if (!this.client || !this.phoneCodeHash) {
      throw new Error("Belum ada permintaan kode OTP.");
    }
    try {
      await this.client.invoke(
        new Api.auth.SignIn({
          phoneNumber,
          phoneCodeHash: this.phoneCodeHash,
          phoneCode,
        })
      );
      this.phoneCodeHash = null;
      this.persistSession();
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/SESSION_PASSWORD_NEEDED/i.test(msg)) return true;
      throw err;
    }
  }

  async signInWithPassword(password) {
    if (!this.client) throw new Error("Client belum di-connect.");
    const passwordSrpResult = await this.client.invoke(new Api.account.GetPassword({}));
    const { computeCheck } = require("telegram/Password");
    const passwordSrpCheck = await computeCheck(passwordSrpResult, password);
    await this.client.invoke(new Api.auth.CheckPassword({ password: passwordSrpCheck }));
    this.phoneCodeHash = null;
    this.persistSession();
  }

  handleRawUpdate(update) {
    // Tangkap edit pesan (UpdateEditMessage/UpdateEditChannelMessage) yang berisi
    // hasil resi final (Res Bot mengubah "Mengecek data..." menjadi hasil lengkap).
    const u = update;
    const isEdit =
      u?.className === "UpdateEditMessage" || u?.className === "UpdateEditChannelMessage";
    if (!isEdit) return;

    const msg = u?.message;
    if (!msg) return;
    if (msg.out === true) return;

    // Hanya dari target Res Bot.
    if (!this.isFromTargetBot({ message: msg })) return;

    const text = msg.message ?? "";
    if (!text || text.trim() === "") return;

    // Abaikan status sementara.
    if (this.isTempStatus(text)) {
      console.log(`[WORKER] Edit status sementara diabaikan: ${text.slice(0, 60)}...`);
      return;
    }

    // Res Bot mungkin meng-edit bertahap (makin lama makin lengkap). Jangan
    // langsung resolve; simpan teks edit paling lengkap dan tunggu hingga pesan
    // terlihat FINAL (mengandung bagian-bagian hasil seperti Update Terakhir).
    console.log(`[WORKER] Edit pesan dari Res Bot (${text.length} char): ${text.slice(0, 80)}...`);
    this.holdEdit(text);
  }

  /**
   * Simpan teks edit terbaik. Jika sudah "lengkap" (final), langsung resolve
   * pending. Jika masih parsial, tunggu edit berikutnya yang lebih lengkap.
   */
  holdEdit(text) {
    // Simpan sebagai kandidat terbaru & terbaik.
    this.bestEdit = text;

    // Jika belum ada pending, tidak ada yang perlu di-resolve.
    if (this.pending.length === 0) {
      console.log(`[WORKER] holdEdit: tidak ada pending (len=${this.pending.length})`);
      return;
    }

    // Jika sudah lengkap, resolve sekarang.
    if (this.isCompleteResult(text)) {
      console.log(`[WORKER] holdEdit: LENGKAP -> enqueue (${text.length} char)`);
      this.enqueueResponse(text);
      this.bestEdit = null;
      return;
    }

    // Masih parsial: mulai timer debounce; kalau tidak ada edit baru yang
    // melengkapi dalam 2.5 detik, resolve dengan yang ada sekarang.
    console.log(`[WORKER] holdEdit: parsial -> debounce 2.5s (${text.length} char)`);
    clearTimeout(this.editDebounceTimer);
    this.editDebounceTimer = setTimeout(() => {
      if (this.pending.length > 0 && this.bestEdit) {
        const textToSend = this.bestEdit;
        this.bestEdit = null;
        console.log(`[WORKER] debounce: resolve (${textToSend.length} char)`);
        this.enqueueResponse(textToSend);
      } else {
        console.log(`[WORKER] debounce: tidak resolve (pending=${this.pending.length}, bestEdit=${!!this.bestEdit})`);
      }
    }, 2500);
  }

  /** Pesan hasil resi dianggap final jika memuat bagian-bagian hasil utama. */
  isCompleteResult(text) {
    // Penanda akhir: Update Terakhir / Penerima / Barang. Semakin banyak bagian
    // hasil yang muncul, semakin yakin itu hasil final.
    const markers = [
      /Update Terakhir/i,
      /Penerima/i,
      /Barang/i,
      /Service\s*:/i,
    ];
    const hit = markers.filter((re) => re.test(text)).length;
    return hit >= 3;
  }

  handleEvent(event) {
    const msg = event?.message;
    const isPrivate = msg?.isPrivate ?? event?.isPrivate ?? false;
    if (!isPrivate) return;
    if (!msg) return;
    if (msg.out === true) return;

    // Hanya terima DM dari target Res Bot (bukan dari bot/akun lain).
    if (!this.isFromTargetBot(event)) return;

    const text = msg.message ?? "";
    if (!text || text.trim() === "") return;

    // Abaikan status sementara ("Mengecek data...", "Memproses...", dll).
    if (this.isTempStatus(text)) {
      console.log(`[WORKER] Status sementara diabaikan: ${text.slice(0, 60)}...`);
      return;
    }

    console.log(`[WORKER] DM dari Res Bot: ${text.slice(0, 80)}...`);
    this.enqueueResponse(text);
  }

  /** True jika pesan adalah status pemrosesan sementara, bukan hasil akhir. */
  isTempStatus(text) {
    return /mengecek data|memproses|processing|\.\.\.$|\.\.$/i.test(text.trim());
  }

  isFromTargetBot(event) {
    // Priority 1: bandingkan dengan peer id target bot (sudah di-resolve).
    const senderId = event?.message?.senderId;
    if (this.targetPeerId != null && senderId != null) {
      const normalized = this.normalizeId(senderId);
      if (normalized === this.targetPeerId) return true;
      return false;
    }

    // Priority 2: bandingkan username (fallback sebelum peer id tersedia).
    const senderUsername = event?.message?.peerId?.username;
    const target = (config.targetBotUsername || "").replace("@", "").toLowerCase();
    if (target && senderUsername) {
      if (senderUsername.toLowerCase() === target) return true;
      return false;
    }

    // Priority 3: pesan berasal dari bot (tidak keluar dari kita) & masuk.
    // Tanpa informasi sender, anggap diterima (fallback longgar).
    return true;
  }

  normalizeId(id) {
    if (id == null) return null;
    if (typeof id === "object") {
      const v = id.value ?? id.userId ?? id.id ?? id;
      if (v && typeof v === "object") return String(v.value ?? v);
      return String(v ?? "");
    }
    // Jangan normalisasi id negatif dari channel.
    return String(id);
  }

  async resolveTargetPeerId(username) {
    if (!this.client || !username) return;
    try {
      const target = username.replace("@", "");
      const entity = await this.client.getEntity(target);
      const id = entity?.id;
      if (id != null) {
        this.targetPeerId = this.normalizeId(id);
        console.log(`[WORKER] Target Res Bot id tersimpan: ${this.targetPeerId}`);
      }
    } catch (err) {
      console.warn(`[WORKER] Gagal resolve target bot id: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Proses satu pesan hasil dari Res Bot. Hanya resolve jika ada pending.
   * Pakai deduplikasi teks agar pesan yang sama (dari NewMessage + Raw) tidak
   * diproses dua kali.
   */
  enqueueResponse(text) {
    // Deduplikasi: lewati jika teks yang sama baru saja diproses.
    if (this.lastResolvedText === text) {
      return;
    }
    this.lastResolvedText = text;

    if (this.pending.length === 0) {
      // Tidak ada pending (pesan sudah lewat / timeout) — buang, jangan simpan.
      return;
    }

    const resolve = this.pending.shift();
    clearTimeout(resolve.timer);
    const report = { text };
    console.log(`[WORKER] resolve pending: ${text.length} char`);
    resolve.fn(report);
  }

  async sendMessage(targetBotUsername, text) {
    if (!this.client || !this.connected) {
      throw new Error("Worker belum terhubung.");
    }
    // Resolve id target Res Bot supaya bisa filter DM dari bot itu saja.
    await this.resolveTargetPeerId(targetBotUsername);
    console.log(`[WORKER] Mengirim ke ${targetBotUsername}: ${text}`);
    const sent = await this.client.sendMessage(targetBotUsername, { message: text });
    return sent.id;
  }

  /**
   * Pasang pending response. Promise selesai ketika ada pesan lengkap masuk
   * dari target bot. Panggil SEBELUM sendMessage agar tidak ada respons yang
   * terlewat.
   */
  waitForResponse(timeoutMs) {
    // Reset deduplikasi untuk request baru (pesan yang sama boleh diproses lagi
    // pada request berikutnya).
    this.lastResolvedText = null;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.pending.findIndex((p) => p.timer === timer);
        if (idx !== -1) this.pending.splice(idx, 1);
        console.log(`[WORKER] waitForResponse: TIMEOUT ${timeoutMs}ms`);
        resolve(null);
      }, timeoutMs);
      this.pending.push({ fn: resolve, timer });
    });
  }
}

export function createTelegramWorkerClient(accountIdentifier) {
  return new TelegramWorkerClient(accountIdentifier);
}
