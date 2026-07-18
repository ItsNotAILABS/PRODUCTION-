import fs from 'node:fs';
for(const f of ['index.html','src/main.js','package.json'])if(!fs.existsSync(f))throw new Error('Missing '+f);
const js=fs.readFileSync('src/main.js','utf8');
for(const t of ['VRButton','XRControllerModelFactory','spawnWave','enemyModel','interact','shopOpen','snap'])if(!js.includes(t))throw new Error('Missing '+t);
console.log('BLACKVECTOR VR CERTIFICATION PASSED');