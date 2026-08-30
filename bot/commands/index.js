import { config } from "../config/environment.js";
import { workerLoginService } from "../services/workerLogin.js";
import { workerManager } from "../services/workerManager.js";
import { userSession } from "../services/userSession.js";
import { handleAddWorker, handleWorkers, handleLogoutWorker } from "./admin.js";
import { handleStart } from "./start.js";
import { handleCek, handleTextResi } from "./cek.js";

async function handleSessionInput(ctx, text) {
  const session = userSession.get(ctx.from?.id);
  if (!session) return false;

  if (session.state === "await_otp") {
    const { phone } = session.data;
    try {
      const result = await workerLoginService.verifyCode(phone, text.trim());
      if (result.need2FA) {
        userSession.set(String(ctx.from.id), "await_2fa", { phone });
        await ctx.reply("🔑 Akun ini memakai 2FA. Kirim **password 2FA**-nya.", {
          parse_mode: "Markdown",
        });
        return true;
      }
      userSession.clear(String(ctx.from.id));
      await ctx.reply(`✅ Worker ${phone} berhasil login dan siap digunakan.`);
      return true;
    } catch (err) {
      userSession.clear(String(ctx.from.id));
      await ctx.reply(`❌ Gagal verifikasi OTP: ${err instanceof Error ? err.message : "error"}`);
      return true;
    }
  }

  if (session.state === "await_2fa") {
    const { phone } = session.data;
    try {
      await workerLoginService.verifyPassword(phone, text);
      userSession.clear(String(ctx.from.id));
      await ctx.reply(`✅ Worker ${phone} berhasil login (2FA) dan siap digunakan.`);
      return true;
    } catch (err) {
      userSession.clear(String(ctx.from.id));
      await ctx.reply(`❌ Gagal verifikasi password: ${err instanceof Error ? err.message : "error"}`);
      return true;
    }
  }

  return false;
}

export async function handleText(ctx) {
  const text = ctx.text ?? "";

  // Perintah slash.
  if (text.startsWith("/")) {
    const [command] = text.split(/\s+/);
    switch (command) {
      case "/start":
        return handleStart(ctx);
      case "/cek":
        return handleCek(ctx);
      case "/addworker":
        return handleAddWorker(ctx);
      case "/workers":
        return handleWorkers(ctx);
      case "/logoutworker":
        return handleLogoutWorker(ctx);
      default:
        return undefined;
    }
  }

  // Alur input bertahap (OTP/2FA) untuk owner.
  if (await handleSessionInput(ctx, text)) return undefined;

  // Teks biasa yang berisi nomor resi -> langsung periksa (tanpa /cek).
  // Mendukung banyak resi (bulk) satu per baris.
  const handled = await handleTextResi(ctx, text);
  if (handled) return undefined;

  return undefined;
}

export { config };
