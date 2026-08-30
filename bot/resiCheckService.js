import { workerManager } from "./workerManager.js";
import { ResiAdapter } from "./resiAdapter.js";
import { cekResiService } from "./cekResiService.js";
import { formatResiMessage } from "./messageFormatter.js";

const CHECK_TIMEOUT_MS = 90_000;
const WORKER_COOLDOWN_MS = 60_000;

export class ResiCheckService {
  async check(noResi) {
    const worker = await workerManager.acquireWorkerWithWait(CHECK_TIMEOUT_MS);
    if (!worker) {
      throw new Error(
        "Tidak ada worker yang tersedia saat ini. Silakan coba beberapa saat lagi."
      );
    }

    let released = false;
    const releaseWorker = () => {
      if (!released) {
        released = true;
        workerManager.release(worker.id);
      }
    };

    try {
      const workerClient = workerManager.getClient(worker.accountIdentifier);
      if (!workerClient) {
        throw new Error("Worker tidak memiliki koneksi MTProto.");
      }

      const adapter = new ResiAdapter(workerClient);

      console.log(`[CEK-RESI] Memulai cek ${noResi} (paralel).`);

      // Hasil Res Bot adalah sumber utama. Fetch penerima berjalan paralel
      // dengan batas waktu ketat (tidak menghambat hasil Res Bot).
      const resiPromise = adapter.checkResi(noResi);
      const penerimaPromise = cekResiService.fetch(noResi).then(
        (data) => data,
        () => null
      );

      const resBotText = await resiPromise;
      // Fetch penerima butuh waktu (cekresi.com lambat + retry proxy). Beri waktu
      // cukup (40s) supaya nama penerima sempat diambil, bukan dipotong.
      const cekResiData = await Promise.race([
        penerimaPromise,
        new Promise((resolve) => setTimeout(() => resolve(null), 40_000)),
      ]);

      console.log(
        `[CEK-RESI] Res Bot OK (${resBotText.length} char). Penerima: ${JSON.stringify(
          cekResiData?.penerima ?? null
        )}`
      );

      // Gabungkan: pesan Res Bot + ganti field Penerima.
      const finalMessage = formatResiMessage(resBotText, cekResiData);

      releaseWorker();
      return finalMessage;
    } catch (err) {
      releaseWorker();
      workerManager.markError(worker.id, WORKER_COOLDOWN_MS);
      throw err;
    }
  }
}

export const resiCheckService = new ResiCheckService();
