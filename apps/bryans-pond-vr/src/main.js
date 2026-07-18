import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';

const WORLD = { pondRadius: 18, shoreRadius: 34, maxFish: 34 };
const BAITS = [
  { name: 'Nightcrawler', attraction: 1.0, color: 0x8d4e38 },
  { name: 'Silver Minnow', attraction: 1.18, color: 0xc8dde8 },
  { name: 'Stink Bait', attraction: 1.38, color: 0x8b7452 },
  { name: 'Golden Dough', attraction: 1.7, color: 0xffc84a },
];
const SPECIES = [
  { name:'Bluegill', color:0x5d9db4, belly:0xbad9df, min:.25, max:1.5, value:8, power:.54, rarity:.40, depth:[.35,1.2], baits:[1,1,.55,.7] },
  { name:'Crappie', color:0xaebcb2, belly:0xdce3d8, min:.5, max:2.4, value:14, power:.72, rarity:.24, depth:[.6,1.8], baits:[1,.95,.65,.6] },
  { name:'Largemouth Bass', color:0x658453, belly:0xc8d1a7, min:1.2, max:9.5, value:32, power:1.2, rarity:.18, depth:[.8,2.5], baits:[.6,1.35,.45,.8] },
  { name:'Channel Catfish', color:0x707986, belly:0xa7adb4, min:2.5, max:22, value:48, power:1.55, rarity:.11, depth:[1.2,3.3], baits:[.7,.7,1.6,.55] },
  { name:'Golden Koi', color:0xf6a629, belly:0xffe5a5, min:1.5, max:8.5, value:120, power:1.4, rarity:.055, depth:[.45,1.7], baits:[.45,.55,.35,1.7] },
  { name:"Bryan's Legend", color:0x37d8c0, belly:0xc6fff3, min:14, max:31, value:400, power:2.25, rarity:.015, depth:[1.7,3.6], baits:[.15,.65,1.1,2.0] },
];

const state = {
  coins:Number(localStorage.getItem('bpvr2-coins')||0), xp:Number(localStorage.getItem('bpvr2-xp')||0),
  best:JSON.parse(localStorage.getItem('bpvr2-best')||'null'), catches:JSON.parse(localStorage.getItem('bpvr2-catches')||'[]'),
  baitIndex:Number(localStorage.getItem('bpvr2-bait')||0), rodLevel:Number(localStorage.getItem('bpvr2-rod')||1),
  lineLevel:Number(localStorage.getItem('bpvr2-line')||1), phase:'idle', tension:0, lineLength:0,
  reelInput:0, fish:null, castVelocity:new THREE.Vector3(), time:0, dayTime:.22, weather:'Clear morning',
  messageTimer:0, biteTimer:0, castCooldown:0, quality:'balanced', desktop:false,
};

let scene,camera,renderer,clock,player,water,sky,sun,rod,rodTip,reel,bobber,lineMesh,lure;
let controllerL,controllerR,gripL,gripR;
const fishes=[], ripples=[], particles=[], birds=[], insects=[];
const tmpV=new THREE.Vector3(), tmpV2=new THREE.Vector3();
const statusEl=document.querySelector('#status'), tensionEl=document.querySelector('#tension-fill'), tensionWrap=document.querySelector('#tension-wrap');

