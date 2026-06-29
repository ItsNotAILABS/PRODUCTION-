/**
 * PROTO-I025: Context Window Protocol (CWP)
 * Derives from: BatchProcessingProtocol, IntegrationOrchestrationProtocol
 * Manage token budgets across concurrent AI sessions with phi-threshold compression.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class ContextWindowProtocol {
  #sessions = new Map(); // id → { maxTokens, messages:[], totalTokens, compressions }

  constructor(config = {}) {
    this.version = '1.0.0';
    this.domain  = 'integrations';
    this.metrics = { created: 0, messages: 0, compressions: 0 };
  }

  /** Initialise a new session with a token budget. */
  createSession(id, { maxTokens = 4096 } = {}) {
    this.#sessions.set(id, {
      maxTokens,
      messages    : [],
      totalTokens : 0,
      compressions: 0,
    });
    this.metrics.created++;
    return { id, maxTokens };
  }

  /**
   * Add a message to a session.
   * If totalTokens exceeds maxTokens * PHI_INV, auto-compress.
   */
  addMessage(sessionId, role, content, tokens) {
    const session = this.#getSession(sessionId);
    const estimatedTokens = tokens ?? Math.ceil(content.length / 4);
    session.messages.push({ role, content, tokens: estimatedTokens, at: Date.now() });
    session.totalTokens += estimatedTokens;
    this.metrics.messages++;

    if (session.totalTokens > session.maxTokens * PHI_INV) {
      this.compress(sessionId);
    }

    return { sessionId, totalTokens: session.totalTokens, compressed: session.compressions };
  }

  /**
   * Compress a session by dropping oldest non-system messages
   * until totalTokens falls below the PHI_INV threshold.
   */
  compress(sessionId) {
    const session  = this.#getSession(sessionId);
    const target   = session.maxTokens * PHI_INV;
    let iterations = 0;

    while (session.totalTokens > target && iterations < session.messages.length) {
      const idx = session.messages.findIndex(m => m.role !== 'system');
      if (idx === -1) break;
      const [removed] = session.messages.splice(idx, 1);
      session.totalTokens = Math.max(0, session.totalTokens - removed.tokens);
      iterations++;
    }

    session.compressions++;
    this.metrics.compressions++;
    return { sessionId, totalTokens: session.totalTokens, compressions: session.compressions };
  }

  /** Return current session context with compression metadata. */
  getContext(sessionId) {
    const session = this.#getSession(sessionId);
    const compressionRatio = session.compressions === 0
      ? 1
      : Math.round((1 - session.totalTokens / session.maxTokens) * 100) / 100;

    return {
      messages        : [...session.messages],
      totalTokens     : session.totalTokens,
      compressionRatio,
    };
  }

  /** Return token usage breakdown for a session. */
  getTokenUsage(sessionId) {
    const session  = this.#getSession(sessionId);
    const used     = session.totalTokens;
    const max      = session.maxTokens;
    const pct      = Math.round((used / max) * 1000) / 1000;
    const headroom = Math.max(0, max - used);
    return { used, max, pct, headroom };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  #getSession(id) {
    const session = this.#sessions.get(id);
    if (!session) throw new Error(`Unknown session: ${id}`);
    return session;
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default ContextWindowProtocol;
