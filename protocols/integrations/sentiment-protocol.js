/**
 * PROTO-I029: Sentiment Protocol (SP)
 * Derives from: DataNormalizationProtocol, AnalyticsAggregationProtocol
 * Lexicon-based sentiment, intent, and emotion detection with phi-weighted sliding window.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

const POSITIVE_WORDS = new Set([
  'good','great','excellent','amazing','wonderful','fantastic','love','like','happy',
  'joy','positive','best','perfect','awesome','brilliant','superb','outstanding',
  'praise','appreciate','thank','helpful','success','win','benefit','improve',
]);

const NEGATIVE_WORDS = new Set([
  'bad','terrible','awful','hate','dislike','horrible','worst','poor','fail',
  'broken','error','wrong','problem','issue','complaint','angry','upset','sad',
  'slow','buggy','crash','useless','disappointing','frustrating','annoying',
]);

const EMOTIONS = {
  joy    : ['happy','joy','love','great','wonderful','delight','pleased','excited'],
  sadness: ['sad','unhappy','depressed','miserable','cry','grief','sorrow','sorry'],
  anger  : ['angry','furious','rage','hate','mad','annoyed','irritated','frustrated'],
  fear   : ['scared','afraid','fear','worried','anxious','nervous','panic','dread'],
  surprise: ['surprised','shocked','amazed','unexpected','wow','astonishing','sudden'],
};

export class SentimentProtocol {
  #window     = [];  // [{ sentiment, score, intent, at }]
  #windowSize = 20;

  constructor(config = {}) {
    this.version    = '1.0.0';
    this.domain     = 'integrations';
    this.#windowSize = config.windowSize ?? 20;
    this.metrics    = { analyzed: 0, critical: 0 };
  }

  /**
   * Analyse text and return sentiment score.
   * @returns {{ sentiment, score, intent, confidence }}
   */
  analyze(text) {
    const words   = this.#tokenize(text);
    let   posHits = 0, negHits = 0;

    for (const w of words) {
      if (POSITIVE_WORDS.has(w)) posHits++;
      if (NEGATIVE_WORDS.has(w)) negHits++;
    }

    const total  = posHits + negHits;
    const rawScore = total === 0 ? 0.5 : posHits / total;
    // Normalise to [0, 1]: 0.5 = neutral, 1 = max positive, 0 = max negative
    const score  = total === 0
      ? 0.5
      : Math.round(rawScore * 1000) / 1000;

    const sentiment = score > 0.6 ? 'positive' : score < 0.4 ? 'negative' : 'neutral';
    const intent    = this.detectIntent(text);
    const confidence = total === 0 ? PHI_INV : Math.min(1, total / words.length + PHI_INV ** 3);

    const reading = { sentiment, score, intent, at: Date.now() };
    this.#window.push(reading);
    if (this.#window.length > this.#windowSize) this.#window.shift();
    this.metrics.analyzed++;

    return { sentiment, score, intent, confidence: Math.round(confidence * 1000) / 1000 };
  }

  /** Classify the communicative intent of a text. */
  detectIntent(text) {
    const t = text.toLowerCase().trim();
    if (/\?$/.test(t) || /^(what|who|when|where|why|how|is|are|do|does|can|could|should)\b/.test(t)) {
      return 'question';
    }
    if (/^(please|kindly|do|make|set|update|delete|create|run|add|remove|fix)\b/.test(t)) {
      return 'command';
    }
    if (NEGATIVE_WORDS.has(this.#tokenize(t)[0]) || /^(terrible|awful|broken|hate)\b/.test(t)) {
      return 'complaint';
    }
    if (POSITIVE_WORDS.has(this.#tokenize(t)[0]) || /^(great|amazing|love|thank)\b/.test(t)) {
      return 'praise';
    }
    return 'statement';
  }

  /**
   * Phi-weighted trend over recent window readings.
   * Earlier readings get weight PHI_INV^i (i=0 is most recent).
   * @returns {{ avgScore, trend, windowSize }}
   */
  trackTrend({ windowSize = 10 } = {}) {
    const slice  = this.#window.slice(-windowSize).reverse(); // most recent first
    let   wSum   = 0, wTotal = 0;

    slice.forEach((r, i) => {
      const w  = PHI_INV ** i;
      wSum    += r.score * w;
      wTotal  += w;
    });

    const avgScore = wTotal === 0 ? 0.5 : Math.round((wSum / wTotal) * 1000) / 1000;
    const trend    = avgScore > 0.6 ? 'improving' : avgScore < 0.4 ? 'declining' : 'stable';
    return { avgScore, trend, windowSize: slice.length };
  }

  /**
   * Returns true if sentiment score is very negative (< PHI_INV^2 ≈ 0.382).
   * Per spec: isCritical if score < PHI_INV^2 (~0.236 after second squaring,
   * but the spec says < PHI_INV^2 which equals (1/PHI)^2 ≈ 0.382 — kept as-is).
   */
  isCritical(text) {
    const { score } = this.analyze(text);
    return score < PHI_INV ** 2;
  }

  /**
   * Return a 5-dimension emotion vector (each value 0-1) for the given text.
   */
  getEmotionVector(text) {
    const words = this.#tokenize(text);
    const wordSet = new Set(words);
    const vector = {};

    for (const [emotion, lexicon] of Object.entries(EMOTIONS)) {
      const hits = lexicon.filter(w => wordSet.has(w)).length;
      vector[emotion] = Math.min(1, Math.round((hits / Math.max(1, lexicon.length) * PHI) * 100) / 100);
    }
    return vector;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  #tokenize(text) {
    return text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default SentimentProtocol;
