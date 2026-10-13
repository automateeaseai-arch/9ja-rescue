// Background sound for where the player is: birdsong and breeze everywhere
// (Kenney's CC0 ambience loop), insects that swell in the rainforest valley
// (built in code), rushing water near rivers and the lake, quieter in caves
// and fading out high in the air.
import { sound } from './sound.js';
import { valleyBlend } from './land.js';

// opts: waterAt(x, z) -> { level, ground } | null
export function createAmbience({ waterAt }) {
  const birds = sound.loop('ambience');
  let insects = null, river = null, nearWater = 0, probeT = 0;

  // A looped noise through a filter, for insects and water.
  function noiseLoop(type, freq, q) {
    const ctx = sound.context;
    if (!ctx) return null;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(sound.output);
    src.start();
    return { src, f, g };
  }

  function makeInsects() {
    const n = noiseLoop('bandpass', 5200, 9);
    if (!n) return null;
    // Cicada-like pulsing: a fast wobble on the volume.
    const ctx = sound.context;
    const pulse = ctx.createGain();
    pulse.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 38;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(pulse.gain);
    lfo.start();
    n.g.disconnect();
    n.g.connect(pulse).connect(sound.output);
    return n;
  }

  // How much water is around the player (0..1), from a ring of probes.
  function probeWater(p) {
    let wet = 0, n = 0;
    for (const r of [0, 9, 20]) {
      for (let a = 0; a < (r ? 8 : 1); a++) {
        const w = waterAt(p.x + Math.cos(a * 0.785) * r, p.z + Math.sin(a * 0.785) * r);
        n++;
        if (w && w.level - w.ground > 0.25) wet += r === 0 ? 3 : r === 9 ? 1.5 : 1;
      }
    }
    return Math.min(1, wet / 9);
  }

  return {
    // altitude: metres above ground in the air drop; cave: 0..1 (valley caves).
    update(dt, p, { altitude = 0, cave = 0, driving = false } = {}) {
      if (!sound.context) return;
      const v = valleyBlend(p.z);
      const air = Math.max(0, 1 - altitude / 60);
      const inside = 1 - cave * 0.8;
      birds.set(0.32 * air * inside * (driving ? 0.6 : 1));
      if (!insects) insects = makeInsects();
      if (!river) river = noiseLoop('lowpass', 900, 0.7);
      if ((probeT -= dt) <= 0) { probeT = 0.5; nearWater = probeWater(p); }
      const t = sound.context.currentTime;
      if (insects) insects.g.gain.setTargetAtTime(0.012 + 0.05 * v * air * inside, t, 0.8);
      if (river) river.g.gain.setTargetAtTime(0.16 * nearWater * air, t, 0.6);
    },
  };
}