function save(){
  localStorage.setItem('bpvr2-coins',state.coins); localStorage.setItem('bpvr2-xp',state.xp);
  localStorage.setItem('bpvr2-best',JSON.stringify(state.best)); localStorage.setItem('bpvr2-catches',JSON.stringify(state.catches.slice(-50)));
  localStorage.setItem('bpvr2-bait',state.baitIndex); localStorage.setItem('bpvr2-rod',state.rodLevel); localStorage.setItem('bpvr2-line',state.lineLevel);
}
function message(text,seconds=2){ statusEl.textContent=text; statusEl.classList.add('show'); state.messageTimer=seconds; }
function haptic(strength=.45,duration=45){
  const gp=controllerR?.userData?.gamepad; const actuator=gp?.hapticActuators?.[0] || gp?.vibrationActuator;
  try{ actuator?.pulse?.(strength,duration); }catch{}
}
function tone(freq=420,duration=.08,volume=.05){
  try{ const ctx=tone.ctx||(tone.ctx=new AudioContext()); const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.frequency.value=freq; gain.gain.setValueAtTime(volume,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+duration); }catch{}
}
function updateHud(){
  document.querySelector('#score').textContent=`Coins ${state.coins} • XP ${state.xp}`;
  document.querySelector('#record').textContent=state.best?`Best: ${state.best.name} ${state.best.weight.toFixed(1)} lb`:'Best: none';
  document.querySelector('#weather').textContent=`${state.weather} • ${BAITS[state.baitIndex].name}`;
  document.querySelector('#gear').textContent=`Rod ${state.rodLevel} • Line ${state.lineLevel}`;
}

function init(){
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x91c7da); scene.fog=new THREE.FogExp2(0x91b8bd,.013);
  camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.04,220); camera.position.set(0,1.68,22);
  player=new THREE.Group(); player.add(camera); scene.add(player);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.0; renderer.xr.enabled=true;
  renderer.xr.setReferenceSpaceType('local-floor'); document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer,{requiredFeatures:['local-floor'],optionalFeatures:['bounded-floor','hand-tracking','layers']}));
  clock=new THREE.Clock(); buildWorld(); setupControllers(); setupDesktop(); updateHud(); renderer.setAnimationLoop(loop);
  addEventListener('resize',resize); document.querySelector('#loading').style.display='none';
}

