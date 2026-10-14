// Savanna landscape pieces (owner's references, 14 Oct: caves, gullies,
// waterfalls, granite hills, painted mud huts; "it should come alive").
// The shapes are carved into the ground in world.js (GULLY, FALLS); this
// file dresses them with the Meshy kit and adds the moving parts: the
// waterfall with spray and flocks of birds.
import * as THREE from 'three';
import { loadKit, place } from './kit/catalogue.js';
import { buildWaterfall, waterTime } from './kit/water.js';
import { groundHeight, riverX, riverLevel, RIVER_HALF_WIDTH, GULLY, gullyNear, gullyDepth, FALLS, DSS, makeRandom } from './world.js';

const KIT = ['Granite_Inselberg', 'Granite_Rock_Shelter', 'River_Boulders_Mossy', 'Waterfall_Rock_Ledge',
  'Gully_Laterite_Bank', 'Hut_Mud_Painted', 'Rock_Arch_Tunnel', 'Boulder_Granite'];

// Big granite domes: a ring on the skyline and two inside the savanna's edges.
export const INSELBERGS = [
  { x: -60, z: -250, s: 2.6 }, { x: 70, z: -270, s: 3.2 }, { x: 215, z: -130, s: 2.8 }, { x: 240, z: 40, s: 2.5 },
  { x: -235, z: -95, s: 2.8 }, { x: -245, z: 70, s: 2.3 },
  { x: -130, z: -122, s: 1 }, { x: 138, z: -112, s: 0.95 },
];
// Rock outcrops (cover in a fight) and walk-in rock shelters.
export const TORS = [[-5, -95], [95, 60], [-130, 25], [55, 105], [150, -75], [-60, 130]];
export const SHELTERS = [{ x: -118, z: -30, yaw: 0.6 }, { x: 142, z: -12, yaw: -2.2 }];
// Painted mud huts around the village edge (enterable).
export const PAINTED_HUTS = [[-30, -20, 0.8], [40, -8, -1.2], [-36, 6, 1.6], [34, 22, -2.0], [-10, 32, 3.1], [-12, -36, 0.3]];

export async function addSavanna(scene, physics, landReady) {
  const rand = makeRandom(31);
  const K = await loadKit(KIT);
  // The open country beyond the savanna has its own height.
  const landHeight = (await landReady) ?? groundHeight;
  const h = groundHeight;
  const put = (name, items, opts) => place(scene, physics, K[name], items, h, opts);

  // Granite domes: far ones are scenery, the near two can be climbed around.
  // Each sits on the lowest ground under its rim.
  const anyHeight = landHeight;
  const domeW = (K.Granite_Inselberg.box.max.x - K.Granite_Inselberg.box.min.x) * K.Granite_Inselberg.def.scale;
  put('Granite_Inselberg', INSELBERGS.map((b, i) => {
    let y = anyHeight(b.x, b.z);
    for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283, r = domeW * b.s * 0.42; y = Math.min(y, anyHeight(b.x + Math.cos(a) * r, b.z + Math.sin(a) * r)); }
    return { x: b.x, z: b.z, y: y - 1.5, yaw: i * 1.7, s: [b.s, b.s * (0.8 + (i % 3) * 0.12), b.s] };
  }), { maxDist: 2400 });
  put('Granite_Rock_Shelter', TORS.map(([x, z], i) => ({ x, z, yaw: i * 2.1, s: 0.8 + (i % 3) * 0.2, sink: 0.4 })));
  // Walk-in shelters: the boulder U with a flat slab balanced on top.
  for (const t of SHELTERS) {
    const y = h(t.x, t.z);
    put('Rock_Arch_Tunnel', [{ x: t.x, z: t.z, yaw: t.yaw, sink: 0.3 }]);
    const top = (K.Rock_Arch_Tunnel.box.max.y - K.Rock_Arch_Tunnel.box.min.y) * K.Rock_Arch_Tunnel.def.scale;
    put('Boulder_Granite', [{ x: t.x, z: t.z, yaw: t.yaw + 0.3, s: [9, 2.2, 8], y: y + top - 0.9 }]);
  }

  // Waterfall: dark stepped rock along the drop on both sides of the river.
  const fz = FALLS.z, rx = riverX(fz);
  const ledges = [];
  for (const off of [-34, -26, -18, -10.5, 10.5, 18, 26, 34]) {
    const x = rx + off;
    ledges.push({ x, z: fz - 1.2, yaw: (rand() - 0.5) * 0.3, s: [1, 0.95 + rand() * 0.2, 1], y: h(x, fz + 4) - 0.8 });
  }
  put('Waterfall_Rock_Ledge', ledges);
  const top = new THREE.Vector3(riverX(fz - 3), riverLevel(fz - 3) + 0.1, fz - 3);
  const bottom = new THREE.Vector3(riverX(fz + 3.5), riverLevel(fz + 3.5) - 0.2, fz + 3.5);
  const updateFalls = buildWaterfall(scene, { top, bottom, width: RIVER_HALF_WIDTH * 2 + 1, rand });

  // Red laterite banks lining the gully walls, facing into the gully.
  const banks = [];
  let run = 0;
  for (let i = 1; i < GULLY.length; i++) {
    const [ax, az] = GULLY[i - 1], [bx, bz] = GULLY[i];
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let t = 4; t < len; t += 7.5) {
      run += 1;
      if (i === GULLY.length - 1 && t > len * 0.5) break; // the gully fades out at its west end
      for (const side of [-1, 1]) {
        if ((run + (side > 0 ? 1 : 0)) % 3 === 0) continue; // gaps of plain earth
        const cx = ax + dx * t, cz = az + dz * t;
        const x = cx - dz * side * 5.4, z = cz + dx * side * 5.4;
        const depth = gullyDepth(cx, cz);
        if (depth < 1.5) continue;
        banks.push({ x, z, y: h(cx, cz) - 0.15, yaw: Math.atan2(cx - x, cz - z), s: [1 + rand() * 0.2, depth / 2.75 * (0.95 + rand() * 0.1), 1] });
      }
    }
  }
  put('Gully_Laterite_Bank', banks);

  // Mossy boulders along the river banks, in the plunge pool and in the gully bed.
  const stones = [];
  for (let z = -150; z < 150; z += 14 + rand() * 12) {
    if (z > 18 && z < 60) continue; // keep the DSS landing clear
    const side = rand() < 0.5 ? -1 : 1;
    const x = riverX(z) + side * (RIVER_HALF_WIDTH + 2.5 + rand() * 2);
    if (Math.hypot(x - DSS.x, z - DSS.z) < DSS.r + 6) continue;
    stones.push({ x, z, yaw: rand() * 6.28, s: 0.6 + rand() * 0.6, sink: 0.3 });
  }
  for (const [ox, oz] of [[-7, 6], [6.5, 7], [-8.5, 12], [7, 13]]) stones.push({ x: rx + ox, z: fz + oz, yaw: rand() * 6.28, s: 0.8 + rand() * 0.4, sink: 0.4 });
  for (let k = 0; k < 7; k++) {
    const g = GULLY[1 + Math.floor(rand() * (GULLY.length - 3))];
    stones.push({ x: g[0] + (rand() - 0.5) * 3, z: g[1] + (rand() - 0.5) * 3, yaw: rand() * 6.28, s: 0.35 + rand() * 0.25, sink: 0.2 });
  }
  put('River_Boulders_Mossy', stones.filter((s) => gullyNear(s.x, s.z).d > 1.6 || s.s < 0.7));

  // Painted mud huts (enterable, like every building).
  put('Hut_Mud_Painted', PAINTED_HUTS.map(([x, z, yaw]) => ({ x, z, yaw })));

  const updateBirds = buildBirds(scene, rand);
  return (dt, playerPos) => {
    if (Math.hypot(playerPos.x - top.x, playerPos.z - top.z) < 180) updateFalls(dt);
    updateBirds(dt, playerPos);
  };
}

