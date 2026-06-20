// templates.mjs — Cloneable templates ("the plus button").
//
// 20 first-class templates in families. Hit `templates_clone(id, name)` and you
// get a fresh, pre-filled vault entry under your namespace. Hit `templates_pull(id)`
// and you get the template body itself for editing.
//
// FAMILIES
//   notebook   — computational notebooks (jupyter-style, python, js, sql, scratchpad)
//   document   — research brief, meeting notes, status report, contract, project plan
//   code       — cli skeleton, api server, test harness, build script, deploy script
//   data       — csv pipeline, json transformer, sql migration, etl, dataset card

import { multiHash, randomToken } from './crypto_ext.mjs';

const T = (id, family, name, description, body, schema = {}) => ({
  id, family, name, description, body,
  input_schema: { type: 'object', properties: schema },
});

export const TEMPLATES = [
  // ── NOTEBOOK family ─────────────────────────────────────────────────
  T('notebook.jupyter_python', 'notebook', 'Jupyter Python Notebook',
    'Python notebook scaffold with markdown header + setup cell + analysis cell + plot cell.',
    {
      cells: [
        { type: 'markdown', source: '# ${title}\n\n_${author} · ${date}_\n\n${intent}' },
        { type: 'code',     source: 'import pandas as pd\nimport numpy as np\nimport matplotlib.pyplot as plt\n%matplotlib inline\n\nprint("setup ok")' },
        { type: 'code',     source: '# load data\ndf = pd.read_csv("${data_path}")\ndf.head()' },
        { type: 'code',     source: '# analyze\ndf.describe()' },
        { type: 'code',     source: '# plot\nfig, ax = plt.subplots()\ndf.plot(ax=ax)\nplt.show()' },
      ],
    },
    { title:{type:'string'}, author:{type:'string'}, intent:{type:'string'}, data_path:{type:'string'} }),

  T('notebook.python_scratch', 'notebook', 'Python Scratchpad',
    'Minimal Python notebook for quick experiments.',
    { cells: [{ type: 'code', source: '# scratch · ${title}\nx = 1\nprint(x)' }] },
    { title: { type: 'string' } }),

  T('notebook.node_scratch', 'notebook', 'Node.js Scratchpad',
    'Minimal Node.js scratch for quick JS experiments.',
    {
      cells: [{ type: 'code', source:
'// ${title}\nconst x = 1 + 1;\nconsole.log({ x });' }],
    },
    { title: { type: 'string' } }),

  T('notebook.sql_workbook', 'notebook', 'SQL Workbook',
    'SQL exploration notebook with connection + sample queries.',
    {
      cells: [
        { type: 'markdown', source: '# ${title}\nDatabase: `${db}`' },
        { type: 'sql',      source: 'SELECT COUNT(*) FROM ${table};' },
        { type: 'sql',      source: 'SELECT * FROM ${table} LIMIT 10;' },
        { type: 'sql',      source: 'SELECT col, COUNT(*) FROM ${table} GROUP BY col ORDER BY 2 DESC LIMIT 20;' },
      ],
    },
    { title:{type:'string'}, db:{type:'string'}, table:{type:'string'} }),

  T('notebook.ml_experiment', 'notebook', 'ML Experiment Log',
    'ML experiment notebook with hyperparams + training loop + metrics + conclusion.',
    {
      cells: [
        { type: 'markdown', source: '# ${experiment_name}\n\nHypothesis: ${hypothesis}' },
        { type: 'code',     source: '# hyperparameters\nLR=${lr}\nBATCH=${batch}\nEPOCHS=${epochs}' },
        { type: 'code',     source: '# train\n# ... your training loop' },
        { type: 'code',     source: '# eval\n# accuracy, loss, confusion' },
        { type: 'markdown', source: '## Conclusion\n${conclusion}' },
      ],
    },
    { experiment_name:{type:'string'}, hypothesis:{type:'string'}, lr:{type:'number'}, batch:{type:'number'}, epochs:{type:'number'}, conclusion:{type:'string'} }),

  // ── DOCUMENT family ─────────────────────────────────────────────────
  T('document.research_brief', 'document', 'Research Brief',
    'One-page research brief: question, finding, evidence, confidence, recommendation.',
    '# Research Brief\n\n**Question:** ${question}\n\n**Finding:** ${finding}\n\n**Confidence:** ${confidence}\n\n## Evidence\n${evidence}\n\n## Recommendation\n${recommendation}\n',
    { question:{type:'string'}, finding:{type:'string'}, evidence:{type:'string'}, confidence:{type:'string'}, recommendation:{type:'string'} }),

  T('document.meeting_notes', 'document', 'Meeting Notes',
    'Structured notes: attendees, decisions, action items, next steps.',
    '# ${title}\n_${date}_\n\n## Attendees\n${attendees}\n\n## Decisions\n${decisions}\n\n## Action Items\n${actions}\n\n## Next Meeting\n${next}\n',
    { title:{type:'string'}, date:{type:'string'}, attendees:{type:'string'}, decisions:{type:'string'}, actions:{type:'string'}, next:{type:'string'} }),

  T('document.status_report', 'document', 'Status Report',
    'Weekly status: did / doing / blocked.',
    '# Status · ${author} · ${week}\n\n**Did**\n${did}\n\n**Doing**\n${doing}\n\n**Blocked**\n${blocked}\n',
    { author:{type:'string'}, week:{type:'string'}, did:{type:'string'}, doing:{type:'string'}, blocked:{type:'string'} }),

  T('document.project_plan', 'document', 'Project Plan',
    'Plan with goals, milestones, risks, success criteria.',
    '# ${name}\n\n## Goal\n${goal}\n\n## Milestones\n${milestones}\n\n## Risks\n${risks}\n\n## Success Criteria\n${success}\n',
    { name:{type:'string'}, goal:{type:'string'}, milestones:{type:'string'}, risks:{type:'string'}, success:{type:'string'} }),

  T('document.incident_postmortem', 'document', 'Incident Postmortem',
    'Blameless postmortem: summary, timeline, root cause, action items.',
    '# Incident ${id} — ${title}\n\n**Severity:** ${severity}\n**Duration:** ${duration}\n\n## Summary\n${summary}\n\n## Timeline\n${timeline}\n\n## Root Cause\n${root_cause}\n\n## Action Items\n${actions}\n',
    { id:{type:'string'}, title:{type:'string'}, severity:{type:'string'}, duration:{type:'string'}, summary:{type:'string'}, timeline:{type:'string'}, root_cause:{type:'string'}, actions:{type:'string'} }),

  // ── CODE family ─────────────────────────────────────────────────────
  T('code.cli_skeleton', 'code', 'CLI Tool Skeleton',
    'Node.js CLI with arg parsing + commands + help text.',
    '#!/usr/bin/env node\n// ${name} — ${description}\nconst args = process.argv.slice(2);\nconst cmd = args[0];\nconst commands = {\n  help: () => console.log("usage: ${name} <command>"),\n  hello: () => console.log("hi from ${name}"),\n};\n(commands[cmd] || commands.help)();\n',
    { name:{type:'string'}, description:{type:'string'} }),

  T('code.api_server', 'code', 'HTTP API Server Skeleton',
    'Node.js http server with routes + json + error handling.',
    'import { createServer } from "node:http";\nconst PORT = ${port};\nconst routes = {\n  "/health": () => ({ ok: true }),\n  "/echo":   (body) => ({ echo: body }),\n};\ncreateServer(async (req, res) => {\n  const h = routes[req.url];\n  if (!h) { res.writeHead(404); return res.end(); }\n  const chunks = []; for await (const c of req) chunks.push(c);\n  const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};\n  res.writeHead(200, { "content-type": "application/json" });\n  res.end(JSON.stringify(await h(body)));\n}).listen(${port});\n',
    { port:{type:'number'} }),

  T('code.test_harness', 'code', 'Test Harness',
    'Tiny assert-based smoke test runner.',
    '// ${name} smoke\nlet pass = 0, fail = 0;\nfunction t(name, fn) { try { fn(); pass++; console.log("PASS " + name); } catch(e) { fail++; console.log("FAIL " + name + ": " + e.message); } }\n\nt("1+1=2", () => { if (1+1 !== 2) throw new Error("math broken"); });\n\nconsole.log(pass + " pass / " + fail + " fail");\nprocess.exit(fail ? 1 : 0);\n',
    { name:{type:'string'} }),

  T('code.build_script', 'code', 'Build Script',
    'Posix shell build pipeline: install + lint + test + bundle.',
    '#!/bin/sh\nset -e\necho "[build] ${name}"\nnpm ci\nnpm run lint || true\nnpm test\nnpm run build\necho "[build] done"\n',
    { name:{type:'string'} }),

  T('code.deploy_script', 'code', 'Deploy Script',
    'Stub deploy script with dry-run + rollback.',
    '#!/bin/sh\nset -e\nENV=${env}\nVERSION=${version}\necho "[deploy] $ENV @ $VERSION"\nif [ "$1" = "--dry-run" ]; then echo "[dry-run] would push"; exit 0; fi\n# real push goes here\necho "[deploy] done"\n',
    { env:{type:'string'}, version:{type:'string'} }),

  // ── DATA family ─────────────────────────────────────────────────────
  T('data.csv_pipeline', 'data', 'CSV Pipeline',
    'Python: read CSV → clean → transform → write.',
    'import pandas as pd\n\ndf = pd.read_csv("${input}")\n# clean\ndf = df.dropna()\n# transform\ndf["${col}_log"] = df["${col}"].apply(lambda x: __import__("math").log(x + 1))\n# write\ndf.to_csv("${output}", index=False)\nprint(f"wrote {len(df)} rows to ${output}")\n',
    { input:{type:'string'}, output:{type:'string'}, col:{type:'string'} }),

  T('data.json_transformer', 'data', 'JSON Transformer',
    'Node.js transform pipeline for JSONL streams.',
    'import { createReadStream, createWriteStream } from "node:fs";\nimport { createInterface } from "node:readline";\nconst rl = createInterface({ input: createReadStream("${input}") });\nconst out = createWriteStream("${output}");\nfor await (const line of rl) {\n  if (!line.trim()) continue;\n  const obj = JSON.parse(line);\n  out.write(JSON.stringify({ ...obj, _ts: Date.now() }) + "\\n");\n}\n',
    { input:{type:'string'}, output:{type:'string'} }),

  T('data.sql_migration', 'data', 'SQL Migration',
    'Up + Down SQL migration scaffold.',
    '-- migration ${name}\n-- up\nCREATE TABLE ${table} (\n  id SERIAL PRIMARY KEY,\n  name TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\n-- down\nDROP TABLE IF EXISTS ${table};\n',
    { name:{type:'string'}, table:{type:'string'} }),

  T('data.etl_template', 'data', 'ETL Template',
    'Extract / transform / load skeleton.',
    'def extract():\n    return read_from("${source}")\n\ndef transform(rows):\n    return [{ **r, "normalized": r["${field}"].lower() } for r in rows]\n\ndef load(rows):\n    write_to("${dest}", rows)\n\nload(transform(extract()))\n',
    { source:{type:'string'}, field:{type:'string'}, dest:{type:'string'} }),

  T('data.dataset_card', 'data', 'Dataset Card',
    'Dataset README with provenance, schema, sample, license.',
    '# Dataset · ${name}\n\n**Source:** ${source}\n**Rows:** ${rows}\n**License:** ${license}\n\n## Schema\n${schema}\n\n## Sample\n${sample}\n\n## Provenance\n${provenance}\n',
    { name:{type:'string'}, source:{type:'string'}, rows:{type:'number'}, license:{type:'string'}, schema:{type:'string'}, sample:{type:'string'}, provenance:{type:'string'} }),
];

