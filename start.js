/**
 * Entry utama "bot tele cek resi".
 * Menjalankan API cek resi + bot Telegram sekaligus dalam satu server (Pterodactyl).
 * Cukup satu perintah: npm start
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

function run(name, script) {
  const child = spawn(node, [script], {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] dihentikan (signal ${signal}).`);
    } else {
      console.log(`[${name}] keluar dengan kode ${code}.`);
    }
  });
  child.on("error", (err) => {
    console.error(`[${name}] error:`, err.message);
  });
  return child;
}

const api = run("API Cek Resi", join(__dirname, "index.js"));
const bot = run("Bot Menvora Resi", join(__dirname, "bot.js"));

function shutdown() {
  console.log("\n[START] Menghentikan semua proses...");
  api.kill();
  bot.kill();
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
