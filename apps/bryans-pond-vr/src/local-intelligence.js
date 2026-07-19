import { env, pipeline } from '@huggingface/transformers';

const appBase = new URL('../', import.meta.url);
const modelRoot = new URL('models/', appBase).href;
const wasmRoot = new URL('wasm/', appBase).href;
const configUrl = new URL('ai/model-config.json', appBase).href;

// Production policy: only bundled model and WASM assets are permitted.
env.localModelPath = modelRoot;
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.backends.onnx.wasm.wasmPaths = wasmRoot;

env.useBrowserCache = true;

let configPromise;
const pipelines = new Map();

async function loadConfig() {
  if (!configPromise) {
    configPromise = fetch(configUrl, { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Local model config unavailable: ${response.status}`);
      }
      return response.json();
    });
  }
  return configPromise;
}

async function getPipeline(name) {
  if (pipelines.has(name)) return pipelines.get(name);

  const config = await loadConfig();
  const spec = config.pipelines?.[name];
  if (!spec) throw new Error(`Unknown local pipeline: ${name}`);

  const instance = await pipeline(spec.task, spec.model, {
    dtype: spec.dtype ?? 'q8',
    device: spec.device ?? 'wasm',
    local_files_only: true,
  });
  pipelines.set(name, instance);
  return instance;
}

export async function initializeLocalIntelligence() {
  const config = await loadConfig();
  const required = config.preload ?? [];
  await Promise.all(required.map((name) => getPipeline(name)));
  return {
    ready: true,
    localOnly: true,
    models: required,
    modelRoot,
    wasmRoot,
  };
}

export async function classifyFishingState(text) {
  const classifier = await getPipeline('fishing-state');
  const result = await classifier(text, {
    candidate_labels: [
      'calm water',
      'active bite',
      'line tension risk',
      'fish exhausted',
      'weather transition',
      'player needs guidance',
    ],
    multi_label: true,
  });
  return result;
}

export async function createFishingGuidance(context) {
  const generator = await getPipeline('fishing-guide');
  const prompt = [
    'You are the local fishing guide inside Bryan\'s Pond VR.',
    'Give one short, practical instruction for the player.',
    `Context: ${JSON.stringify(context)}`,
  ].join('\n');

  const output = await generator(prompt, {
    max_new_tokens: 48,
    temperature: 0.55,
    repetition_penalty: 1.08,
  });

  return output?.[0]?.generated_text ?? '';
}

export async function embedCatchRecord(record) {
  const embedder = await getPipeline('catch-embedding');
  const text = `${record.species} ${record.weight}lb ${record.weather} ${record.lure}`;
  return embedder(text, { pooling: 'mean', normalize: true });
}

export function localModelDiagnostics() {
  return {
    remoteModelsAllowed: env.allowRemoteModels,
    localModelPath: env.localModelPath,
    wasmPaths: env.backends.onnx.wasm.wasmPaths,
    loadedPipelines: [...pipelines.keys()],
  };
}
