const KEY='bp4-expedition';
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{rank:1,tokens:0,streak:0,discoveries:[],contracts:[]}}catch{return{rank:1,tokens:0,streak:0,discoveries:[],contracts:[]}}};
const state=load();
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const habitats=['North Pine Trail','Marsh Hide','Old Creek Crossing','Rocky Point','Deepwater Cove','Cabin Ridge'];
const wildlife=['White-tailed Deer','Red Fox','Great Blue Heron','River Otter','Painted Turtle','Barred Owl','Wild Turkey','Beaver'];
const contracts=[
 {text:'Land any 3 fish',target:3,reward:120,type:'catch'},
 {text:'Discover 2 reserve habitats',target:2,reward:90,type:'discover'},
 {text:'Catch a fish over 5 lb',target:1,reward:180,type:'trophy'},
 {text:'Visit the tackle shop',target:1,reward:60,type:'shop'}
];
if(!state.contracts.length)state.contracts=contracts.slice(0,3).map((x,i)=>({...x,id:Date.now()+i,progress:0,done:false}));
const style=document.createElement('style');style.textContent=`#expedition{position:fixed;left:14px;top:94px;z-index:14;width:min(330px,90vw);padding:14px;border-radius:16px;background:#07151ed9;border:1px solid #75e8ce33;color:#eefcff;font:12px system-ui;backdrop-filter:blur(12px);pointer-events:auto}#expedition h3{margin:0 0 8px;color:#72efd0;letter-spacing:.09em}#expedition .row{display:flex;justify-content:space-between;margin:5px 0}#expedition button{width:100%;margin-top:8px;padding:9px;border:0;border-radius:9px;background:#63e0b5;color:#052017;font-weight:900}#expedition .contract{padding:7px 0;border-top:1px solid #ffffff14}#expedition.min .body{display:none}`;document.head.appendChild(style);
const el=document.createElement('section');el.id='expedition';el.innerHTML=`<h3>RESERVE EXPEDITION</h3><div class="body"><div class="row"><span>Ranger rank</span><b id="ex-rank"></b></div><div class="row"><span>Trail tokens</span><b id="ex-token"></b></div><div class="row"><span>Discovery streak</span><b id="ex-streak"></b></div><div id="ex-contracts"></div><button id="ex-scout">Scout New Habitat</button><button id="ex-shop">Reserve Outfitter</button></div>`;document.body.appendChild(el);
el.querySelector('h3').onclick=()=>el.classList.toggle('min');
function toast(t){let n=document.querySelector('#status');if(n){n.textContent=t;n.classList.add('show');setTimeout(()=>n.classList.remove('show'),2200)}}
function render(){el.querySelector('#ex-rank').textContent=state.rank;el.querySelector('#ex-token').textContent=state.tokens;el.querySelector('#ex-streak').textContent=state.streak;el.querySelector('#ex-contracts').innerHTML=state.contracts.map(c=>`<div class="contract">${c.done?'✓ ':''}${c.text}<br><small>${c.progress}/${c.target} • ${c.reward} tokens</small></div>`).join('');save()}
function advance(type,n=1){for(const c of state.contracts){if(!c.done&&c.type===type){c.progress=Math.min(c.target,c.progress+n);if(c.progress>=c.target){c.done=true;state.tokens+=c.reward;state.rank=1+Math.floor(state.tokens/400);toast(`CONTRACT COMPLETE +${c.reward} TOKENS`)}}}render()}
el.querySelector('#ex-scout').onclick=()=>{const h=habitats[Math.floor(Math.random()*habitats.length)],a=wildlife[Math.floor(Math.random()*wildlife.length)],id=`${h}:${a}`;if(!state.discoveries.includes(id)){state.discoveries.push(id);state.tokens+=25;state.streak++;advance('discover');toast(`${h} discovered • ${a} sighted +25`)}else toast(`${a} tracks found at ${h}`);render()};
el.querySelector('#ex-shop').onclick=()=>{advance('shop');const coins=Number(JSON.parse(localStorage.getItem('bp3-coins')||'0'));const cost=150;if(coins>=cost){localStorage.setItem('bp3-coins',JSON.stringify(coins-cost));state.tokens+=40;toast('OUTFITTER BUNDLE: bait, trail map, +40 tokens')}else toast(`Outfitter bundle costs ${cost} coins`);render()};
let prior=0;setInterval(()=>{let catches=[];try{catches=JSON.parse(localStorage.getItem('bp3-catches')||'[]')}catch{}if(catches.length>prior){const newest=catches.slice(prior);advance('catch',newest.length);if(newest.some(x=>x.weight>=5))advance('trophy');prior=catches.length}},1200);
render();