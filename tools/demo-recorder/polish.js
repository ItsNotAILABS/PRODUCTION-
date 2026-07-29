#!/usr/bin/env node
// Generic ffmpeg post-processor for demo-recorder footage: turns a raw
// Playwright screen capture into a polished demo clip (title/outro cards,
// punch-in zooms, synced captions) — built entirely from the real recorded
// frames. It never adds content that isn't literally in the source video;
// every caption and crop region in the config must be verified against
// extracted frames first (see the skill for the frame-extraction step).
//
// Usage:
//   node polish.js --config examples/foo.polish.json
//
// Config schema — see examples/*.polish.json for real, working examples:
// {
//   "input": "raw.webm",
//   "output": "polished.mp4",
//   "font": "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  // optional
//   "videoSize": { "width": 1920, "height": 1080 },                  // optional, this is the default
//   "fadeDur": 0.12,                                                  // optional
//   "captionStyle": { "fontsize": 32, "fontcolor": "white",
//                      "boxcolor": "black@0.55", "boxborderw": 18 },  // optional
//   "intro": { "duration": 1.8, "bg": "0xF3F1EC",
//              "lines": [ { "text": "TITLE", "size": 90, "color": "0x1A1A1A", "dy": -90 } ] },
//   "outro": { ...same shape as intro... },
//   "segments": [
//     { "start": 0.0, "end": 4.0, "caption": "what is genuinely on screen here" },
//     { "start": 8.0, "end": 11.0, "caption": "...", "crop": { "w": 960, "h": 540, "x": 80, "y": 400 } }
//   ]
// }
//
// crop is optional per segment: { w, h, x, y } is cropped from the source
// frame then scaled back up to videoSize — a punch-in on a real region of
// the real footage. Get x/y/w/h by extracting a frame at that timestamp
// (ffmpeg -ss T -i raw.webm -frames:v 1 check.png) and reading real pixel
// coordinates off it — never guess them.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config') out.config = argv[++i];
    else throw new Error(`unknown arg: ${argv[i]}`);
  }
  if (!out.config) throw new Error('--config is required');
  return out;
}

function writeTextFile(tmpDir, id, text) {
  const p = path.join(tmpDir, `cap_${id}.txt`);
  fs.writeFileSync(p, text, 'utf8');
  // ':' would otherwise be parsed as a filter-option separator by ffmpeg.
  return p.replace(/:/g, '\\:');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfgPath = path.resolve(args.config);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const baseDir = path.dirname(cfgPath);

  const input = path.resolve(baseDir, cfg.input);
  const output = path.resolve(baseDir, cfg.output);
  const font = cfg.font || '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  const size = cfg.videoSize || { width: 1920, height: 1080 };
  const fadeDur = cfg.fadeDur != null ? cfg.fadeDur : 0.12;
  const capStyle = Object.assign(
    { fontsize: 32, fontcolor: 'white', boxcolor: 'black@0.55', boxborderw: 18 },
    cfg.captionStyle || {}
  );

  if (!fs.existsSync(input)) throw new Error(`input not found: ${input}`);
  if (!fs.existsSync(font)) throw new Error(`font not found: ${font}`);
  if (!Array.isArray(cfg.segments) || cfg.segments.length === 0) {
    throw new Error('config.segments must be a non-empty array');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-polish-'));
  const inputs = ['-i', input]; // main is always input index === card slate count
  const cardInputs = [];
  let cardIdx = 0;
  let mainInputIdx = 0;

  function addCardInput(card) {
    const idx = cardInputs.length + 1; // input 0 reserved for main below once we know order
    cardInputs.push(card);
    return idx;
  }

  // Build ffmpeg -i list: [intro?] [main] [outro?] so labels are simple.
  const ffArgs = [];
  const chains = [];
  let nextInput = 0;
  let introIdx = null, outroIdx = null;

  if (cfg.intro) {
    ffArgs.push('-f', 'lavfi', '-i', `color=c=${cfg.intro.bg}:s=${size.width}x${size.height}:d=${cfg.intro.duration}:r=25`);
    introIdx = nextInput++;
  }
  ffArgs.push('-i', input);
  mainInputIdx = nextInput++;
  if (cfg.outro) {
    ffArgs.push('-f', 'lavfi', '-i', `color=c=${cfg.outro.bg}:s=${size.width}x${size.height}:d=${cfg.outro.duration}:r=25`);
    outroIdx = nextInput++;
  }

  const labels = [];

  function slateChain(idx, slate, label) {
    let chain = `[${idx}:v]`;
    const drawTexts = slate.lines.map((line) => {
      const tf = writeTextFile(tmpDir, `${label}_${line.text.slice(0, 8).replace(/\W/g, '')}_${Math.random().toString(36).slice(2, 6)}`, line.text);
      return `drawtext=fontfile=${font}:textfile=${tf}:fontcolor=${line.color}:fontsize=${line.size}:x=(w-text_w)/2:y=(h/2)+(${line.dy})`;
    });
    chain += drawTexts.join(',');
    chain += `,fade=t=in:st=0:d=0.3,fade=t=out:st=${(slate.duration - 0.3).toFixed(2)}:d=0.3`;
    chain += `[${label}]`;
    chains.push(chain);
    labels.push(`[${label}]`);
  }

  if (introIdx !== null) slateChain(introIdx, cfg.intro, 'intro');

  cfg.segments.forEach((seg, i) => {
    const label = `seg${i}`;
    const dur = seg.end - seg.start;
    let chain = `[${mainInputIdx}:v]trim=${seg.start}:${seg.end},setpts=PTS-STARTPTS`;
    if (seg.crop) {
      const c = seg.crop;
      chain += `,crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${size.width}:${size.height}`;
    }
    const tf = writeTextFile(tmpDir, `${label}_${Math.random().toString(36).slice(2, 6)}`, seg.caption);
    chain += `,drawtext=fontfile=${font}:textfile=${tf}:fontcolor=${capStyle.fontcolor}:fontsize=${capStyle.fontsize}:box=1:boxcolor=${capStyle.boxcolor}:boxborderw=${capStyle.boxborderw}:x=(w-text_w)/2:y=h-140`;
    const outFade = Math.max(0, dur - fadeDur);
    chain += `,fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${outFade.toFixed(3)}:d=${fadeDur}`;
    chain += `[${label}]`;
    chains.push(chain);
    labels.push(`[${label}]`);
  });

  if (outroIdx !== null) slateChain(outroIdx, cfg.outro, 'outro');

  chains.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[outv]`);

  const filterComplex = chains.join(';\n');

  const finalArgs = [
    '-y',
    ...ffArgs,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-r', '25',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output,
    '-loglevel', 'error',
  ];

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const res = spawnSync('ffmpeg', finalArgs, { stdio: 'inherit' });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (res.status !== 0) {
    throw new Error(`ffmpeg exited with status ${res.status}`);
  }
  console.log('DONE:', output);
}

main();
