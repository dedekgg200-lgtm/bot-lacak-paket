import { Telegraf } from "telegraf";
import { config } from "./bot/config/environment.js";
import { handleText } from "./bot/commands/index.js";
import { handleStart, startText } from "./bot/commands/start.js";
import { autoConnectWorkers } from "./bot/services/autoConnect.js";
import { workerManager } from "./bot/services/workerManager.js";

async function main() {
  if (!config.botToken) {
    console.error("[MENVORA-RESI] BOT_TOKEN belum diatur. Salin .env.example ke .env lalu isi.");
    process.exit(1);
  }
  if (!config.telegramApiId || !config.telegramApiHash) {
    console.error("[MENVORA-RESI] TELEGRAM_API_ID / TELEGRAM_API_HASH belum diatur di .env.");
    process.exit(1);
  }
  if (!config.targetBotUsername) {
    console.error("[MENVORA-RESI] TARGET_BOT_USERNAME (Res Bot) belum diatur di .env.");
    process.exit(1);
  }

  const bot = new Telegraf(config.botToken);

  // Safety net anti-crash.
  const isKnownUnhandled = (err) =>
    /TIMEOUT|CONNECTION_CLOSED|ECONNRESET|Socket(Timeout|Closed)|READ_TIMEOUT/i.test(
      err instanceof Error ? err.message : String(err)
    );
  process.on("unhandledRejection", (reason) => {
    if (isKnownUnhandled(reason)) return;
    console.error("[MENVORA-RESI][unhandledRejection]", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[MENVORA-RESI][uncaughtException]", err);
  });

  // Set menu command Telegram agar muncul tombol perintah di keyboard.
  try {
    await bot.telegram.setMyCommands([
      { command: "start", description: "Mulai / info bot" },
      { command: "cek", description: "Cek status resi (contoh: /cek JZ3026911456)" },
    ]);
  } catch (err) {
    console.warn("[MENVORA-RESI] Gagal set command menu:", err);
  }

  // Auto-welcome: saat user baru mulai chat (pesan pertama), langsung sapa.
  const greeted = new Set();
  bot.on("new_chat_members", (ctx) => {
    void ctx.reply(startText(), { parse_mode: "Markdown" }).catch(() => {});
  });

  bot.command("start", handleStart);
  bot.on("text", async (ctx) => {
    const userId = String(ctx.from?.id ?? "");
    const isOwner =
      (config.ownerTelegramId && userId === String(config.ownerTelegramId)) ||
      config.ownerTelegramIds.includes(userId);

    // Untuk user baru (bukan owner dan belum pernah disapa), tampilkan welcome
    // pada pesan pertama, lalu lanjutkan ke handler biasa.
    if (!isOwner && !greeted.has(userId)) {
      greeted.add(userId);
      await ctx.reply(startText(), { parse_mode: "Markdown" }).catch(() => {});
    }
    return handleText(ctx);
  });
  bot.catch((err) => {
    console.error("[MENVORA-RESI][bot-catch]", err);
  });

  // Pulihkan worker dari sesi tersimpan.
  try {
    const restored = await autoConnectWorkers();
    if (restored > 0) console.log(`[MENVORA-RESI] ${restored} worker dipulihkan.`);
  } catch (err) {
    console.error("[MENVORA-RESI] Gagal memulihkan worker:", err);
  }
  const avail = workerManager.list().filter((w) => w.status === "AVAILABLE");
  console.log(`[MENVORA-RESI] Worker tersedia: ${avail.length}/${workerManager.list().length}`);

  await bot.launch();
  console.log("[MENVORA-RESI] Bot berjalan.");

  const stop = () => {
    bot.stop("SIGINT");
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((err) => {
  console.error("[MENVORA-RESI] Gagal menjalankan bot:", err);
  process.exit(1);
});
