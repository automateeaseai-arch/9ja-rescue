// Cave system built in code from passages and chambers (reference 9): a
// sandy floor, rock walls traced around the cave outline, a ceiling with a
// skylight, and changes to the terrain above so the hill stays solid except
// at the two mouths and the skylight. Surfaces darken with depth so the
// inside reads as a cave yet stays navigable.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { addFixedCollider } from '../world.js';
import { Path, noise2, smooth, clamp, lerp } from './util.js';
import { caveRock } from './materials.js';

const n3 = (x, y, z) => (noise2(x + y * 0.71, z - y * 0.37) + noise2(z + y * 1.3, x - y * 0.53)) * 0.5;

export function createCave(def, groundAt) {
  const passages = def.passages.map((p) => ({ path: new Path(p.pts, { spacing: 1 }), w: p.w }));
  const chambers = def.chambers;
  const entrance = new THREE.Vector2(def.passages[0].pts[0][0], def.passages[0].pts[0][1]);
  const lastP = def.passages[def.passages.length - 1].pts;
  const exit = new THREE.Vector2(lastP[lastP.length - 1][0], lastP[lastP.length - 1][1]);
  const sky = chambers.find((c) => c.skylight);
  // Floors follow the ground just outside each mouth.
  const floorE = groundAt(entrance.x + 3, entrance.y);
  const floorW = groundAt(exit.x, exit.y + 3);

  function sdf(x, z) {
    let d = Infinity;
    for (const p of passages) d = Math.min(d, p.path.nearest(x, z, 20).d - p.w / 2);
    for (const c of chambers) d = Math.min(d, Math.hypot(x - c.x, z - c.z) - c.r);
    return d + (noise2(x * 0.35, z * 0.35) - 0.5) * 1.2;
  }
  function floorAt(x, z) {
    const t = clamp((x - entrance.x) / (exit.x - entrance.x), 0, 1);
    return lerp(floorE, floorW, smooth(t, 0, 1)) + (noise2(x * 0.5, z * 0.5) - 0.5) * 0.25;
  }
  function roofH(x, z) {
    let h = def.height + (noise2(x * 0.3 + 4, z * 0.3) - 0.5) * 1.0;
    for (const c of chambers) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r + 2) h = Math.max(h, 4.6 + (c.h - 4.6) * Math.sqrt(Math.max(0, 1 - (d / (c.r + 2)) ** 2)));
    }
    return h;
  }
  const ceilAt = (x, z) => floorAt(x, z) + roofH(x, z);
  // Outside the hill (at a mouth): no walls or roof, the terrain stays.
  const openAir = (x, z) => groundAt(x, z) < floorAt(x, z) + 0.35;
  const nearMouth = (x, z) => Math.min(Math.hypot(x - entrance.x, z - entrance.y), Math.hypot(x - exit.x, z - exit.y)) < 7;
  const skyD = (x, z) => (sky ? Math.hypot(x - sky.x, z - sky.z) : Infinity);
  const skyTop = sky ? ceilAt(sky.x, sky.z) : 0;
  // Bounding box for quick rejection of far-away terrain points.
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (const p of passages) for (const pt of p.path.pts) { bx0 = Math.min(bx0, pt.x); bx1 = Math.max(bx1, pt.x); bz0 = Math.min(bz0, pt.z); bz1 = Math.max(bz1, pt.z); }
  for (const c of chambers) { bx0 = Math.min(bx0, c.x - c.r); bx1 = Math.max(bx1, c.x + c.r); bz0 = Math.min(bz0, c.z - c.r); bz1 = Math.max(bz1, c.z + c.r); }
  const far = (x, z) => x < bx0 - 12 || x > bx1 + 12 || z < bz0 - 12 || z > bz1 + 12;

  // Terrain changes: keep rock above the cave, a crater round the skylight.
  function terrainMod(x, z, h) {
    if (far(x, z)) return h;
    const s = sdf(x, z);
    if (s < 3 && !nearMouth(x, z) && skyD(x, z) > (sky?.skylight ?? 0) + 3) h = Math.max(h, ceilAt(x, z) + 1.8);
    const d = skyD(x, z);
    if (d < sky.skylight + 6) h = Math.min(Math.max(h, skyTop), skyTop + Math.max(0, d - sky.skylight) * 1.1);
    return h;
  }
  // h: the highest corner of the ground triangle being tested.
  function holeAt(x, z, h) {
    if (far(x, z) || h < floorAt(x, z) + 0.35) return false;
    if (skyD(x, z) < sky.skylight + 0.4) return true;
    return nearMouth(x, z) && sdf(x, z) < 0.8 && h < ceilAt(x, z) + 1.2;
  }
  function inside(x, z) {
    return !far(x, z) && sdf(x, z) < 0.5;
  }
  // 0 near the openings, 1 deep inside (for lighting).
  function depth(x, z) {
    const de = Math.min(Math.hypot(x - entrance.x, z - entrance.y), Math.hypot(x - exit.x, z - exit.y));
    const lit = Math.max(Math.exp(-de / 9), Math.exp(-skyD(x, z) / 5) * 0.9);
    return 1 - lit;
  }

  return { sdf, floorAt, ceilAt, terrainMod, holeAt, inside, depth, openAir, groundAt, entrance, exit, sky, passages, chambers, floorE, floorW };
}

