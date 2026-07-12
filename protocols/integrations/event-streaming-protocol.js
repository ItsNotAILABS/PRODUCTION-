/**
 * PROTO-I009: Event Streaming Protocol (ESP)
 * Derives from: SynapseBindingEngineProtocol, PhiResonanceSyncProtocol
 * Real-time event bus across integrations with phi-weighted priority queue and backpressure.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class EventStreamingProtocol {
  #subscribers = new Map(); // topic → Set<handler>
  #queue       = [];        // [{topic, event, priority, ts}]
  #processing  = false;

  constructor(config = {}) {
    this.version      = '1.0.0';
    this.domain       = 'integrations';
    this.maxQueueSize = config.maxQueueSize ?? 10_000;
    this.metrics      = { published: 0, consumed: 0, dropped: 0 };
  }

  /** Subscribe a handler to a topic. */
  subscribe(topic, handler) {
    if (!this.#subscribers.has(topic)) this.#subscribers.set(topic, new Set());
    this.#subscribers.get(topic).add(handler);
    return { topic, subscribed: true, total: this.#subscribers.get(topic).size };
  }

  /** Unsubscribe a handler from a topic. */
  unsubscribe(topic, handler) {
    const subs = this.#subscribers.get(topic);
    if (!subs) return { removed: false };
    const removed = subs.delete(handler);
    return { topic, removed };
  }

  /** Publish a single event to a topic. Fan-out to all subscribers. */
  async publish(topic, event) {
    if (this.#queue.length >= this.maxQueueSize) {
      this.metrics.dropped++;
      return { dropped: true };
    }
    const priority = this.#computePriority(topic, event);
    this.#enqueue({ topic, event, priority, ts: Date.now() });
    this.metrics.published++;
    await this.#flush();
    return { topic, priority, queued: this.#queue.length };
  }

  /** Publish a batch of events to a topic with backpressure. */
  async publishBatch(topic, events = []) {
    const results = [];
    for (const event of events) {
      results.push(await this.publish(topic, event));
    }
    return { topic, total: events.length, results };
  }

  /** Phi-weighted priority: events with higher numeric value get higher priority. */
  #computePriority(topic, event) {
    const base = typeof event.priority === 'number' ? event.priority : 1;
    const topicWeight = [...(this.#subscribers.get(topic) ?? [])].length;
    return base * PHI_INV + topicWeight * PHI_INV * PHI_INV;
  }

  #enqueue(item) {
    this.#queue.push(item);
    this.#queue.sort((a, b) => b.priority - a.priority);
  }

  async #flush() {
    if (this.#processing) return;
    this.#processing = true;
    while (this.#queue.length > 0) {
      const item  = this.#queue.shift();
      const subs  = this.#subscribers.get(item.topic);
      if (!subs || subs.size === 0) continue;
      const calls = [...subs].map((fn) => {
        try { return Promise.resolve(fn(item.event, { topic: item.topic, ts: item.ts, priority: item.priority })); }
        catch { return Promise.resolve(); }
      });
      await Promise.allSettled(calls);
      this.metrics.consumed++;
    }
    this.#processing = false;
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default EventStreamingProtocol;
