require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();

const TOKEN = process.env.TELEGRAM_TOKEN;
const MAX_DATA = 30;

if (!TOKEN) {
    throw new Error("TELEGRAM_TOKEN belum diatur!");
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

console.log("BOT REKAP DATA BERJALAN");


function ambilData(text) {

    const resi =
        text.match(/(?:No Resi|Nomor Resi)\s*:\s*([0-9]+)/i)?.[1] || "";

    const pengirim =
        text.match(
            /🚀\s*Pengirim[\s\S]*?├\s*(.*?)\s*└/i
        )?.[1]?.trim() || "";

    const penerima =
        text.match(
            /🚩\s*Penerima[\s\S]*?├\s*(.*?)\s*└/i
        )?.[1]
        ?.replace(/[:*]/g, "")
        .trim() || "";

    const alamat =
        text.match(
            /🚩\s*Penerima[\s\S]*?└\s*(.*?)(?:\n|⏩)/i
        )?.[1]?.trim() || "";

    const telepon =
        text.match(
            /(?:📞\s*Telepon|Telepon)\s*:\s*([0-9+\-\s]+)/i
        )?.[1]
        ?.replace(/\s/g, "") || "";

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


bot.onText(/\/start/, (msg) => {

    bot.sendMessage(
        msg.chat.id,
        "👋 Bot Rekap Data siap digunakan.\n\nLangsung kirim data paket ke bot.",
        menuUtama()
    );

});


bot.on("message", (msg) => {

    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) {
        return;
    }

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
                        "❌ Terjadi kesalahan."
                    );
                }

                if (rows.length === 0) {
                    return bot.sendMessage(
                        chatId,
                        "📭 Belum ada data yang tersimpan."
                    );
                }

                const buttons = [];
                let baris = [];

                for (let i = 1; i <= rows.length; i++) {

                    baris.push({
                        text: String(i),
                        callback_data: "ambil_" + i
                    });

                    if (baris.length === 5 || i === rows.length) {
                        buttons.push(baris);
                        baris = [];
                    }
                }

                bot.sendMessage(
                    chatId,
                    "📦 Data tersedia: " + rows.length +
                    "\n\nPilih jumlah data yang ingin diambil:",
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
            "❌ Data tidak dapat dibaca.\n\nPastikan nomor resi dan nama penerima ada."
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
                    "⚠️ Penyimpanan penuh (" +
                    MAX_DATA +
                    "/" +
                    MAX_DATA +
                    ").\n\nSilakan ambil data terlebih dahulu."
                );

            }


            db.run(
                `
                INSERT INTO paket
                (resi, penerima, pengirim, alamat, telepon)
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    data.resi,
                    data.penerima,
                    data.pengirim,
                    data.alamat,
                    data.telepon
                ],
                (err) => {

                    if (err) {
                        return bot.sendMessage(
                            chatId,
                            "❌ Data gagal disimpan."
                        );
                    }

                    bot.sendMessage(
                        chatId,
                        "✅ Data berhasil disimpan.\n📦 Total data: " +
                        (result.total + 1) +
                        "/" +
                        MAX_DATA
                    );

                }
            );

        }
    );

});


bot.on("callback_query", (query) => {

    const chatId = query.message.chat.id;

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
`*Halo kk*

Kami ingin mengonfirmasi paket dengan data berikut:

*Nomor Resi*: ${data.resi}
*Nama Penerima*: ${data.penerima}
*Nama Pengirim/Toko*: ${data.pengirim}
*Alamat*: ${data.alamat}

Terima kasih.`;

                    await bot.sendMessage(
                        chatId,
                        rekap
                    );


                    if (data.telepon) {

                        await bot.sendMessage(
                            chatId,
                            data.telepon
                        );

                    }


                    await new Promise(
                        (resolve, reject) => {

                            db.run(
                                "DELETE FROM paket WHERE id = ?",
                                [data.id],
                                (err) => {

                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve();
                                    }

                                }
                            );

                        }
                    );

                }


                await bot.answerCallbackQuery(
                    query.id,
                    {
                        text: rows.length +
                        " data berhasil dikirim."
                    }
                );


                bot.sendMessage(
                    chatId,
                    "✅ " +
                    rows.length +
                    " data berhasil dikirim dan dihapus dari penyimpanan.",
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
