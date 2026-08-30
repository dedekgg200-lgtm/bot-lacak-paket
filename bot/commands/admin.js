import { config } from "../config/environment.js";
import { workerManager } from "../services/workerManager.js";
import { workerLoginService } from "../services/workerLogin.js";
import { workerSessionManager } from "../services/workerSession.js";
import { userSession } from "../services/userSession.js";

const PHONE_REGEX = /^\+?\d{8,15}$/;

function isOwner(ctx) {
  const id = String(ctx.from?.id ?? "");
  if (config.ownerTelegramId && id === String(config.ownerTelegramId)) return true;
  if (config.ownerTelegramIds.includes(id)) return true;
  return false;
}

function ensureOwner(ctx) {
  if (!isOwner(ctx)) {
    return ctx.reply("⛔ Anda tidak memiliki akses ke perintah ini.");
  }
  return null;
}

function formatWorkers() {
  const workers = workerManager.list();
  if (workers.length === 0) return "Belum ada worker.";
  return workers
    .map((w) => `• ${w.id}: ${w.accountIdentifier} — ${w.status} (req: ${w.totalRequests})`)
    .join("\n");
}

export async function handleAddWorker(ctx) {
  const denied = ensureOwner(ctx);
  if (denied) return denied;

  const phone = (ctx.text ?? "").split(/\s+/).slice(1).join(" ").trim();

  if (!phone) {
    return ctx.reply(
      "Penggunaan: `/addworker <nomor>`\n\nContoh: `/addworker +6281234567890`",
      { parse_mode: "Markdown" }
    );
  }

  if (!config.telegramApiId || !config.telegramApiHash) {
    return ctx.reply("⚠️ TELEGRAM_API_ID / TELEGRAM_API_HASH belum diatur di .env.");
  }

  if (!PHONE_REGEX.test(phone)) {
    return ctx.reply("⚠️ Nomor telepon tidak valid. Contoh: `+6281234567890`", {
      parse_mode: "Markdown",
    });
  }

  workerManager.addWorker(phone);

  try {
    const needCode = await workerLoginService.requestCode(phone);
    if (!needCode) {
      const { createTelegramWorkerClient } = await import("../services/workerClient.js");
      const client = createTelegramWorkerClient(phone);
      await client.connect();
      if (await client.isAuthorized()) {
        workerManager.registerClient(phone, client);
        workerManager.setAvailable(phone);
        return ctx.reply(`✅ Worker ${phone} sudah terhubung (session valid).`);
      }
    }
    userSession.set(String(ctx.from.id), "await_otp", { phone });
    return ctx.reply(
      `✅ Kode OTP telah dikirim ke ${phone}.\n\nKirim **kode OTP**-nya sekarang.`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    return ctx.reply(`⚠️ Gagal mengirim kode OTP: ${err instanceof Error ? err.message : "error"}`);
  }
}

export async function handleWorkers(ctx) {
  const denied = ensureOwner(ctx);
  if (denied) return denied;
  return ctx.reply(`🔐 *Sesi Worker*\n━━━━━━━━━━━━━━━━━━\n${formatWorkers()}`, {
    parse_mode: "Markdown",
  });
}

export async function handleLogoutWorker(ctx) {
  const denied = ensureOwner(ctx);
  if (denied) return denied;

  const phone = (ctx.text ?? "").split(/\s+/).slice(1).join(" ").trim();
  const worker = workerManager
    .list()
    .find((w) => w.accountIdentifier === phone || w.id === phone);
  if (!worker) {
    return ctx.reply(`Worker "${phone || "-"}" tidak ditemukan.\n\n${formatWorkers()}`, {
      parse_mode: "Markdown",
    });
  }

  await workerManager.logoutWorker(worker.id);
  workerSessionManager.remove(worker.accountIdentifier);
  return ctx.reply(`🗑 Worker ${worker.accountIdentifier} berhasil di-logout.`);
}
