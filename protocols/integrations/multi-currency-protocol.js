/**
 * PROTO-I013: Multi-Currency Protocol (MCP)
 * Derives from: TemporalEngineProtocol, PatternSynthesisProtocol
 * Currency conversion, formatting, and phi-weighted rate confidence scoring.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class MultiCurrencyProtocol {
  #rateBooks = new Map(); // baseCurrency → { rates: Map<currency, rate>, updatedAt }

  constructor(config = {}) {
    this.version      = '1.0.0';
    this.domain       = 'integrations';
    this.defaultLocale = config.defaultLocale ?? 'en-US';
    this.metrics      = { conversions: 0, formatRequests: 0 };
  }

  /** Set exchange rates. rates: { USD: 1.0, EUR: 0.92, ... } */
  setRates(baseCurrency, rates = {}) {
    const rateMap = new Map(Object.entries(rates));
    rateMap.set(baseCurrency, 1); // base rate = 1
    this.#rateBooks.set(baseCurrency.toUpperCase(), { rates: rateMap, updatedAt: Date.now() });
    return { base: baseCurrency, currencies: rateMap.size };
  }

  /** Convert amount from one currency to another. */
  convert(amount, from, to) {
    from = from.toUpperCase(); to = to.toUpperCase();
    if (from === to) return { amount, from, to, rate: 1, converted: amount, formatted: this.format(amount, to) };

    const { rate, confidence } = this.#getRate(from, to);
    const converted = parseFloat((amount * rate).toFixed(6));
    this.metrics.conversions++;
    return { amount, from, to, rate, converted, formatted: this.format(converted, to), confidence };
  }

  /** Format an amount as a localized currency string. */
  format(amount, currency, locale = this.defaultLocale) {
    this.metrics.formatRequests++;
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }

  /** Normalize/batch-convert an array of {amount, currency} to a target currency. */
  normalize(items = [], targetCurrency) {
    return items.map(({ amount, currency }) => {
      const result = this.convert(amount, currency, targetCurrency);
      return { original: { amount, currency }, ...result };
    });
  }

  #getRate(from, to) {
    // Try direct book for `from` as base
    const book = this.#rateBooks.get(from);
    if (book?.rates.has(to)) {
      const rate        = book.rates.get(to);
      const ageMs       = Date.now() - book.updatedAt;
      const confidence  = Math.max(0, PHI_INV - ageMs / (24 * 3_600_000) * PHI_INV);
      return { rate, confidence };
    }

    // Try cross-rate via any available base
    for (const [base, bk] of this.#rateBooks) {
      if (bk.rates.has(from) && bk.rates.has(to)) {
        const fromRate = bk.rates.get(from);
        const toRate   = bk.rates.get(to);
        const rate     = toRate / fromRate;
        const ageMs    = Date.now() - bk.updatedAt;
        const confidence = Math.max(0, PHI_INV * PHI_INV - ageMs / (24 * 3_600_000) * PHI_INV);
        return { rate, confidence };
      }
    }
    throw new Error(`No exchange rate available for ${from} → ${to}`);
  }

  report() { return { version: this.version, domain: this.domain, metrics: this.metrics }; }
}

export default MultiCurrencyProtocol;
