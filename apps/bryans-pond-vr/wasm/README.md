# Local ONNX Runtime WASM assets

Place the Transformers.js / ONNX Runtime Web WASM binaries in this directory so the production game does not depend on a CDN.

Typical files include:

```text
ort-wasm-simd-threaded.wasm
ort-wasm-simd-threaded.jsep.wasm
ort-wasm-simd-threaded.mjs
ort-wasm-simd-threaded.jsep.mjs
```

The exact filenames depend on the installed `@huggingface/transformers` and `onnxruntime-web` versions. Copy the matching runtime files from the installed package during the production build or vendor them here deliberately.

`src/local-intelligence.js` sets:

```js
env.backends.onnx.wasm.wasmPaths = new URL('wasm/', appBase).href;
```

Do not mix WASM binaries from a different ONNX Runtime version.