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
- Persistent coins, XP, catches, best trophy, selected bait, rod level, and line level
- Desktop controls for visual inspection before headset testing

## Quest 2 controls

- **Right trigger:** cast / set hook / dismiss catch result
- **Right grip:** reel
- **Left trigger:** cycle bait
- **Left thumbstick:** walk

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

The scene is tuned around Quest 2 constraints: procedural low-to-medium polygon geometry, capped pixel ratio, limited shadow-casting objects, 512px water normals, and no mandatory downloaded GLB assets. Physical headset verification is still required before claiming stable 72/90 Hz performance.
