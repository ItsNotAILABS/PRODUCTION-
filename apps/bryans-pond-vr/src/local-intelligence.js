import { env, pipeline } from '@huggingface/transformers';

const pageBase = new URL('./', document.baseURI);
const modelRoot = new URL('models/', pageBase).href;
const wasmRoot = new URL('wasm/', pageBase).href;
const configUrl = new URL('ai/model-config.json', pageBase).href;

// Production policy: Bryan's Pond VR only loads bundled local assets.
env.localModelPath = model