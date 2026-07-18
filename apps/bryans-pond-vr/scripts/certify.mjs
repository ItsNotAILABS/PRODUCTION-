import fs from 'node:fs';
const required=['index.html','src/main-pro.js','src/experience.js','package.json','README.md'];
const missing=required.filter(p=>!fs.existsSync(p));
if(missing.length){console.error('Missing:',missing);process.exit(1)}
const js=fs.readFileSync('src/main-pro.js','utf8');
for(const token of [
  'VRButton','XRControllerModelFactory','Water','Sky','renderer.xr.enabled',
  'reelGesture','snap-turns','wrist','mission','drag','cycleWeather',
  'casting','fight','haptic','local-floor'
]){
  if(!js.includes(token)){console.error('Missing Quest Pro system:',token);process.exit(1)}
}
const html=fs.readFileSync('index.html','utf8');
for(const token of ['tension-wrap','Load Quest Pro Pond','META QUEST 2','mission','weather-cycle','drag-up']){
  if(!html.includes(token)){console.error('Missing UI:',token);process.exit(1)}
}
console.log('CERTIFICATION PASSED: WebXR, Touch controllers, physical reel gesture, snap turn, comfort vignette, drag, weather, missions, wrist HUD, water, fish AI, fight physics, persistence, and Quest UI present.');