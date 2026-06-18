// runspace_governance.mjs — code review BEFORE execution. Two-reviewer model.
//
// The runspace doesn't blindly run anything Loom hands it. Every code file gets
// scored by two reviewers with opposing biases:
//
//   STRICT  — looks for dangerous patterns; subtracts heavily.
//   PERMISSIVE — gives benefit of the doubt; adds back for low-risk indicators.
//
// Final score in [-100, +100]. Decision:
//   ≥ +20 : ALLOW
//   -19 to +19 : REVIEW_REQUIRED (block until operator/AI overrides)
//   ≤ -20 : DENY
//
// Reviewers cite specific findings (line numbers when possible) so the AI
// knows exactly why something was blocked and can rewrite.

// Patterns the strict reviewer hates (severity in points subtracted).
const DANGEROUS = [
  { id: 'rm_rf_root',          re: /\brm\s+-rf?\s+(\/|\$HOME|~)/m,                weight: 80, why: 'rm -rf on root/home/tilde' },
  { id: 'shell_pipe_curl',     re: /\bcurl\s+[^\n|]+\|\s*(sh|bash|zsh|pwsh)/m,    weight: 70, why: 'curl piped to shell — remote code execution' },
  { id: 'wget_pipe_sh',        re: /\bwget\s+[^\n|]+\|\s*(sh|bash)/m,             weight: 70, why: 'wget piped to shell' },
  { id: 'eval_user_input',     re: /\beval\s*\(/m,                                 weight: 30, why: 'eval()' },
  { id: 'exec_user_input',     re: /\bnew\s+Function\s*\(/m,                       weight: 30, why: 'new Function() — runtime code gen' },
  { id: 'process_kill',        re: /\bprocess\.kill\(/m,                           weight: 20, why: 'process.kill()' },
  { id: 'recursive_delete',    re: /\bfs\.rm[a-zA-Z]*\([^)]*recursive\s*:\s*true/m, weight: 30, why: 'fs.rm({recursive:true}) — wide delete' },
  { id: 'child_spawn_shell',   re: /\bspawn\s*\([^)]*shell\s*:\s*true/m,           weight: 25, why: 'spawn with shell:true' },
  { id: 'http_listen_global',  re: /\.listen\s*\(\s*\d+\s*,\s*['"]0\.0\.0\.0['"]/m, weight: 35, why: 'binds to 0.0.0.0 — internet-exposed' },
  { id: 'env_dump',            re: /\bprocess\.env\b[^=]*(?:console|log|stdout|write)/m, weight: 15, why: 'logs process.env — leak risk' },
  { id: 'crypto_secret_in_src',re: /\b(sk-[A-Za-z0-9-_]{20,}|lk_[A-Za-z0-9-_]{20,}|AKIA[0-9A-Z]{16})\b/m, weight: 50, why: 'hard-coded API key' },
  { id: 'sudo',                re: /\bsudo\s+/m,                                    weight: 50, why: 'sudo invocation' },
  { id: 'subprocess_no_args',  re: /\bsubprocess\.(call|run|Popen)\s*\(\s*['"][^'"]+\s+/m, weight: 10, why: 'subprocess with string command (injection risk)' },
];

// Patterns the permissive reviewer trusts (severity added).
const TRUSTED = [
  { id: 'pure_compute',        re: /^[\s\S]*$/m,                                   weight: 0,  why: 'baseline' },
  { id: 'has_assertions',      re: /\bassert\b|\bconsole\.assert\b/m,              weight: 10, why: 'contains assertions' },
  { id: 'has_try_catch',       re: /\btry\s*\{[\s\S]*?\}\s*catch/m,                weight: 8,  why: 'has try/catch error handling' },
  { id: 'uses_strict_mode',    re: /^\s*['"]use strict['"]/m,                      weight: 5,  why: 'uses strict mode' },
  { id: 'only_node_builtins',  re: /^(?!.*from\s+['"][^@\s]+['"])/m,                weight: 5,  why: 'only Node built-in imports' },
  { id: 'has_tests',           re: /\bdescribe\s*\(|\bit\s*\(|\btest\s*\(|smoke|assert\(/m, weight: 8, why: 'contains test scaffolding' },
];

// Severity → label mapping
function severityLabel(score) {
  if (score >= 60)  return 'TRUSTED';
  if (score >= 20)  return 'ALLOW';
  if (score >= -19) return 'REVIEW_REQUIRED';
  return 'DENY';
}

function findLine(text, regex) {
  const m = text.match(regex);
  if (!m) return null;
  const idx = text.indexOf(m[0]);
  const before = text.slice(0, idx);
  return before.split('\n').length;
}

export class RunspaceGovernance {
  constructor({ receipts } = {}) {
    this.receipts = receipts;
    this.reviews  = []; // history of recent reviews
  }

  /**
   * Two-reviewer score on a code blob. Returns:
   *   { ok, decision, score, strict_findings, permissive_findings, advice }
   */
  review({ code, language = 'unknown', filename = 'unknown' }) {
    if (typeof code !== 'string') return { ok: false, reason: 'CODE_MUST_BE_STRING' };

    const strict_findings = [];
    const permissive_findings = [];
    let score = 0;

    // Strict pass
    for (const p of DANGEROUS) {
      if (p.re.test(code)) {
        const line = findLine(code, p.re);
        strict_findings.push({ id: p.id, line, why: p.why, weight: p.weight });
        score -= p.weight;
      }
    }
    // Permissive pass
    for (const p of TRUSTED) {
      if (p.re.test(code)) {
        permissive_findings.push({ id: p.id, why: p.why, weight: p.weight });
        score += p.weight;
      }
    }

    // Length-based small adjustment (very short scripts are safer baseline)
    if (code.length < 200) score += 5;
    if (code.length > 5000) score -= 5;

    score = Math.max(-100, Math.min(100, score));
    const decision = severityLabel(score);

    const advice = [];
    for (const f of strict_findings) {
      advice.push(`Remove or replace: ${f.why} (line ${f.line ?? '?'}). Each occurrence costs ${f.weight} points.`);
    }
    if (decision === 'DENY') advice.push('At least one dangerous pattern crossed a hard threshold; rewrite without it.');
    if (decision === 'REVIEW_REQUIRED' && strict_findings.length === 0) {
      advice.push('No dangerous patterns but no trust signals either. Add assertions / try-catch / strict mode.');
    }

    const record = {
      ts: Date.now(), filename, language, score, decision,
      strict_count: strict_findings.length,
      permissive_count: permissive_findings.length,
      bytes: code.length,
    };
    this.reviews.push(record);
    if (this.reviews.length > 100) this.reviews.shift();

    this.receipts?.append({
      kind: 'sandbox_test', ref: `governance:${filename}`, agent: 'system',
      meta: { decision, score, strict_count: strict_findings.length, language },
    });

    return {
      ok: true, decision, score, language, filename,
      strict_findings, permissive_findings, advice,
    };
  }

  stats() {
    const byDecision = {};
    for (const r of this.reviews) byDecision[r.decision] = (byDecision[r.decision] || 0) + 1;
    return {
      total_reviews: this.reviews.length,
      by_decision: byDecision,
      recent: this.reviews.slice(-10).reverse(),
    };
  }
}

/**
 * Convenience: run review, and execute only if decision is ALLOW or TRUSTED.
 * Returns the review + the run (if executed).
 */
export async function governedExec({ runspace, governance, job_id, file_content, file_path,
                                      command, args, language, override = false }) {
  const review = governance.review({ code: file_content, language, filename: file_path });
  if (!review.ok) return { ok: false, reason: 'REVIEW_FAILED', detail: review };
  if (!override && (review.decision === 'DENY' || review.decision === 'REVIEW_REQUIRED')) {
    return { ok: false, reason: 'BLOCKED_BY_GOVERNANCE', review };
  }
  const write = await runspace.writeFile(job_id, { path: file_path, content: file_content });
  if (!write.ok) return { ok: false, reason: 'WRITE_FAILED', detail: write };
  const exec = await runspace.exec(job_id, { command, args });
  return { ok: true, review, write, exec };
}
