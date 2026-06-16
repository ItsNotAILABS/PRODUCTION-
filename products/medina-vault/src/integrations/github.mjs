// integrations/github.mjs — real GitHub connector. Uses stored API key.
// node:https only, zero deps. Framework for sibling connectors (Stripe, Notion, SMTP).
//
// Each integration takes { keys } at construction so plaintext is fetched JIT.
// All calls observe the receipt ledger.

import { request } from 'node:https';

function ghFetch(token, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = request({
      hostname: 'api.github.com',
      method, path,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'medina-vault',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = JSON.parse(text); } catch { json = text; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

export function buildGitHubSkills({ keys, receipts }) {
  const token = () => {
    const t = keys?.unwrap('github');
    if (!t) throw new Error('github API key not configured (call keys_set name=github)');
    return t;
  };

  const observe = (ref, meta) => receipts?.append({ kind: 'key_use', ref: 'github', agent: 'github-integration', meta: { op: ref, ...meta } });

  return [
    {
      name: 'integrations.github.user',
      description: 'Get authenticated user (verifies key + scopes).',
      inputSchema: { type: 'object', properties: {} },
      async run() {
        try {
          const r = await ghFetch(token(), 'GET', '/user', null);
          observe('user', { status: r.status });
          return r.status === 200
            ? { ok: true, user: { login: r.body.login, name: r.body.name, id: r.body.id, public_repos: r.body.public_repos } }
            : { ok: false, reason: 'GH_ERROR', status: r.status, message: r.body?.message };
        } catch (e) { return { ok: false, reason: 'KEY_OR_NETWORK', message: e.message }; }
      },
    },
    {
      name: 'integrations.github.create_issue',
      description: 'Create an issue in a repo.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' }, repo: { type: 'string' },
          title: { type: 'string' }, body: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
        },
        required: ['owner', 'repo', 'title'],
      },
      async run({ owner, repo, title, body = '', labels = [] }) {
        try {
          const r = await ghFetch(token(), 'POST', `/repos/${owner}/${repo}/issues`, { title, body, labels });
          observe('create_issue', { owner, repo, status: r.status });
          return r.status === 201
            ? { ok: true, issue: { number: r.body.number, url: r.body.html_url, state: r.body.state } }
            : { ok: false, reason: 'GH_ERROR', status: r.status, message: r.body?.message };
        } catch (e) { return { ok: false, reason: 'KEY_OR_NETWORK', message: e.message }; }
      },
    },
    {
      name: 'integrations.github.list_issues',
      description: 'List open issues on a repo.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' }, repo: { type: 'string' },
          state: { type: 'string', enum: ['open','closed','all'], default: 'open' },
          per_page: { type: 'number', default: 20 },
        },
        required: ['owner', 'repo'],
      },
      async run({ owner, repo, state = 'open', per_page = 20 }) {
        try {
          const r = await ghFetch(token(), 'GET', `/repos/${owner}/${repo}/issues?state=${state}&per_page=${per_page}`);
          observe('list_issues', { owner, repo, status: r.status });
          return r.status === 200
            ? { ok: true, count: r.body.length,
                issues: r.body.map(i => ({ number: i.number, title: i.title, state: i.state, url: i.html_url, labels: i.labels?.map(l=>l.name) })) }
            : { ok: false, reason: 'GH_ERROR', status: r.status, message: r.body?.message };
        } catch (e) { return { ok: false, reason: 'KEY_OR_NETWORK', message: e.message }; }
      },
    },
    {
      name: 'integrations.github.comment',
      description: 'Add a comment to an existing issue or PR.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' }, repo: { type: 'string' },
          number: { type: 'number' }, body: { type: 'string' },
        },
        required: ['owner', 'repo', 'number', 'body'],
      },
      async run({ owner, repo, number, body }) {
        try {
          const r = await ghFetch(token(), 'POST', `/repos/${owner}/${repo}/issues/${number}/comments`, { body });
          observe('comment', { owner, repo, number, status: r.status });
          return r.status === 201
            ? { ok: true, comment: { id: r.body.id, url: r.body.html_url } }
            : { ok: false, reason: 'GH_ERROR', status: r.status, message: r.body?.message };
        } catch (e) { return { ok: false, reason: 'KEY_OR_NETWORK', message: e.message }; }
      },
    },
  ];
}
