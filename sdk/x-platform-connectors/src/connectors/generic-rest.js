import { XPlatformConnector } from '../platform-connector.js';

/**
 * GenericRestConnector — X ecosystem adapter for any arbitrary REST API.
 * Operations: get, post, put, patch, delete against a configurable base URL.
 * Provide credentials.bearerToken or credentials.apiKey for authentication.
 */
export class GenericRestConnector extends XPlatformConnector {
  #baseUrl;
  #defaultHeaders;

  /**
   * @param {{
   *   name?:         string,
   *   baseUrl:       string,
   *   headers?:      object,
   *   capabilities?: string[],
   *   credentials?:  object,
   * }} opts
   */
  constructor({ name = 'generic-rest', baseUrl, headers = {}, capabilities = ['rest'], credentials = {} } = {}) {
    super({ name, version: '1.0.0', capabilities, credentials });
    this.#baseUrl        = baseUrl ?? '';
    this.#defaultHeaders = { 'Content-Type': 'application/json', ...headers };
  }

  async connect() {
    if (!this.#baseUrl) throw new Error(`${this.name}: baseUrl is required`);
    await super.connect();
  }

  _operations() {
    return {
      get:    (p) => this.#req('GET',    p.path ?? '/', null,   p.headers),
      post:   (p) => this.#req('POST',   p.path ?? '/', p.body, p.headers),
      put:    (p) => this.#req('PUT',    p.path ?? '/', p.body, p.headers),
      patch:  (p) => this.#req('PATCH',  p.path ?? '/', p.body, p.headers),
      delete: (p) => this.#req('DELETE', p.path ?? '/', null,   p.headers),
    };
  }

  async #req(method, path, body = null, extra = {}) {
    const url     = `${this.#baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const headers = { ...this.#defaultHeaders, ...extra };

    const { bearerToken, apiKey, apiKeyHeader = 'X-API-Key' } = this.credentials;
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    if (apiKey)      headers[apiKeyHeader]    = apiKey;

    const options = { method, headers };
    if (body && method !== 'GET') options.body = JSON.stringify(body);

    const res  = await fetch(url, options);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      throw new Error(`${this.name}: ${method} ${url} → ${res.status}: ${text.slice(0, 200)}`);
    }
    return { status: res.status, data, platform: this.name, url };
  }
}

export default GenericRestConnector;