function buildWorld(){
  scene.add(new THREE.HemisphereLight(0xd8f4ff,0x33452e,1.65));
  sun=new THREE.DirectionalLight(0xffefcf,3.2); sun.position.set(-18,28,12); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-38; sun.shadow.camera.right=38; sun.shadow.camera.top=38; sun.shadow.camera.bottom=-38; scene.add(sun);
  buildSky(); buildTerrain(); buildWater(); buildDockAndCabin(); buildVegetation(); buildAtmosphere(); buildRod();
  for(let i=0;i<WORLD.maxFish;i++) spawnFish();
}
function buildSky(){
  sky=new Sky(); sky.scale.setScalar(300); scene.add(sky);
  const u=sky.material.uniforms; u.turbidity.value=7; u.rayleigh.value=2.2; u.mieCoefficient.value=.008; u.mieDirectionalG.value=.84;
}
function buildTerrain(){
  const g=new THREE.CircleGeometry(WORLD.shoreRadius,128,0,Math.PI*2); const pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){ const x=pos.getX(i),z=pos.getY(i),r=Math.hypot(x,z); const noise=Math.sin(x*.33)*.18+Math.cos(z*.27)*.14;
    pos.setZ(i,Math.max(0,(r-WORLD.pondRadius)*.035)+noise*(r/WORLD.shoreRadius)); }
  g.computeVertexNormals(); const m=new THREE.MeshStandardMaterial({color:0x4c733d,roughness:1}); const ground=new THREE.Mesh(g,m);
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
  const beach=new THREE.Mesh(new THREE.RingGeometry(WORLD.pondRadius-1.3,WORLD.pondRadius+2.4,128),new THREE.MeshStandardMaterial({color:0xb89d70,roughness:1}));
  beach.rotation.x=-Math.PI/2; beach.position.y=.025; beach.receiveShadow=true; scene.add(beach);
}
function buildWater(){
  const normals=new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg',t=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;});
  water=new Water(new THREE.CircleGeometry(WORLD.pondRadius,128),{textureWidth:512,textureHeight:512,waterNormals:normals,sunDirection:new THREE.Vector3(),sunColor:0xffffff,waterColor:0x146f81,distortionScale:2.1,fog:true});
  water.rotation.x=-Math.PI/2; water.position.y=.06; scene.add(water);
  const bottom=new THREE.Mesh(new THREE.CircleGeometry(WORLD.pondRadius-.4,96),new THREE.MeshStandardMaterial({color:0x223d30,roughness:1}));
  bottom.rotation.x=-Math.PI/2; bottom.position.y=-3.1; scene.add(bottom);
}
function buildDockAndCabin(){
  const wood=new THREE.MeshStandardMaterial({color:0x765238,roughness:.88}); const dark=new THREE.MeshStandardMaterial({color:0x3f2a20,roughness:1});
  const dock=new THREE.Group();
  for(let i=0;i<14;i++){ const plank=new THREE.Mesh(new THREE.BoxGeometry(1.65,.16,.72),wood); plank.position.set(0,.22,13.2+i*.68); plank.castShadow=true; plank.receiveShadow=true; dock.add(plank); }
  for(const x of [-.65,.65]) for(const z of [13.4,17,21.3]){ const post=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,2.7,8),dark); post.position.set(x,-.65,z); post.castShadow=true; dock.add(post); }
  scene.add(dock);
  const cabin=new THREE.Group(); cabin.position.set(-12,0,18);
  const base=new THREE.Mesh(new THREE.BoxGeometry(6,3.2,4.8),new THREE.MeshStandardMaterial({color:0x6a4934,roughness:.94})); base.position.y=1.6; base.castShadow=true; cabin.add(base);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(4.6,2.2,4),new THREE.MeshStandardMaterial({color:0x342d2a,roughness:1})); roof.rotation.y=Math.PI/4; roof.position.y=4.25; roof.scale.z=.78; cabin.add(roof);
  const windowMat=new THREE.MeshStandardMaterial({color:0xffc56b,emissive:0xff8a1e,emissiveIntensity:.9});
  for(const x of [-1.6,1.6]){const win=new THREE.Mesh(new THREE.PlaneGeometry(.9,1.1),windowMat);win.position.set(x,2,2.411);cabin.add(win);} scene.add(cabin);
}
function buildVegetation(){
  const trunkMat=new THREE.MeshStandardMaterial({color:0x5c3d28,roughness:1}); const leafMat=new THREE.MeshStandardMaterial({color:0x2f6f3b,roughness:.95});
  for(let i=0;i<58;i++){ const a=Math.random()*Math.PI*2,r=WORLD.pondRadius+5+Math.random()*(WORLD.shoreRadius-WORLD.pondRadius-6); const tree=new THREE.Group();
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16,.24,2.8,8),trunkMat); trunk.position.y=1.4; trunk.castShadow=true; tree.add(trunk);
    for(let j=0;j<3;j++){ const crown=new THREE.Mesh(new THREE.ConeGeometry(1.25-j*.13,2.3,9),leafMat); crown.position.y=3+j*1.05; crown.castShadow=true; tree.add(crown); }
    tree.position.set(Math.cos(a)*r,0,Math.sin(a)*r); tree.rotation.y=Math.random()*Math.PI; tree.scale.setScalar(.75+Math.random()*.6); scene.add(tree);
  }
  const reedMat=new THREE.MeshStandardMaterial({color:0x547c35,roughness:1});
  for(let i=0;i<140;i++){ const a=Math.random()*Math.PI*2,r=WORLD.pondRadius-1+Math.random()*2.3; const reed=new THREE.Mesh(new THREE.CylinderGeometry(.018,.025,.55+Math.random()*.8,5),reedMat);
    reed.position.set(Math.cos(a)*r,.3,Math.sin(a)*r); reed.rotation.z=(Math.random()-.5)*.15; scene.add(reed); }
  for(let i=0;i<35;i++){ const a=Math.random()*Math.PI*2,r=WORLD.pondRadius+1+Math.random()*7; const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.25+Math.random()*.55),new THREE.MeshStandardMaterial({color:0x66706b,roughness:1}));
    rock.position.set(Math.cos(a)*r,.15,Math.sin(a)*r); rock.scale.y=.55; rock.castShadow=true; scene.add(rock); }
}
function buildAtmosphere(){
  for(let i=0;i<7;i++){ const bird=new THREE.Group(); const mat=new THREE.MeshBasicMaterial({color:0x1c2226});
    const wing1=new THREE.Mesh(new THREE.PlaneGeometry(.35,.08),mat),wing2=wing1.clone(); wing1.rotation.z=.35; wing2.rotation.z=-.35; wing1.position.x=-.18; wing2.position.x=.18; bird.add(wing1,wing2);
    bird.userData={radius:18+Math.random()*18,speed:.06+Math.random()*.06,phase:Math.random()*6.28,height:8+Math.random()*7}; scene.add(bird); birds.push(bird); }
  for(let i=0;i<35;i++){ const bug=new THREE.Mesh(new THREE.SphereGeometry(.018,5,4),new THREE.MeshBasicMaterial({color:0xffe98b})); bug.userData={center:new THREE.Vector3((Math.random()-.5)*18,1+Math.random()*2,(Math.random()-.5)*18),phase:Math.random()*6.28}; scene.add(bug); insects.push(bug); }
}
function buildRod(){
  rod=new THREE.Group();
  const cork=new THREE.MeshStandardMaterial({color:0xb98a59,roughness:.82}); const graphite=new THREE.MeshStandardMaterial({color:0x222a2d,metalness:.55,roughness:.3});
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.48,12),cork); handle.rotation.z=Math.PI/2; handle.position.x=.24; rod.add(handle);
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.008,.018,1.9,12),graphite); shaft.rotation.z=Math.PI/2; shaft.position.x=1.4; rod.add(shaft);
  reel=new THREE.Group(); const spool=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.08,18),new THREE.MeshStandardMaterial({color:0x555f67,metalness:.8,roughness:.22})); spool.rotation.z=Math.PI/2; reel.add(spool);
  const crank=new THREE.Mesh(new THREE.BoxGeometry(.18,.025,.025),graphite); crank.position.set(.05,-.1,.08); reel.add(crank); reel.position.set(.42,-.08,0); rod.add(reel);
  rodTip=new THREE.Object3D(); rodTip.position.set(2.35,0,0); rod.add(rodTip);
  lineMesh=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xe7fbff,transparent:true,opacity:.88})); scene.add(lineMesh);
  bobber=new THREE.Mesh(new THREE.SphereGeometry(.075,14,10),new THREE.MeshStandardMaterial({color:0xff493d,emissive:0x5b0803})); bobber.visible=false; scene.add(bobber);
  lure=new THREE.Mesh(new THREE.SphereGeometry(.04,10,8),new THREE.MeshStandardMaterial({color:BAITS[state.baitIndex].color,metalness:.15,roughness:.45})); bobber.add(lure); lure.position.y=-.2;
  camera.add(rod); rod.position.set(.24,-.22,-.52); rod.rotation.set(0,-.22,-.04);
}

