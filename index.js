const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();

const TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = Number(process.env.OWNER_ID);
const MAX_DATA = 30;

if (!TOKEN) {
    throw new Error("BOT_TOKEN belum diatur!");
}

if (!OWNER_ID) {
    throw new Error("OWNER_ID belum diatur!");
}

const bot = new TelegramBot(TOKEN, {
    polling: true
});

const db = new sqlite3.Database("./data.db");

db.run(`
    CREATE TABLE IF NOT EXISTS paket (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resi TEXT,
        penerima TEXT,
        pengirim TEXT,
        alamat TEXT,
        telepon TEXT
    )
`);

function ambilData(text) {
    const resi =
        text.match(/No Resi\s*:\s*([0-9]+)/i)?.[1] ||
        text.match(/Nomor Resi\s*:\s*([0-9]+)/i)?.[1] ||
        "";

    const pengirim =
        text.match(/🚀\s*Pengirim[\s\S]*?├\s*(.*?)\s*└/i)?.[1]?.trim() ||
        "";

    const penerima =
        text.match(/🚩\s*Penerima[\s\S]*?├\s*(.*?)\s*└/i)?.[1]
            ?.replace(/[:*]/g, "")
            .trim() ||
        "";

    const alamat =
        text.match(/🚩\s*Penerima[\s\S]*?└\s*(.*?)(?:\n|⏩)/i)?.[1]?.trim() ||
        "";

    const telepon =
        text.match(/(?:📞\s*Telepon|Telepon)\s*:\s*([0-9+\-\s]+)/i)?.[1]
            ?.replace(/\s/g, "")
            .trim() ||
        "";

    return {
        resi,
        penerima,
        pengirim,
        alamat,
        telepon
    };
}

function menuUtama() {
    return {
        reply_markup: {
            keyboard: [
                ["📋 Ambil Rekapan"]
            ],
            resize_keyboard: true
        }
    };
}

bot.onText(/\/start/, async (msg) => {
    if (msg.from.id !== OWNER_ID) {
        return bot.sendMessage(
            msg.chat.id,
            "⛔ Bot ini hanya dapat digunakan oleh pemilik."
        );
    }

    bot.sendMessage(
        msg.chat.id,
        "👋 Bot Rekap Data siap digunakan.\n\nLangsung kirimkan data paket ke bot. Data akan otomatis disimpan.",
        menuUtama()
    );
});

bot.on("message", (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (userId !== OWNER_ID) {
        return;
    }

    if (!msg.text) {
        return;
    }

    const text = msg.text;

    if (text === "/start") {
        return;
    }

    if (text === "📋 Ambil Rekapan") {
        db.all(
            "SELECT * FROM paket ORDER BY id ASC",
            [],
            (err, rows) => {
                if (err) {
                    return bot.sendMessage(
                        chatId,
                        "❌ Terjadi kesalahan saat mengambil data."
                    );
                }

                const jumlah = rows.length;

                if (jumlah === 0) {
                    return bot.sendMessage(
                        chatId,
                        "📭 Belum ada data yang tersimpan."
                    );
                }

                const buttons = [];
                let baris = [];

                for (let i = 1; i <= jumlah; i++) {
                    baris.push({
                        text: String(i),
                        callback_data: `ambil_${i}`
                    });

                    if (baris.length === 5 || i === jumlah) {
                        buttons.push(baris);
                        baris = [];
                    }
                }

                bot.sendMessage(
                    chatId,
                    `📦 Data tersedia: ${jumlah}\n\nPilih jumlah data yang ingin diambil:`,
                    {
                        reply_markup: {
                            inline_keyboard: buttons
                        }
                    }
                );
            }
        );

        return;
    }

    const data = ambilData(text);

    if (!data.resi || !data.penerima) {
        return bot.sendMessage(
            chatId,
            "❌ Data tidak dapat dibaca.\n\nPastikan kamu mengirim data paket dengan format yang lengkap."
        );
    }

    db.get(
        "SELECT COUNT(*) AS total FROM paket",
        [],
        (err, result) => {
            if (err) {
                return bot.sendMessage(
                    chatId,
                    "❌ Terjadi kesalahan."
                );
            }

            if (result.total >= MAX_DATA) {
                return bot.sendMessage(
                    chatId,
                    `⚠️ Penyimpanan sudah penuh (${MAX_DATA}/${MAX_DATA}).\n\nSilakan ambil beberapa data terlebih dahulu.`
                );
            }

            db.run(
                `INSERT INTO paket (resi, penerima, pengirim, alamat, telepon)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    data.resi,
                    data.penerima,
                    data.pengirim,
                    data.alamat,
                    data.telepon
                ],
                function (err) {
                    if (err) {
                        return bot.sendMessage(
                            chatId,
                            "❌ Data gagal disimpan."
                        );
                    }

                    bot.sendMessage(
                        chatId,
                        `✅ Data berhasil disimpan.\n📦 Total data: ${result.total + 1}/${MAX_DATA}`
                    );
                }
            );
        }
    );
});

bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    if (userId !== OWNER_ID) {
        return bot.answerCallbackQuery(query.id, {
            text: "Tidak memiliki akses."
        });
    }

    if (!query.data.startsWith("ambil_")) {
        return;
    }

    const jumlah = Number(
        query.data.replace("ambil_", "")
    );

    db.all(
        "SELECT * FROM paket ORDER BY id ASC LIMIT ?",
        [jumlah],
        async (err, rows) => {
            if (err || rows.length === 0) {
                return bot.sendMessage(
                    chatId,
                    "❌ Data tidak ditemukan."
                );
            }

            try {
                for (const data of rows) {
                    const rekap =
`<b>Halo Kak</b>

Kami ingin mengonfirmasi paket dengan data berikut:

<b>Nomor Resi</b>: ${data.resi}
<b>Nama Penerima</b>: ${data.penerima}
<b>Nama Pengirim/Toko</b>: ${data.pengirim}
<b>Alamat</b>: ${data.alamat}

Terima kasih.`;

                    // Kirim rekap terlebih dahulu
                    await bot.sendMessage(
                        chatId,
                        rekap,
                        {
                            parse_mode: "HTML"
                        }
                    );

                    // Nomor HP dikirim sebagai pesan terpisah
                    if (data.telepon) {
                        await bot.sendMessage(
                            chatId,
                            data.telepon
                        );
                    }

                    // Hapus hanya setelah berhasil dikirim
                    await new Promise((resolve, reject) => {
                        db.run(
                            "DELETE FROM paket WHERE id = ?",
                            [data.id],
                            function (err) {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                }

                bot.answerCallbackQuery(query.id, {
                    text: `${rows.length} data berhasil dikirim.`
                });

                bot.sendMessage(
                    chatId,
                    `✅ ${rows.length} data berhasil dikirim dan dihapus dari penyimpanan.`,
                    menuUtama()
                );

            } catch (error) {
                console.error(error);

                bot.sendMessage(
                    chatId,
                    "❌ Terjadi kesalahan saat mengirim data."
                );
            }
        }
    );
});

console.log("🤖 Bot Rekap Data sedang berjalan...");
