"use strict";
/**
 * Real outcome signals, fetched from the GitHub API. Every value returned
 * here is a genuine measurement — no synthetic or placeholder data — so the
 * learning core in lib/learn.js is always folding in something real. Any
 * signal that can't be measured (e.g. code scanning not enabled) is simply
 * omitted rather than faked.
 */

const API_ROOT = "https://api.github.com";

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function getJson(url, token) {
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok) {
    throw new Error(`${url} -> HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Outcome (0..1) per job in the most recent completed run of a workflow —
 * 1 for a successful job, 0 for anything else (failure, cancelled, timed out).
 * Returns {} if the workflow has no completed runs yet.
 */
async function fetchLatestWorkflowJobOutcomes(owner, repo, workflowFile, token) {
  const runsUrl = `${API_ROOT}/repos/${owner}/${repo}/actions/workflows/${workflowFile}/runs?status=completed&per_page=1`;
  const runs = await getJson(runsUrl, token);
  const latestRun = runs.workflow_runs?.[0];
  if (!latestRun) return {};

  const jobsUrl = `${API_ROOT}/repos/${owner}/${repo}/actions/runs/${latestRun.id}/jobs`;
  const jobs = await getJson(jobsUrl, token);

  const outcomes = {};
  for (const job of jobs.jobs ?? []) {
    outcomes[job.name] = job.conclusion === "success" ? 1 : 0;
  }
  return outcomes;
}

/**
 * Outcome (0..1) from open CodeQL alert count: 1.0 with zero open alerts,
 * decaying toward 0 as the count grows, floored at 0.05 so a very noisy
 * repo doesn't erase this signal's weight entirely. Returns null if code
 * scanning isn't enabled/accessible (404) rather than a fabricated value.
 */
async function fetchCodeQLOutcome(owner, repo, token) {
  try {
    const url = `${API_ROOT}/repos/${owner}/${repo}/code-scanning/alerts?state=open&per_page=100`;
    const alerts = await getJson(url, token);
    const count = Array.isArray(alerts) ? alerts.length : 0;
    return Math.max(0.05, 1 / (1 + count));
  } catch {
    return null;
  }
}

/**
 * Outcome (0..1) from open Dependabot PR count against
 * apps/weekly-command-center/ — 1.0 with none open (fully current), decaying
 * as more stack up unmerged.
 */
async function fetchDependencyFreshnessOutcome(owner, repo, token) {
  try {
    const url = `${API_ROOT}/search/issues?q=repo:${owner}/${repo}+is:pr+is:open+author:app/dependabot`;
    const result = await getJson(url, token);
    const count = result.total_count ?? 0;
    return Math.max(0.05, 1 / (1 + count));
  } catch {
    return null;
  }
}

/**
 * Gathers every real signal into a flat {signalKey: outcome} map, dropping
 * any signal that couldn't be measured this cycle.
 */
async function collectOutcomes({ owner, repo, token }) {
  const outcomes = {};

  try {
    const ciJobs = await fetchLatestWorkflowJobOutcomes(owner, repo, "weekly-command-center-ci.yml", token);
    for (const [jobName, outcome] of Object.entries(ciJobs)) {
      outcomes[`ci:${jobName}`] = outcome;
    }
  } catch (err) {
    console.error(`Skipping CI signals: ${err.message}`);
  }

  const codeql = await fetchCodeQLOutcome(owner, repo, token);
  if (codeql !== null) outcomes["codeql_findings"] = codeql;

  const freshness = await fetchDependencyFreshnessOutcome(owner, repo, token);
  if (freshness !== null) outcomes["dependency_freshness"] = freshness;

  return outcomes;
}

module.exports = {
  fetchLatestWorkflowJobOutcomes,
  fetchCodeQLOutcome,
  fetchDependencyFreshnessOutcome,
  collectOutcomes,
};
