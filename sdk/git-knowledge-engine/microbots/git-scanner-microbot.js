'use strict';

const { MicrobotBase } = require('../../microbots/microbot-base.js');
const path             = require('node:path');
const { execSync }     = require('node:child_process');

/**
 * GitScannerMicrobot
 * Parent: git-knowledge-bot
 *
 * Continuously watches a Git repository for new commits and changed files.
 * On each tick it reads the latest commit hash and emits a 'repo-changed'
 * event when the HEAD has advanced since the last check.
 *
 * This is the observation layer of the Git Knowledge Engine — it feeds
 * new state into the engine so the knowledge graph stays current.
 */
class GitScannerMicrobot extends MicrobotBase {
  /**
   * @param {string} parentBot
   * @param {{ repoRoot: string, pollIntervalMs?: number }} config
   */
  constructor(parentBot, config = {}) {
    super('git-scanner', parentBot, config);
    this.repoRoot        = path.resolve(config.repoRoot ?? process.cwd());
    this.pollIntervalMs  = config.pollIntervalMs ?? 30_000;
    this._lastHead       = null;
    this._changeCount    = 0;
    this._timer          = null;
  }

  async _execute() {
    this._lastHead = this._readHead();
    this._emit('scan-start', { repoRoot: this.repoRoot, head: this._lastHead });

    // Run one immediate scan then schedule polling
    const initial = this._scan();

    this._timer = setInterval(() => {
      try { this._pollTick(); } catch { /* swallow — microbot must not crash */ }
    }, this.pollIntervalMs);

    // Return the initial scan result; polling continues until shutdown()
    return initial;
  }

  shutdown() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    super.shutdown();
  }

  _onTick() {
    this._pollTick();
  }

  // ---------------------------------------------------------------------------

  _pollTick() {
    const currentHead = this._readHead();
    if (currentHead && currentHead !== this._lastHead) {
      const diff = this._diffSince(this._lastHead, currentHead);
      this._lastHead = currentHead;
      this._changeCount++;
      this._emit('repo-changed', {
        repoRoot:    this.repoRoot,
        previousHead: diff.previousHead,
        currentHead:  diff.currentHead,
        newCommits:   diff.commits,
        changedFiles: diff.files,
        changeCount:  this._changeCount,
      });
    }
  }

  _scan() {
    const head     = this._lastHead;
    const branches = this._readBranches();
    const recent   = this._readRecentCommits(5);

    return {
      repoRoot:      this.repoRoot,
      head,
      branches,
      recentCommits: recent,
      scannedAt:     new Date().toISOString(),
    };
  }

  _readHead() {
    try {
      return execSync(
        `git -C "${this.repoRoot}" rev-parse HEAD`,
        { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
    } catch { return null; }
  }

  _readBranches() {
    try {
      return execSync(
        `git -C "${this.repoRoot}" branch -a --format="%(refname:short)"`,
        { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim().split('\n').map((b) => b.trim()).filter(Boolean);
    } catch { return []; }
  }

  _readRecentCommits(n) {
    try {
      return execSync(
        `git -C "${this.repoRoot}" log --format="%H|%an|%aI|%s" -n ${n}`,
        { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim().split('\n').filter(Boolean).map((l) => {
        const [hash, author, date, ...msg] = l.split('|');
        return { hash: hash?.trim(), author: author?.trim(), date: date?.trim(), message: msg.join('|').trim() };
      });
    } catch { return []; }
  }

  _diffSince(oldHead, newHead) {
    let commits = [];
    let files   = [];

    if (oldHead && newHead) {
      try {
        const range = `${oldHead}..${newHead}`;
        commits = execSync(
          `git -C "${this.repoRoot}" log --format="%H|%an|%aI|%s" ${range}`,
          { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] },
        ).trim().split('\n').filter(Boolean).map((l) => {
          const [hash, author, date, ...msg] = l.split('|');
          return { hash: hash?.trim(), author: author?.trim(), date: date?.trim(), message: msg.join('|').trim() };
        });

        files = execSync(
          `git -C "${this.repoRoot}" diff --name-only ${range}`,
          { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] },
        ).trim().split('\n').filter(Boolean);
      } catch { /* skip */ }
    }

    return { previousHead: oldHead, currentHead: newHead, commits, files };
  }
}

module.exports = GitScannerMicrobot;
