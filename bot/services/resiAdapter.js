import { config } from "../config/environment.js";
import { buildResBotCommand } from "./expedisi.js";

const REQUEST_TIMEOUT_MS = 60_000;

export class ResiAdapter {
  constructor(client) {
    this.client = client;
  }

  get targetBotUsername() {
    return config.targetBotUsername;
  }

  async checkResi(noResi) {
    if (!this.client.isConnected()) {
      throw new Error("MTProto client tidak terhubung.");
    }

    const command = buildResBotCommand(noResi);

    // Pasang pending DULU (sebelum kirim) supaya tidak ada respons yang terlewat,
    // lalu kirim perintah ke Res Bot.
    const responsePromise = this.client.waitForResponse(REQUEST_TIMEOUT_MS);
    await this.client.sendMessage(this.targetBotUsername, command);
    const rawResponse = await responsePromise;

    if (rawResponse === null) {
      throw new Error("Timeout menunggu respons Res Bot.");
    }

    return rawResponse.text;
  }

  async healthCheck() {
    return this.client.isConnected();
  }
}
