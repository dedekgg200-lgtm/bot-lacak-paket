export function startText() {
  return (
    "👋 Selamat datang di *Menvora Resi*!\n\n" +
    "Bot untuk mengecek nomor resi pengiriman.\n\n" +
    "Gunakan perintah:\n" +
    "`/cek <no_resi>` - cek status resi\n\n" +
    "Contoh: `/cek JZ3026911456`"
  );
}

export async function handleStart(ctx) {
  await ctx.reply(startText(), { parse_mode: "Markdown" });
}
