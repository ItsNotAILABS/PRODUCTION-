# Bryan's Pond VR

A high-fidelity procedural WebXR fishing simulator built for **Meta Quest 2** and desktop browsers.

## What is real in this build

- Physical casting arc with gravity and water collision
- Quest Touch controller models and haptic feedback
- Rod, reel, line sag, bobber, lure, splash particles, and line-tension feedback
- Six fish species with different depths, bait preferences, size distributions, stamina, and fighting power
- Species-specific procedural fish bodies, eyes, fins, tails, and catfish whiskers
- Fish patrol, attraction, bite timing, hook setting, surges, slack-line escape, line-break escape, and landing distance
- Dynamic sky, daylight, water reflections, shoreline terrain, dock, cabin, trees, reeds, rocks, birds, and insects
- Persistent coins, XP, catches, best trophy, selected bait, rod level, line level, drag, missions, and weather
- Two-hand reel gesture, snap turning, comfort vignette, wrist HUD, and Quest-oriented progression
- Desktop controls for visual inspection before headset testing

## Local custom intelligence

The project now includes a strict local Transformers.js runtime in `src/local-intelligence.js`.

```js
import { env } from '@huggingface/transformers';

env.localModelPath = '/models/';
env.allowRemoteModels = false;
env.backends.onnx.wasm.wasmPaths = '/wasm/';
```

The implementation resolves paths relative to the deployed application base so it also works beneath the GitHub Pages `/PRODUCTION-/` base path.

Configured local pipelines:

- `fishing-state`: zero-shot classification for fight, weather, and guidance state
- `fishing-guide`: short local text generation for in-world coaching
- `catch-embedding`: local feature extraction for catch memory and similarity

The registry lives in `ai/model-config.json`. Actual ONNX model assets belong under `models/`, while matching ONNX Runtime Web binaries belong under `wasm/`.

Remote model loading is disabled. Missing assets fail locally and do not fall back to the Hugging Face Hub.

### Convert models to ONNX

```bash
python -m pip install "optimum[onnxruntime]" transformers
optimum-cli export onnx --model YOUR_MODEL ./models/fishing-guide
```

For Quest 2, use compact quantized models. Large generative models can overwhelm headset memory and frame timing, so intelligence should load lazily outside the render loop.

## Quest 2 controls

- **Right trigger:** cast / set hook / dismiss catch result
- **Right grip or physical crank gesture:** reel
- **Left trigger:** cycle bait
- **Left thumbstick:** walk
- **Right thumbstick:** snap turn

## Run locally

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Desktop inspection works over local HTTP. Immersive WebXR on Quest requires HTTPS.

## Production build

```bash
npm run build
npm run certify
```

Deploy `dist/` to any HTTPS static host. The included GitHub Actions workflow builds and publishes the app to GitHub Pages.

## Performance target

The scene is tuned around Quest 2 constraints: procedural low-to-medium polygon geometry, capped pixel ratio, limited shadow-casting objects, 512px water normals, and no mandatory downloaded GLB assets. Local inference must remain event-driven and outside the per-frame WebXR render path. Physical headset verification is still required before claiming stable 72/90 Hz performance.
