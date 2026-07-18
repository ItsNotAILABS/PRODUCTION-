const $ = (selector) => document.querySelector(selector);

const profile = {
  get coins() { return Number(localStorage.getItem('bpvr2-coins') || 0); },
  get xp() { return Number(localStorage.getItem('bpvr2-xp') || 0); },
  get rod() { return Number(localStorage.getItem('bpvr2-rod') || 1); },
  get line() { return Number(localStorage.getItem('bpvr2-line') || 1); },
  get catches() {
    try { return JSON.parse(localStorage.getItem('bpvr2-catches') || '[]'); }
    catch { return []; }
  },
};

function setStatus(text, tone = 'normal') {
  const node = $('#preflight');
  if (!node) return;
  node.textContent = text;
  node.dataset.tone = tone;
}

async function detectXR() {
  if (!navigator.xr) {
    setStatus('WebXR is unavailable here. Desktop preview will still work.', 'warn');
    return false;
  }
  try {
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    setStatus(
      supported ? 'Quest-ready: immersive VR is available.' : 'Desktop preview mode: immersive VR was not detected.',
      supported ? 'good' : 'warn',
    );
    return supported;
  } catch {
    setStatus('WebXR capability check could not complete.', 'warn');
    return false;
  }
}

function renderJournal() {
  const list = $('#journal-list');
  if (!list) return;
  const catches = profile.catches.slice(-8).reverse();
  list.innerHTML = catches.length
    ? catches.map((item) => `
      <div class="catch-row">
        <strong>${item.name}</strong>
        <span>${Number(item.weight || 0).toFixed(1)} lb</span>
      </div>`).join('')
    : '<div class="empty">Land a fish to begin the trophy journal.</div>';

  $('#profile-coins').textContent = profile.coins.toLocaleString();
  $('#profile-xp').textContent = profile.xp.toLocaleString();
  $('#profile-gear').textContent = `Rod ${profile.rod} / Line ${profile.line}`;
}

function buyUpgrade(type) {
  const current = type === 'rod' ? profile.rod : profile.line;
  const cost = (type === 'rod' ? 160 : 125) * current;
  if (profile.coins < cost) {
    setStatus(`You need ${cost.toLocaleString()} coins for that ${type} upgrade.`, 'warn');
    return;
  }
  localStorage.setItem('bpvr2-coins', String(profile.coins - cost));
  localStorage.setItem(`bpvr2-${type}`, String(current + 1));
  renderJournal();
  setStatus(`${type === 'rod' ? 'Rod' : 'Line'} upgraded to level ${current + 1}. Reloading the pond applies it.`, 'good');
}

function installAmbientAudio() {
  let context;
  let master;
  let started = false;

  const start = () => {
    if (started) return;
    started = true;
    try {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.035;
      master.connect(context.destination);

      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * 0.18;
      }
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 720;
      noise.connect(lowpass).connect(master);
      noise.start();

      const bird = () => {
        if (!context) return;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        const startAt = context.currentTime;
        oscillator.frequency.setValueAtTime(1450 + Math.random() * 500, startAt);
        oscillator.frequency.exponentialRampToValueAtTime(2200 + Math.random() * 500, startAt + 0.12);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.018, startAt + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.2);
        oscillator.connect(gain).connect(master);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.22);
        setTimeout(bird, 5500 + Math.random() * 9000);
      };
      setTimeout(bird, 1800);
    } catch {
      // Audio is enhancement-only. The game remains playable without it.
    }
  };

  document.addEventListener('pointerdown', start, { once: true });
  document.addEventListener('keydown', start, { once: true });
}

function addPerformanceProbe() {
  const display = $('#performance');
  if (!display) return;
  let frames = 0;
  let last = performance.now();
  const tick = (now) => {
    frames += 1;
    if (now - last >= 1000) {
      display.textContent = `${frames} FPS`;
      display.dataset.tone = frames < 55 ? 'warn' : 'good';
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function setupPanels() {
  const journalButton = $('#journal');
  const journalPanel = $('#journal-panel');
  journalButton?.addEventListener('click', () => {
    renderJournal();
    journalPanel?.classList.toggle('open');
  });
  $('#journal-close')?.addEventListener('click', () => journalPanel?.classList.remove('open'));
  $('#upgrade-rod')?.addEventListener('click', () => buyUpgrade('rod'));
  $('#upgrade-line')?.addEventListener('click', () => buyUpgrade('line'));
}

function registerOfflineShell() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function watchLaunch() {
  $('#start')?.addEventListener('click', () => {
    document.body.classList.add('pond-loaded');
    setTimeout(renderJournal, 800);
  });
}

detectXR();
renderJournal();
setupPanels();
installAmbientAudio();
addPerformanceProbe();
registerOfflineShell();
watchLaunch();
