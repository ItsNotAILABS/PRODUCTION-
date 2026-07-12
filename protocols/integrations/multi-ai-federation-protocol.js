/**
 * Multi-AI Federation Protocol (PROTO-I021)
 *
 * Enables sovereign X ecosystem instances to form federations: sharing
 * intelligence, load, and capability across network boundaries without
 * shared clocks, shared state, or central authority.
 *
 * Federation operates through phi-encoded gossip: each member periodically
 * broadcasts its organism state, capabilities, and available tools using a
 * phi-timestamp that allows receivers to infer the sender's heartbeat phase
 * without a shared clock.
 *
 * Key invariants:
 * - Each member retains full sovereignty (no member can command another)
 * - Intelligence sharing is opt-in per capability domain
 * - Federation membership is governed by each member's own governance layer
 * - Phi-resonant gossip intervals prevent thundering-herd broadcast storms
 */

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;
const HEARTBEAT_MS = 873;

// Federation message types
export const FEDERATION_MSG = Object.freeze({
  ANNOUNCE:     'federation.announce',     // member joins/renews
  CAPABILITY:   'federation.capability',   // capability advertisement
  QUERY:        'federation.query',        // cross-member capability query
  RESPONSE:     'federation.response',     // query response
  HEARTBEAT:    'federation.heartbeat',    // liveness signal
  WITHDRAW:     'federation.withdraw',     // member leaves
  SYNC_REQUEST: 'federation.sync.request', // request state snapshot
  SYNC_RESPONSE:'federation.sync.response',// state snapshot response
});

// Member health states
export const MEMBER_HEALTH = Object.freeze({
  HEALTHY:     'healthy',      // vitality > PHI_INV
  DEGRADED:    'degraded',     // vitality in [PHI_INV², PHI_INV)
  CRITICAL:    'critical',     // vitality in [0.2, PHI_INV²)
  UNREACHABLE: 'unreachable',  // no heartbeat for > 3 × gossip interval
});

export class MultiFederationProtocol {
  #memberId;
  #members;          // Map<memberId, MemberEntry>
  #sharedCapabilities; // Set<string> — capability domains we share
  #handlers;         // Map<FEDERATION_MSG, Function[]>
  #gossipIntervalMs;
  #gossipTimer;
  #lastHeartbeat;
  #queryCallbacks;   // Map<queryId, {resolve, reject, timeout}>
  #transport;        // async (memberId, message) => void

  /**
   * @param {{
   *   memberId: string,
   *   transport: (memberId: string, msg: object) => Promise<void>,
   *   sharedCapabilities?: string[],
   *   gossipIntervalMs?: number,
   * }} opts
   */
  constructor({ memberId, transport, sharedCapabilities = [], gossipIntervalMs = HEARTBEAT_MS * PHI }) {
    if (!memberId) throw new TypeError('MultiFederationProtocol requires memberId');
    if (typeof transport !== 'function') throw new TypeError('MultiFederationProtocol requires transport function');

    this.#memberId        = memberId;
    this.#transport       = transport;
    this.#members         = new Map();
    this.#sharedCapabilities = new Set(sharedCapabilities);
    this.#handlers        = new Map();
    this.#gossipIntervalMs = gossipIntervalMs;
    this.#gossipTimer     = null;
    this.#lastHeartbeat   = Date.now();
    this.#queryCallbacks  = new Map();
  }

