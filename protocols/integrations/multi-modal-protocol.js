/**
 * PROTO-I030: Multi-Modal Protocol (MMP)
 * Derives from: MCPGatewayProtocol, BatchProcessingProtocol
 * Multi-modal input routing with per-modality processor registration and metrics.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

const MODALITIES = Object.freeze(['text', 'image', 'audio', 'document', 'video']);

export class MultiModalProtocol {
  #processors = new Map(); // modality → { handler, callCount, avgMs }

  constructor(config = {}) {
    this.version    = '1.0.0';
    this.domain     = 'integrations';
    this.modalities = MODALITIES;
    this.metrics    = { processed: 0, errors: 0 };
  }

  /** Register a handler function for a given modality. */
  registerProcessor(modality, handler) {
    if (!MODALITIES.includes(modality)) {
      throw new Error(`Unknown modality: ${modality}. Must be one of: ${MODALITIES.join(', ')}`);
    }
    if (typeof handler !== 'function') throw new Error(`Handler must be a function`);
    this.#processors.set(modality, { handler, callCount: 0, avgMs: 0 });
    return { modality, registered: true };
  }

  /**
   * Detect the modality of an input from input.type, input.mimeType, or default to 'text'.
   */
  detectModality(input) {
    if (!input || typeof input !== 'object') return 'text';

    const type = input.type?.toLowerCase() ?? '';
    const mime = input.mimeType?.toLowerCase() ?? '';

    if (MODALITIES.includes(type)) return type;
    if (mime.startsWith('image/'))                              return 'image';
    if (mime.startsWith('audio/'))                              return 'audio';
    if (mime.startsWith('video/'))                              return 'video';
    if (mime === 'application/pdf' || mime.includes('document')) return 'document';
    return 'text';
  }

  /**
   * Route input to the registered processor for the given modality.
   * Tracks call counts and average latency.
   */
  async process(input, modality) {
    const resolvedModality = modality ?? this.detectModality(input);
    const proc = this.#processors.get(resolvedModality);

    if (!proc) {
      this.metrics.errors++;
      throw new Error(`No processor registered for modality: ${resolvedModality}`);
    }

    const t0 = Date.now();
    try {
      const result  = await proc.handler(input);
      const elapsed = Date.now() - t0;
      proc.callCount++;
      proc.avgMs    = (proc.avgMs * (proc.callCount - 1) + elapsed) / proc.callCount;
      this.metrics.processed++;
      return { modality: resolvedModality, result, latencyMs: elapsed };
    } catch (err) {
      this.metrics.errors++;
      throw err;
    }
  }

  /** Transcribe audio input (shorthand for process with 'audio' modality). */
  async transcribe(audioInput) {
    return this.process(audioInput, 'audio');
  }

  /** Describe image input (shorthand for process with 'image' modality). */
  async describe(imageInput) {
    return this.process(imageInput, 'image');
  }

  /** Extract content from document input (shorthand for process with 'document' modality). */
  async extract(documentInput) {
    return this.process(documentInput, 'document');
  }

  /** Return per-modality statistics. */
  getStats() {
    const stats = {};
    for (const modality of MODALITIES) {
      const proc = this.#processors.get(modality);
      stats[modality] = proc
        ? { callCount: proc.callCount, avgMs: Math.round(proc.avgMs) }
        : { callCount: 0, avgMs: 0 };
    }
    return { modalities: stats, ...this.metrics };
  }

  report() {
    return { version: this.version, domain: this.domain, stats: this.getStats() };
  }
}

export default MultiModalProtocol;
