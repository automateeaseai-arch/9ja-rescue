// River Valley terrain shape: one height function built from the layout.
// Layers, in order: valley floor, east highlands, west ridge, village
// terraces, ravine, grotto bowl, flattened clearings, smoothed trails and
// ramps, creeks, the river and the wetland lake.
import { Path, fbm2, noise2, smooth, lerp, clamp, ellipseR } from '../kit/util.js';
import * as L from './layout.js';

const xEast = (z) => 22 + 5 * Math.sin(z * 0.035);           // west edge of the highlands
const zEast = (x) => -30 + 8 * Math.sin(x * 0.03);            // south edge (gentle ramp)
const xRidge = (z) => -34 + 4 * Math.sin(z * 0.05);           // east edge of the west ridge
const zRidge = (x) => -62 + 5 * Math.sin(x * 0.05);           // south edge of the west ridge

export function createValleyShape() {
  const river = new Path(L.RIVER, { spacing: 2 });
  const creek = new Path(L.CREEK, { spacing: 2 });
  const grottoStream = new Path([[-73, -50], [-62, -40], [-44, -30], [-26, -24], [-14, -22]], { spacing: 2 });
  const ravineStream = new Path([[-200, -205], [-171, -165], [-151, -130], [-136, -92], [-126, -50], [-121, -36]], { spacing: 2 });
  const ravine = new Path([[-130, -48, 7.2], [-140, -90, 8.4], [-156, -130, 9.4], [-176, -165, 10.5], [-205, -205, 11.5]], { spacing: 2 });
  const bridgeS = river.nearest(L.BRIDGE.x, L.BRIDGE.z).s;
  const fordS = river.nearest(L.STEPPING.x, L.STEPPING.z).s;

  // ---- Stage 1: landforms ----
  function base(x, z) {
    let h = 7 - 5.4 * smooth(z, 40, 170);
    h += (fbm2(x * 0.018, z * 0.018) - 0.5) * 4 + (noise2(x * 0.09, z * 0.09) - 0.5) * 0.7;
    return h;
  }
  function highlands(x, z, h) {
    const top = 18 + (fbm2(x * 0.015 + 5, z * 0.015) - 0.5) * 5;
    const m = smooth(x, xEast(z) - 3, xEast(z) + 3) * (1 - smooth(z, zEast(x) - 18, zEast(x) + 18));
    return lerp(h, top, m);
  }
  function ridge(x, z, h) {
    const top = 15 + (fbm2(x * 0.02 + 9, z * 0.02) - 0.5) * 4;
    const blendS = lerp(2.5, 16, 1 - smooth(x, -132, -112)); // gentle in the far west, a cliff by the grotto
    const m = (1 - smooth(x, xRidge(z) - 2.5, xRidge(z) + 2.5)) * (1 - smooth(z, zRidge(x) - blendS, zRidge(x) + blendS));
    return lerp(h, top, m);
  }
  // Terraces stepping down the highland slope, like reference 14.
  function terraces(x, z, h) {
    const r = Math.hypot(x - L.VILLAGE.x, z - L.VILLAGE.z);
    if (r > 58) return h;
    const step = 2.6;
    const f = h / step;
    const q = Math.floor(f);
    const t = (q + smooth(f - q, 0.78, 1.0)) * step;
    return lerp(h, t, 1 - smooth(r, 42, 58));
  }
  function ravineCarve(x, z, h) {
    const n = ravine.nearest(x, z, 40);
    if (n.d > 40) return h;
    return Math.min(h, n.y + Math.max(0, n.d - 10) * 2.2);
  }
  function grotto(x, z, h) {
    const r = Math.hypot(x - L.GROTTO.x, z - L.GROTTO.z);
    if (r > 30) return h;
    h = Math.min(h, 6.6 + Math.max(0, r - L.GROTTO.r) * 2.6);
    if (r < L.GROTTO.pool + 1) h = Math.min(h, 4.9 + Math.pow(r / (L.GROTTO.pool + 1), 2) * 1.8);
    return h;
  }
  function flatten(x, z, h) {
    const c = L.COMPOUND;
    const dx = Math.max(0, Math.abs(x - c.x) - c.w / 2), dz = Math.max(0, Math.abs(z - c.z) - c.d / 2);
    h = lerp(7.2, h, smooth(Math.hypot(dx, dz), 2, 14));
    for (const [px, pz, ph, r] of [
      [L.DRY_EXTRACTION.x, L.DRY_EXTRACTION.z, null, 13],
      [L.BRIDGE.x - L.BRIDGE.length / 2 - 1, L.BRIDGE.z, L.BRIDGE.deck - 0.05, 4],
      [L.BRIDGE.x + L.BRIDGE.length / 2 + 1, L.BRIDGE.z, L.BRIDGE.deck - 0.05, 4],
      [L.RAVINE_CAMP.x, L.RAVINE_CAMP.z, null, 12],
      [L.VIEWPOINT.x, L.VIEWPOINT.z, null, 5],
    ]) {
      const d = Math.hypot(x - px, z - pz);
      if (d < r + 10) h = lerp(ph ?? centre(px, pz), h, smooth(d, r, r + 8));
    }
    return h;
  }
  const centreCache = new Map();
  function centre(px, pz) {
    const k = px + ',' + pz;
    if (!centreCache.has(k)) centreCache.set(k, stage1(px, pz, true));
    return centreCache.get(k);
  }
  function stage1(x, z, skipFlatten = false) {
    let h = base(x, z);
    h = highlands(x, z, h);
    h = ridge(x, z, h);
    h = terraces(x, z, h);
    h = ravineCarve(x, z, h);
    h = grotto(x, z, h);
    return skipFlatten ? h : flatten(x, z, h);
  }

  // ---- Stage 2: trails. Flat trails follow the ground, smoothed; ramps run
  // straight between their end heights (cut into slopes and terraces). ----
  const trails = [];
  function addTrail(points, width, ramp = false) {
    const p = new Path(points, { spacing: 2 });
    const ys = p.pts.map((pt) => stage1(pt.x, pt.z));
    if (ramp) {
      const a = ys[0], b = ys[ys.length - 1];
      p.pts.forEach((pt, i) => { pt.y = lerp(a, b, p.cum[i] / p.length); });
    } else {
      // Moving average so the walking line has no sudden bumps.
      p.pts.forEach((pt, i) => {
        let s = 0, n = 0;
        for (let k = -6; k <= 6; k++) { const j = clamp(i + k, 0, ys.length - 1); s += ys[j]; n++; }
        pt.y = s / n;
      });
    }
    p.width = width;
    trails.push(p);
    return p;
  }
  const R = L.ROUTES;
  const routes = {
    arrival: addTrail(R.arrival, 3.4),
    direct: addTrail(R.direct, 3.6),
    concealedLow: addTrail(R.concealed.slice(0, 5), 3),
    villageRamp: addTrail([[104, 6], [112, -10], [130, -20], [118, -36], [124, -52]], 3.6, true),
    plateau: addTrail([[124, -52], [100, -62], [70, -64], [44, -62]], 3),
    gorgeRamp: addTrail([[44, -62], [33, -72], [24, -86], [12, -94]], 3.2, true),
    gorgeFloor: addTrail([[12, -94], [0, -93]], 3),
    westShelf: addTrail([[-17, -91], [-24, -88], [-29, -86]], 3),
    caveToBreach: addTrail(R.caveToBreach, 2.8),
    wetland: addTrail(R.wetland, 3),
    wetlandToJetty: addTrail(R.wetlandToJetty, 3),
    escortRiver: addTrail(R.escortRiver, 3.4),
    escortDry: addTrail(R.escortDry, 3.6),
    ravine: addTrail(R.ravine, 3),
    gorgeTrail: addTrail(R.gorgeTrail, 2.6),
    northRoad: addTrail(R.northRoad, 4),
  };
  function stage2(x, z) {
    let h = stage1(x, z);
    for (const p of trails) {
      const n = p.nearest(x, z, p.width + 4);
      if (n.d < p.width / 2 + 4) h = lerp(n.y, h, smooth(n.d, p.width * 0.5, p.width * 0.5 + 4));
    }
    return h;
  }

  // ---- Stage 3: water ----
  // River surface height along the river, falling gently to the lake.
  const L0 = river.length;
  function riverLevelAt(s) {
    return s < bridgeS ? lerp(5.0, 2.4, s / bridgeS) : lerp(2.4, L.LAKE.level, (s - bridgeS) / (L0 - bridgeS));
  }
  function riverWidthAt(z) {
    let hw = z < -40 ? 6 : lerp(6, 9, smooth(z, -40, 0));
    if (z > 60) hw = lerp(9, 12, smooth(z, 60, 120));
    return hw;
  }
  function riverInfo(x, z) {
    const n = river.nearest(x, z, 60);
    const hw = riverWidthAt(z);
    return { ...n, hw, level: riverLevelAt(n.s), ford: Math.abs(n.s - fordS) < 6 };
  }
  // Creek levels follow the smoothed ground along the creek.
  for (const c of [creek, grottoStream, ravineStream]) {
    const ys = c.pts.map((pt) => stage2(pt.x, pt.z));
    c.pts.forEach((pt, i) => {
      let m = Infinity;
      for (let k = -8; k <= 8; k++) m = Math.min(m, ys[clamp(i + k, 0, ys.length - 1)]);
      pt.y = m - 0.45; // water surface sits below the lowest nearby bank
    });
    // Water must never run uphill.
    for (let i = 1; i < c.pts.length; i++) c.pts[i].y = Math.min(c.pts[i].y, c.pts[i - 1].y);
  }

  function height(x, z) {
    let h = stage2(x, z);
    for (const [c, hw] of [[creek, 2.4], [grottoStream, 1.8], [ravineStream, 1.5]]) {
      const n = c.nearest(x, z, 12);
      if (n.d < 12) {
        const bed = n.d < hw ? n.y - 0.15 - 0.55 * (1 - (n.d / hw) ** 2) : n.y - 0.15 + (n.d - hw) * 0.55;
        h = Math.min(h, bed);
      }
    }
    const r = riverInfo(x, z);
    if (r.d < 60) {
      const steep = r.ford ? 0.45 : z < 55 ? 1.8 : lerp(1.8, 0.32, smooth(z, 55, 85));
      const depth = r.ford ? 0.2 : 1.6;
      const bed = r.d < r.hw
        ? r.level - 0.15 - depth * (1 - (r.d / r.hw) ** 2)
        : r.level - 0.15 + (r.d - r.hw) * steep;
      h = Math.min(h, bed);
    }
    // Wetland lake with marshy islands.
    const e = ellipseR(x, z, L.LAKE);
    if (e < 1.6) {
      const isl = Math.max(0, fbm2(x * 0.045 + 3, z * 0.045) - 0.56) * 6;
      const bed = L.LAKE.level - 1.1 + isl;
      const lakeH = lerp(bed, L.LAKE.level + 0.45, smooth(e, 0.86, 1.0)) + Math.max(0, e - 1) * 12;
      h = Math.min(h, lakeH);
    }
    return h;
  }

  // ---- Zones used to choose ground colour and vegetation ----
  const compoundRect = (x, z, m = 0) =>
    Math.abs(x - L.COMPOUND.x) < L.COMPOUND.w / 2 + m && Math.abs(z - L.COMPOUND.z) < L.COMPOUND.d / 2 + m;
  function forest(x, z) {
    const se = smooth(x, 40, 95) * smooth(z, 50, 110);                                  // arrival rainforest
    const west = (1 - smooth(x, -48, -26)) * smooth(z, -66, -52) * (1 - smooth(z, 78, 100)); // jungle by the compound
    const creekBand = 1 - smooth(creek.nearest(x, z, 30).d, 10, 26);
    const ridgeTop = (1 - smooth(x, -40, -30)) * (1 - smooth(z, -70, -60)) * 0.45;
    let f = Math.max(se, west, creekBand * 0.8, ridgeTop);
    if (compoundRect(x, z, 6)) f = 0;
    return clamp(f, 0, 1);
  }
  const highland = (x, z) => smooth(x, xEast(z) - 3, xEast(z) + 3) * (1 - smooth(z, zEast(x) - 10, zEast(x) + 10));
  const ridgeZone = (x, z) => (1 - smooth(x, xRidge(z) - 2.5, xRidge(z) + 2.5)) * (1 - smooth(z, zRidge(x) - 3, zRidge(x) + 3));
  const lakeR = (x, z) => ellipseR(x, z, L.LAKE);

  // Distance to the nearest walking trail (for keeping routes clear).
  function trailDist(x, z, maxD = 12) {
    let best = Infinity;
    for (const p of trails) best = Math.min(best, p.nearest(x, z, maxD).d - p.width / 2);
    return best;
  }

  return {
    height, stage1, riverInfo, riverLevelAt, riverWidthAt, river, creek, grottoStream, ravine, ravineStream,
    trails, routes, trailDist, forest, highland, ridgeZone, lakeR, compoundRect,
    xEast, zEast, xRidge, zRidge,
  };
}
