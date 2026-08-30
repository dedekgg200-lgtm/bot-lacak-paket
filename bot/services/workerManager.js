export const WORKER_STATUS = {
  AVAILABLE: "AVAILABLE",
  CONNECTING: "CONNECTING",
  BUSY: "BUSY",
  DISCONNECTED: "DISCONNECTED",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  ERROR: "ERROR",
  COOLDOWN: "COOLDOWN",
};

export class WorkerManager {
  constructor() {
    this.workers = [];
    this.clients = new Map();
    this.waiters = [];
  }

  list() {
    return this.workers.slice();
  }

  registerClient(accountIdentifier, client) {
    this.clients.set(accountIdentifier, client);
  }

  getClient(accountIdentifier) {
    return this.clients.get(accountIdentifier);
  }

  addWorker(accountIdentifier) {
    const existing = this.workers.find((w) => w.accountIdentifier === accountIdentifier);
    if (existing) return existing;
    const worker = {
      id: `worker-${this.workers.length + 1}`,
      accountIdentifier,
      status: WORKER_STATUS.CONNECTING,
      lastActivityAt: Date.now(),
      totalRequests: 0,
      totalErrors: 0,
    };
    this.workers.push(worker);
    return worker;
  }

  removeWorker(workerId) {
    const index = this.workers.findIndex((w) => w.id === workerId);
    if (index === -1) return false;
    const [removed] = this.workers.splice(index, 1);
    return removed;
  }

  async logoutWorker(workerId) {
    const worker = this.workers.find((w) => w.id === workerId);
    if (!worker) return undefined;
    const client = this.clients.get(worker.accountIdentifier);
    if (client) {
      await (client.disconnect?.() ?? Promise.resolve()).catch(() => {});
      this.clients.delete(worker.accountIdentifier);
    }
    this.workers = this.workers.filter((w) => w.id !== workerId);
    return worker;
  }

  assignNextAvailable() {
    const worker = this.workers.find((w) => w.status === WORKER_STATUS.AVAILABLE);
    if (!worker) return undefined;
    worker.status = WORKER_STATUS.BUSY;
    worker.totalRequests += 1;
    worker.lastActivityAt = Date.now();
    return worker;
  }

  wakeWaiters() {
    const pending = this.waiters.splice(0);
    for (const resolve of pending) {
      const worker = this.assignNextAvailable();
      resolve(worker);
      if (!worker) return;
    }
  }

  acquireWorkerWithWait(maxWaitMs) {
    const immediate = this.assignNextAvailable();
    if (immediate) return Promise.resolve(immediate);
    return new Promise((resolve) => {
      const resolver = resolve;
      this.waiters.push(resolver);
      setTimeout(() => {
        const idx = this.waiters.indexOf(resolver);
        if (idx !== -1) this.waiters.splice(idx, 1);
        resolve(undefined);
      }, maxWaitMs);
    });
  }

  release(workerId) {
    const worker = this.workers.find((w) => w.id === workerId);
    if (worker && worker.status === WORKER_STATUS.BUSY) {
      worker.status = WORKER_STATUS.AVAILABLE;
      worker.lastActivityAt = Date.now();
      this.wakeWaiters();
    }
  }

  setAvailable(accountIdentifierOrId) {
    const worker =
      this.workers.find((w) => w.id === accountIdentifierOrId) ??
      this.workers.find((w) => w.accountIdentifier === accountIdentifierOrId);
    if (worker) {
      worker.status = WORKER_STATUS.AVAILABLE;
      worker.lastActivityAt = Date.now();
      this.wakeWaiters();
    }
  }

  setAuthRequired(accountIdentifierOrId) {
    const worker =
      this.workers.find((w) => w.id === accountIdentifierOrId) ??
      this.workers.find((w) => w.accountIdentifier === accountIdentifierOrId);
    if (worker) {
      worker.status = WORKER_STATUS.AUTH_REQUIRED;
      worker.lastActivityAt = Date.now();
    }
  }

  markError(workerId, cooldownMs = 60_000) {
    const worker = this.workers.find((w) => w.id === workerId);
    if (!worker) return;
    worker.status = WORKER_STATUS.COOLDOWN;
    worker.totalErrors += 1;
    worker.lastActivityAt = Date.now();
    setTimeout(() => {
      const now = this.workers.find((w) => w.id === workerId);
      if (now && now.status === WORKER_STATUS.COOLDOWN) {
        now.status = WORKER_STATUS.AVAILABLE;
        now.lastActivityAt = Date.now();
        this.wakeWaiters();
      }
    }, cooldownMs);
  }
}

export const workerManager = new WorkerManager();
