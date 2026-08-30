/**
 * Deteksi ekspedisi dari nomor resi, lalu peta ke perintah Res Bot.
 * Saat ini baru J&T yang didukung penuh (Res Bot command `/jnt`).
 */

const RESI_PREFIXES = [
  { name: "J&T Express", command: "jnt", regex: /^(JT|JZ|JK|JR|JM|JE|JH)\s*[A-Z0-9]+/i },
];

export function detectExpedisi(noResi) {
  const resi = (noResi ?? "").replace(/\s+/g, "").toUpperCase();
  for (const exp of RESI_PREFIXES) {
    if (exp.regex.test(resi)) {
      return exp;
    }
  }
  return null;
}

/**
 * Bangun perintah untuk dikirim ke Res Bot.
 * Contoh: `/jnt JZ3026911456`
 */
export function buildResBotCommand(noResi) {
  const exp = detectExpedisi(noResi);
  if (!exp) {
    throw new Error(
      `Ekspedisi tidak terdeteksi. Cek kode awalan resi (saat ini hanya mendukung J&T Express).`
    );
  }
  const resi = noResi.replace(/\s+/g, "").toUpperCase();
  return `/${exp.command} ${resi}`;
}
