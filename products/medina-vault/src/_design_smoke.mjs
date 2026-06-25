// Smoke: design engine — archetypes, compile, fill, exec_plan

import { DesignEngine } from './design_engine.mjs';

const G=s=>`\x1b[32m${s}\x1b[0m`, R=s=>`\x1b[31m${s}\x1b[0m`,
      Y=s=>`\x1b[33m${s}\x1b[0m`, C=s=>`\x1b[36m${s}\x1b[0m`;
function assert(n,c,d=''){console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?' '+Y('· '+d):''}`);if(!c)process.exitCode=1;}

console.log(C('\n=== DESIGN ENGINE — SMOKE ===\n'));

const de = new DesignEngine();

// List
const list = de.list();
assert('5 archetypes listed', list.length === 5, list.map(a=>a.id).join(','));
assert('all archetypes have id, name, description, tags, file_count',
  list.every(a => a.id && a.name && a.description && Array.isArray(a.tags) && a.file_count > 0));

// Get
const fastapi = de.get('fastapi-service');
assert('get(fastapi-service) ok', fastapi.ok);
assert('fastapi has files', fastapi.files?.length >= 6, `got ${fastapi.files?.length}`);
assert('fastapi has exec_plan', Array.isArray(fastapi.exec_plan) && fastapi.exec_plan.length > 0);

const notFound = de.get('ghost-archetype');
assert('get unknown returns ARCHETYPE_NOT_FOUND', !notFound.ok && notFound.available?.length > 0);

// Compile — fastapi
const plan = de.compile('fastapi-service', { name: 'User Auth Service', description: 'JWT auth microservice' });
assert('compile: ok', plan.ok, JSON.stringify(plan).slice(0,80));
assert('compile: plan_id starts with bp_', plan.plan_id?.startsWith('bp_'));
assert('compile: has files', plan.files?.length >= 6, `got ${plan.files?.length}`);
assert('compile: files filled — {name} replaced', plan.files.every(f => !f.content?.includes('{name}')), 'found unreplaced {name}');
assert('compile: main.py contains service name', plan.files.find(f=>f.path==='main.py')?.content?.includes('User Auth Service'));
assert('compile: name_slug generated', plan.name_slug === 'user-auth-service', `got ${plan.name_slug}`);
assert('compile: exec_plan has 2 steps', plan.exec_plan?.length === 2);
assert('compile: fingerprint is a string', typeof plan.fingerprint === 'string' && plan.fingerprint.length > 10);
assert('compile: instructions populated', plan.instructions?.length > 0);

// Compile — data-pipeline
const dp = de.compile('data-pipeline', { name: 'Sales ETL' });
assert('data-pipeline compile ok', dp.ok && dp.file_count === 4);
assert('data-pipeline: pipeline.py exists', dp.files.some(f=>f.path==='pipeline.py'));
assert('data-pipeline: test file exists', dp.files.some(f=>f.path.includes('test')));
assert('data-pipeline: name filled in pipeline.py', dp.files.find(f=>f.path==='pipeline.py')?.content?.includes('Sales ETL'));

// Compile — ml-experiment
const ml = de.compile('ml-experiment', { name: 'Churn Predictor' });
assert('ml-experiment compile ok', ml.ok && ml.file_count >= 3, `file_count=${ml.file_count}`);
assert('ml-experiment: experiment.py exists', ml.files.some(f=>f.path==='experiment.py'));
assert('ml-experiment: stdlib only — no import numpy', !ml.files.find(f=>f.path==='experiment.py')?.content?.includes('import numpy'));

// Compile — node-server
const ns = de.compile('node-server', { name: 'Items API' });
assert('node-server compile ok', ns.ok && ns.file_count === 5);
assert('node-server: exec_plan uses node', ns.exec_plan.every(s=>s.command==='node'));
assert('node-server: package.json exists', ns.files.some(f=>f.path==='package.json'));

// Compile — cli-tool
const cli = de.compile('cli-tool', { name: 'Deploy CLI' });
assert('cli-tool compile ok', cli.ok && cli.file_count === 4);
assert('cli-tool: cli.py exists', cli.files.some(f=>f.path==='cli.py'));

// Preview (no file content)
const preview = de.preview('fastapi-service', { name: 'Preview Test' });
assert('preview: ok', preview.ok);
assert('preview: files have path + bytes but no content',
  preview.files.every(f => f.path && typeof f.bytes === 'number' && !('content' in f)));

// Compile missing name → error
const noName = de.compile('fastapi-service', {});
assert('compile without name → NAME_REQUIRED', !noName.ok && noName.reason === 'NAME_REQUIRED');

// By tag
const pythonArchetypes = de.archetypes_by_tag('python');
assert('archetypes_by_tag(python) >= 3', pythonArchetypes.length >= 3, `got ${pythonArchetypes.length}`);

// Stats
const stats = de.stats();
assert('stats: total=5', stats.total === 5);
assert('stats: has python + node tags', stats.by_tag['python'] >= 3 && stats.by_tag['node'] >= 1);

// Uniqueness — two compiles of same archetype produce different plan_ids
const p1 = de.compile('cli-tool', { name: 'Tool A' });
const p2 = de.compile('cli-tool', { name: 'Tool B' });
assert('two compiles produce different plan_ids', p1.plan_id !== p2.plan_id);
assert('two compiles produce different fingerprints (different content)', p1.fingerprint !== p2.fingerprint);

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1
    ? R('  failure\n')
    : G('  5 archetypes · compile · fill · exec_plan · preview — all green\n')));
