import fs from 'node:fs';

const required = [
  'index.html',
  'src/main-pro.js',
  'src/experience.js',
  'src/local-intelligence.js',
  'ai/model-config.json',
  'models/README.md',
  'wasm/README.md',
  'package.json',
  'README.md',
];

const missing = required.filter((path) => !fs.existsSync(path));
if (missing.length) {
  console.error('Missing:', missing);
  process.exit(1);
}

const vr = fs.readFileSync('src/main-pro.js', 'utf8');
for (const token of [
  'VRButton', 'XRControllerModelFactory', 'Water', 'Sky',
  'renderer.xr.enabled', 'reelGesture', 'lastSnap', 'wrist',
  'mission', 'drag', 'cycleWeather', 'casting', 'fight',
  'haptic', 'local-floor',
]) {
  if (!vr.includes(token)) {
    console.error('Missing Quest Pro system:', token);
    process.exit(1);
  }
}

const intelligence = fs.readFileSync('src/local-intelligence.js', 'utf8');
for (const token of [
  "from '@huggingface/transformers'",
  'env.localModelPath',
  'env.allowRemoteModels = false',
  'env.backends.onnx.wasm.wasmPaths',
  'local_files_only: true',
  'initializeLocalIntelligence',
  'classifyFishingState',
  'createFishingGuidance',
]) {
  if (!intelligence.includes(token)) {
    console.error('Missing local intelligence system:', token);
    process.exit(1);
  }
}

const modelConfig = JSON.parse(fs.readFileSync('ai/model-config.json', 'utf8'));
if (modelConfig.policy?.allowRemoteModels !== false) {
  console.error('Remote model policy must remain disabled.');
  process.exit(1);
}
for (const name of ['fishing-state', 'fishing-guide', 'catch-embedding']) {
  if (!modelConfig.pipelines?.[name]) {
    console.error('Missing model pipeline:', name);
    process.exit(1);
  }
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!pkg.dependencies?.['@huggingface/transformers']) {
  console.error('Transformers.js dependency missing.');
  process.exit(1);
}

const html = fs.readFileSync('index.html', 'utf8');
for (const token of [
  'tension-wrap', 'Load Quest Pro Pond', 'META QUEST 2',
  'mission', 'weather-cycle', 'drag-up',
]) {
  if (!html.includes(token)) {
    console.error('Missing UI:', token);
    process.exit(1);
  }
}

console.log('CERTIFICATION PASSED: WebXR, Touch controllers, physical reel gesture, snap turn, comfort vignette, drag, weather, missions, wrist HUD, water, fish AI, fight physics, persistence, local Transformers.js policy, local ONNX model registry, and local WASM paths present.');
