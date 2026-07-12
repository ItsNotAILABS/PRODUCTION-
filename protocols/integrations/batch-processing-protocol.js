/**
 * PROTO-I010: Batch Processing Protocol (BPP)
 * Derives from: SwarmIntelligenceProtocol, AdaptiveOptimizerProtocol
 * Batch operations with configurable concurrency, phi-backoff on failure, and throughput tracking.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class BatchProcessingProtocol {
  #batches = new Map(); // batchId → { items, processor, opts, status }

  constructor(config = {}) {
    this.version     = '1.0.0';
    this.domain      = 'integrations';
    this.defaultSize = config.defaultBatchSize  ?? 50;
    this.defaultConc = config.defaultConcurrency ?? 4;
    this.metrics     = { batches: 0, totalProcessed: 0, totalFailed: 0, throughputPerSec: 0 };
  }

  /** Create a batch job. Returns batchId. */
  createBatch(items = [], processor, { batchSize, concurrency, onProgress } = {}) {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.#batches.set(batchId, {
      items: [...items],
      processor,
      opts: { batchSize: batchSize ?? this.defaultSize, concurrency: concurrency ?? this.defaultConc, onProgress },
      status: { total: items.length, processed: 0, failed: 0, progress: 0 },
      startedAt: null,
    });
    this.metrics.batches++;
    return batchId;
  }

  /** Execute a batch job. */
  async executeBatch(batchId) {
    const job = this.#batches.get(batchId);
    if (!job) throw new Error(`Batch not found: ${batchId}`);

    job.startedAt = Date.now();
    const chunks  = this.#chunkArray(job.items, job.opts.batchSize);

    for (const chunk of chunks) {
      await this.#processChunkConcurrent(chunk, job);
    }

    const durationMs = Date.now() - job.startedAt;
    const throughput = job.status.processed / (durationMs / 1000 || 1);
    this.metrics.totalProcessed += job.status.processed;
    this.metrics.totalFailed    += job.status.failed;
    this.metrics.throughputPerSec = parseFloat(throughput.toFixed(2));
    return { batchId, ...job.status, durationMs, throughputPerSec: throughput };
  }

  /** Get current status of a batch. */
  getBatchStatus(batchId) {
    const job = this.#batches.get(batchId);
    if (!job) throw new Error(`Batch not found: ${batchId}`);
    return { batchId, ...job.status };
  }

  async #processChunkConcurrent(chunk, job) {
    const { concurrency, onProgress } = job.opts;
    const semaphore = new Array(concurrency).fill(Promise.resolve());
    let idx = 0;
    const run = async () => {
      while (idx < chunk.length) {
        const item = chunk[idx++];
        await this.#processWithBackoff(item, job.processor);
        job.status.processed++;
        job.status.progress = parseFloat((job.status.processed / job.status.total).toFixed(4));
        if (typeof onProgress === 'function') onProgress(job.status);
      }
    };
    await Promise.all(semaphore.map(() => run()));
  }

  async #processWithBackoff(item, processor, attempt = 0, maxRetries = 3) {
    try {
      return await processor(item);
    } catch {
      if (attempt >= maxRetries) { return null; }
      const delay = Math.round(100 * PHI ** attempt);
      await new Promise((r) => setTimeout(r, delay));
      return this.#processWithBackoff(item, processor, attempt + 1, maxRetries);
    }
  }

  #chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default BatchProcessingProtocol;
