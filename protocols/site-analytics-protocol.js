/**
 * PROTO-GEN-003: Website Analytics & Optimization
 * ═════════════════════════════════════════════════════════════════════
 *
 * Real-time analytics for generated websites: traffic patterns,
 * user engagement, conversion funnels, performance metrics, and
 * phi-weighted recommendations for optimization.
 */

'use strict';

const PHI = 1.618033988749895;
const PHI_INV = 0.618033988749895;

const METRIC_TYPE = Object.freeze({
  PAGE_VIEW:    'page_view',
  CLICK:        'click',
  CONVERSION:   'conversion',
  BOUNCE:       'bounce',
  TIME_ON_PAGE: 'time_on_page',
  SCROLL_DEPTH: 'scroll_depth',
  ERROR:        'error',
});

class SiteAnalytics {
  constructor(siteId) {
    this.siteId = siteId;
    this.events = [];
    this.sessions = {};
    this.metrics = {};
    this._beat = 0;
  }

  recordEvent(eventType, { userId = null, pageId = null, value = 0, metadata = {} } = {}) {
    const event = {
      ts: Date.now(),
      type: eventType,
      userId: userId || `anon-${Math.random().toString(36).slice(2, 9)}`,
      pageId,
      value,
      metadata,
    };
    this.events.push(event);
    if (this.events.length > 10000) this.events.shift();
    return event;
  }

  updateSession(userId, pageId, duration = 0) {
    if (!this.sessions[userId]) {
      this.sessions[userId] = {
        userId,
        startedAt: Date.now(),
        pages: {},
        duration: 0,
        conversions: 0,
        bounced: false,
      };
    }
    const session = this.sessions[userId];
    if (!session.pages[pageId]) {
      session.pages[pageId] = { views: 0, timeSpent: 0, bounceRisk: 1.0 };
    }
    session.pages[pageId].views++;
    session.pages[pageId].timeSpent += duration;
    session.pages[pageId].bounceRisk *= PHI_INV;
    session.duration += duration;
  }

  recordConversion(userId, conversionValue) {
    if (this.sessions[userId]) {
      this.sessions[userId].conversions++;
    }
    this.recordEvent(METRIC_TYPE.CONVERSION, { userId, value: conversionValue });
  }

  computeMetrics() {
    const eventsByType = {};
    for (const evt of this.events) {
      if (!eventsByType[evt.type]) eventsByType[evt.type] = 0;
      eventsByType[evt.type]++;
    }

    const sessions = Object.values(this.sessions);
    const avgSessionDuration = sessions.length > 0
      ? sessions.reduce((s, x) => s + x.duration, 0) / sessions.length
      : 0;
    const conversionRate = sessions.length > 0
      ? sessions.filter(s => s.conversions > 0).length / sessions.length
      : 0;
    const bounceRate = sessions.length > 0
      ? sessions.filter(s => s.bounced).length / sessions.length
      : 0;

    this.metrics = {
      ts: Date.now(),
      totalEvents: this.events.length,
      totalSessions: sessions.length,
      eventsByType,
      avgSessionDuration: +(avgSessionDuration.toFixed(2)),
      conversionRate: +(conversionRate.toFixed(4)),
      bounceRate: +(bounceRate.toFixed(4)),
      health: 1 - Math.max(0, bounceRate - PHI_INV) * PHI,
    };

    return this.metrics;
  }

  getRecommendations() {
    this.computeMetrics();
    const recs = [];

    if (this.metrics.bounceRate > 0.5) {
      recs.push({
        priority: 'HIGH',
        metric: 'bounce_rate',
        issue: `Bounce rate ${(this.metrics.bounceRate * 100).toFixed(1)}% is high`,
        suggestion: 'Improve above-the-fold content and CTA clarity',
        phi_impact: PHI,
      });
    }

    if (this.metrics.avgSessionDuration < 30) {
      recs.push({
        priority: 'HIGH',
        metric: 'session_duration',
        issue: `Avg session ${this.metrics.avgSessionDuration}s is too short`,
        suggestion: 'Add more engaging content and internal navigation',
        phi_impact: PHI,
      });
    }

    if (this.metrics.conversionRate < 0.02) {
      recs.push({
        priority: 'MEDIUM',
        metric: 'conversion',
        issue: `Conversion rate ${(this.metrics.conversionRate * 100).toFixed(2)}% below threshold`,
        suggestion: 'Optimize checkout flow and reduce friction',
        phi_impact: PHI_INV,
      });
    }

    const topPages = Object.entries(
      this.events
        .filter(e => e.pageId)
        .reduce((m, e) => {
          m[e.pageId] = (m[e.pageId] || 0) + 1;
          return m;
        }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      recommendations: recs,
      topPages: topPages.map(([pageId, count]) => ({ pageId, events: count })),
      metrics: this.metrics,
    };
  }

  snapshot() {
    return {
      siteId: this.siteId,
      metrics: this.computeMetrics(),
      recommendations: this.getRecommendations(),
      sessionsTracked: Object.keys(this.sessions).length,
      eventsRecorded: this.events.length,
    };
  }
}

module.exports = { SiteAnalytics, METRIC_TYPE };
