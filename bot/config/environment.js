import "dotenv/config";

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function parseIdList(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((id) => id.replace(/[^\d-]/g, "").trim())
    .filter((id) => id.length > 0);
}

export const config = {
  botToken: process.env.BOT_TOKEN ?? "",
  telegramApiId: process.env.TELEGRAM_API_ID ?? "",
  telegramApiHash: process.env.TELEGRAM_API_HASH ?? "",
  ownerTelegramId: process.env.OWNER_TELEGRAM_ID ?? "",
  ownerTelegramIds: parseIdList(process.env.OWNER_TELEGRAM_IDS),
  targetBotUsername: process.env.TARGET_BOT_USERNAME ?? "",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  dataDir: process.env.DATA_DIR ?? "",
  resiApiBaseUrl: process.env.RESI_API_BASE_URL ?? "",
  resiTimeoutMs: parsePositiveInt(process.env.RESI_TIMEOUT_MS, 90_000),
};