function fill(body, input) {
  if (typeof body === 'string') {
    return body.replace(/\$\{(\w+)\}/g, (_, k) => input[k] ?? `\${${k}}`);
  }
  if (Array.isArray(body)) return body.map(b => fill(b, input));
  if (body && typeof body === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(body)) out[k] = fill(v, input);
    return out;
  }
  return body;
}

export class TemplateRegistry {
  constructor() { this.byId = new Map(TEMPLATES.map(t => [t.id, t])); }

  list({ family } = {}) {
    const arr = family ? [...this.byId.values()].filter(t => t.family === family) : [...this.byId.values()];
    return arr.map(t => ({
      id: t.id, family: t.family, name: t.name, description: t.description,
      input_schema: t.input_schema,
    }));
  }

  families() {
    const out = {};
    for (const t of this.byId.values()) (out[t.family] ||= []).push(t.id);
    return out;
  }

  /** Pull the raw template body for editing or external use. */
  pull(id) {
    const t = this.byId.get(id);
    if (!t) return { ok: false, reason: 'TEMPLATE_NOT_FOUND' };
    return { ok: true, ...t };
  }

  /** Clone fills the template with input and returns a vault-ready value. */
  clone(id, { input = {}, agent_id = 'operator', name } = {}) {
    const t = this.byId.get(id);
    if (!t) return { ok: false, reason: 'TEMPLATE_NOT_FOUND' };
    const filled = fill(t.body, input);
    const clone_id = 'clone_' + randomToken(8);
    return {
      ok: true,
      template_id: id, template_family: t.family,
      clone_id, agent_id,
      name: name || `${t.name} — ${new Date().toISOString().slice(0, 10)}`,
      value: filled,
      fingerprint: multiHash(JSON.stringify(filled)).combined,
      created_at: Date.now(),
    };
  }

  stats() {
    const byFamily = {};
    for (const t of this.byId.values()) byFamily[t.family] = (byFamily[t.family] || 0) + 1;
    return { total: this.byId.size, by_family: byFamily, families: Object.keys(byFamily) };
  }
}
