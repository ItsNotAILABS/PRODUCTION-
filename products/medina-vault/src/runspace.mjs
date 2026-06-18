// runspace.mjs — Loom's local code execution sandbox.
//
// Each job is an isolated folder under ~/.medina/runspace/<job_id>/.
// The vault can:
//   1. Create a job → mkdir + return path
//   2. Write files into it
//   3. Execute a command IN that folder with strict limits:
//      · cwd  = the job folder only
//      · env  = minimal whitelist (PATH only, no MEDINA_* secrets)
//      · shell = false (no shell injection)
//      · timeout = configurable (default 30s, max 5min)
//      · max output = configurable (default 256KB)
//   4. Collect outputs (stdout, stderr, exitCode, files written)
//   5. Cleanup
//
// Every job fires receipts: runspace_job_created / runspace_exec_completed.
// Results are stored to ROOT vault by default for durability.

import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import { join, dirname, resolve, relative, sep, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { multiHash, randomToken } from './crypto_ext.mjs';

const RUNSPACE_ROOT = process.env.MEDINA_RUNSPACE_PATH
  || join(process.env.MEDINA_HOME || join(homedir(), '.medina'), 'runspace');

const DEFAULT_TIMEOUT_MS  = 30_000;
const MAX_TIMEOUT_MS      = 300_000;
const DEFAULT_MAX_OUTPUT  = 256 * 1024;        // 256 KB
const MAX_FILE_BYTES      = 5 * 1024 * 1024;   // 5 MB per file
const ALLOWED_COMMANDS    = new Set(['node', 'python', 'python3', 'sh', 'bash', 'cmd', 'powershell', 'pwsh', 'git', 'npm', 'pip']);

export class Runspace {
  constructor({ rootVault, receipts } = {}) {
    this.rootVault = rootVault;
    this.receipts  = receipts;
    this.jobs = new Map();  // id → Job
  }

  async _ensureRoot() {
    await fsp.mkdir(RUNSPACE_ROOT, { recursive: true });
  }

  /** Create a new isolated job folder. Returns { id, path }. */
  async createJob({ label } = {}) {
    await this._ensureRoot();
    const id = 'job_' + Date.now().toString(36) + '_' + randomToken(6);
    const path = join(RUNSPACE_ROOT, id);
    await fsp.mkdir(path, { recursive: true });
    const job = { id, path, label: label || id, created: Date.now(), files: [], runs: [] };
    this.jobs.set(id, job);
    this.receipts?.append({
      kind: 'agent_dispatched', ref: `runspace:${id}`, agent: 'system',
      meta: { runspace_job_created: true, label: job.label },
    });
    return { ok: true, id, path, label: job.label };
  }

  /** Write a file relative to the job folder. Path traversal blocked. */
  async writeFile(job_id, { path: rel, content }) {
    const job = this.jobs.get(job_id);
    if (!job) return { ok: false, reason: 'JOB_NOT_FOUND' };
    if (!rel || isAbsolute(rel)) return { ok: false, reason: 'PATH_MUST_BE_RELATIVE' };
    const full = resolve(job.path, rel);
    const inside = !relative(job.path, full).startsWith('..' + sep) && relative(job.path, full) !== '..';
    if (!inside) return { ok: false, reason: 'PATH_ESCAPE_DENIED' };

    const buf = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
    if (buf.length > MAX_FILE_BYTES) return { ok: false, reason: 'FILE_TOO_LARGE', max: MAX_FILE_BYTES };

    await fsp.mkdir(dirname(full), { recursive: true });
    await fsp.writeFile(full, buf);
    const hash = multiHash(buf.toString('utf8')).combined;
    job.files.push({ path: rel, bytes: buf.length, hash, written_at: Date.now() });
    return { ok: true, path: rel, bytes: buf.length, hash };
  }

  /**
   * Execute a command inside the job folder. command MUST be in ALLOWED_COMMANDS.
   * Returns { ok, stdout, stderr, exit_code, timed_out, ms }.
   */
  async exec(job_id, { command, args = [], timeout_ms = DEFAULT_TIMEOUT_MS, max_output_bytes = DEFAULT_MAX_OUTPUT } = {}) {
    const job = this.jobs.get(job_id);
    if (!job) return { ok: false, reason: 'JOB_NOT_FOUND' };
    if (!command) return { ok: false, reason: 'COMMAND_REQUIRED' };
    if (!ALLOWED_COMMANDS.has(command)) {
      return { ok: false, reason: 'COMMAND_NOT_ALLOWED', allowed: [...ALLOWED_COMMANDS] };
    }
    const timeout = Math.min(MAX_TIMEOUT_MS, Math.max(100, timeout_ms || DEFAULT_TIMEOUT_MS));

    return await new Promise((resolveExec) => {
      const t0 = Date.now();
      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let killed = false;
      let truncated = false;
      const child = spawn(command, args, {
        cwd: job.path,
        env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT || '' },
        shell: false,
        windowsHide: true,
      });
      const killTimer = setTimeout(() => {
        killed = true;
        try { child.kill('SIGKILL'); } catch {}
      }, timeout);
      const append = (which, chunk) => {
        const buf = (which === 'out' ? stdout : stderr);
        if (buf.length + chunk.length > max_output_bytes) {
          if (!truncated) truncated = true;
          const room = Math.max(0, max_output_bytes - buf.length);
          const slice = chunk.slice(0, room);
          if (which === 'out') stdout = Buffer.concat([stdout, slice]);
          else stderr = Buffer.concat([stderr, slice]);
          return;
        }
        if (which === 'out') stdout = Buffer.concat([stdout, chunk]);
        else stderr = Buffer.concat([stderr, chunk]);
      };
      child.stdout.on('data', (c) => append('out', c));
      child.stderr.on('data', (c) => append('err', c));
      child.on('error', (e) => {
        clearTimeout(killTimer);
        const run = {
          ok: false, reason: 'SPAWN_FAILED', message: e.message,
          ms: Date.now() - t0,
        };
        job.runs.push({ ...run, command, args, ts: Date.now() });
        this.receipts?.append({
          kind: 'agent_failed', ref: `runspace:${job_id}`, agent: 'system',
          meta: { command, error: e.message },
        });
        resolveExec(run);
      });
      child.on('close', (code) => {
        clearTimeout(killTimer);
        const ms = Date.now() - t0;
        const result = {
          ok: !killed && code === 0,
          exit_code: code,
          timed_out: killed,
          truncated,
          stdout: stdout.toString('utf8'),
          stderr: stderr.toString('utf8'),
          ms,
          command, args,
        };
        job.runs.push({ ...result, ts: Date.now() });
        this.receipts?.append({
          kind: 'agent_completed', ref: `runspace:${job_id}`, agent: 'system',
          meta: { command, exit_code: code, ms, timed_out: killed, output_bytes: stdout.length + stderr.length },
        });
        resolveExec(result);
      });
    });
  }

  /** List files in the job folder + last run outputs. */
  async collect(job_id) {
    const job = this.jobs.get(job_id);
    if (!job) return { ok: false, reason: 'JOB_NOT_FOUND' };
    // Refresh file list from disk (the script may have created new files)
    const files = [];
    async function walk(dir, rel = '') {
      let items;
      try { items = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of items) {
        const next = rel ? join(rel, e.name) : e.name;
        if (e.isDirectory()) await walk(join(dir, e.name), next);
        else {
          try {
            const st = await fsp.stat(join(dir, e.name));
            files.push({ path: next, bytes: st.size });
          } catch {}
        }
      }
    }
    await walk(job.path);
    return {
      ok: true, id: job.id, path: job.path, label: job.label,
      files, runs: job.runs.slice(-10),
    };
  }

  /** Optionally persist a key result file into the ROOT vault under runspace/<job>/<path>. */
  async persistToRoot(job_id, file_path, { agent_id, operator } = {}) {
    const job = this.jobs.get(job_id);
    if (!job) return { ok: false, reason: 'JOB_NOT_FOUND' };
    if (!this.rootVault) return { ok: false, reason: 'NO_ROOT_VAULT' };
    const full = resolve(job.path, file_path);
    const inside = !relative(job.path, full).startsWith('..' + sep);
    if (!inside) return { ok: false, reason: 'PATH_ESCAPE_DENIED' };
    let text;
    try { text = await fsp.readFile(full, 'utf8'); }
    catch (e) { return { ok: false, reason: 'READ_FAILED', message: e.message }; }
    return this.rootVault.write({
      key: `runspace/${job_id}/${file_path}`,
      kind: 'note', value: text,
      agent_id: agent_id || 'system', operator,
    });
  }

  /** Delete the job folder. */
  async cleanup(job_id) {
    const job = this.jobs.get(job_id);
    if (!job) return { ok: false, reason: 'JOB_NOT_FOUND' };
    try { await fsp.rm(job.path, { recursive: true, force: true }); }
    catch (e) { return { ok: false, reason: 'CLEANUP_FAILED', message: e.message }; }
    this.jobs.delete(job_id);
    return { ok: true, id: job_id };
  }

  list() {
    return [...this.jobs.values()].map(j => ({
      id: j.id, label: j.label, path: j.path, created: j.created,
      file_count: j.files.length, run_count: j.runs.length,
    }));
  }

  stats() {
    return {
      total_jobs: this.jobs.size,
      runspace_root: RUNSPACE_ROOT,
      allowed_commands: [...ALLOWED_COMMANDS],
      limits: {
        default_timeout_ms: DEFAULT_TIMEOUT_MS,
        max_timeout_ms:     MAX_TIMEOUT_MS,
        default_max_output: DEFAULT_MAX_OUTPUT,
        max_file_bytes:     MAX_FILE_BYTES,
      },
    };
  }

  static get path() { return RUNSPACE_ROOT; }
}
