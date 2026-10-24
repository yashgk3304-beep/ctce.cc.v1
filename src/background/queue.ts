export interface QueueTask<T> {
  signature: string;
  run: () => Promise<T>;
}

export class RequestQueue {
  private chain: Promise<void> = Promise.resolve();
  private inflight = new Map<string, Promise<unknown>>();

  enqueue<T>(signature: string, run: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(signature);
    if (existing) return existing as Promise<T>;

    const task = new Promise<T>((resolve, reject) => {
      this.chain = this.chain
        .then(async () => {
          try {
            const result = await run();
            resolve(result);
          } catch (err) {
            reject(err);
          } finally {
            this.inflight.delete(signature);
          }
        })
        .catch((err) => {
          this.inflight.delete(signature);
          reject(err);
        });
    });

    this.inflight.set(signature, task);
    return task;
  }

  get pendingSignatures(): string[] {
    return [...this.inflight.keys()];
  }
}

export const globalRequestQueue = new RequestQueue();
