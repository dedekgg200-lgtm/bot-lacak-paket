import { createTelegramWorkerClient } from "./workerClient.js";
import { workerManager } from "./workerManager.js";

export class WorkerLoginService {
  constructor() {
    this.clients = new Map();
  }

  async requestCode(accountIdentifier) {
    const client = createTelegramWorkerClient(accountIdentifier);
    await client.connect();
    this.clients.set(accountIdentifier, client);
    return client.sendCode(accountIdentifier);
  }

  async verifyCode(accountIdentifier, phoneCode) {
    const client = this.clients.get(accountIdentifier);
    if (!client) throw new Error("Worker belum memulai proses login.");
    const need2FA = await client.signIn(accountIdentifier, phoneCode);
    if (need2FA) return { need2FA: true, done: false };
    this.finalize(accountIdentifier);
    return { need2FA: false, done: true };
  }

  async verifyPassword(accountIdentifier, password) {
    const client = this.clients.get(accountIdentifier);
    if (!client) throw new Error("Worker belum memulai proses login.");
    await client.signInWithPassword(password);
    return this.finalize(accountIdentifier);
  }

  finalize(accountIdentifier) {
    const client = this.clients.get(accountIdentifier);
    if (client) {
      workerManager.registerClient(accountIdentifier, client);
    }
    workerManager.setAvailable(accountIdentifier);
    return { workerId: accountIdentifier, accountIdentifier };
  }
}

export const workerLoginService = new WorkerLoginService();
