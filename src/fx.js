// Combat effects built in code: bullet tracers, muzzle flashes and
// synthesised sounds (gunshot, punch). No downloads.
import * as THREE from 'three';

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

  // Sound: created on the first touch or key press (browsers require it).
  let ctx = null, noise = null, windNode = null;
  const unlock = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
    }
    if (ctx.state === 'suspended') ctx.resume();
  };
  for (const ev of ['touchstart', 'mousedown', 'keydown']) addEventListener(ev, unlock, { passive: true });

  function play(volume, freq, length) {
    if (!ctx || ctx.state !== 'running' || volume < 0.02) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + length + 0.05);
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
    },
    punch() { play(0.6, 260, 0.12); },
    // Grenade: a deep boom with a long tail, quieter and duller far away.
    boom(distance = 0) {
      play(1.0 / (1 + distance * 0.04), distance > 50 ? 260 : 600, 1.2);
      play(0.6 / (1 + distance * 0.05), 1800, 0.18);
    },
    // Two rising notes when a first-aid kit is picked up.
    chime() {
      if (!ctx || ctx.state !== 'running') return;
      [660, 990].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * 0.1;
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.4);
      });
    },
    // Continuous air noise for the air drop: volume 0..1, pitch as a filter
    // frequency (low drone in the plane, rushing wind in freefall).
    wind(volume, freq = 800) {
      if (!ctx || ctx.state !== 'running') return;
      if (!windNode) {
        if (volume < 0.01) return;
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(f).connect(g).connect(ctx.destination);
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
