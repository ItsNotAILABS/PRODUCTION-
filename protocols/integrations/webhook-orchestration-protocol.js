/**
 * PROTO-I005: Webhook Orchestration Protocol (WOP)
 * Derives from: EventStreamingProtocol, RetryRecoveryProtocol
 * Manages incoming webhooks from all platforms with HMAC-SHA256 verification, dispatch, and retry.
 */

import { createHmac } from 'crypto';

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class WebhookOrchestrationProtocol {
  #endpoints = new Map(); // platform → { secret, handler, retries }

  constructor(config = {}) {
    this.version    = '1.0.0';
    this.domain     = 'integrations';
    this.maxRetries = config.maxRetries ?? 3;
    this.metrics    = { received: 0, verified: 0, dispatched: 0, failed: 0 };
  }

  /** Register a webhook endpoint for a platform. */
  registerEndpoint(platform, secret, handler) {
    if (typeof handler !== 'function') throw new Error('handler must be a function');
    this.#endpoints.set(platform, { secret, handler, retries: 0 });
    return { platform, registered: true };
  }

  /** Receive a webhook, verify HMAC-SHA256, dispatch to handler, retry on failure. */
  async receive(platform, payload, headers = {}, signature = '') {
    this.metrics.received++;
    const endpoint = this.#endpoints.get(platform);
    if (!endpoint) throw new Error(`No endpoint registered for platform: ${platform}`);

    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const valid = this.#verifyHmac(body, endpoint.secret, signature);
    if (!valid) {
      this.metrics.failed++;
      return { platform, verified: false, dispatched: false, error: 'Invalid signature' };
    }
    this.metrics.verified++;

    const parsed = (() => { try { return JSON.parse(body); } catch { return payload; } })();
    const result = await this.#dispatchWithRetry(endpoint, parsed, headers);
    return { platform, verified: true, ...result };
  }

  #verifyHmac(body, secret, signature) {
    if (!secret || !signature) return !secret; // no secret = open endpoint
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const sig = signature.replace(/^sha256=/, '');
    // constant-time compare via XOR length check
    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0;
  }

  async #dispatchWithRetry(endpoint, payload, headers) {
    let attempt = 0;
    while (attempt <= this.maxRetries) {
      try {
        const result = await endpoint.handler(payload, headers);
        this.metrics.dispatched++;
        return { dispatched: true, result, attempts: attempt + 1 };
      } catch (err) {
        attempt++;
        if (attempt > this.maxRetries) {
          this.metrics.failed++;
          return { dispatched: false, error: err.message, attempts: attempt };
        }
        // phi-backoff: delay = PHI^attempt * 100ms
        await new Promise((r) => setTimeout(r, Math.round(PHI ** attempt * 100)));
      }
    }
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default WebhookOrchestrationProtocol;
