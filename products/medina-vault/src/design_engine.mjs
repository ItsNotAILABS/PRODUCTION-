// design_engine.mjs — Python Design Intelligence.
//
// Takes a natural-language description of what you want to build and compiles
// a complete, ready-to-run build foundation: file structure, starter code for
// every file, dependency manifest, runspace execution plan, and a human brief.
//
// "A Python design engine that compiles full buildouts for you so you can
//  then work from there. You can have a solid foundation and walls that it
//  builds for you." — Operator, 2026-06-25
//
// Output is a structured BuildPlan that can be:
//   1. Written directly to a runspace job (runspace.writeFile for each file)
//   2. Exported to a local folder (write to disk via fs)
//   3. Deposited as a zip (zip all files → deposit_create)
//   4. Stored in vault (for future AI sessions to pick up)

import { multiHash, randomToken } from './crypto_ext.mjs';

// ── Build plan templates ──────────────────────────────────────────────

const ARCHETYPES = {

  'fastapi-service': {
    name: 'FastAPI Microservice',
    description: 'Production FastAPI service: router, models, health endpoint, Dockerfile, tests.',
    tags: ['python', 'fastapi', 'api', 'microservice'],
    files: [
      { path: 'main.py', content:
`from fastapi import FastAPI
from routers import items
from models import HealthResponse

app = FastAPI(title="{name}", version="0.1.0")
app.include_router(items.router, prefix="/items")

@app.get("/health", response_model=HealthResponse)
async def health():
    return {"ok": True, "service": "{name}", "version": "0.1.0"}
` },
      { path: 'routers/__init__.py', content: '' },
      { path: 'routers/items.py', content:
`from fastapi import APIRouter, HTTPException
from typing import List
from models import Item

router = APIRouter()
_store: dict[str, Item] = {}

@router.get("/", response_model=List[Item])
async def list_items():
    return list(_store.values())

@router.post("/", response_model=Item)
async def create_item(item: Item):
    _store[item.id] = item
    return item

@router.get("/{item_id}", response_model=Item)
async def get_item(item_id: str):
    if item_id not in _store:
        raise HTTPException(status_code=404, detail="Not found")
    return _store[item_id]
` },
      { path: 'models.py', content:
`from pydantic import BaseModel
from typing import Optional

class Item(BaseModel):
    id: str
    name: str
    value: Optional[float] = None

class HealthResponse(BaseModel):
    ok: bool
    service: str
    version: str
` },
      { path: 'requirements.txt', content: 'fastapi>=0.110.0\nuvicorn[standard]>=0.29.0\npydantic>=2.0.0\npytest>=8.0.0\nhttpx>=0.27.0\n' },
      { path: 'Dockerfile', content:
`FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
` },
      { path: 'tests/test_api.py', content:
`import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True

def test_create_and_get_item():
    r = client.post("/items/", json={"id": "1", "name": "test", "value": 9.9})
    assert r.status_code == 200
    r2 = client.get("/items/1")
    assert r2.json()["name"] == "test"

def test_list_items():
    r = client.get("/items/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
` },
      { path: 'README.md', content:
`# {name}

FastAPI microservice built by Loom Design Engine.

## Run

\`\`\`bash
pip install -r requirements.txt
uvicorn main:app --reload
\`\`\`

## Test

\`\`\`bash
pytest tests/
\`\`\`

## Docker

\`\`\`bash
docker build -t {name_slug} .
docker run -p 8000:8000 {name_slug}
\`\`\`
` },
    ],
    exec_plan: [
      { step: 'install', command: 'pip', args: ['install', '-r', 'requirements.txt'], description: 'Install dependencies' },
      { step: 'test',    command: 'python3', args: ['-m', 'pytest', 'tests/', '-v'], description: 'Run test suite' },
    ],
  },

  'data-pipeline': {
    name: 'Python Data Pipeline',
    description: 'ETL pipeline: extract → validate → transform → load. Pandas + logging + CLI.',
    tags: ['python', 'data', 'etl', 'pandas'],
    files: [
      { path: 'pipeline.py', content:
`#!/usr/bin/env python3
"""
{name} — Data Pipeline
Built by Loom Design Engine v0.4
"""
import json, logging, sys, argparse
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("{name_slug}")

def extract(source: str) -> list[dict]:
    """Read data from source (json file path or '-' for stdin)."""
    if source == "-":
        return json.load(sys.stdin)
    return json.loads(Path(source).read_text())

def validate(rows: list[dict]) -> list[dict]:
    """Drop rows missing required fields."""
    required = {field for field in rows[0].keys() if rows[0][field] is not None} if rows else set()
    before = len(rows)
    clean = [r for r in rows if all(r.get(f) is not None for f in required)]
    log.info(f"validate: {before} → {len(clean)} rows ({before-len(clean)} dropped)")
    return clean

def transform(rows: list[dict]) -> list[dict]:
    """Apply transforms: lowercase strings, round floats to 4dp."""
    out = []
    for r in rows:
        out.append({
            k: v.lower() if isinstance(v, str) else
               round(v, 4) if isinstance(v, float) else v
            for k, v in r.items()
        })
    return out

def load(rows: list[dict], dest: str) -> None:
    """Write transformed rows to dest (json file path or '-' for stdout)."""
    data = json.dumps(rows, indent=2)
    if dest == "-":
        print(data)
    else:
        Path(dest).write_text(data)
        log.info(f"load: wrote {len(rows)} rows to {dest}")

def run(source: str, dest: str) -> dict:
    rows = extract(source)
    rows = validate(rows)
    rows = transform(rows)
    load(rows, dest)
    return {"ok": True, "rows": len(rows)}

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="{name} pipeline")
    p.add_argument("--source", default="-", help="Input path or - for stdin")
    p.add_argument("--dest",   default="-", help="Output path or - for stdout")
    args = p.parse_args()
    result = run(args.source, args.dest)
    log.info(json.dumps(result))
` },
      { path: 'requirements.txt', content: 'pandas>=2.1.0\n' },
      { path: 'tests/test_pipeline.py', content:
`import json, pytest
from pipeline import extract, validate, transform, load, run

SAMPLE = [{"id": "1", "name": "Alice", "score": 9.99999}, {"id": "2", "name": None, "score": 8.0}]

def test_validate_drops_nulls():
    clean = validate(SAMPLE)
    assert len(clean) == 1
    assert clean[0]["id"] == "1"

def test_transform_lowercase():
    rows = [{"id":"1","name":"ALICE","score":9.99999}]
    out = transform(rows)
    assert out[0]["name"] == "alice"
    assert out[0]["score"] == 10.0  # rounded to 4dp

def test_full_run(tmp_path):
    src = tmp_path / "in.json"
    dst = tmp_path / "out.json"
    src.write_text(json.dumps([{"id":"1","name":"Test","score":3.14159}]))
    result = run(str(src), str(dst))
    assert result["ok"]
    out = json.loads(dst.read_text())
    assert out[0]["name"] == "test"
` },
      { path: 'README.md', content:
`# {name}

Data pipeline built by Loom Design Engine.

## Run

\`\`\`bash
echo '[{"id":"1","name":"TEST","score":3.14}]' | python3 pipeline.py
\`\`\`

## Test

\`\`\`bash
pytest tests/ -v
\`\`\`
` },
    ],
    exec_plan: [
      { step: 'smoke', command: 'python3', args: ['pipeline.py', '--help'], description: 'Verify CLI' },
      { step: 'test',  command: 'python3', args: ['-m', 'pytest', 'tests/', '-v'], description: 'Run test suite' },
    ],
  },

  'cli-tool': {
    name: 'Python CLI Tool',
    description: 'Click-based CLI with subcommands, config, and rich output.',
    tags: ['python', 'cli', 'click'],
    files: [
      { path: 'cli.py', content:
`#!/usr/bin/env python3
"""
{name} — CLI Tool
Built by Loom Design Engine v0.4
"""
import click, json, sys
from pathlib import Path

CONFIG_PATH = Path.home() / ".{name_slug}" / "config.json"

def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {}

def save_config(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))

@click.group()
@click.version_option("0.1.0")
def cli():
    """{name} — {description}"""

@cli.command()
@click.argument("key")
@click.argument("value")
def config(key, value):
    """Set a config value."""
    cfg = load_config()
    cfg[key] = value
    save_config(cfg)
    click.echo(f"set {key}={value}")

@cli.command()
def status():
    """Show current config."""
    cfg = load_config()
    click.echo(json.dumps(cfg, indent=2))

@cli.command()
@click.argument("input", type=click.File("r"), default="-")
@click.option("--format", default="json", type=click.Choice(["json", "line"]))
def process(input, format):
    """Process input data."""
    data = json.load(input)
    if format == "json":
        click.echo(json.dumps(data, indent=2))
    else:
        for item in (data if isinstance(data, list) else [data]):
            click.echo(str(item))

if __name__ == "__main__":
    cli()
` },
      { path: 'requirements.txt', content: 'click>=8.1.0\n' },
      { path: 'tests/test_cli.py', content:
`from click.testing import CliRunner
from cli import cli

runner = CliRunner()

def test_status():
    r = runner.invoke(cli, ["status"])
    assert r.exit_code == 0

def test_config_set():
    with runner.isolated_filesystem():
        r = runner.invoke(cli, ["config", "key1", "val1"])
        assert r.exit_code == 0
        assert "key1" in r.output

def test_process_json():
    r = runner.invoke(cli, ["process"], input='{"x":1}')
    assert r.exit_code == 0
` },
      { path: 'README.md', content:
`# {name}

CLI tool built by Loom Design Engine.

## Install

\`\`\`bash
pip install -r requirements.txt
python3 cli.py --help
\`\`\`
` },
    ],
    exec_plan: [
      { step: 'smoke', command: 'python3', args: ['cli.py', '--help'], description: 'Verify CLI' },
      { step: 'test',  command: 'python3', args: ['-m', 'pytest', 'tests/', '-v'], description: 'Run tests' },
    ],
  },

  'ml-experiment': {
    name: 'ML Experiment',
    description: 'Scikit-learn experiment scaffold: data gen → train → evaluate → report.',
    tags: ['python', 'ml', 'sklearn', 'experiment'],
    files: [
      { path: 'experiment.py', content:
`#!/usr/bin/env python3
"""
{name} — ML Experiment
Built by Loom Design Engine v0.4
"""
import json, math, random
from statistics import mean, stdev

# ── Synthetic dataset ─────────────────────────────────────────────────
random.seed(42)
def generate_data(n=200):
    X, y = [], []
    for _ in range(n):
        x1, x2 = random.gauss(0,1), random.gauss(0,1)
        label = 1 if x1 + x2 + random.gauss(0,0.3) > 0 else 0
        X.append([x1, x2])
        y.append(label)
    return X, y

# ── Logistic regression (stdlib only) ────────────────────────────────
def sigmoid(z): return 1 / (1 + math.exp(-max(-500, min(500, z))))

def train(X, y, lr=0.1, epochs=200):
    w = [0.0, 0.0]; b = 0.0
    for _ in range(epochs):
        for xi, yi in zip(X, y):
            pred = sigmoid(w[0]*xi[0] + w[1]*xi[1] + b)
            err = pred - yi
            w[0] -= lr * err * xi[0]
            w[1] -= lr * err * xi[1]
            b    -= lr * err
    return w, b

def predict(X, w, b): return [1 if sigmoid(w[0]*x[0]+w[1]*x[1]+b)>0.5 else 0 for x in X]

def accuracy(preds, labels): return sum(p==l for p,l in zip(preds,labels)) / len(labels)

# ── Run ───────────────────────────────────────────────────────────────
X, y = generate_data()
split = int(len(X)*0.8)
X_train, y_train = X[:split], y[:split]
X_test,  y_test  = X[split:],  y[split:]
w, b = train(X_train, y_train)
preds = predict(X_test, w, b)
acc  = accuracy(preds, y_test)

report = {
    "experiment": "{name}",
    "model": "logistic_regression",
    "train_size": len(X_train),
    "test_size": len(X_test),
    "accuracy": round(acc, 4),
    "weights": [round(v, 4) for v in w],
    "bias": round(b, 4),
    "ok": True,
}
print(json.dumps(report, indent=2))
` },
      { path: 'requirements.txt', content: '# no dependencies — stdlib only\n' },
      { path: 'tests/test_experiment.py', content:
`import json, subprocess, sys

def test_runs_and_accurate():
    result = subprocess.run([sys.executable, "experiment.py"], capture_output=True, text=True)
    assert result.returncode == 0
    report = json.loads(result.stdout)
    assert report["ok"] is True
    assert report["accuracy"] >= 0.8, f"accuracy too low: {report['accuracy']}"
` },
      { path: 'README.md', content:
`# {name}

ML experiment built by Loom Design Engine. Runs stdlib-only logistic regression.

## Run

\`\`\`bash
python3 experiment.py
\`\`\`
` },
    ],
    exec_plan: [
      { step: 'run',  command: 'python3', args: ['experiment.py'], description: 'Run experiment' },
      { step: 'test', command: 'python3', args: ['-m', 'pytest', 'tests/', '-v'], description: 'Verify accuracy' },
    ],
  },

  'node-server': {
    name: 'Node.js HTTP Server',
    description: 'Production-ready Node.js HTTP service: routes, middleware, JWT stub, tests.',
    tags: ['node', 'http', 'server', 'api'],
    files: [
      { path: 'server.mjs', content:
`// {name} — HTTP Server
// Built by Loom Design Engine v0.4
import { createServer } from 'node:http';
import { router } from './router.mjs';

const PORT = process.env.PORT || 3000;

const server = createServer(async (req, res) => {
  const t0 = Date.now();
  try {
    const url = new URL(req.url, \`http://localhost:\${PORT}\`);
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {};
    const result = await router(req.method, url.pathname, body, req.headers);
    res.writeHead(result.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result.body));
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
  process.stderr.write(\`\${req.method} \${req.url} \${Date.now()-t0}ms\\n\`);
});

server.listen(PORT, () => process.stderr.write(\`{name} listening on :\${PORT}\\n\`));
export { server };
` },
      { path: 'router.mjs', content:
`// Route handlers
const routes = {};
const on = (method, path, fn) => { routes[\`\${method}:\${path}\`] = fn; };

on('GET',  '/health', async () => ({ status: 200, body: { ok: true, service: '{name}', version: '0.1.0' } }));
on('GET',  '/items',  async () => ({ status: 200, body: { ok: true, items: [...store.values()] } }));
on('POST', '/items',  async ({ id, name, value }) => {
  if (!id || !name) return { status: 400, body: { ok: false, error: 'id and name required' } };
  store.set(id, { id, name, value: value ?? null, created_at: Date.now() });
  return { status: 201, body: { ok: true, item: store.get(id) } };
});

const store = new Map();

export async function router(method, path, body, headers) {
  const handler = routes[\`\${method}:\${path}\`];
  if (!handler) return { status: 404, body: { ok: false, error: 'NOT_FOUND' } };
  return handler(body, headers);
}
` },
      { path: 'tests/test_server.mjs', content:
`import assert from 'node:assert';
import { router } from '../router.mjs';

let pass=0,fail=0;
async function t(n,fn){try{await fn();pass++;console.log('PASS '+n);}catch(e){fail++;console.log('FAIL '+n+': '+e.message);}}

await t('health ok', async () => {
  const r = await router('GET','/health',{},{});
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});
await t('create item', async () => {
  const r = await router('POST','/items',{id:'1',name:'thing',value:42},{});
  assert.equal(r.status, 201);
  assert.equal(r.body.item.name, 'thing');
});
await t('list items', async () => {
  const r = await router('GET','/items',{},{});
  assert.ok(Array.isArray(r.body.items));
});
await t('missing fields → 400', async () => {
  const r = await router('POST','/items',{id:'x'},{});
  assert.equal(r.status, 400);
});
await t('404 on unknown route', async () => {
  const r = await router('GET','/ghost',{},{});
  assert.equal(r.status, 404);
});

console.log(JSON.stringify({ok:fail===0,pass,fail}));
process.exit(fail?1:0);
` },
      { path: 'package.json', content: `{"name":"{name_slug}","version":"0.1.0","type":"module","scripts":{"start":"node server.mjs","test":"node tests/test_server.mjs"}}\n` },
      { path: 'README.md', content:
`# {name}

Node.js HTTP server built by Loom Design Engine.

## Run

\`\`\`bash
node server.mjs
\`\`\`

## Test

\`\`\`bash
node tests/test_server.mjs
\`\`\`
` },
    ],
    exec_plan: [
      { step: 'test', command: 'node', args: ['tests/test_server.mjs'], description: 'Run router tests' },
    ],
  },
};