  get memberId() { return this.#memberId; }
  get memberCount() { return this.#members.size; }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /** Join the federation. Starts gossip loop. */
  async join(knownPeers = []) {
    this.#startGossip();
    // Announce to all known peers
    await Promise.allSettled(knownPeers.map(peerId => this.#announce(peerId)));
    return { memberId: this.#memberId, joined: Date.now() };
  }

  /** Leave the federation. Notifies all known members and stops gossip. */
  async leave() {
    this.#stopGossip();
    const msg = this.#buildMsg(FEDERATION_MSG.WITHDRAW, {});
    await this.#broadcast(msg);
    this.#members.clear();
    return { memberId: this.#memberId, left: Date.now() };
  }

  // ─── Capability sharing ────────────────────────────────────────────────────

  /** Share a capability domain with the federation. */
  shareCapability(domain) {
    this.#sharedCapabilities.add(domain);
    // Immediately advertise to all known members
    const msg = this.#buildMsg(FEDERATION_MSG.CAPABILITY, {
      domains: [...this.#sharedCapabilities],
    });
    this.#broadcast(msg).catch(() => {});
    return { domain, shared: true, total: this.#sharedCapabilities.size };
  }

  /** Stop sharing a capability domain. */
  withdrawCapability(domain) {
    this.#sharedCapabilities.delete(domain);
    const msg = this.#buildMsg(FEDERATION_MSG.CAPABILITY, {
      domains: [...this.#sharedCapabilities],
    });
    this.#broadcast(msg).catch(() => {});
    return { domain, withdrawn: true, total: this.#sharedCapabilities.size };
  }

  /** Query the federation for members that have a given capability domain. */
  async queryCapability(domain, timeoutMs = 2000) {
    const queryId = `${this.#memberId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const results = [];

    await new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      this.#queryCallbacks.set(queryId, {
        onResponse: (memberId, domains) => {
          if (domains.includes(domain)) results.push(memberId);
        },
        resolve: () => { clearTimeout(timer); resolve(); },
        timer,
      });
    });

    this.#queryCallbacks.delete(queryId);
    return results;
  }

  // ─── Message handling ──────────────────────────────────────────────────────

  /**
   * Handle an inbound federation message. Call this from your transport layer
   * whenever a message arrives from another federation member.
   */
  async receive(message) {
    if (!message || !message.type || message.fromMemberId === this.#memberId) return;

    const { type, fromMemberId, phiTimestamp, payload } = message;

    // Update member liveness
    this.#updateMember(fromMemberId, phiTimestamp);

    switch (type) {
      case FEDERATION_MSG.ANNOUNCE:
        await this.#handleAnnounce(fromMemberId, payload);
        break;
      case FEDERATION_MSG.CAPABILITY:
        this.#handleCapability(fromMemberId, payload);
        break;
      case FEDERATION_MSG.QUERY:
        await this.#handleQuery(fromMemberId, payload);
        break;
      case FEDERATION_MSG.RESPONSE:
        this.#handleResponse(fromMemberId, payload);
        break;
      case FEDERATION_MSG.HEARTBEAT:
        // Member liveness already updated above
        break;
      case FEDERATION_MSG.WITHDRAW:
        this.#members.delete(fromMemberId);
        break;
      case FEDERATION_MSG.SYNC_REQUEST:
        await this.#handleSyncRequest(fromMemberId);
        break;
      case FEDERATION_MSG.SYNC_RESPONSE:
        this.#handleSyncResponse(fromMemberId, payload);
        break;
    }

    // Invoke registered handlers
    const fns = this.#handlers.get(type) || [];
    for (const fn of fns) fn(fromMemberId, payload);
  }

  /** Register a handler for a specific federation message type. */
  on(type, handler) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, []);
    this.#handlers.get(type).push(handler);
    return this;
  }

  // ─── Federation intelligence ───────────────────────────────────────────────

  /** Return a snapshot of all known federation members with their health. */
  getMembers() {
    const now = Date.now();
    const members = [];
    for (const [id, entry] of this.#members) {
      const staleness = now - entry.lastSeen;
      const health = staleness > this.#gossipIntervalMs * 3 ? MEMBER_HEALTH.UNREACHABLE
                   : entry.vitality >= PHI_INV              ? MEMBER_HEALTH.HEALTHY
                   : entry.vitality >= PHI_INV ** 2         ? MEMBER_HEALTH.DEGRADED
                                                             : MEMBER_HEALTH.CRITICAL;
      members.push({
        memberId:     id,
        health,
        vitality:     entry.vitality,
        capabilities: entry.capabilities,
        lastSeen:     entry.lastSeen,
        phaseOffset:  entry.phaseOffset,
      });
    }
    return members;
  }

  /**
   * Compute a phi-weighted federation health score. Healthy members contribute
   * more than degraded ones; unreachable members contribute 0.
   */
  getFederationHealth() {
    const members = this.getMembers();
    if (!members.length) return 0;

    const totalWeight = members.reduce((sum, m, i) => {
      const contribution = m.health === MEMBER_HEALTH.UNREACHABLE ? 0
                         : m.vitality * (1 / (1 + i * PHI_INV));
      return sum + contribution;
    }, 0);

    const maxPossible = members.reduce((sum, _, i) => sum + 1 / (1 + i * PHI_INV), 0);
    return totalWeight / (maxPossible || 1);
  }

  /**
   * Route a capability query to the best available member using phi-weighted
   * scoring: healthy members with lower index get higher routing weight.
   */
  selectMember(domain) {
    const eligible = this.getMembers().filter(
      m => m.health !== MEMBER_HEALTH.UNREACHABLE && m.capabilities.includes(domain),
    );
    if (!eligible.length) return null;

    // Phi-score: higher vitality + lower index = higher score
    let best = null, bestScore = -1;
    eligible.forEach((m, i) => {
      const score = m.vitality / (1 + i * PHI_INV);
      if (score > bestScore) { bestScore = score; best = m; }
    });
    return best;
  }

  // ─── Private: Gossip ───────────────────────────────────────────────────────

  #startGossip() {
    if (this.#gossipTimer) return;
    // Stagger first gossip by PHI_INV fraction of interval to reduce startup burst
    const firstDelay = this.#gossipIntervalMs * PHI_INV;
    setTimeout(() => {
      this.#gossipTick();
      this.#gossipTimer = setInterval(() => this.#gossipTick(), this.#gossipIntervalMs);
    }, firstDelay);
  }

  #stopGossip() {
    if (this.#gossipTimer) {
      clearInterval(this.#gossipTimer);
      this.#gossipTimer = null;
    }
  }

  async #gossipTick() {
    this.#lastHeartbeat = Date.now();
    const msg = this.#buildMsg(FEDERATION_MSG.HEARTBEAT, {
      vitality: PHI_INV, // Default vitality; override by setting organism vitality
      capabilities: [...this.#sharedCapabilities],
    });
    await this.#broadcast(msg);
  }

  async #announce(peerId) {
    const msg = this.#buildMsg(FEDERATION_MSG.ANNOUNCE, {
      capabilities: [...this.#sharedCapabilities],
    });
    try {
      await this.#transport(peerId, msg);
      // After announcing, request a sync so we learn about other members
      const syncReq = this.#buildMsg(FEDERATION_MSG.SYNC_REQUEST, {});
      await this.#transport(peerId, syncReq);
    } catch (_) { /* peer may not be reachable yet */ }
  }

  async #broadcast(msg) {
    await Promise.allSettled(
      [...this.#members.keys()].map(peerId => this.#transport(peerId, msg).catch(() => {})),
    );
  }

  // ─── Private: Message handlers ─────────────────────────────────────────────

  async #handleAnnounce(fromMemberId, payload) {
    const { capabilities = [] } = payload;
    this.#updateMember(fromMemberId, null, { capabilities });
    // Respond with our own announcement
    const response = this.#buildMsg(FEDERATION_MSG.ANNOUNCE, {
      capabilities: [...this.#sharedCapabilities],
    });
    await this.#transport(fromMemberId, response).catch(() => {});
  }

  #handleCapability(fromMemberId, payload) {
    const { domains = [] } = payload;
    const entry = this.#members.get(fromMemberId);
    if (entry) entry.capabilities = domains;
  }

  async #handleQuery(fromMemberId, payload) {
    const { queryId, domain } = payload;
    const hasDomain = this.#sharedCapabilities.has(domain);
    const response = this.#buildMsg(FEDERATION_MSG.RESPONSE, {
      queryId,
      domains: [...this.#sharedCapabilities],
      hasCapability: hasDomain,
    });
    await this.#transport(fromMemberId, response).catch(() => {});
  }

  #handleResponse(fromMemberId, payload) {
    const { queryId, domains = [] } = payload;
    const cb = this.#queryCallbacks.get(queryId);
    if (cb) cb.onResponse(fromMemberId, domains);
  }

  async #handleSyncRequest(fromMemberId) {
    const memberList = [...this.#members.entries()].map(([id, e]) => ({
      memberId:     id,
      capabilities: e.capabilities,
      vitality:     e.vitality,
      lastSeen:     e.lastSeen,
    }));
    const response = this.#buildMsg(FEDERATION_MSG.SYNC_RESPONSE, { members: memberList });
    await this.#transport(fromMemberId, response).catch(() => {});
  }

  #handleSyncResponse(fromMemberId, payload) {
    const { members = [] } = payload;
    for (const m of members) {
      if (m.memberId !== this.#memberId && !this.#members.has(m.memberId)) {
        this.#members.set(m.memberId, {
          capabilities: m.capabilities,
          vitality:     m.vitality,
          lastSeen:     m.lastSeen || Date.now(),
          phaseOffset:  0,
        });
      }
    }
  }

  // ─── Private: Utilities ────────────────────────────────────────────────────

  #buildMsg(type, payload) {
    return {
      type,
      fromMemberId: this.#memberId,
      phiTimestamp: (Date.now() % HEARTBEAT_MS) / PHI,
      payload,
    };
  }

  #updateMember(memberId, phiTimestamp, overrides = {}) {
    const existing = this.#members.get(memberId) || {
      capabilities: [],
      vitality:     PHI_INV,
      lastSeen:     Date.now(),
      phaseOffset:  0,
    };

    const phaseOffset = phiTimestamp != null
      ? ((Date.now() % HEARTBEAT_MS) / PHI) - phiTimestamp
      : existing.phaseOffset;

    this.#members.set(memberId, {
      ...existing,
      ...overrides,
      lastSeen:    Date.now(),
      phaseOffset,
    });
  }
}

export const FEDERATION_PROTOCOL_VERSION = '1.0.0';
export default MultiFederationProtocol;
