import { resiCheckService } from "../services/resiCheckService.js";
import { workerManager, WORKER_STATUS } from "../services/workerManager.js";
import { detectExpedisi } from "../services/expedisi.js";

// Nomor resi J&T: awalan (JT|JZ|JK|JR|JM|JE|JH) + digit. Berhenti tepat sebelum
// prefix J&T berikutnya / non-digit / akhir, sehingga dua resi yang menempel
// (contoh "JZ...1447JZ...1448") tetap terpisah.
const PREFIX = /JT|JZ|JK|JR|JM|JE|JH/;
const RESI_PATTERN = new RegExp(
  `(${PREFIX.source})(\\d+)(?=\\D|(?:${PREFIX.source})|$)`,
  "gi"
);

/**
 * Ekstrak daftar nomor resi dari sebuah teks. Mendukung:
 *  - satu nomor: "JZ3026911451"
 *  - banyak nomor satu per baris / dipisah spasi / tanpa pemisah (bulk)
 * Kembalikan array nomor unik (uppercase).
 */
export function parseResiNumbers(text) {
  const matches = (text ?? "").matchAll(RESI_PATTERN);
  const unique = [];
  const seen = new Set();
  for (const m of matches) {
    const n = `${m[1]}${m[2]}`.toUpperCase();
    if (n.length >= 8 && !seen.has(n)) {
      seen.add(n);
      unique.push(n);
    }
  }
  return unique;
}

/** True jika masih ada worker yang langsung tersedia (tidak sibuk semua). */
function hasAvailableWorker() {
  return workerManager.list().some((w) => w.status === WORKER_STATUS.AVAILABLE);
}

/**
 * Kirim satu hasil resi ke chat sebagai pesan terpisah (plain text).
 */
async function sendResiResult(ctx, noResi, index, total) {
  const prefix = total > 1 ? `[${index}/${total}]\n` : "";
  let processing = null;
  try {
    processing = await ctx.reply(`⏳ Mengecek resi *${noResi}*...`, {
      parse_mode: "Markdown",
    });
  } catch {
    // Gagal kirim pesan "processing" (mis. rate limit) — coba tanpa edit.
    try {
      const message = await resiCheckService.check(noResi);
      await ctx.reply(prefix + message).catch(() => {});
    } catch {
      await ctx.reply(`${prefix}❌ *Gagal mengecek resi* ${noResi}`).catch(() => {});
    }
    return;
  }

  try {
    const message = await resiCheckService.check(noResi);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processing.message_id,
      undefined,
      prefix + message
    ).catch(() => {
      // Kalau edit gagal, kirim sebagai pesan baru.
      return ctx.reply(prefix + message).catch(() => {});
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Terjadi kesalahan";
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processing.message_id,
      undefined,
      `${prefix}❌ *Gagal mengecek resi* ${noResi}\n\n${reason}`,
      { parse_mode: "Markdown" }
    ).catch(() => {});
  }
}

/**
 * Proses daftar resi (bulk). Memanfaatkan banyak worker secara paralel:
 * sebanyak worker yang tersedia dipakai bersamaan, sisanya antri. Kirim tiap
 * hasil 1 per 1 terpisah. Dengan 1 worker, proses berurutan; dengan 2+ worker,
 * beberapa resi diproses bersamaan -> lebih cepat.
 */
async function processResiList(ctx, resis) {
  // Anti-double: kalau semua worker sedang sibuk, langsung beri tahu user.
  if (!hasAvailableWorker()) {
    await ctx.reply(
      "⏳ Bot sedang memproses request lain. Silakan tunggu sebentar, lalu coba lagi."
    );
    return;
  }

  if (resis.length > 1) {
    const available = workerManager.list().filter((w) => w.status === WORKER_STATUS.AVAILABLE).length;
    await ctx.reply(
      `📦 Ditemukan *${resis.length}* resi. Diproses (maks ${Math.max(1, Math.min(available, 2))} paralel).\n\n${resis
        .map((r, i) => `${i + 1}. ${r}`)
        .join("\n")}`,
      { parse_mode: "Markdown" }
    );
  }

  // Bounded concurrency: batasi maks 2 bersamaan untuk stabilitas (hindari race).
  const available = workerManager.list().filter((w) => w.status === WORKER_STATUS.AVAILABLE).length;
  const concurrency = Math.max(1, Math.min(available, 2));
  let nextIndex = 0;

  async function workerLoop() {
    while (nextIndex < resis.length) {
      const i = nextIndex;
      nextIndex += 1;
      await sendResiResult(ctx, resis[i], i + 1, resis.length);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, resis.length) }, () => workerLoop());
  await Promise.all(runners);
}

/** Handler untuk perintah /cek <no_resi> (bisa multi resi). */
export async function handleCek(ctx) {
  const args = (ctx.text ?? "").split(/\s+/).slice(1).join(" ").trim();

  if (!args) {
    return ctx.reply(
      "Penggunaan: `/cek <no_resi>`\n\nContoh: `/cek JZ3026911456`\n\nBisa juga kirim banyak resi satu per baris untuk bulk."
    );
  }

  const resis = parseResiNumbers(args);
  if (resis.length === 0) {
    return ctx.reply(
      "⚠️ Tidak ada nomor resi valid ditemukan. Contoh: `/cek JZ3026911456`"
    );
  }

  return processResiList(ctx, resis);
}

/** Handler untuk teks biasa (tanpa perintah) yang berisi nomor resi. */
export async function handleTextResi(ctx, text) {
  const resis = parseResiNumbers(text);
  if (resis.length === 0) return false;

  if (text.trim().startsWith("/")) return false;

  await processResiList(ctx, resis);
  return true;
}
