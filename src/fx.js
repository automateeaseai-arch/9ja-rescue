// Combat effects built in code: bullet tracers, muzzle flashes and
// synthesised sounds (gunshot, punch, reload, splash, wind).
import * as THREE from 'three';
import { sound } from './sound.js';

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.3, 'rgba(255,200,90,0.9)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFx(scene) {
  // Tracers: thin glowing rods, pooled.
  const rodGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 4, 1, true);
  rodGeo.rotateX(Math.PI / 2);
  rodGeo.translate(0, 0, 0.5);
  const tracers = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(rodGeo, new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    m.visible = false;
    m.frustumCulled = false;
    m.userData.t = 0;
    scene.add(m);
    tracers.push(m);
  }
  const flashMat = new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const flashes = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(flashMat);
    s.visible = false;
    s.userData.t = 0;
    scene.add(s);
    flashes.push(s);
  }
  let ti = 0, fi = 0;

  // Synthesised sounds go through the shared audio context (sound.js), so
  // the mute switch covers them. The noise burst is made once.
  let ctx = null, noise = null, windNode = null, out = null;
  const live = () => {
    const c = sound.context;
    if (!c) return false;
    if (!noise) {
      ctx = c;
      out = sound.output;
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
    }
    return true;
  };

  function play(volume, freq, length, delay = 0, type = 'lowpass') {
    if (!live() || volume < 0.02) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + length + 0.05);
  }

  // A short falling tone: the body of a nearby gunshot.
  function thump(volume, freq, length) {
    if (!live() || volume < 0.02) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + length);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + length + 0.05);
  }

  return {
    tracer(from, to) {
      const m = tracers[ti++ % tracers.length];
      m.position.copy(from);
      m.lookAt(to);
      m.scale.set(1, 1, from.distanceTo(to));
      m.material.opacity = 0.9;
      m.userData.t = 0.07;
      m.visible = true;
    },
    flash(at) {
      const s = flashes[fi++ % flashes.length];
      s.position.copy(at);
      s.scale.setScalar(0.3 + Math.random() * 0.15);
      s.material.rotation = Math.random() * 6;
      s.userData.t = 0.05;
      s.visible = true;
    },
    // Volume falls off with distance from the listener (the player).
    gunshot(distance = 0) {
      const v = 0.5 / (1 + distance * 0.06);
      play(v, distance > 40 ? 900 : 2600, 0.25 + Math.min(distance, 60) * 0.004);
      // Close by, a deep thump under the crack; far away, a rolling echo.
      if (distance < 30) thump(v * 0.9, 95, 0.16);
      else play(v * 0.5, 500, 0.9, 0.12);
    },
    // Magazine out, then in and the bolt pulled (spread over the reload time).
    reload(secs = 2) {
      const k = secs / 2;
      play(0.3, 2400, 0.05, 0.05 * k, 'bandpass');
      play(0.25, 1400, 0.08, 0.35 * k, 'bandpass');
      play(0.35, 2600, 0.05, 1.45 * k, 'bandpass');
      play(0.4, 1800, 0.06, 1.75 * k, 'bandpass');
      play(0.3, 3000, 0.04, 1.85 * k, 'bandpass');
    },
    // A bullet landing on a guard: a short, bright tick.
    hitTick() { play(0.45, 3800, 0.04, 0.03, 'bandpass'); play(0.3, 1200, 0.05, 0.03); },
    // A foot or a stroke in water.
    paddle(volume = 0.3) { play(volume, 900 + Math.random() * 500, 0.22); play(volume * 0.5, 2600, 0.08); },
    punch() { play(0.6, 260, 0.12); },
    // A blade cutting the air.
    swish() { play(0.35, 3200, 0.16); },
    // Hitting water: a bright slap with a softer wash after it.
    splash() { play(0.8, 1600, 0.35); play(0.45, 520, 1.1); },
    // Grenade: a deep boom with a long tail, quieter and duller far away.
    boom(distance = 0) {
      play(1.0 / (1 + distance * 0.04), distance > 50 ? 260 : 600, 1.2);
      play(0.6 / (1 + distance * 0.05), 1800, 0.18);
    },
    // Two rising notes when a first-aid kit is picked up.
    chime() {
      if (!live()) return;
      [660, 990].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.1;
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.4);
      });
    },
    // Continuous air noise for the air drop: volume 0..1, pitch as a filter
    // frequency (low drone in the plane, rushing wind in freefall).
    wind(volume, freq = 800) {
      if (!live()) return;
      if (!windNode) {
        if (volume < 0.01) return;
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(f).connect(g).connect(out);
        src.start();
        windNode = { src, f, g };
      }
      const t = ctx.currentTime;
      windNode.g.gain.setTargetAtTime(volume * 0.5, t, 0.2);
      windNode.f.frequency.setTargetAtTime(freq, t, 0.2);
    },
    update(dt) {
      for (const m of tracers) {
        if (!m.visible) continue;
        m.userData.t -= dt;
        m.material.opacity = Math.max(0, m.userData.t / 0.07) * 0.9;
        if (m.userData.t <= 0) m.visible = false;
      }
      for (const s of flashes) {
        if (!s.visible) continue;
        s.userData.t -= dt;
        if (s.userData.t <= 0) s.visible = false;
      }
    },
  };
}