// Builds the cave meshes and colliders. `glows` are warm lamp-lit spots
// ([x, z, radius]) baked into the rock colour.
export function buildCave(scene, physics, cave, glows = []) {
  const { sdf, floorAt, ceilAt, depth, openAir } = cave;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of cave.passages) for (const pt of p.path.pts) { x0 = Math.min(x0, pt.x); x1 = Math.max(x1, pt.x); z0 = Math.min(z0, pt.z); z1 = Math.max(z1, pt.z); }
  for (const c of cave.chambers) { x0 = Math.min(x0, c.x - c.r); x1 = Math.max(x1, c.x + c.r); z0 = Math.min(z0, c.z - c.r); z1 = Math.max(z1, c.z + c.r); }
  x0 -= 5; x1 += 5; z0 -= 5; z1 += 5;

  const shade = (x, z) => {
    let s = lerp(1.0, 0.5, depth(x, z));
    for (const [gx, gz, gr] of glows) s += 0.45 * Math.max(0, 1 - Math.hypot(x - gx, z - gz) / gr);
    return Math.min(1.1, s);
  };
  const mat = caveRock('#c09466');
  const floorMat = caveRock('#b99467');

  // ---- Floor and ceiling grids ----
  const g = 0.8;
  const nx = Math.ceil((x1 - x0) / g) + 1, nz = Math.ceil((z1 - z0) / g) + 1;
  const vals = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) vals[j * nx + i] = sdf(x0 + i * g, z0 + j * g);
  function grid(yAt, keep, flip, hole) {
    const pos = [], col = [], idx = [];
    const map = new Int32Array(nx * nz).fill(-1);
    const vid = (i, j) => {
      const k = j * nx + i;
      if (map[k] < 0) {
        const x = x0 + i * g, z = z0 + j * g;
        map[k] = pos.length / 3;
        pos.push(x, yAt(x, z), z);
        const s = shade(x, z);
        col.push(s, s * 0.95, s * 0.88);
      }
      return map[k];
    };
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const cx = x0 + (i + 0.5) * g, cz = z0 + (j + 0.5) * g;
        if (sdf(cx, cz) > keep || hole?.(cx, cz)) continue;
        const a = vid(i, j), b = vid(i, j + 1), c = vid(i + 1, j + 1), d = vid(i + 1, j);
        if (flip) idx.push(a, d, b, b, d, c); else idx.push(a, b, d, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  // Floor everywhere in the outline (no gaps where the ground is cut); just
  // under the ground where the mouth is open air, so the ground shows.
  // Floor wherever the ground may be cut, extending a little into the open
  // mouths; there it tucks just under the ground so the two never step.
  const nearRock = (x, z) => !openAir(x, z) || [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => !openAir(x + dx, z + dz));
  const floorGeo = grid((x, z) => (openAir(x, z) ? Math.min(floorAt(x, z), cave.groundAt(x, z) - 0.12) : floorAt(x, z)), 1.4, false, (x, z) => !nearRock(x, z));
  const ceilGeo = grid((x, z) => ceilAt(x, z) + (n3(x * 0.5, 0, z * 0.5) - 0.5) * 0.8, 1.0, true,
    (x, z) => openAir(x, z) || (cave.sky && Math.hypot(x - cave.sky.x, z - cave.sky.z) < cave.sky.skylight));

  // ---- Walls: trace the outline (marching squares), extrude upwards ----
  const segs = [];
  const edgePt = (ia, ja, ib, jb) => {
    const va = vals[ja * nx + ia], vb = vals[jb * nx + ib];
    const t = va / (va - vb);
    return [x0 + (ia + (ib - ia) * t) * g, z0 + (ja + (jb - ja) * t) * g];
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const v0 = vals[j * nx + i], v1 = vals[j * nx + i + 1], v2 = vals[(j + 1) * nx + i + 1], v3 = vals[(j + 1) * nx + i];
      const c = (v0 < 0 ? 1 : 0) | (v1 < 0 ? 2 : 0) | (v2 < 0 ? 4 : 0) | (v3 < 0 ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const e = [
        () => edgePt(i, j, i + 1, j),
        () => edgePt(i + 1, j, i + 1, j + 1),
        () => edgePt(i, j + 1, i + 1, j + 1),
        () => edgePt(i, j, i, j + 1),
      ];
      const table = {
        1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]],
        8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]],
      };
      for (const [a, b] of table[c]) segs.push([e[a](), e[b]()]);
    }
  }
  const ROWS = 7;
  const wpos = [], wcol = [], widx = [];
  const grad = (x, z) => {
    const h = 0.3;
    const gx = sdf(x + h, z) - sdf(x - h, z), gz = sdf(x, z + h) - sdf(x, z - h);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  };
  const wallVert = (x, z, r) => {
    const yb = floorAt(x, z) - 0.6, yt = ceilAt(x, z) + 0.7;
    const t = r / ROWS;
    const y = lerp(yb, yt, t);
    const [gx, gz] = grad(x, z);
    // Rounded profile: the wall leans in near the floor and the roof.
    const bulge = (1 - Math.sin(Math.PI * t)) * 0.7;
    const rough = (n3(x * 0.6, y * 0.6, z * 0.6) - 0.5) * 1.4;
    const o = rough - bulge;
    const s = shade(x, z) * (0.9 + 0.1 * Math.sin(Math.PI * t));
    wcol.push(s, s * 0.96, s * 0.9);
    return [x + gx * o, y, z + gz * o];
  };
  for (const [[ax, az], [bx, bz]] of segs) {
    if (openAir((ax + bx) / 2, (az + bz) / 2)) continue; // the mouths stay open
    const base = wpos.length / 3;
    for (let r = 0; r <= ROWS; r++) {
      wpos.push(...wallVert(ax, az, r));
      wpos.push(...wallVert(bx, bz, r));
    }
    for (let r = 0; r < ROWS; r++) {
      const a = base + r * 2, b = a + 1, c = a + 2, d = a + 3;
      widx.push(a, c, b, b, c, d);
    }
  }
  let wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3));
  wallGeo.setIndex(widx);
  wallGeo = mergeVertices(wallGeo, 0.01);
  wallGeo.computeVertexNormals();

  for (const [geo, m] of [[floorGeo, floorMat], [ceilGeo, mat], [wallGeo, mat]]) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    addFixedCollider(physics, RAPIER.ColliderDesc.trimesh(new Float32Array(geo.attributes.position.array), new Uint32Array(geo.index.array)), { x: 0, y: 0, z: 0 });
  }

  // Skylight: a rock rim hides the seam with the ground above, and a soft
  // shaft of light falls to the floor.
  if (cave.sky) {
    const { x, z, skylight } = cave.sky;
    const top = ceilAt(x, z);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(skylight + 0.2, skylight + 0.4, 3.2, 20, 3, true), mat);
    rim.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(rim.geometry.attributes.position.count * 3).fill(0.85), 3));
    rim.position.set(x, top + 0.6, z);
    rim.castShadow = rim.receiveShadow = true;
    scene.add(rim);
  }
}
