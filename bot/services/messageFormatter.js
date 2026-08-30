/**
 * Memformat pesan akhir yang dikirim ke user.
 *
 * Sumber utama: respons Res Bot (format lengkap: Ekspedisi, Resi, Status,
 * Penerima, Barang, Update Terakhir).
 *
 * Field "Penerima" pada pesan Res Bot (yang sudah di-mask, mis. `s*****i`)
 * diganti dengan NAMA penerima penuh hasil script cek-resi (proyek root),
 * misal dari "Package has been delivered to Sri Susanti,  (Delivered)"
 * menjadi "Sri Susanti".
 */

const PENERIMA_HEADER = "🚩 Penerima";

/**
 * Ambil hanya NAMA penerima dari string API cek-resi.
 *
 * Pola: "Package has been delivered to <NAMA>,  (Delivered)"
 *  -> mengambil teks antara "delivered to " dan ", (Delivered)".
 *
 * Hanya untuk status delivered. Untuk status lain kembalikan "" supaya dipakai
 * nama dari Res Bot (yang sudah di-mask) sebagai fallback yang lebih tepat.
 */
export function formatPenerima(raw) {
  const text = (raw ?? "").trim();
  if (!text) return "";

  // Tangkap nama setelah "delivered to " sampai salah satu dari: koma, kurung,
  // atau akhir string. Mencakup format:
  //   "delivered to usep pramuji,  (Delivered)"
  //   "delivered to usep pramuji,"
  //   "delivered to usep pramuji"
  const m = text.match(/delivered\s+to\s+([^,()]+)/i);
  if (!m) return "";

  // Bersihkan spasi/karakter trailing.
  const name = m[1].trim();
  if (!name) return "";
  return name;
}

function extractPenerimaFromResBot(text) {
  // Ambil nama penerima dari Res Bot sebelum di-ganti (untuk fallback).
  const idx = text.indexOf(PENERIMA_HEADER);
  if (idx === -1) return "";
  const after = text.slice(idx + PENERIMA_HEADER.length);
  // Baris pertama setelah header biasanya "┠  <nama>"
  const lines = after.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return "";
  const first = lines[0];
  const m = first.match(/┠\s*(.*)/);
  return m ? m[1].trim() : "";
}

/**
 * Ganti nilai Penerima pada teks Res Bot dengan nama dari script cek-resi.
 * Jika `newPenerima` kosong/tidak ditemukan, teks Res Bot dibiarkan apa adanya.
 */
export function applyPenerima(text, newPenerima) {
  const idx = text.indexOf(PENERIMA_HEADER);
  if (idx === -1) return text;

  const blockEnd = text.indexOf("\n\n", idx);
  const end = blockEnd === -1 ? text.length : blockEnd;
  const block = text.slice(idx, end);
  const lines = block.split(/\r?\n/);

  const replacement = (newPenerima ?? "").trim();

  const resultLines = lines.map((line) => {
    if (/^┠\s*/.test(line)) {
      return `┠  ${replacement || line.replace(/^┠\s*/, "")}`;
    }
    return line;
  });

  return text.slice(0, idx) + resultLines.join("\n") + text.slice(end);
}

/**
 * Format pesan akhir. Jika cekResiData berisi penerima, ganti field penerima
 * pada pesan Res Bot. Jika cekResiData null, pakai pesan Res Bot mentah.
 */
export function formatResiMessage(resBotText, cekResiData) {
  let message = resBotText.trim();

  const rawPenerima = cekResiData?.penerima;
  let penerima = formatPenerima(rawPenerima);

  // Fallback: kalau API tidak memberikan nama penuh, pakai nama dari pesan
  // Res Bot (yang sudah di-mask, mis. "N****n") supaya field tidak kosong.
  if (!penerima) {
    penerima = extractPenerimaFromResBot(message);
  }

  console.log(
    `[FORMAT] rawPenerima=${JSON.stringify(rawPenerima)} -> formatPenerima=${JSON.stringify(penerima)}`
  );
  if (penerima) {
    message = applyPenerima(message, penerima);
  }

  return message;
}
