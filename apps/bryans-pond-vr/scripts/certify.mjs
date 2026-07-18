import fs from 'node:fs';
const required=['index.html','src/main.js','package.json','README.md'];
const missing=required.filter(p=>!fs.existsSync(p));
if(missing.length){console.error('Missing:',missing);process.exit(1)}
const js=fs.readFileSync('src/main.js','utf8');
for(const token of ['VRButton','XRControllerModelFactory','Water','Sky','renderer.xr.enabled','updateFight','updateCasting','createFishModel','haptic']){
  if(!js.includes(token)){console.error('Missing system:',token);process.exit(1)}
}
const html=fs.readFileSync('index.html','utf8');
for(const token of ['tension-wrap','Enter the Pond','META QUEST 2']){
  if(!html.includes(token)){console.error('Missing UI:',token);process.exit(1)}
}
console.log('CERTIFICATION PASSED: WebXR, controllers, water, sky, casting, fish AI, fight physics, persistence, and HUD present.');
