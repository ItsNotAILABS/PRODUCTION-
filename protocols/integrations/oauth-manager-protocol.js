/**
 * PROTO-I006: OAuth Manager Protocol (OMP)
 * Derives from: SecurityGatewayProtocol, ChromoVaultProtocol
 * Manages OAuth 2.0 token lifecycle with auto-refresh within 5 minutes of expiry.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;
const REFRESH_WINDOW_MS = 5 * 60 * 1000; // 5 min

export class OAuthManagerProtocol {
  #apps   = new Map(); // platform → { clientId, clientSecret, tokenUrl, scopes }
  #tokens = new Map(); // `${platform}:${tenantId}` → { accessToken, refreshToken, expiresAt }

  constructor(config = {}) {
    this.version  = '1.0.0';
    this.domain   = 'integrations';
    this.fetchFn  = config.fetchFn ?? null; // injectable for testing
    this.metrics  = { stored: 0, refreshed: 0, expired: 0, revoked: 0 };
  }

  /** Register an OAuth application for a platform. */
  registerApp(platform, { clientId, clientSecret, tokenUrl, scopes = [] }) {
    this.#apps.set(platform, { clientId, clientSecret, tokenUrl, scopes });
    return { platform, scopes };
  }

  /** Store a token for a tenant. */
  storeToken(platform, tenantId, { accessToken, refreshToken, expiresAt }) {
    const key = `${platform}:${tenantId}`;
    this.#tokens.set(key, { accessToken, refreshToken, expiresAt: new Date(expiresAt).getTime() });
    this.metrics.stored++;
    return { platform, tenantId, stored: true };
  }

  /** Get a valid access token, auto-refreshing if within 5 min of expiry. */
  async getToken(platform, tenantId) {
    const key   = `${platform}:${tenantId}`;
    const token = this.#tokens.get(key);
    if (!token) throw new Error(`No token stored for ${platform}:${tenantId}`);

    const now = Date.now();
    if (token.expiresAt - now < REFRESH_WINDOW_MS) {
      if (!token.refreshToken) {
        this.metrics.expired++;
        throw new Error(`Token expired for ${platform}:${tenantId} and no refresh token available`);
      }
      return this.#refresh(platform, tenantId, token, key);
    }

    const ttlMs = token.expiresAt - now;
    // phi-weighted confidence: higher confidence when far from expiry
    const confidence = Math.min(1, (ttlMs / (60 * 60 * 1000)) * PHI_INV);
    return { accessToken: token.accessToken, expiresAt: token.expiresAt, ttlMs, confidence };
  }

  async #refresh(platform, tenantId, token, key) {
    const app = this.#apps.get(platform);
    if (!app) throw new Error(`No OAuth app registered for platform: ${platform}`);

    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: token.refreshToken,
      client_id:     app.clientId,
      client_secret: app.clientSecret,
    });

    let data;
    if (this.fetchFn) {
      data = await this.fetchFn(app.tokenUrl, { method: 'POST', body: body.toString() });
    } else {
      // Simulated response for environments without fetch
      data = { access_token: token.accessToken, expires_in: 3600, refresh_token: token.refreshToken };
    }

    const newExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
    this.#tokens.set(key, {
      accessToken:  data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      expiresAt:    newExpiry,
    });
    this.metrics.refreshed++;
    return { accessToken: data.access_token, expiresAt: newExpiry, ttlMs: data.expires_in * 1000, confidence: PHI_INV };
  }

  /** Revoke a token. */
  revoke(platform, tenantId) {
    const deleted = this.#tokens.delete(`${platform}:${tenantId}`);
    if (deleted) this.metrics.revoked++;
    return { revoked: deleted };
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default OAuthManagerProtocol;
