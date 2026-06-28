import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

/**
 * File categories derived from extension and path patterns.
 * @readonly
 */
const CATEGORIES = {
  protocol:   /protocols?\//i,
  schema:     /schemas?\//i,
  governance: /governance\//i,
  mission:    /missions?\//i,
  sdk:        /sdk\//i,
  test:       /(test|spec)\//i,
  docs:       /(docs?|research|papers?)\//i,
  config:     /^(package\.json|tsconfig|\.github|dfx\.json|pyproject\.toml|requirements.*\.txt)/i,
  microbot:   /microbot/i,
  worker:     /worker/i,
};

/**
 * Source file extensions worth indexing.
 * @readonly
 */
const SOURCE_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx',
  '.py', '.java', '.mo', '.jl',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx', '.html', '.csv',
  '.agda', '.lean', '.hs', '.idr', '.fsx', '.v',
]);

const IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'dist', '.next', '__pycache__',
  'coverage', '.cache', 'build', 'out',
]);

const KEY_FILES = new Set([
  'package.json', 'pyproject.toml', 'requirements.txt',
  'README.md', 'README', 'CLAUDE.md', 'MANIFEST.json',
  'dfx.json', 'tsconfig.json', '.well-known/ai.json',
]);

/**
 * GitIndexer — walks a local Git repository and builds a structured
 * index of files, commits, branches, and key metadata. This index
 * is the raw input consumed by GitKnowledgeGraph.
 */
export class GitIndexer {
  /** @type {string} Absolute path to repo root */
  #root;

  /** @type {boolean} */
  #hasGit;

  /**
   * @param {string} repoPath - Absolute path to the repository root.
   */
  constructor(repoPath) {
    const resolved = path.resolve(repoPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Repository path not found: ${resolved}`);
    }
    this.#root   = resolved;
    this.#hasGit = fs.existsSync(path.join(resolved, '.git'));
  }

  get root() { return this.#root; }

  /**
   * Build the full repository index.
   * @returns {{ meta: object, files: object[], commits: object[], branches: string[], tags: string[], keyFiles: object[] }}
   */
  index() {
    const files    = this.#walkFiles(this.#root);
    const commits  = this.#hasGit ? this.#readCommits(40) : [];
    const branches = this.#hasGit ? this.#readBranches() : [];
    const tags     = this.#hasGit ? this.#readTags()     : [];
    const keyFiles = this.#readKeyFiles(files);
    const meta     = this.#buildMeta(files, commits, branches);

    return { meta, files, commits, branches, tags, keyFiles };
  }

  /**
   * Scan only files — lighter than a full index.
   * @returns {object[]}
   */
  scanFiles() {
    return this.#walkFiles(this.#root);
  }

  // ---------------------------------------------------------------------------
  // File walking
  // ---------------------------------------------------------------------------

  /**
   * Recursively walk the repo, returning a descriptor for each source file.
   * @param {string} dir
   * @param {number} [depth=0]
   * @returns {object[]}
   */
  #walkFiles(dir, depth = 0) {
    if (depth > 12) return [];

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const results = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.well-known') continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath  = path.relative(this.#root, fullPath);

      if (entry.isDirectory()) {
        results.push(...this.#walkFiles(fullPath, depth + 1));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!SOURCE_EXTS.has(ext) && !KEY_FILES.has(entry.name)) continue;

        let size = 0;
        try { size = fs.statSync(fullPath).size; } catch { /* skip */ }

        results.push({
          id:       crypto.createHash('sha1').update(relPath).digest('hex').slice(0, 12),
          path:     relPath,
          name:     entry.name,
          ext,
          size,
          category: this.#classify(relPath, entry.name),
          depth,
        });
      }
    }

    return results;
  }

  /**
   * Classify a file into a category.
   * @param {string} relPath
   * @param {string} name
   * @returns {string}
   */
  #classify(relPath, name) {
    for (const [cat, pattern] of Object.entries(CATEGORIES)) {
      if (pattern.test(relPath) || pattern.test(name)) return cat;
    }
    return 'source';
  }

  // ---------------------------------------------------------------------------
  // Git operations
  // ---------------------------------------------------------------------------

  /**
   * Read recent commits via git log.
   * @param {number} limit
   * @returns {object[]}
   */
  #readCommits(limit) {
    try {
      const raw = execSync(
        `git -C "${this.#root}" log --format="%H|%an|%ae|%aI|%s" -n ${limit}`,
        { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] },
      );

      return raw
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, author, email, date, ...msgParts] = line.split('|');
          return {
            hash:    hash?.trim(),
            author:  author?.trim(),
            email:   email?.trim(),
            date:    date?.trim(),
            message: msgParts.join('|').trim(),
          };
        })
        .filter((c) => c.hash);
    } catch {
      return [];
    }
  }

  /**
   * Read branch names.
   * @returns {string[]}
   */
  #readBranches() {
    try {
      const raw = execSync(
        `git -C "${this.#root}" branch -a --format="%(refname:short)"`,
        { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return raw.trim().split('\n').map((b) => b.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Read tag names.
   * @returns {string[]}
   */
  #readTags() {
    try {
      const raw = execSync(
        `git -C "${this.#root}" tag --sort=-creatordate`,
        { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return raw.trim().split('\n').map((t) => t.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Key files
  // ---------------------------------------------------------------------------

  /**
   * Read and return the contents of key files (README, package.json, etc.)
   * @param {object[]} fileIndex
   * @returns {object[]}
   */
  #readKeyFiles(fileIndex) {
    const keyEntries = fileIndex.filter(
      (f) => KEY_FILES.has(f.name) || KEY_FILES.has(f.path),
    );

    return keyEntries.slice(0, 10).map((f) => {
      let content = null;
      try {
        const raw = fs.readFileSync(path.join(this.#root, f.path), 'utf8');
        // Cap at 8KB per key file to stay lean
        content = raw.length > 8_192 ? raw.slice(0, 8_192) + '\n…[truncated]' : raw;
      } catch { /* skip */ }
      return { ...f, content };
    });
  }

  // ---------------------------------------------------------------------------
  // Meta
  // ---------------------------------------------------------------------------

  /**
   * Build top-level repository metadata.
   * @param {object[]} files
   * @param {object[]} commits
   * @param {string[]} branches
   * @returns {object}
   */
  #buildMeta(files, commits, branches) {
    const byCategory = {};
    const byExt      = {};

    for (const f of files) {
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
      byExt[f.ext]           = (byExt[f.ext] ?? 0) + 1;
    }

    const currentBranch = this.#hasGit ? this.#currentBranch() : null;
    const latestCommit  = commits[0] ?? null;

    return {
      root: this.#root,
      name: path.basename(this.#root),
      hasGit: this.#hasGit,
      currentBranch,
      totalFiles: files.length,
      byCategory,
      byExt,
      latestCommit,
      totalBranches: branches.length,
      indexedAt: new Date().toISOString(),
    };
  }

  #currentBranch() {
    try {
      return execSync(
        `git -C "${this.#root}" rev-parse --abbrev-ref HEAD`,
        { encoding: 'utf8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
    } catch {
      return null;
    }
  }
}

export default GitIndexer;