function createFishModel(species,weight){
  const fish=new THREE.Group(); const scale=.55+Math.min(1.35,weight/species.max)*.9;
  const bodyMat=new THREE.MeshPhysicalMaterial({color:species.color,roughness:.36,metalness:.06,clearcoat:.25,clearcoatRoughness:.45});
  const bellyMat=new THREE.MeshStandardMaterial({color:species.belly,roughness:.5});
  const body=new THREE.Mesh(new THREE.SphereGeometry(.34,20,12),bodyMat); body.scale.set(1.8,.72,.78); body.castShadow=true; fish.add(body);
  const belly=new THREE.Mesh(new THREE.SphereGeometry(.31,18,10),bellyMat); belly.scale.set(1.55,.48,.68); belly.position.y=-.13; fish.add(belly);
  const tail=new THREE.Mesh(new THREE.ConeGeometry(.30,.58,3),bodyMat); tail.rotation.z=-Math.PI/2; tail.position.x=-.67; fish.add(tail);
  const dorsal=new THREE.Mesh(new THREE.ConeGeometry(.15,.36,3),bodyMat); dorsal.position.set(-.05,.34,0); dorsal.rotation.z=Math.PI; fish.add(dorsal);
  const eyeMat=new THREE.MeshBasicMaterial({color:0xffffff}); const pupilMat=new THREE.MeshBasicMaterial({color:0x050505});
  for(const z of [-.23,.23]){ const eye=new THREE.Mesh(new THREE.SphereGeometry(.045,10,8),eyeMat); eye.position.set(.43,.11,z); fish.add(eye); const pupil=new THREE.Mesh(new THREE.SphereGeometry(.022,8,6),pupilMat); pupil.position.set(.47,.11,z*1.08); fish.add(pupil); }
  if(species.name.includes('Catfish')){ for(const z of [-1,1]){ const whisker=new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.45,5),bodyMat); whisker.rotation.z=Math.PI/2; whisker.rotation.y=z*.35; whisker.position.set(.58,-.08,z*.14); fish.add(whisker);} }
  fish.scale.setScalar(scale); return fish;
}
function chooseSpecies(){ let r=Math.random(),sum=0; for(const s of SPECIES){sum+=s.rarity;if(r<=sum)return s;} return SPECIES[0]; }
function spawnFish(){
  const species=chooseSpecies(),weight=species.min+Math.pow(Math.random(),1.55)*(species.max-species.min),fish=createFishModel(species,weight);
  const a=Math.random()*Math.PI*2,r=2.5+Math.random()*(WORLD.pondRadius-3.5),depth=species.depth[0]+Math.random()*(species.depth[1]-species.depth[0]);
  fish.position.set(Math.cos(a)*r,-depth,Math.sin(a)*r); fish.rotation.y=Math.random()*Math.PI*2;
  fish.userData={species,weight,heading:fish.rotation.y,speed:.28+Math.random()*.5,turn:0,interest:0,stamina:1,burst:0,wander:Math.random()*10}; scene.add(fish); fishes.push(fish);
}