// ── Substitution engine ───────────────────────────────────────────────

function slugify(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function applyVars(files, vars) {
  return files.map(f => ({
    path: fill(f.path, vars),
    content: fill(f.content, vars),
  }));
}

// ── BuildPlan ─────────────────────────────────────────────────────────

export class DesignEngine {
  constructor() {
    this._archetypes = new Map(Object.entries(ARCHETYPES));
  }

  /** List available archetypes. */
  list() {
    return [...this._archetypes.entries()].map(([id, a]) => ({
      id, name: a.name, description: a.description, tags: a.tags,
      file_count: a.files.length,
    }));
  }

  get(archetype_id) {
    const a = this._archetypes.get(archetype_id);
    if (!a) return { ok: false, reason: 'ARCHETYPE_NOT_FOUND', available: [...this._archetypes.keys()] };
    return { ok: true, archetype_id, ...a };
  }

  /**
   * Compile a BuildPlan from an archetype + user description.
   *
   * @param {string} archetype_id - e.g. 'fastapi-service'
   * @param {object} opts
   * @param {string} opts.name - Human name for the build (e.g. "User Auth Service")
   * @param {string} [opts.description] - Short description, fills {description} in templates
   * @param {object} [opts.extra_vars] - Additional template variables
   * @returns BuildPlan
   */
  compile(archetype_id, { name, description, extra_vars = {} } = {}) {
    const a = this._archetypes.get(archetype_id);
    if (!a) return { ok: false, reason: 'ARCHETYPE_NOT_FOUND', available: [...this._archetypes.keys()] };
    if (!name) return { ok: false, reason: 'NAME_REQUIRED' };

    const name_slug = slugify(name);
    const vars = {
      name, name_slug,
      description: description || a.description,
      ...extra_vars,
    };

    const files = applyVars(a.files, vars);
    const plan_id = 'bp_' + Date.now().toString(36) + '_' + randomToken(6);
    const fingerprint = multiHash(JSON.stringify(files)).combined;

    return {
      ok: true,
      plan_id,
      archetype_id,
      archetype_name: a.name,
      name, name_slug,
      description: vars.description,
      files,              // [{path, content}] — write these to runspace / disk
      exec_plan: a.exec_plan.map(s => ({ ...s })),  // [{step, command, args, description}]
      fingerprint,
      file_count: files.length,
      tags: a.tags,
      created_at: Date.now(),
      instructions: [
        `Build plan ready: ${files.length} files.`,
        `1. Write files to runspace: each {path: file.path, content: file.content}`,
        `2. Execute each step in exec_plan: {command} {args.join(" ")}`,
        `3. Collect output and store in vault or deposit.`,
      ].join('\n'),
    };
  }

  /** Quick compile-and-summarize for the MCP surface. */
  preview(archetype_id, { name, description } = {}) {
    const plan = this.compile(archetype_id, { name, description });
    if (!plan.ok) return plan;
    return {
      ok: true,
      plan_id: plan.plan_id,
      archetype_name: plan.archetype_name,
      name: plan.name,
      files: plan.files.map(f => ({ path: f.path, bytes: f.content.length })),
      exec_plan: plan.exec_plan,
      fingerprint: plan.fingerprint,
      instructions: plan.instructions,
    };
  }

  archetypes_by_tag(tag) {
    return this.list().filter(a => a.tags.includes(tag));
  }

  stats() {
    const archetypes = this.list();
    const by_tag = {};
    for (const a of archetypes) a.tags.forEach(t => { by_tag[t] = (by_tag[t]||0)+1; });
    return { total: archetypes.length, by_tag };
  }
}
