// Small maths helpers shared by the environment kit.
import * as THREE from 'three';

export { makeRandom } from '../world.js';

export const smooth = THREE.MathUtils.smoothstep;
export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;

// Value noise in 2D, deterministic, roughly 0..1.
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function fbm2(x, z, octaves = 4) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * f, z * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

// A path through the world: smoothed through its control points, with the
// distance to it (and how far along it) cheap to look up.
export class Path {
  constructor(points, { closed = false, spacing = 1.5 } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z, y = 0]) => new THREE.Vector3(x, y, z)), closed, 'centripetal');
    const n = Math.max(2, Math.ceil(curve.getLength() / spacing));
    this.pts = curve.getSpacedPoints(n);
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
    // Coarse bounding box for early rejection.
    this.min = new THREE.Vector2(Infinity, Infinity);
    this.max = new THREE.Vector2(-Infinity, -Infinity);
    for (const p of this.pts) {
      this.min.x = Math.min(this.min.x, p.x); this.min.y = Math.min(this.min.y, p.z);
      this.max.x = Math.max(this.max.x, p.x); this.max.y = Math.max(this.max.y, p.z);
    }
    // Segments bucketed in a coarse grid so nearby lookups stay fast.
    this.cell = 12;
    this.grid = new Map();
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const x0 = Math.floor(Math.min(a.x, b.x) / this.cell), x1 = Math.floor(Math.max(a.x, b.x) / this.cell);
      const z0 = Math.floor(Math.min(a.z, b.z) / this.cell), z1 = Math.floor(Math.max(a.z, b.z) / this.cell);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = cx * 100003 + cz;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(i);
      }
    }
  }

  segmentsNear(x, z, maxD) {
    const r = Math.ceil(maxD / this.cell);
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    const out = new Set();
    for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) {
      const list = this.grid.get(i * 100003 + j);
      if (list) for (const s of list) out.add(s);
    }
    return out;
  }

  // { d: distance in the ground plane, s: distance along the path, y: the
  // interpolated height stored on the path, i: segment index }
  nearest(x, z, maxD = Infinity) {
    if (x < this.min.x - maxD || x > this.max.x + maxD || z < this.min.y - maxD || z > this.max.y + maxD) {
      return { d: Infinity, s: 0, y: 0, i: 0, t: 0 };
    }
    let best = Infinity, bs = 0, by = 0, bi = 0, bt = 0;
    const p = this.pts;
    const segs = maxD < 200 ? this.segmentsNear(x, z, maxD) : p.keys();
    for (const i of segs) {
      if (i >= p.length - 1) continue;
      const ax = p[i].x, az = p[i].z, bx = p[i + 1].x, bz = p[i + 1].z;
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x, ez = az + dz * t - z;
      const d2 = ex * ex + ez * ez;
      if (d2 < best) {
        best = d2; bi = i; bt = t;
        bs = this.cum[i] + (this.cum[i + 1] - this.cum[i]) * t;
        by = p[i].y + (p[i + 1].y - p[i].y) * t;
      }
    }
    if (best === Infinity) return { d: Infinity, s: 0, y: 0, i: 0, t: 0 };
    return { d: Math.sqrt(best), s: bs, y: by, i: bi, t: bt };
  }

  // Point and direction at distance s along the path.
  at(s) {
    s = clamp(s, 0, this.length);
    let i = 0;
    while (i < this.cum.length - 2 && this.cum[i + 1] < s) i++;
    const t = (s - this.cum[i]) / ((this.cum[i + 1] - this.cum[i]) || 1);
    const a = this.pts[i], b = this.pts[i + 1];
    const pos = a.clone().lerp(b, t);
    const dir = b.clone().sub(a).setY(0).normalize();
    return { pos, dir };
  }
}

// Ellipse helper: 0 at the centre, 1 on the rim.
export function ellipseR(x, z, e) {
  const dx = (x - e.x) / e.rx, dz = (z - e.z) / e.rz;
  return Math.sqrt(dx * dx + dz * dz);
}
