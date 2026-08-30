import { workerSessionManager } from "./workerSession.js";
import { workerManager } from "./workerManager.js";
import { createTelegramWorkerClient } from "./workerClient.js";

export async function autoConnectWorkers() {
  let restored = 0;
  const accounts = workerSessionManager.list();

  for (const accountIdentifier of accounts) {
    const worker =
      workerManager.list().find((w) => w.accountIdentifier === accountIdentifier) ??
      workerManager.addWorker(accountIdentifier);

    try {
      const client = createTelegramWorkerClient(accountIdentifier);
      await client.connect();

      if (await client.isAuthorized()) {
        workerManager.registerClient(accountIdentifier, client);
        workerManager.setAvailable(worker.id);
        restored += 1;
        console.log(`[WORKER] ${accountIdentifier} terhubung (AVAILABLE).`);
      } else {
        await client.disconnect().catch(() => {});
        workerManager.setAuthRequired(worker.id);
        console.warn(`[WORKER] ${accountIdentifier} butuh login ulang (AUTH_REQUIRED).`);
      }
    } catch (err) {
      console.warn(
        `[WORKER] Gagal auto-connect ${accountIdentifier}: ${err instanceof Error ? err.message : err}`
      );
      workerManager.setAuthRequired(worker.id);
    }
  }

  return restored;
}
