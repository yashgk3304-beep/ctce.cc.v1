export class RequestQueue {
  private chain: Promise<void> = Promise.resolve();
  private inflight = new Map<string, Promise<unknown>>();
  private aborts = new Map<string, AbortController>();

  enqueue<T>(signature: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const existing = this.inflight.get(signature);
    if (existing) return existing as Promise<T>;

    const ac = new AbortController();
    this.aborts.set(signature, ac);

    const task = new Promise<T>((resolve, reject) => {
      this.chain = this.chain
        .then(async () => {
          try {
            const result = await run(ac.signal);
            resolve(result);
          } catch (err) {
            reject(err);
          } finally {
            this.inflight.delete(signature);
            this.aborts.delete(signature);
          }
        })
        .catch((err) => {
          this.inflight.delete(signature);
          this.aborts.delete(signature);
          reject(err);
        });
    });

    this.inflight.set(signature, task);
    return task;
  }

  abort(signature?: string): void {
    if (signature) {
      this.aborts.get(signature)?.abort();
      this.inflight.delete(signature);
      this.aborts.delete(signature);
      return;
    }
    for (const ac of this.aborts.values()) ac.abort();
    this.inflight.clear();
    this.aborts.clear();
  }

  get pendingSignatures(): string[] {
    return [...this.inflight.keys()];
  }
}

export const globalRequestQueue = new RequestQueue();