function setupControllers(){
  const factory=new XRControllerModelFactory(); controllerL=renderer.xr.getController(0); controllerR=renderer.xr.getController(1); gripL=renderer.xr.getControllerGrip(0); gripR=renderer.xr.getControllerGrip(1);
  gripL.add(factory.createControllerModel(gripL)); gripR.add(factory.createControllerModel(gripR)); player.add(controllerL,controllerR,gripL,gripR);
  controllerR.addEventListener('connected',e=>controllerR.userData.gamepad=e.data.gamepad); controllerL.addEventListener('connected',e=>controllerL.userData.gamepad=e.data.gamepad);
  controllerR.addEventListener('selectstart',primaryAction); controllerR.addEventListener('squeezestart',()=>state.reelInput=1); controllerR.addEventListener('squeezeend',()=>state.reelInput=0);
  controllerL.addEventListener('selectstart',cycleBait);
}
function setupDesktop(){
  state.desktop=true; addEventListener('pointerdown',e=>{if(e.button===0)primaryAction(); if(e.button===2)state.reelInput=1;});
  addEventListener('pointerup',()=>state.reelInput=0); addEventListener('contextmenu',e=>e.preventDefault()); addEventListener('keydown',e=>{if(e.code==='KeyB')cycleBait();if(e.code==='KeyR')state.reelInput=1;}); addEventListener('keyup',e=>{if(e.code==='KeyR')state.reelInput=0;});
}
function cycleBait(){ state.baitIndex=(state.baitIndex+1)%BAITS.length; lure.material.color.setHex(BAITS[state.baitIndex].color); message(BAITS[state.baitIndex].name); tone(520,.06); updateHud(); save(); }
function primaryAction(){ if(state.castCooldown>0)return; if(state.phase==='idle')cast(); else if(state.phase==='bite')hook(); else if(state.phase==='landed'){state.phase='idle';state.fish=null;bobber.visible=false;tensionWrap.classList.remove('show');} }
function getRodOriginDirection(){
  const origin=new THREE.Vector3(),dir=new THREE.Vector3(); if(renderer.xr.isPresenting){ rodTip.getWorldPosition(origin); controllerR.getWorldDirection(dir); dir.multiplyScalar(-1); return {origin,dir}; }
  origin.copy(camera.position); camera.getWorldDirection(dir); return {origin,dir};
}
function cast(){
  const {origin,dir}=getRodOriginDirection(); state.phase='casting'; state.castCooldown=.45; bobber.position.copy(origin); bobber.visible=true;
  const strength=10.5+state.rodLevel*1.2; state.castVelocity.copy(dir).multiplyScalar(strength); state.castVelocity.y=Math.max(4.4,state.castVelocity.y+5.6); state.lineLength=0; message('Cast'); tone(260,.05); haptic(.3,35);
}
function hook(){ if(!state.fish)return; state.phase='fighting'; state.tension=.42; state.fish.userData.stamina=1; state.fish.userData.burst=.5; tensionWrap.classList.add('show'); message(`Hooked ${state.fish.userData.species.name}!`,2); haptic(.85,110); tone(720,.12,.07); }
function addRipple(pos,color=0xbff7ff){ const ring=new THREE.Mesh(new THREE.RingGeometry(.06,.1,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.75,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.copy(pos); ring.position.y=.07; ring.userData.life=1; scene.add(ring); ripples.push(ring); }
function splash(pos,power=1){ addRipple(pos); for(let i=0;i<8*power;i++){ const p=new THREE.Mesh(new THREE.SphereGeometry(.015,5,4),new THREE.MeshBasicMaterial({color:0xc9f8ff,transparent:true})); p.position.copy(pos); p.userData={life:.6+Math.random()*.5,velocity:new THREE.Vector3((Math.random()-.5)*power,Math.random()*1.4*power,(Math.random()-.5)*power)}; scene.add(p); particles.push(p);} tone(150,.12,.04); }
function landFish(){
  const d=state.fish.userData; state.phase='landed'; state.coins+=Math.round(d.species.value*d.weight); state.xp+=Math.round(d.weight*12);
  const catchRecord={name:d.species.name,weight:d.weight,time:new Date().toISOString()}; state.catches.push(catchRecord); if(!state.best||d.weight>state.best.weight)state.best=catchRecord;
  message(`LANDED ${d.species.name} • ${d.weight.toFixed(1)} lb`,5); haptic(1,220); tone(880,.25,.08); scene.remove(state.fish); const i=fishes.indexOf(state.fish); if(i>=0)fishes.splice(i,1);
  setTimeout(spawnFish,1400); save(); updateHud();
}
function escapeFish(reason='The fish escaped!'){ message(reason,2.5); haptic(.6,140); tone(110,.18,.06); state.phase='idle'; state.fish=null; bobber.visible=false; tensionWrap.classList.remove('show'); }

function updateCasting(dt){
  if(state.phase!=='casting')return; state.castVelocity.y-=9.81*dt; bobber.position.addScaledVector(state.castVelocity,dt);
  if(bobber.position.y<=.08){ bobber.position.y=.08; if(Math.hypot(bobber.position.x,bobber.position.z)>WORLD.pondRadius-1){ const angle=Math.atan2(bobber.position.z,bobber.position.x); bobber.position.set(Math.cos(angle)*(WORLD.pondRadius-1),.08,Math.sin(angle)*(WORLD.pondRadius-1)); }
    state.phase='waiting'; state.biteTimer=0; splash(bobber.position,1.4); message('Waiting for a bite…'); }
}
function updateFish(dt){
  for(const f of fishes){ if(f===state.fish&&state.phase==='fighting')continue; const d=f.userData; d.wander+=dt; d.turn+=(Math.random()-.5)*dt*.35; d.turn*=.98; d.heading+=d.turn*dt+Math.sin(d.wander*.3)*dt*.05;
    f.rotation.y=-d.heading; f.position.x+=Math.cos(d.heading)*d.speed*dt; f.position.z+=Math.sin(d.heading)*d.speed*dt; f.position.y+=Math.sin(d.wander*1.3)*dt*.03;
    if(Math.hypot(f.position.x,f.position.z)>WORLD.pondRadius-1.2)d.heading+=Math.PI*.75;
    if(state.phase==='waiting'){ const flat=Math.hypot(f.position.x-bobber.position.x,f.position.z-bobber.position.z); const bait=BAITS[state.baitIndex]; const compatibility=d.species.baits[state.baitIndex];
      if(flat<3.6){ d.interest+=dt*bait.attraction*compatibility*(.55+Math.max(0,1-flat/4)); const target=tmpV.copy(bobber.position); target.y=f.position.y; f.position.lerp(target,.08*dt*bait.attraction);
        if(d.interest>1.6+Math.random()*2.1){ state.phase='bite'; state.fish=f; state.biteTimer=1.65; splash(bobber.position,.7); message('BITE — SET THE HOOK!',1.7); haptic(.75,90); tone(640,.08,.06); }}
      else d.interest=Math.max(0,d.interest-dt*.25); }
  }
  if(state.phase==='bite'){ state.biteTimer-=dt; bobber.position.y=.04+Math.sin(state.time*28)*.035; if(state.biteTimer<=0)escapeFish('Too slow — it dropped the bait'); }
}
function updateFight(dt){
  if(state.phase!=='fighting'||!state.fish)return; const f=state.fish,d=f.userData; const lineStrength=1+.16*(state.lineLevel-1),rodPower=1+.14*(state.rodLevel-1);
  d.burst-=dt; if(d.burst<=0){d.burst=.5+Math.random()*1.5; d.turn+=(Math.random()-.5)*2.4;}
  const surge=(.34+Math.abs(Math.sin(state.time*(1.4+d.species.power)))*.34+Math.random()*.13)*d.species.power;
  state.tension+=dt*(surge/lineStrength-state.reelInput*.82*rodPower); state.tension=THREE.MathUtils.clamp(state.tension,0,1.25);
  if(state.reelInput){ d.stamina-=dt*(.10+.025*state.rodLevel)*(1.15-state.tension*.35); const toward=tmpV.copy(player.position); toward.y=f.position.y; toward.sub(f.position).normalize(); f.position.addScaledVector(toward,dt*(.34+.08*state.rodLevel)); reel.rotation.x+=dt*14; }
  else d.stamina=Math.min(1,d.stamina+dt*.035);
  f.userData.heading+=f.userData.turn*dt; f.position.x+=Math.cos(f.userData.heading)*surge*dt*.34; f.position.z+=Math.sin(f.userData.heading)*surge*dt*.34;
  bobber.position.copy(f.position); bobber.position.y=.08; tensionEl.style.width=`${Math.min(100,state.tension*100)}%`;
  tensionEl.style.background=state.tension>.82?'#ff4f57':state.tension<.2?'#f6c85f':'#59e2b6';
  if(Math.random()<dt*3)splash(bobber.position,.45); if(state.tension>1.02){escapeFish('Line snapped under too much tension');return;} if(state.tension<.055&&Math.random()<dt*.35){escapeFish('The hook went slack');return;}
  const distance=Math.hypot(f.position.x-player.position.x,f.position.z-player.position.z); if(d.stamina<=0&&distance<4.5)landFish();
}
function updateLine(){
  if(!lineMesh||state.phase==='idle'||!bobber.visible){lineMesh.visible=false;return;} lineMesh.visible=true; const start=new THREE.Vector3(); rodTip.getWorldPosition(start); const end=bobber.position;
  const points=[]; for(let i=0;i<=12;i++){ const t=i/12,p=start.clone().lerp(end,t); const sag=Math.sin(Math.PI*t)*Math.min(1.2,start.distanceTo(end)*.045)*(state.phase==='fighting'?.25:1); p.y-=sag; points.push(p); }
  lineMesh.geometry.setFromPoints(points);
}
function updateRodPose(){ if(renderer.xr.isPresenting){ gripR.getWorldPosition(tmpV); gripR.getWorldQuaternion(rod.quaternion); camera.remove(rod); scene.add(rod); rod.position.copy(tmpV); rod.rotation.z-=Math.PI/2; rod.position.y-=.05; } }
function updateLocomotion(dt){ const session=renderer.xr.getSession(); if(!session)return; for(const source of session.inputSources){ if(!source.gamepad)continue; const a=source.gamepad.axes; if(source.handedness==='left'&&a.length>=4){ const x=a[2]||0,y=a[3]||0; camera.getWorldDirection(tmpV); tmpV.y=0; tmpV.normalize(); tmpV2.set(1,0,0).applyQuaternion(camera.quaternion); tmpV2.y=0; tmpV2.normalize(); player.position.addScaledVector(tmpV,-y*dt*2.25); player.position.addScaledVector(tmpV2,x*dt*2.25); if(player.position.length()>31)player.position.setLength(31); } } }
function updateWorld(dt){
  state.dayTime=(state.dayTime+dt*.0006)%1; const phi=THREE.MathUtils.degToRad(90-state.dayTime*150),theta=THREE.MathUtils.degToRad(180); const sunPos=new THREE.Vector3().setFromSphericalCoords(1,phi,theta);
  sky.material.uniforms.sunPosition.value.copy(sunPos); sun.position.copy(sunPos).multiplyScalar(40); water.material.uniforms.sunDirection.value.copy(sun.position).normalize(); water.material.uniforms.time.value+=dt*.7;
  const daylight=THREE.MathUtils.clamp(sunPos.y*.8+.35,.18,1); renderer.toneMappingExposure=.55+daylight*.6; scene.fog.color.setHSL(.53,.25,.28+daylight*.36); scene.background.copy(scene.fog.color);
  for(const b of birds){ const d=b.userData,a=state.time*d.speed+d.phase; b.position.set(Math.cos(a)*d.radius,d.height+Math.sin(a*2)*.5,Math.sin(a)*d.radius); b.rotation.y=-a; }
  for(const bug of insects){ const d=bug.userData,t=state.time+d.phase; bug.position.set(d.center.x+Math.sin(t*1.7)*.5,d.center.y+Math.sin(t*2.6)*.25,d.center.z+Math.cos(t*1.3)*.5); }
}
function updateEffects(dt){
  for(let i=ripples.length-1;i>=0;i--){const r=ripples[i];r.userData.life-=dt;r.scale.multiplyScalar(1+dt*1.6);r.material.opacity=Math.max(0,r.userData.life*.75);if(r.userData.life<=0){scene.remove(r);ripples.splice(i,1);}}
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.userData.life-=dt;p.userData.velocity.y-=3.2*dt;p.position.addScaledVector(p.userData.velocity,dt);p.material.opacity=Math.max(0,p.userData.life);if(p.userData.life<=0){scene.remove(p);particles.splice(i,1);}}
}
function loop(){ const dt=Math.min(clock.getDelta(),.045); state.time+=dt; state.castCooldown=Math.max(0,state.castCooldown-dt); if(state.messageTimer>0&&(state.messageTimer-=dt)<=0)statusEl.classList.remove('show');
  updateRodPose(); updateLocomotion(dt); updateWorld(dt); updateCasting(dt); updateFish(dt); updateFight(dt); updateEffects(dt); updateLine(); renderer.render(scene,camera); }
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}

document.querySelector('#start').addEventListener('click',init);
document.querySelector('#reset').addEventListener('click',()=>{if(confirm('Reset fishing progress?')){localStorage.clear();location.reload();}});
