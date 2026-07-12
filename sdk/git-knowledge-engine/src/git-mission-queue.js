/**
 * GitMissionQueue — async, concurrency-controlled mission executor.
 * Queues mission jobs up to maxDepth, runs up to maxConcurrent in parallel,
 * and enforces per-mission timeouts. Back-pressure rejects enqueue calls
 * when the queue is full rather than silently dropping work.
 */
export class GitMissionQueue {
  /** @type {number} */
  #maxConcurrent;

  /** @type {number} */
  #maxDepth;

  /** @type {number} */
  #timeoutMs;

  /** @type {number} Running job count */
  #running = 0;

  /** @type {Array<{ job: Function, resolve: Function, reject: Function, enqueuedAt: number }>} */
  #pending = [];

  /** @type {{ enqueued: number, started: number, completed: number, failed: number, timedOut: number, rejected: number }} */
  #stats = { enqueued: 0, started: 0, completed: 0, failed: 0, timedOut: 0, rejected: 0 };

  /**
   * @param {{ maxConcurrent?: number, maxDepth?: number, timeoutMs?: number }} [opts]
   */
  constructor({ maxConcurrent = 8, maxDepth = 64, timeoutMs = 30_000 } = {}) {
    this.#maxConcurrent = maxConcurrent;
    this.#maxDepth      = maxDepth;
    this.#timeoutMs     = timeoutMs;
  }

  /**
   * Enqueue an async job function. Returns a promise that resolves/rejects
   * when the job completes, or rejects immediately if the queue is full.
   * @template T
   * @param {() => Promise<T>} job
   * @returns {Promise<T>}
   */
  enqueue(job) {
    if (this.#pending.length >= this.#maxDepth) {
      this.#stats.rejected++;
      return Promise.reject(
        new Error(
          `GitMissionQueue: queue depth (${this.#maxDepth}) exceeded. ` +
          `${this.#running} running, ${this.#pending.length} pending.`,
        ),
      );
    }

    this.#stats.enqueued++;

    return new Promise((resolve, reject) => {
      this.#pending.push({ job, resolve, reject, enqueuedAt: Date.now() });
      this.#drain();
    });
  }

  /**
   * Current queue state snapshot.
   * @returns {{ running: number, pending: number, stats: object }}
   */
  status() {
    return {
      running: this.#running,
      pending: this.#pending.length,
      stats:   { ...this.#stats },
    };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  #drain() {
    while (this.#running < this.#maxConcurrent && this.#pending.length > 0) {
      const item = this.#pending.shift();
      if (!item) break;
      this.#run(item);
    }
  }

  async #run({ job, resolve, reject }) {
    this.#running++;
    this.#stats.started++;

    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        this.#stats.timedOut++;
        this.#stats.failed++;
        reject(new Error(`GitMissionQueue: mission timed out after ${this.#timeoutMs}ms`));
        this.#finish();
      }
    }, this.#timeoutMs);

    // Prevent the timer from blocking process exit
    if (timer.unref) timer.unref();

    try {
      const result = await job();
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        this.#stats.completed++;
        resolve(result);
      }
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        this.#stats.failed++;
        reject(err);
      }
    } finally {
      this.#finish();
    }
  }

  #finish() {
    this.#running = Math.max(0, this.#running - 1);
    this.#drain();
  }
}

export default GitMissionQueue;
