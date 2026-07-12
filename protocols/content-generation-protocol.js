/**
 * PROTO-GEN-004: Content Generation & Optimization
 * ═════════════════════════════════════════════════════════════════════
 *
 * Generates SEO-optimized content, manages editorial calendars,
 * and scores content quality using phi-weighted coherence metrics.
 */

'use strict';

const PHI = 1.618033988749895;
const PHI_INV = 0.618033988749895;

const CONTENT_TYPE = Object.freeze({
  BLOG_POST:    'blog_post',
  LANDING_PAGE: 'landing_page',
  PRODUCT_PAGE: 'product_page',
  TUTORIAL:     'tutorial',
  CASE_STUDY:   'case_study',
  NEWSLETTER:   'newsletter',
});

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function scoreReadability(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const words = tokenize(text);
  const avgSentenceLength = words.length / Math.max(1, sentences.length);
  const uniqueWords = new Set(words).size;
  const lexicalDiversity = uniqueWords / Math.max(1, words.length);

  const readability = (
    (Math.min(20, avgSentenceLength) / 20) * 0.5 +
    lexicalDiversity * 0.5
  );
  return Math.min(1, readability);
}

function scoreKeywordRelevance(content, keywords) {
  if (keywords.length === 0) return 0;
  const tokens = tokenize(content);
  const tokenSet = new Set(tokens);
  const matchCount = keywords.filter(kw => {
    const kwTokens = tokenize(kw);
    return kwTokens.some(t => tokenSet.has(t));
  }).length;
  return matchCount / keywords.length;
}

function scoreEngagement(text) {
  const questionCount = (text.match(/\?/g) || []).length;
  const exclaimCount = (text.match(/!/g) || []).length;
  const callToActionPatterns = /call to action|click|learn more|discover|join/gi;
  const ctaCount = (text.match(callToActionPatterns) || []).length;

  const engagement = (
    Math.tanh(questionCount / 10) * 0.3 +
    Math.tanh(exclaimCount / 10) * 0.3 +
    Math.tanh(ctaCount / 5) * 0.4
  );
  return Math.min(1, engagement);
}

class ContentGenerator {
  constructor() {
    this.content = [];
    this.calendar = [];
    this.templates = {};
  }

  registerTemplate(contentType, template) {
    this.templates[contentType] = template;
  }

  generateContent(contentType, { topic = '', keywords = [], targetLength = 500 } = {}) {
    if (!this.templates[contentType]) {
      return { ok: false, error: `No template for ${contentType}` };
    }

    const template = this.templates[contentType];
    const content = `${template.header} ${topic}\n\n${template.body}\n\n${template.footer}`;

    const record = {
      id: `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: contentType,
      topic,
      content,
      generatedAt: Date.now(),
      quality: this._scoreContent(content, keywords),
    };

    this.content.push(record);
    if (this.content.length > 500) this.content.shift();

    return { ok: true, content: record };
  }

  _scoreContent(text, keywords = []) {
    const readability = scoreReadability(text);
    const keywordRelevance = scoreKeywordRelevance(text, keywords);
    const engagement = scoreEngagement(text);

    const weighted = (
      readability * PHI +
      keywordRelevance * PHI_INV +
      engagement * 1
    ) / 3;

    return {
      overall: +(Math.min(1, weighted).toFixed(4)),
      readability: +(readability.toFixed(4)),
      keywordRelevance: +(keywordRelevance.toFixed(4)),
      engagement: +(engagement.toFixed(4)),
    };
  }

  scheduleContent(contentId, publishDate, channels = []) {
    const record = this.content.find(c => c.id === contentId);
    if (!record) return { ok: false, error: 'content_not_found' };

    const scheduled = {
      contentId,
      publishDate,
      channels,
      scheduledAt: Date.now(),
      published: false,
    };

    this.calendar.push(scheduled);
    return { ok: true, scheduled };
  }

  optimizeForSEO(contentId, targetKeywords = []) {
    const record = this.content.find(c => c.id === contentId);
    if (!record) return { ok: false, error: 'content_not_found' };

    const currentScore = scoreKeywordRelevance(record.content, targetKeywords);
    const suggestions = [];

    if (currentScore < 0.5) {
      suggestions.push({
        priority: 'HIGH',
        issue: 'Low keyword relevance',
        suggestion: 'Incorporate target keywords naturally throughout content',
      });
    }

    const readability = scoreReadability(record.content);
    if (readability < 0.5) {
      suggestions.push({
        priority: 'MEDIUM',
        issue: 'Complex sentence structure',
        suggestion: 'Use shorter sentences and simpler vocabulary',
      });
    }

    return {
      ok: true,
      currentKeywordScore: +(currentScore.toFixed(4)),
      suggestions,
      estimatedImprovementIfApplied: +(Math.min(1, currentScore * PHI).toFixed(4)),
    };
  }

  snapshot() {
    return {
      totalContent: this.content.length,
      averageQuality: this.content.length > 0
        ? +(this.content.reduce((s, c) => s + c.quality.overall, 0) / this.content.length).toFixed(4)
        : 0,
      scheduledPublications: this.calendar.length,
      templates: Object.keys(this.templates),
    };
  }
}

module.exports = { ContentGenerator, CONTENT_TYPE, scoreReadability, scoreKeywordRelevance, scoreEngagement };
