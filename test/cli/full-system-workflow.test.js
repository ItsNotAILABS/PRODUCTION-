const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RegisterAIEngine = require('../../organism-cli/ai-engine');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLI_ENTRY = path.join(REPO_ROOT, 'organism-cli', 'index.js');

function runCli(command) {
  const args = command ? [CLI_ENTRY, command] : [CLI_ENTRY];
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  return { ...result, output };
}

function captureConsoleLogs(fn) {
  const originalLog = console.log;
  const logs = [];

  console.log = (...args) => {
    logs.push(args.map(String).join(' '));
  };

  try {
    fn();
  } finally {
    console.log = originalLog;
  }

  return logs.join('\n');
}

describe('Full system processing and workflow', () => {
  it('runs CLI validate command as a real processing flow', () => {
    const result = runCli('validate');
    assert.equal(result.status, 0, `validate command failed:\n${result.output}`);

    assert.match(result.output, /Scanning extensions\.\.\./);
    assert.match(result.output, /Validating Manifest V3 compliance\.\.\./);
    assert.match(result.output, /Found \d+ extensions/);
    assert.match(result.output, /(All \d+ extensions valid|(\d+ valid, \d+ invalid))/);
  });

  it('runs CLI status command and reports computed system health', () => {
    const result = runCli('status');
    assert.equal(result.status, 0, `status command failed:\n${result.output}`);

    assert.match(result.output, /Register AI — Status/);
    assert.match(result.output, /Extensions:/);
    assert.match(result.output, /Valid:/);
    assert.match(result.output, /Vitality:/);
    assert.match(result.output, /Heartbeat:/);
    assert.match(result.output, /Platform:/);
  });

  it('executes full engine workflow in order (without launching browser)', () => {
    const engine = new RegisterAIEngine(REPO_ROOT);
    engine.install = () => true;

    const output = captureConsoleLogs(() => engine.runFullPipeline());

    const scanIndex = output.indexOf('Scanning extensions...');
    const validateIndex = output.indexOf('Validating Manifest V3 compliance...');
    const detectIndex = output.indexOf('Detecting Chromium browser...');
    const statusIndex = output.indexOf('Register AI — Status');
    const heartbeatIndex = output.indexOf('Heartbeat:');

    assert.ok(scanIndex >= 0, 'scan step missing from full pipeline output');
    assert.ok(validateIndex > scanIndex, 'validate step should run after scan');
    assert.ok(detectIndex > validateIndex, 'browser detection should run after validate');
    assert.ok(statusIndex > detectIndex, 'status step should run after browser detection');
    assert.ok(heartbeatIndex > statusIndex, 'heartbeat summary should run after status');
  });
});