// Flocks of small dark birds wheeling over the savanna, wings flapping.
function buildBirds(scene, rand) {
  const flocks = [];
  for (let f = 0; f < 4; f++) {
    const n = 6 + Math.floor(rand() * 6);
    flocks.push({ cx: (rand() - 0.5) * 220, cz: (rand() - 0.5) * 220, r: 25 + rand() * 30, y: 22 + rand() * 18, speed: 0.12 + rand() * 0.08, dir: rand() < 0.5 ? -1 : 1, birds: Array.from({ length: n }, () => [rand() * 4 - 2, rand() * 3 - 1.5, rand() * 4 - 2, rand() * 6.28]) });
  }
  const total = flocks.reduce((a, f) => a + f.birds.length, 0);
  const pos = new Float32Array(total * 9 * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#2b2622', side: THREE.DoubleSide, fog: true }));
  mesh.frustumCulled = false;
  scene.add(mesh);
  let t = 0;
  return (dt, playerPos) => {
    t += dt;
    let i = 0;
    for (const f of flocks) {
      const a = t * f.speed * f.dir;
      const fx = f.cx + Math.cos(a) * f.r, fz = f.cz + Math.sin(a) * f.r;
      // Heading along the circle.
      const hx = -Math.sin(a) * f.dir, hz = Math.cos(a) * f.dir;
      for (const [ox, oy, oz, ph] of f.birds) {
        const x = fx + ox * 3 + Math.sin(t * 0.7 + ph) * 1.5, y = f.y + oy * 2 + Math.sin(t * 0.5 + ph) * 0.8, z = fz + oz * 3;
        const flap = Math.sin(t * 9 + ph) * 0.45;
        const sx = -hz * 0.45, sz = hx * 0.45; // wing span direction
        // Body tip, left wing, right wing (two triangles sharing the body line).
        const bx = hx * 0.35, bz = hz * 0.35;
        const w = [x + sx, y + flap, z + sz], wl = [x - sx, y + flap, z - sz];
        const nose = [x + bx, y, z + bz], tail = [x - bx, y, z - bz];
        pos.set([...nose, ...tail, ...w, ...nose, ...tail, ...wl], i);
        i += 18;
      }
    }
    geo.attributes.position.needsUpdate = true;
  };
}

export { waterTime };
