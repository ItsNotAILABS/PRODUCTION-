'use strict';

/**
 * GitDigestMicrobot
 * Parent: git-knowledge-bot
 *
 * Runs a complete digest mission against a GitKnowledgeEngine instance and
 * emits the result as a structured knowledge artifact. This microbot is the
 * synthesis layer — it consumes the scanner's index and produces a human-
 * and machine-readable knowledge digest for downstream X ecosystem consumers.
 */

const { MicrobotBase } = require('../../microbots/microbot-base.js');

class GitDigestMicrobot extends MicrobotBase {
  /**
   * @param {string} parentBot
   * @param {{ engine: import('../src/git-knowledge-engine.js').GitKnowledgeEngine }} config
   */
  constructor(parentBot, config = {}) {
    super('git-digest', parentBot, config);

    if (!config.engine) {
      throw new Error('GitDigestMicrobot requires config.engine (a GitKnowledgeEngine instance)');
    }

    this._engine = config.engine;
  }

  async _execute() {
    // Run all non-mutating missions in parallel for speed
    const [
      digest,
      protocols,
      governance,
      entries,
      sdkSurface,
      contributors,
    ] = await Promise.allSettled([
      this._engine.digest(),
      this._engine.auditProtocols(),
      this._engine.auditGovernance(),
      this._engine.entrySurface(),
      this._engine.sdkSurface(),
      this._engine.contributorMap(),
    ]);

    this.tick();

    const artifact = {
      generatedAt: new Date().toISOString(),
      sections: {
        digest:      this._unwrap(digest),
        protocols:   this._unwrap(protocols),
        governance:  this._unwrap(governance),
        entries:     this._unwrap(entries),
        sdkSurface:  this._unwrap(sdkSurface),
        contributors: this._unwrap(contributors),
      },
      summary: this._buildSummary(digest, protocols, governance, entries, sdkSurface),
    };

    this._emit('digest-ready', artifact);
    return artifact;
  }

  // ---------------------------------------------------------------------------

  _unwrap(settled) {
    if (settled.status === 'fulfilled') return settled.value?.result ?? settled.value;
    return { error: settled.reason?.message ?? 'unknown error' };
  }

  _buildSummary(digest, protocols, governance, entries, sdkSurface) {
    const d  = this._unwrap(digest);
    const p  = this._unwrap(protocols);
    const g  = this._unwrap(governance);
    const e  = this._unwrap(entries);
    const s  = this._unwrap(sdkSurface);

    return {
      repoName:       d.repository?.name    ?? 'unknown',
      totalFiles:     d.repository?.totalFiles ?? 0,
      totalProtocols: p.count  ?? 0,
      totalGovernance: g.count ?? 0,
      totalEntries:   e.count  ?? 0,
      totalSdkModules: s.count ?? 0,
      latestCommit:   d.latestCommit?.message?.slice(0, 60) ?? null,
      currentBranch:  d.repository?.branch ?? null,
    };
  }
}

module.exports = GitDigestMicrobot;
