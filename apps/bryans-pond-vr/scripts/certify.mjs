import fs from 'node:fs';
const required=['index.html','src/main-wilderness.js','package.json'];
const missing=required.filter(p=>!fs.existsSync(p));
if(missing.length){console.error('Missing:',missing);process.exit(1)}
const js=fs.readFileSync('src/main-wilderness.js','utf8');
for(const token of ['VRButton','XRControllerModelFactory','Water','Sky','buildForest','buildShop','buildAnimals','buildFish','shopAction','locomotion']){
  if(!js.includes(token)){console.error('Missing wilderness system:',token);process.exit(1)}
}
const html=fs.readFileSync('index.html','utf8');
for(const token of ['Enter Wilderness','WALKABLE WILDERNESS','TACKLE SHOP','main-wilderness.js']){
  if(!html.includes(token)){console.error('Missing wilderness UI:',token);process.exit(1)}
}
console.log('BRYANS POND WILDERNESS CERTIFICATION PASSED');