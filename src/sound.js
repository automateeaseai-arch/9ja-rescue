// Sound files (all CC0, from Kenney's starter kits and the uisfx "organic"
// pack; see README) and the one shared audio context every sound goes
// through, so a single switch mutes the whole game.
//
// Browsers only allow sound after a touch or key press: the context is made
// on the first one. Files are fetched after the game starts (about 0.6 MB),
// so they never slow the first load; a sound that isn't loaded yet is skipped.

const BASE = import.meta.env.BASE_URL + 'sounds/';
const FILES = {
  steps: 'steps.mp3', land: 'land.mp3', impact: 'impact.mp3',
  truck: 'engine-truck.mp3', bike: 'engine-bike.mp3', ambience: 'ambience.mp3',
  press: 'ui/press.mp3', back: 'ui/back.mp3', select: 'ui/select.mp3', purchase: 'ui/purchase.mp3',
  error: 'ui/error.mp3', success: 'ui/success.mp3', achievement: 'ui/achievement.mp3', bonus: 'ui/bonus.mp3',
};
// Start of each footstep in steps.mp3 (seconds); each lasts about 0.14 s.
const STEPS = [0.0, 0.388, 0.76, 1.2, 1.635, 2.026, 2.434, 2.848, 3.23, 3.637, 4.01, 4.45];
const MUTE_KEY = '9ja.muted.v1';

let ctx = null, master = null, game = null, muted = false, active = false;
const buffers = {};
const loading = {};
const stats = {};   // plays per sound, for the test hooks
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked */ }

function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    // Game sounds go through their own gain, silenced in menus and on pause.
    game = ctx.createGain();
    game.gain.value = active ? 1 : 0;
    game.connect(master);
    ['press', 'back', 'select', 'purchase', 'error', 'success'].forEach(load);
  }
  if (ctx.state === 'suspended') ctx.resume();
}
// Quiet while the page is in the background.
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else ctx.resume();
});
for (const ev of ['touchstart', 'pointerdown', 'mousedown', 'keydown']) addEventListener(ev, unlock, { passive: true, capture: true });

function load(name) {
  if (buffers[name] || loading[name] || !ctx) return;
  loading[name] = fetch(BASE + FILES[name])
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then((b) => new Promise((ok, bad) => ctx.decodeAudioData(b, ok, bad)))
    .then((buf) => { buffers[name] = buf; })
    .catch(() => { setTimeout(() => { delete loading[name]; }, 20000); }); // try again later
}

const ready = () => ctx && ctx.state === 'running';

export const sound = {
  stats,
  get loaded() { return Object.keys(buffers); },
  get context() { return ready() ? ctx : null; },
  // Where synthesised sounds (fx.js) connect, so mute covers them too.
  get output() { return game; },
  // Game sounds play only while the game runs (not in menus or on pause).
  setGameActive(on) {
    if (on === active) return;
    active = on;
    if (game) game.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.08);
  },
  get muted() { return muted; },
  setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
  },
  // Fetch the game's sounds (the menu ones are fetched on first use).
  preload(names = Object.keys(FILES)) {
    const go = () => { if (ctx) names.forEach(load); else setTimeout(go, 500); };
    go();
  },
  // A one-shot file sound. opts: volume, rate, offset/duration (play part of the file), pan.
  play(name, { volume = 1, rate = 1, offset = 0, duration, pan = 0, ui = false } = {}) {
    if (!ready()) return;
    const buf = buffers[name];
    if (!buf) { load(name); return; }
    stats[name] = (stats[name] || 0) + 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = volume;
    let out = src.connect(g);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; out = out.connect(p); }
    out.connect(ui ? master : game);
    src.start(ctx.currentTime, offset, duration);
  },
  // One footstep from the set, picked at random (never the same twice running).
  step(volume, rate = 1) {
    let i;
    do { i = Math.floor(Math.random() * STEPS.length); } while (i === this._lastStep);
    this._lastStep = i;
    this.play('steps', { volume, rate: rate * (0.92 + Math.random() * 0.16), offset: STEPS[i], duration: 0.16 });
  },
  // A looping file sound (engine, ambience). Returns { set(volume, rate), stop() };
  // volume and rate glide to the new values. Starts once its file has loaded.
  loop(name) {
    let node = null, vol = 0, rate = 1;
    const start = () => {
      if (node || !ready() || !buffers[name]) { if (!buffers[name]) load(name); return; }
      const buf = buffers[name];
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      // MP3 files carry a few ms of silence at each end: loop inside it.
      src.loopStart = Math.min(0.05, buf.duration / 4);
      src.loopEnd = Math.max(src.loopStart + 0.1, buf.duration - 0.05);
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(game);
      src.start(ctx.currentTime, src.loopStart + Math.random() * (src.loopEnd - src.loopStart));
      node = { src, g };
      stats['loop:' + name] = (stats['loop:' + name] || 0) + 1;
    };
    return {
      set(v, r = 1) {
        vol = v; rate = r;
        if (!node) { if (v > 0.005) start(); if (!node) return; }
        const t = ctx.currentTime;
        node.g.gain.setTargetAtTime(v, t, 0.15);
        node.src.playbackRate.setTargetAtTime(r, t, 0.15);
      },
      stop() {
        if (!node) return;
        const n = node;
        node = null;
        n.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        setTimeout(() => { try { n.src.stop(); } catch { /* already stopped */ } }, 600);
      },
      get volume() { return vol; },
    };
  },
  // Menu sounds.
  ui(name, volume = 0.6) { this.play(name, { volume, ui: true }); },
};
