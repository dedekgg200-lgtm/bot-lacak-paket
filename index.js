require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();

const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

if (!TOKEN) {
  console.log("BOT_TOKEN belum diatur di file .env");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, {
  polling: true
});

// Membuat database
const db = new sqlite3.Database("./data.db");

// Membuat tabel data
db.run(`
  CREATE TABLE IF NOT EXISTS data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    nama TEXT,
    nomor TEXT,
    keterangan TEXT,
    tanggal TEXT
  )
`);

console.log("🤖 Bot Rekap Data berhasil dijalankan");

// Perintah /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  const pesan = `
Halo 👋

Selamat datang di *Bot Rekap Data* 📋

Untuk menambahkan data, gunakan format berikut:

*Nama:* Nama Anda
*Nomor:* 08123456789
*Keterangan:* Contoh keterangan

Kirim data tersebut dalam satu pesan.
  `;

  bot.sendMessage(chatId, pesan, {
    parse_mode: "Markdown"
  });
});

// Menerima pesan
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // Mengabaikan perintah
  if (!text || text.startsWith("/")) {
    return;
  }

  const namaMatch = text.match(/nama\s*:\s*(.+)/i);
  const nomorMatch = text.match(/nomor\s*:\s*(.+)/i);
  const keteranganMatch = text.match(/keterangan\s*:\s*(.+)/i);

  // Jika format tidak sesuai
  if (!namaMatch || !nomorMatch) {
    return;
  }

  const nama = namaMatch[1].trim();
  const nomor = nomorMatch[1].trim();
  const keterangan = keteranganMatch
    ? keteranganMatch[1].trim()
    : "-";

  const tanggal = new Date().toLocaleString("id-ID");

  // Menyimpan data
  db.run(
    `INSERT INTO data 
    (user_id, nama, nomor, keterangan, tanggal)
    VALUES (?, ?, ?, ?, ?)`,
    [userId, nama, nomor, keterangan, tanggal],
    function (err) {
      if (err) {
        console.log(err);

        bot.sendMessage(
          chatId,
          "❌ Terjadi kesalahan saat menyimpan data."
        );

        return;
      }

      const pesanBerhasil = `
✅ *DATA BERHASIL DISIMPAN*

*ID Data:* ${this.lastID}
*Nama:* ${nama}
*Nomor:* ${nomor}
*Keterangan:* ${keterangan}
*Tanggal:* ${tanggal}
      `;

      bot.sendMessage(chatId, pesanBerhasil, {
        parse_mode: "Markdown"
      });
    }
  );
});

// Perintah /rekap
bot.onText(/\/rekap/, (msg) => {
  const chatId = msg.chat.id;

  // Hanya owner yang dapat melihat seluruh data
  if (OWNER_ID && String(msg.from.id) !== String(OWNER_ID)) {
    bot.sendMessage(
      chatId,
      "❌ Anda tidak memiliki akses untuk melihat seluruh rekap data."
    );

    return;
  }

  db.all(
    `SELECT * FROM data ORDER BY id DESC`,
    [],
    (err, rows) => {
      if (err) {
        bot.sendMessage(
          chatId,
          "❌ Terjadi kesalahan mengambil data."
        );

        return;
      }

      if (rows.length === 0) {
        bot.sendMessage(
          chatId,
          "📭 Belum ada data yang tersimpan."
        );

        return;
      }

      let hasil = `📋 *REKAP DATA*\n\n`;

      rows.forEach((data) => {
        hasil += `
*ID:* ${data.id}
*Nama:* ${data.nama}
*Nomor:* ${data.nomor}
*Keterangan:* ${data.keterangan}
*Tanggal:* ${data.tanggal}

━━━━━━━━━━━━━━
`;
      });

      // Telegram memiliki batas panjang pesan
      if (hasil.length > 4000) {
        hasil = hasil.substring(0, 4000);
      }

      bot.sendMessage(chatId, hasil, {
        parse_mode: "Markdown"
      });
    }
  );
});

// Perintah /total
bot.onText(/\/total/, (msg) => {
  const chatId = msg.chat.id;

  db.get(
    `SELECT COUNT(*) AS total FROM data`,
    [],
    (err, row) => {
      if (err) {
        bot.sendMessage(chatId, "❌ Terjadi kesalahan.");
        return;
      }

      bot.sendMessage(
        chatId,
        `📊 *Total Data Tersimpan:* ${row.total}`,
        {
          parse_mode: "Markdown"
        }
      );
    }
});

// Menampilkan kesalahan polling
bot.on("polling_error", (error) => {
  console.log("Polling error:", error.message);
});