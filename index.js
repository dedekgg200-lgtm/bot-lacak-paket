const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ===============================
// ENVIRONMENT VARIABLE
// ===============================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_TOKEN belum diatur di Railway.');
  process.exit(1);
}

// ===============================
// DATABASE SEDERHANA
// ===============================
const DATA_FILE = path.join(__dirname, 'data.json');

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    return {};
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===============================
// BOT
// ===============================
const bot = new TelegramBot(TELEGRAM_TOKEN, {
  polling: true
});

// ===============================
// MENU
// ===============================
function tampilkanMenu(chatId) {
  bot.sendMessage(chatId, '📋 Menu Bot Rekap', {
    reply_markup: {
      keyboard: [
        [{ text: '➕ Tambah Data' }],
        [{ text: '📋 Lihat Rekap' }],
        [{ text: '🗑 Hapus Semua Data' }]
      ],
      resize_keyboard: true
    }
  });
}

// ===============================
// /START
// ===============================
bot.onText(/^\\/start$/, (msg) => {
  tampilkanMenu(msg.chat.id);
});

// ===============================
// TAMBAH DATA
// ===============================
bot.on('message', async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text === '➕ Tambah Data') {
    return bot.sendMessage(
      chatId,
      'Silakan kirim data yang ingin direkap.\n\n' +
      'Bisa kirim beberapa data sekaligus, satu data per baris.'
    );
  }

  if (text === '📋 Lihat Rekap') {
    const data = loadData();
    const userData = data[chatId] || [];

    if (userData.length === 0) {
      return bot.sendMessage(chatId, '📋 Rekap masih kosong.');
    }

    let hasil = '📋 REKAP DATA\n\n';

    userData.forEach((item, index) => {
      hasil += `${index + 1}. ${item}\n`;
    });

    return bot.sendMessage(chatId, hasil);
  }

  if (text === '🗑 Hapus Semua Data') {
    const data = loadData();

    if (!data[chatId] || data[chatId].length === 0) {
      return bot.sendMessage(chatId, 'Tidak ada data yang bisa dihapus.');
    }

    delete data[chatId];
    saveData(data);

    return bot.sendMessage(chatId, '✅ Semua data kamu sudah dihapus.');
  }

  // Abaikan perintah /start
  if (text === '/start') return;

  // Abaikan tombol menu
  if (
    text === '➕ Tambah Data' ||
    text === '📋 Lihat Rekap' ||
    text === '🗑 Hapus Semua Data'
  ) {
    return;
  }

  // ===============================
  // SIMPAN DATA
  // ===============================
  const data = loadData();

  if (!data[chatId]) {
    data[chatId] = [];
  }

  // Pisahkan berdasarkan baris
  const daftarData = text
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);

  data[chatId].push(...daftarData);

  saveData(data);

  bot.sendMessage(
    chatId,
    `✅ Berhasil menyimpan ${daftarData.length} data.\n` +
    `📦 Total data kamu sekarang: ${data[chatId].length}`
  );
});

// ===============================
// ERROR HANDLER
// ===============================
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

console.log('🤖 Bot Rekap berhasil dijalankan.');
