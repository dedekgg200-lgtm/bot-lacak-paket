# Bot Tele Cek Resi

Gabungan **API Cek Resi + Bot Telegram Menvora Resi** dalam satu server, deploy di **Pterodactyl**. Tidak perlu Vercel — scraping cekresi.com jalan langsung dari server ini (bukan serverless), jadi **nama penerima dapat muncul**.

## Arsitektur (satu folder, satu server)

```
[User] --(/cek JZ...)--> [Bot Telegram] (bot.js)
                              |
                              +-- [CekResiService] -> function.js (scraper cekresi.com)
                              |       |-- proxy dari lib/proxyManager
                              |       `-- nama penerima
                              |
                              +-- [API Dashboard] (index.js, port 3000)
                                      |-- /cek-resi/:noresi (publik)
                                      |-- /api/proxy, /api/logs, /api/stats (admin)
```

Semua berjalan bersama via `start.js` (menjalankan API + bot sekaligus).

## File utama

| File | Fungsi |
| --- | --- |
| `start.js` | Jalankan API + bot bersama (`npm start`) |
| `index.js` | API cek resi + dashboard admin |
| `bot.js` | Bot Telegram Menvora Resi |
| `function.js` | Scraper cekresi.com |
| `lib/` | proxyManager, logStore, auth |
| `public/` | Dashboard HTML |
| `bot/` | Modul bot |

## Konfigurasi

Salin `.env.example` ke `.env`:

| Variabel | Keterangan |
| --- | --- |
| `BOT_TOKEN` | Token bot dari @BotFather |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | Kredensial akun worker |
| `OWNER_TELEGRAM_ID` | ID Telegram pemilik |
| `TARGET_BOT_USERNAME` | Username Res Bot (tanpa @) |
| `PORT` | Port API dashboard (default 3000) |
| `DASHBOARD_PASSWORD` | Password dashboard admin (**ganti!**) |

## Deploy ke Pterodactyl

1. Buat server Pterodactyl dengan egg **Node.js** (image `node:20`).
2. **Startup command**: `node start.js`
3. Upload isi folder ini (kecuali `node_modules`, `data`).
4. Di panel, jalankan **Install**: `npm install --production`
5. Set env variables di panel (BOT_TOKEN, TELEGRAM_API_ID, dll.).
6. **Buat volume persisten untuk `data/`** (berisi session worker `.session`) agar worker tidak login ulang tiap restart.
7. Start server.

## Dashboard admin

Buka `http://IP_SERVER:PORT` lalu login dengan `DASHBOARD_PASSWORD`. Di dashboard kamu bisa:
- **Add/hapus proxy** (paste banyak, satu per baris).
- **Validasi proxy**.
- Lihat **log request** & **statistik**.

## Menambah proxy

Di dashboard → **Proxy Management** → tempel proxy (satu per baris) → **Add** → **Validasi Semua**.

Format didukung (dua-duanya):
```
host:port:user:pass
user:pass:host:port
```

## Command bot

| Command | Keterangan |
| --- | --- |
| `/start` | Info bot |
| `/cek <no_resi>` | Cek resi (bisa bulk) |
| `/addworker <nomor>` *(owner)* | Tambah & login worker (OTP/2FA) |

## Penting

- **Scraping cekresi.com jalan dari server ini** (bukan Vercel serverless), jadi lebih andal untuk ambil nama penerima.
- Gunakan **proxy yang valid** (lewat dashboard) supaya cekresi.com tidak memblokir IP server.
- `DASHBOARD_PASSWORD` default `admin123` — **harus ganti**.
