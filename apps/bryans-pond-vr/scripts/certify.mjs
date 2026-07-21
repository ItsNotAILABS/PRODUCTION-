import fs from 'node:fs';

const required = [
  'index.html',
  'src/main-wilderness.js',
  'src/gameplay-expansion.js',
  'package.json',
  'README.md',
];

const missing = required.filter((path) => !fs.existsSync(path));
if (missing.length) {
  console.error('Missing:', missing);
  process.exit(1);
}

const wilderness = fs.readFileSync('src/main-wilderness.js', 'utf8');
for (const token of [
  'VRButton',
  'XRControllerModelFactory',
  'Water',
  'Sky',
  'renderer.xr.enabled',
  'local-floor',
  'buildForest',
  'buildShop',
  'buildAnimals',
  'buildFish',
  'shopAction',
  'locomotion',
]) {
  if (!wilderness.includes(token)) {
    console.error('Missing wilderness VR system:', token);
    process.exit(1);
  }
}

const gameplay = fs.readFileSync('src/gameplay-expansion.js', 'utf8');
for (const token of [
  'Expedition Rank',
  'contracts',
  'discoveries',
  'habitats',
  'wildlife',
  'claimContract',
]) {
  if (!gameplay.includes(token)) {
    console.error('Missing expedition gameplay system:', token);
    process.exit(1);
  }
}

const html = fs.readFileSync('index.html', 'utf8');
for (const token of [
  'Enter Wilderness',
  'WALKABLE WILDERNESS',
  'TACKLE SHOP',
  'main-wilderness.js',
  'gameplay-expansion.js',
]) {
  if (!html.includes(token)) {
    console.error('Missing wilderness UI:', token);
    process.exit(1);
  }
}

console.log('BRYANS POND VR CERTIFICATION PASSED');
