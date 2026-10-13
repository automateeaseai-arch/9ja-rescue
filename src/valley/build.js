// Builds the River Valley area from the layout (layout.js), the terrain
// shape (heights.js), the Meshy kit (kit/catalogue.js) and code-built
// structures, water and plants (kit/*). Mission-critical routes are kept
// clear: scattered rocks and plants are rejected near trails, doors,
// bridges, boardwalks and extraction points.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { addFixedCollider } from '../world.js';
import { tarpMaterial, cloth } from '../camp.js';
import { makeRandom, Path, noise2, fbm2, smooth, clamp, lerp } from '../kit/util.js';
import { buildTerrain } from '../kit/terrain.js';
import { createCave, buildCave } from '../kit/cave.js';
import { waterMaterial, buildRiverStrip, buildPond, buildWaterfall, waterTime } from '../kit/water.js';
import { loadKit, place, pieceSize } from '../kit/catalogue.js';
import { setDistanceScale } from '../kit/chunks.js';
import * as V from '../kit/vegetation.js';
import * as S from '../kit/structures.js';
import { createExtraction, polylineRoute, v3 } from '../kit/extraction.js';
import { createValleyShape } from './heights.js';
import * as L from './layout.js';

const C = (hex) => new THREE.Color(hex);
const PAL = {
  dry: C('#a8987a'), gold: C('#b39a6c'), grass: C('#88874f'), scrub: C('#958c63'),
  forest: C('#3f3326'), litter: C('#584330'), moss: C('#46522c'),
  laterite: C('#94472b'), lateriteDry: C('#a06b4c'), mudDark: C('#4a4330'),
  lush: C('#667f3c'), gravel: C('#8f877a'), sand: C('#a89a80'),
  sandstone: C('#a8875f'), granite: C('#959083'), marsh: C('#5a6f37'), yard: C('#86523a'),
};

// Moves every collider the valley creates by the valley's origin, so all
// valley code can keep working in its own coordinates.
function offsetPhysics(physics, o) {
  return {
    createRigidBody(desc) {
      const t = desc.translation;
      desc.translation = { x: t.x + o.x, y: t.y, z: t.z + o.z };
      return physics.createRigidBody(desc);
    },
    createCollider: (desc, body) => physics.createCollider(desc, body),
    castRay(ray, ...args) {
      const src = ray.origin;
      ray.origin = { x: src.x + o.x, y: src.y, z: src.z + o.z };
      const hit = physics.castRay(ray, ...args);
      ray.origin = src;
      return hit;
    },
  };
}

// The valley's shape is cheap to compute; the land joining it to the
// savanna needs it before the valley itself is built.
export function prepareValley() {
  const shape = createValleyShape();
  const cave = createCave(L.CAVE, shape.height);
  const heightAt = (x, z) => cave.terrainMod(x, z, shape.height(x, z));
  return { shape, cave, heightAt };
}

// Builds the valley inside `world` with its centre at `origin` (world x, z).
// Light, sky and haze come from the shared world.
export async function buildValley(world, physicsWorld, { phone = false, step = async () => {}, origin = { x: 0, z: 0 }, prepared = prepareValley() } = {}) {
  const rand = makeRandom(L.SEED);
  const { shape, cave, heightAt } = prepared;
  const scene = new THREE.Group();
  scene.position.set(origin.x, 0, origin.z);
  world.add(scene);
  scene.updateMatrixWorld(true);
  const physics = offsetPhysics(physicsWorld, origin);
  // Phones switch to low-detail copies sooner and draw less far.
  setDistanceScale(phone ? 0.68 : 1, phone ? 0.55 : 1);

  // ---- Terrain ----
  await step('Shaping the valley');
  const trailCache = new Map();
  const trailD = (x, z) => shape.trailDist(x, z, 8);
  function colorAt(x, z, h, slope) {
    const c = new THREE.Color();
    const n = fbm2(x * 0.06, z * 0.06);
    const forest = shape.forest(x, z);
    const high = shape.highland(x, z);
    const ridge = shape.ridgeZone(x, z);
    c.copy(PAL.dry).lerp(PAL.grass, 0.5 + smooth(n, 0.3, 0.7) * 0.4);
    c.lerp(PAL.gold, high * 0.45);
    c.lerp(PAL.scrub, ridge * 0.5);
    // Rainforest floor: dark soil, leaf litter, moss.
    const floor = PAL.forest.clone().lerp(PAL.litter, smooth(noise2(x * 0.3, z * 0.3), 0.4, 0.8)).lerp(PAL.moss, smooth(n, 0.55, 0.75) * 0.6);
    c.lerp(floor, forest);
    let wet = forest * 0.35;
    // Cliffs and steep banks show bare rock.
    const rock = x < 0 || ridge > 0.5 ? PAL.sandstone : PAL.granite;
    c.lerp(rock, smooth(slope, 0.7, 1.3));
    // River banks: lush grass, then gravel and wet sand at the water.
    const r = shape.riverInfo(x, z);
    if (r.d < r.hw + 14) {
      c.lerp(PAL.lush, (1 - smooth(r.d, r.hw + 2, r.hw + 12)) * 0.75 * (1 - smooth(slope, 0.6, 1.2)));
      const g = 1 - smooth(r.d, r.hw - 1, r.hw + 2.5);
      c.lerp(z < 0 ? PAL.sand : PAL.gravel, g);
      wet = Math.max(wet, g * 0.8);
    }
    for (const cr of [shape.creek, shape.grottoStream, shape.ravineStream]) {
      const d = cr.nearest(x, z, 8).d;
      if (d < 8) { const g = 1 - smooth(d, 1.5, 6); c.lerp(PAL.gravel.clone().lerp(PAL.moss, 0.4), g * 0.8); wet = Math.max(wet, g * 0.7); }
    }
    // Wetland: dark mud at the waterline, marsh green around.
    const lr = shape.lakeR(x, z);
    if (lr < 1.5) {
      c.lerp(PAL.marsh, (1 - smooth(lr, 1.0, 1.4)) * 0.8);
      const m = h < L.LAKE.level + 0.35 ? 1 : 0;
      c.lerp(PAL.mudDark, m);
      wet = Math.max(wet, m, (1 - smooth(lr, 0.95, 1.2)) * 0.6);
    }
    // Trails: red laterite, wet and rutted in the forest.
    const td = trailD(x, z);
    if (td < 3) {
      const t = (1 - smooth(td, -1.0, 1.0)) * (0.75 + 0.25 * noise2(x * 0.4, z * 0.4));
      c.lerp(forest > 0.3 || shape.compoundRect(x, z, 20) ? PAL.laterite : PAL.lateriteDry, t);
      wet = Math.max(wet, t * (forest > 0.3 ? 0.85 : 0.25));
    }
    // Plantation surroundings: damp, greener ground (ref. 5).
    if (shape.compoundRect(x, z, 40)) c.lerp(PAL.lush.clone().lerp(PAL.forest, 0.4), 0.55 * (1 - smooth(Math.max(Math.abs(x - L.COMPOUND.x) - L.COMPOUND.w / 2, Math.abs(z - L.COMPOUND.z) - L.COMPOUND.d / 2), 10, 40)));
    if (shape.compoundRect(x, z, 2)) {
      c.lerp(PAL.yard, 0.85);
      wet = Math.max(wet, 0.55 + noise2(x * 0.2, z * 0.2) * 0.45);
    }
    // Jetty bank and dry extraction clearing.
    const dj = Math.hypot(x - L.JETTY.x + 4, z - L.JETTY.z);
    if (dj < 16) { c.lerp(PAL.laterite, 1 - smooth(dj, 8, 16)); wet = Math.max(wet, (1 - smooth(dj, 8, 16)) * 0.8); }
    const dd = Math.hypot(x - L.DRY_EXTRACTION.x, z - L.DRY_EXTRACTION.z);
    if (dd < 18) c.lerp(PAL.lateriteDry, 1 - smooth(dd, 10, 18));
    if (Math.hypot(x - L.GROTTO.x, z - L.GROTTO.z) < 20) c.lerp(PAL.moss, 0.5 * (1 - smooth(slope, 0.8, 1.4)));
    return [c.r, c.g, c.b, clamp(wet, 0, 1)];
  }
  const terrain = buildTerrain(scene, physics, {
    size: L.HALF * 2, step: L.GRID, heightAt, colorAt,
    holeAt: (x, z, hMax) => cave.holeAt(x, z, hMax),
  });
  const groundAt = terrain.groundAt;
  trailCache.clear();

  // Walking surface at a point (decks, bridges, floors), for NPCs.
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  function surfaceAt(x, z, yHint) {
    const g = groundAt(x, z);
    const from = (yHint ?? g) + 0.45;
    ray.origin = { x, y: Math.max(from, g + 0.05), z };
    const hit = physics.castRay(ray, 6, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
    if (hit) return ray.origin.y - hit.timeOfImpact;
    return g;
  }

  // ---- Water ----
  await step('Filling the river');
  const riverMat = waterMaterial({ shallow: '#7e9a88', deep: '#2f5048', sky: '#c4d3d6', opacity: 0.9, flowSpeed: 1.1 });
  const creekMat = waterMaterial({ shallow: '#5d7562', deep: '#2c4436', sky: '#8a9f9f', opacity: 0.8, flowSpeed: 1.4, ripple: 1.0, foam: 0.35 });
  const lakeMat = waterMaterial({ shallow: '#4f5a44', deep: '#1f2924', sky: '#8a9c9c', opacity: 0.95, flowSpeed: 0.2, ripple: 0.5 });
  const poolMat = waterMaterial({ shallow: '#5fb3a1', deep: '#1f6b62', sky: '#d6e4e2', opacity: 0.82, flowSpeed: 0.35 });
  buildRiverStrip(scene, shape.river, {
    levelAt: (s) => shape.riverLevelAt(s), halfWidthAt: (p) => shape.riverWidthAt(p.z), groundAt, material: riverMat, across: 8,
    skip: (x, z) => shape.lakeR(x, z) < 0.92 || z < -252, // starts at a spring below the escarpment
  });
  for (const [c, hw] of [[shape.creek, 2.4], [shape.grottoStream, 1.8], [shape.ravineStream, 1.5]]) {
    buildRiverStrip(scene, c, { levelAt: (s, p) => p.y, halfWidthAt: () => hw - 0.9, groundAt, material: creekMat, across: 3 });
  }
  buildPond(scene, { ...L.LAKE, groundAt, material: lakeMat, rings: phone ? 14 : 20, segs: 56, scale: 1.3 });
  const poolLevel = 6.1;
  buildPond(scene, { x: L.GROTTO.x, z: L.GROTTO.z, rx: L.GROTTO.pool + 1.5, level: poolLevel, groundAt, material: poolMat, rings: 8, segs: 32, scale: 1.1 });

  // ---- Cave ----
  await step('Carving the cave');
  const sup0 = L.CAVE.chambers[1];
  buildCave(scene, physics, cave, [[sup0.x - 1, sup0.z - 1, 7]]);

  // ---- Meshy kit ----
  await step('Loading valley models');
  const K = await loadKit([
    'Stilt_House_Thatch', 'Stilt_House_Tin', 'Depot_Warehouse', 'Plantation_House', 'Palm_Oil_Mill', 'Barn_Long_TinRoof',
    'Rock_Arch_Tunnel', 'Cave_Chamber_Skylight', 'Cliff_Overhang_Mossy', 'Cliff_Sandstone_Section', 'River_Stone_Flat',
    'Stone_Wall_Dry', 'Rainforest_Tree_Buttress', 'Wooden_Cart', 'Dugout_Canoe',
    'Boulder_Granite', 'House_MudBrick_TinRoof', 'Hut_Thatched_Round', 'Crate_Wooden', 'Drum_Blue', 'Table_Wooden',
    'Vehicle_SUV_Dark', 'Vehicle_Van_Grey',
  ]);
  const put = (name, items, opts) => place(scene, physics, K[name], items, groundAt, opts);

  // Spots that scattered plants and rocks must avoid: [x, z, radius].
  const clear = [];
  const isClear = (x, z, r = 1) => {
    if (shape.trailDist(x, z, r + 4) < r + 1.2) return false;
    for (const [cx, cz, cr] of clear) if ((x - cx) ** 2 + (z - cz) ** 2 < (cr + r) ** 2) return false;
    if (shape.compoundRect(x, z, 3 + r)) return false;
    if (Math.abs(x) > L.HALF - 4 || Math.abs(z) > L.HALF - 4) return false;
    return true;
  };
  const inWater = (x, z, m = 0.5) => {
    const r = shape.riverInfo(x, z);
    if (r.d < r.hw + m) return true;
    if (shape.lakeR(x, z) < 1.05 && groundAt(x, z) < L.LAKE.level + 0.15) return true;
    for (const [c, hw] of [[shape.creek, 2.4], [shape.grottoStream, 1.8], [shape.ravineStream, 1.5]]) if (c.nearest(x, z, 6).d < hw + m) return true;
    return Math.hypot(x - L.GROTTO.x, z - L.GROTTO.z) < L.GROTTO.pool + 1.5 + m;
  };
  const slopeAt = (x, z) => Math.hypot(groundAt(x + 1, z) - groundAt(x - 1, z), groundAt(x, z + 1) - groundAt(x, z - 1)) / 2;

  // ================= Plantation / depot compound (refs 4 and 5) =================
  await step('Building the compound');
  const CP = L.COMPOUND, cx0 = CP.x - CP.w / 2, cx1 = CP.x + CP.w / 2, cz0 = CP.z - CP.d / 2, cz1 = CP.z + CP.d / 2;
  const gateT = (a, b, g) => (g - a) / (b - a);
  S.compoundWall(scene, physics, [
    [cx0, cz0, cx1, cz0, [[gateT(cx0, cx1, L.GATES.breach.x) - 0.06, gateT(cx0, cx1, L.GATES.breach.x) + 0.06, 'breach']]],
    [cx1, cz0, cx1, cz1, [[gateT(cz0, cz1, L.GATES.east.z) - 0.065, gateT(cz0, cz1, L.GATES.east.z) + 0.065]]],
    [cx1, cz1, cx0, cz1, [[gateT(cx1, cx0, L.GATES.south.x) - 0.05, gateT(cx1, cx0, L.GATES.south.x) + 0.05]]],
    [cx0, cz1, cx0, cz0, [[gateT(cz1, cz0, L.GATES.west.z) - 0.065, gateT(cz1, cz0, L.GATES.west.z) + 0.065]]],
  ], groundAt, rand);
  // Vines over the walls.
  const vineItems = [];
  for (let i = 0; i < 70; i++) {
    const side = Math.floor(rand() * 4), t = rand();
    const [x, z, yaw] = side === 0 ? [lerp(cx0, cx1, t), cz0 - 0.2, 0] : side === 1 ? [cx1 + 0.2, lerp(cz0, cz1, t), Math.PI / 2] : side === 2 ? [lerp(cx0, cx1, t), cz1 + 0.2, 0] : [cx0 - 0.2, lerp(cz0, cz1, t), Math.PI / 2];
    vineItems.push([x, groundAt(x, z) + 2.3, z, yaw, 0.8 + rand() * 1.6, 1.4]);
  }
  put('Plantation_House', [{ x: -80, z: -1, yaw: 0 }]);
  put('Depot_Warehouse', [{ x: -101, z: 15, yaw: Math.PI / 2 }]);
  const yC = groundAt(-80, 15);
  S.openShed(scene, physics, { x: -60, z: 1, y: groundAt(-60, 1), yaw: 0, w: 8.5, d: 6, h: 3.8 }, rand);
  put('Palm_Oil_Mill', [{ x: -60, z: 1.2, y: groundAt(-60, 1) + 0.12, yaw: 0.05 }]);
  S.codeBuilding(scene, physics, { x: -96.5, z: 33, y: groundAt(-96.5, 33), yaw: Math.PI / 2, w: 9, d: 6.5, h: 3.1, door: 1.4 }, rand);
  S.openShed(scene, physics, { x: -61.5, z: 35.5, y: groundAt(-61.5, 35.5), yaw: Math.PI, w: 9, d: 6, h: 3.4, back: true }, rand);
  S.waterTank(scene, physics, { x: -107, z: -6, y: groundAt(-107, -6) }, rand);
  put('Drum_Blue', [[-88, 19], [-87.2, 19.6], [-88.6, 20.2], [-66, 6], [-65.2, 6.6], [-54, 30], [-108, 30], [-107.3, 30.8]].map(([x, z]) => ({ x, z, yaw: rand() * 6 })));
  const crateH = pieceSize(K.Crate_Wooden).y;
  put('Crate_Wooden', [[-93, 23], [-91.9, 23], [-92.4, 23, 1], [-55, 38], [-56, 38.3], [-108, 37], [-107, 37.2], [-107.5, 37.1, 1], [-85, 39]].map(([x, z, up]) => ({ x, z, yaw: rand() * 0.4, y: groundAt(x, z) + (up ? crateH : 0) })));
  put('Wooden_Cart', [{ x: -70, z: 22, yaw: 0.8 }]);
  put('Table_Wooden', [{ x: -73, z: 30, yaw: 0.1 }]);
  S.fruitPiles(scene, [[-66, 12, 1.4], [-63, 15, 1.1], [-57, 9, 1.0]], groundAt, rand);
  S.puddles(scene, [[-72, 18, 2.6, 1.6, 0.3], [-82, 26, 3.2, 1.8, 1.2], [-64, 24, 1.8, 1.2, 0.5], [-90, 6, 2.2, 1.4, 0.2], [-52, 20, 2.0, 1.1, 0], [-77, 40, 1.8, 1.2, 0], [-30, 30, 1.6, 1.0, 0]], groundAt);
  clear.push([-80, -1, 9], [-101, 15, 9], [-60, 1, 6], [-96.5, 33, 7], [-61.5, 35.5, 7]);

  // ================= Bridge, gorge, ford =================
  await step('Building bridges and boardwalks');
  const bedAt = groundAt;
  S.concreteBridge(scene, physics, { ...L.BRIDGE, bedAt }, rand);
  clear.push([L.BRIDGE.x, L.BRIDGE.z, L.BRIDGE.length / 2 + 3]);
  // Sandstone walls line the gorge (ref. 15) and the steep bridge banks (ref. 11).
  const cliffs = [];
  for (let z = -255; z < -46; z += 10.5) {
    if (z < -94 || z > -66) { // leave the descent trail open
      const x = shape.xEast(z) + 1.2;
      cliffs.push({ x, z, yaw: -Math.PI / 2 + (rand() - 0.5) * 0.25, y: groundAt(x - 4, z) - 1, s: [1, 1.05 + rand() * 0.2, 1] });
    }
    if (z < -96 || z > -77) { // leave the cave mouth open
      const x = shape.xRidge(z) - 1.2;
      cliffs.push({ x, z, yaw: Math.PI / 2 + (rand() - 0.5) * 0.25, y: groundAt(x + 4, z) - 1, s: [1, 0.82 + rand() * 0.15, 1] });
    }
  }
  // Grotto bowl walls.
  for (let a = -2.6; a <= -0.5; a += 0.42) {
    const r = L.GROTTO.r + 2.5;
    const x = L.GROTTO.x + Math.cos(a) * r, z = L.GROTTO.z + Math.sin(a) * r;
    if (Math.abs(a + Math.PI / 2) < 0.45) continue; // waterfall cliff goes here
    if (Math.hypot(x - cave.exit.x, z - cave.exit.y) < 7 || cave.sdf(x, z) < 6) continue;
    cliffs.push({ x, z, yaw: Math.atan2(L.GROTTO.x - x, L.GROTTO.z - z), y: 5.5, s: [0.8, 0.95, 1], tint: [0.8, 0.85, 0.72] });
  }
  put('Cliff_Sandstone_Section', cliffs);
  const bankRocks = [];
  for (let z = -40; z < 62; z += 6.5) {
    const r = shape.riverInfo(-15, z);
    for (const side of [-1, 1]) {
      const p = shape.river.nearest(-15, z);
      const pt = shape.river.pts[p.i];
      const x = pt.x + side * (r.hw + 2.6);
      if (Math.abs(z - L.BRIDGE.z) < 5) continue;
      bankRocks.push({ x, z, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, y: shape.riverLevelAt(p.s) - 1.2, s: [0.55, 0.42 + rand() * 0.1, 0.8] });
    }
  }
  put('Cliff_Sandstone_Section', bankRocks, { collider: 'box', lowOnly: true });

  // Rapids: boulders in the gorge river and around the ford; stepping stones.
  const riverRocks = [];
  for (let i = 0; i < 90; i++) {
    const s = rand() * shape.river.length * 0.55;
    const { pos, dir } = shape.river.at(s);
    const hw = shape.riverWidthAt(pos.z);
    const off = (rand() - 0.5) * 2 * (hw + 1.5);
    const x = pos.x - dir.z * off, z = pos.z + dir.x * off;
    if (Math.hypot(x - L.STEPPING.x, z - L.STEPPING.z) < 7 || Math.hypot(x - L.BRIDGE.x, z - L.BRIDGE.z) < 3) continue;
    riverRocks.push({ x, z, yaw: rand() * 6.28, s: 0.5 + rand() * 1.0, sink: 0.4, tiltX: (rand() - 0.5) * 0.3, tint: [0.78, 0.8, 0.76] });
  }
  put('Boulder_Granite', riverRocks, { lowOnly: true });
  const ford = shape.riverInfo(L.STEPPING.x, L.STEPPING.z);
  const stones = [];
  for (let t = -1; t <= 1.001; t += 0.12) {
    const x = L.STEPPING.x + t * (ford.hw + 1.5), z = L.STEPPING.z + t * 1.2 + (rand() - 0.5) * 0.3;
    stones.push({ x, z, y: ford.level - 0.28, yaw: rand() * 6.28, s: 0.95 + rand() * 0.2 });
  }
  put('River_Stone_Flat', stones);

  // ================= Cave mouths =================
  // Entrance: the sandstone vault (Meshy) opening onto the gorge (refs 9, 10).
  // No collider: the cave's own walls behind it do the blocking, so the
  // vault's exact shape can never seal the way in.
  put('Cave_Chamber_Skylight', [{ x: cave.entrance.x + 1.5, z: cave.entrance.y, yaw: Math.PI / 2, s: 0.85, y: cave.floorE - 0.4 }], { collider: 'none' });
  clear.push([cave.entrance.x, cave.entrance.y, 9], [cave.exit.x, cave.exit.y, 8]);
  // Supply chamber: crates, drums and a first-aid box.
  const sup = L.CAVE.chambers[1];
  const supY = cave.floorAt(sup.x, sup.z);
  put('Crate_Wooden', [[sup.x - 2, sup.z - 2], [sup.x - 1, sup.z - 2.3], [sup.x - 1.5, sup.z - 2.1, 1], [sup.x + 2.5, sup.z - 1]].map(([x, z, up]) => ({ x, z, y: cave.floorAt(x, z) + (up ? crateH : 0), yaw: rand() })));
  put('Drum_Blue', [[sup.x + 2, sup.z + 1.5], [sup.x + 2.8, sup.z + 2.2]].map(([x, z]) => ({ x, z, y: cave.floorAt(x, z), yaw: rand() * 6 })));
  const aid = new THREE.Mesh(S.boxGeo(0.6, 0.4, 0.4, 1), new THREE.MeshStandardMaterial({ color: '#e9e6df', roughness: 0.6 }));
  aid.position.set(sup.x - 1.2, supY + crateH + 0.2, sup.z - 2.1);
  scene.add(aid);
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ color: '#c8281e' }));
  cross.position.copy(aid.position).add(new THREE.Vector3(0, 0, 0.205));
  scene.add(cross);
  // Hurricane lamp on the crates: an emissive glass and a warm glow.
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.26, 10), new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ffb347', emissiveIntensity: 2.2 }));
  lamp.position.set(sup.x - 2, supY + crateH + 0.13, sup.z - 2);
  scene.add(lamp);

  // ================= Waterfall grotto (ref 8) =================
  await step('Building the waterfall');
  const fallZ = L.GROTTO.z - L.GROTTO.r - 0.5;
  put('Cliff_Overhang_Mossy', [
    { x: L.GROTTO.x, z: fallZ - 3.2, yaw: 0, y: 4.6, s: [1, 1.05, 1] },
    { x: L.GROTTO.x - 13, z: L.GROTTO.z - 7, yaw: 1.1, y: 4.8, s: [0.75, 0.9, 0.8] },
  ]);
  const fallTop = v3(L.GROTTO.x + 0.5, 4.6 + pieceSize(K.Cliff_Overhang_Mossy).y * 0.93, fallZ + 1.0);
  const updateFall = buildWaterfall(scene, { top: fallTop, bottom: v3(L.GROTTO.x + 0.5, poolLevel, L.GROTTO.z - 3.5), width: 3.6, rand });
  const grottoRocks = [];
  for (let i = 0; i < 18; i++) {
    const a = rand() * 6.28, r = L.GROTTO.pool + 0.8 + rand() * 4;
    const x = L.GROTTO.x + Math.cos(a) * r, z = L.GROTTO.z + Math.sin(a) * r;
    if (shape.trailDist(x, z) < 2 || Math.hypot(x - cave.exit.x, z - cave.exit.y) < 5 || cave.sdf(x, z) < 3) continue;
    grottoRocks.push({ x, z, yaw: rand() * 6, s: 0.5 + rand() * 0.9, sink: 0.3, tint: [0.62, 0.72, 0.58] });
  }
  for (const [x, z, s] of [[cave.exit.x - 6, cave.exit.y + 1.5, 1.4], [cave.exit.x + 5.5, cave.exit.y, 1.6]]) {
    grottoRocks.push({ x, z, yaw: rand() * 6, s, sink: 0.5, tint: [0.7, 0.74, 0.62] });
  }
  put('Boulder_Granite', grottoRocks);
  clear.push([L.GROTTO.x, L.GROTTO.z, L.GROTTO.pool + 1]);

  // ================= Wetland: boardwalks and stilt homes (refs 2 and 3) =================
  const deck = L.LAKE.level + 1.2;
  const bwItems = { planks: [], posts: [], ropes: [] };
  const hub = L.BOARDWALK_HUB;
  const boardwalkPaths = [];
  for (const bw of L.BOARDWALKS) {
    // Walks stop at the edge of the round hub platform (no rails across it).
    const pts = bw.pts.map((pt) => [...pt]);
    for (const [end, next] of [[0, 1], [pts.length - 1, pts.length - 2]]) {
      if (Math.hypot(pts[end][0] - hub.x, pts[end][1] - hub.z) < 0.5) {
        const dx = pts[next][0] - hub.x, dz = pts[next][1] - hub.z, d = Math.hypot(dx, dz);
        pts[end] = [hub.x + dx / d * (hub.r - 0.4), hub.z + dz / d * (hub.r - 0.4)];
      }
    }
    const p = new Path(pts, { spacing: 1 });
    boardwalkPaths.push(p);
    const g0 = groundAt(p.pts[0].x, p.pts[0].z), g1 = groundAt(p.pts[p.pts.length - 1].x, p.pts[p.pts.length - 1].z);
    const d0 = Math.max(deck, g0 + 0.25), d1 = Math.max(deck, g1 + 0.25);
    // Deck height: lake level + 1.2, ramping to the shore and never below the ground.
    const deckY = (s) => {
      const q = p.at(s).pos;
      return Math.max(lerp(d0, deck, smooth(s, 0, 6)) + (d1 - deck) * smooth(s, p.length - 6, p.length), groundAt(q.x, q.z) + 0.2);
    };
    // Junctions: where any walk starts or ends on another walk or the hub.
    const openings = L.BOARDWALKS.flatMap((o) => [o.pts[0], o.pts[o.pts.length - 1]]).map(([x, z]) => [x, z, 3.2]);
    S.boardwalk(scene, physics, p, { width: bw.w, deckY, bedAt, openings }, rand, bwItems);
    for (const pt of p.pts) clear.push([pt.x, pt.z, bw.w / 2 + 0.8]);
  }
  S.flushBoardwalks(scene, bwItems, rand);
  S.roundPlatform(scene, physics, { x: L.BOARDWALK_HUB.x, z: L.BOARDWALK_HUB.z, r: L.BOARDWALK_HUB.r, deckY: deck, bedAt }, rand);
  for (const h of L.STILT_HOUSES) {
    put(h.kind === 'tin' ? 'Stilt_House_Tin' : 'Stilt_House_Thatch', [{ x: h.x, z: h.z, yaw: h.rot, y: L.LAKE.level - 0.7 }]);
    clear.push([h.x, h.z, 6]);
  }
  put('Dugout_Canoe', [
    { x: -178, z: 160, yaw: 0.4, y: L.LAKE.level - 0.25 }, { x: -205, z: 172, yaw: 2.1, y: L.LAKE.level - 0.25 },
    { x: -196, z: 205, yaw: -0.6, y: L.LAKE.level - 0.25 }, { x: -140, z: 197, yaw: 1.3, y: L.LAKE.level - 0.25 },
    { x: -66, z: 104, yaw: 2.6, y: groundAt(-66, 104) - 0.1, tiltZ: 0.1 },
  ]);

  // ================= Riverside extraction: jetty, shelter, boat (ref 1) =================
  const jr = shape.riverInfo(L.JETTY.x, L.JETTY.z);
  const jc = shape.river.pts[jr.i];
  const jdir = shape.river.at(jr.s).dir;
  const toBank = new THREE.Vector3(-jdir.z, 0, jdir.x);
  if (toBank.x > 0) toBank.negate(); // west bank
  const root = jc.clone().addScaledVector(toBank, jr.hw + 3.2);
  const jYaw = Math.atan2(-(jc.z - root.z), jc.x - root.x);
  const jDeck = Math.max(jr.level + 1.0, groundAt(root.x, root.z) + 0.2);
  const J = S.jetty(scene, physics, { x: root.x, z: root.z, yaw: jYaw, length: L.JETTY.length, deckY: jDeck, bedAt }, rand);
  clear.push([root.x, root.z, 6], [jc.x, jc.z, 8]);
  const shelterAt = root.clone().addScaledVector(toBank, 7).addScaledVector(jdir, -3);
  S.shelter(scene, physics, { x: shelterAt.x, z: shelterAt.z, y: groundAt(shelterAt.x, shelterAt.z), yaw: jYaw + Math.PI / 2 }, rand);
  const suvAt = root.clone().addScaledVector(toBank, 8).addScaledVector(jdir, 8);
  put('Vehicle_SUV_Dark', [{ x: suvAt.x, z: suvAt.z, yaw: Math.atan2(jdir.x, jdir.z) + Math.PI / 2 + 0.3 }]);
  clear.push([shelterAt.x, shelterAt.z, 6], [suvAt.x, suvAt.z, 5]);
  S.puddles(scene, [[root.x + toBank.x * 4, root.z + toBank.z * 4 + 2, 2.4, 1.4, 0.4], [suvAt.x - 3, suvAt.z - 4, 2, 1.2, 1]], groundAt);

  const boat = new THREE.Group();
  const boatHull = S.dssBoat(rand);
  boatHull.rotation.y = -Math.PI / 2; // hull points along +x; make it face the group's +z
  boat.add(boatHull);
  const boatPos = J.end.clone();
  boatPos.y = jr.level;
  boat.position.copy(boatPos);
  boat.rotation.y = Math.atan2(-jdir.x, -jdir.z); // bow upstream, ready to leave
  scene.add(boat);
  // Boat leaves upstream, keeping clear of the bridge pier.
  const upstream = [];
  for (let s = jr.s; s > 120; s -= 12) {
    const { pos, dir } = shape.river.at(s);
    upstream.push(v3(pos.x - dir.z * 4, shape.riverLevelAt(s), pos.z + dir.x * 4));
  }
  upstream.unshift(boatPos.clone());

  // ================= Dry-land extraction: SUV and van (ref 1 vehicles) =================
  const DX = L.DRY_EXTRACTION;
  put('Vehicle_SUV_Dark', [{ x: DX.x - 4, z: DX.z - 5, yaw: -0.2 }]);
  const van = new THREE.Group();
  const vanMesh = new THREE.Mesh(K.Vehicle_Van_Grey.geo, K.Vehicle_Van_Grey.mat);
  vanMesh.scale.setScalar(3);
  vanMesh.rotation.y = Math.PI / 2; // front (local -x) faces the group's +z
  vanMesh.castShadow = vanMesh.receiveShadow = true;
  van.add(vanMesh);
  van.position.set(DX.x + 3, groundAt(DX.x + 3, DX.z) - 0.05, DX.z);
  van.rotation.y = -Math.PI / 2; // facing west, rear doors to the compound
  scene.add(van);
  const vanBody = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  const vb = K.Vehicle_Van_Grey.box;
  const vanLen = (vb.max.x - vb.min.x) * 3;
  physics.createCollider(RAPIER.ColliderDesc.cuboid((vb.max.z - vb.min.z) * 3 * 0.38, (vb.max.y - vb.min.y) * 1.5, vanLen / 2), vanBody);
  clear.push([DX.x, DX.z, 14]);
  const vanRoute = [van.position.clone()];
  for (let x = DX.x - 10; x > -258; x -= 10) vanRoute.push(v3(x, groundAt(x, DX.z + (x - DX.x) * 0.05) - 0.05, DX.z + (x - DX.x) * 0.05));

  // ================= Highland terraced village (refs 12, 13, 14) =================
  await step('Building the highland village');
  const VX = L.VILLAGE.x, VZ = L.VILLAGE.z;
  // Retaining walls along the terrace risers, from the Meshy dry-stone wall.
  const walls = [];
  for (let x = VX - 46; x < VX + 46; x += 4.1) {
    let prevStep = null;
    for (let z = VZ - 46; z < VZ + 46; z += 0.5) {
      if (Math.hypot(x - VX, z - VZ) > 44) continue;
      const h = groundAt(x, z), h2 = groundAt(x, z + 0.5);
      if (h - h2 > 0.45 && !prevStep && shape.trailDist(x, z) > 2.5) {
        walls.push({ x, z: z + 0.6, yaw: 0, y: h2 - 0.25, s: [1, (h - h2 + 1.4) / pieceSize(K.Stone_Wall_Dry).y, 1] });
        prevStep = z;
      } else if (prevStep && z - prevStep > 3) prevStep = null;
    }
  }
  put('Stone_Wall_Dry', walls.slice(0, phone ? 120 : 220));
  // Houses on flat terrace ground, kept off the village path.
  const homes = [], barns = [], granaries = [], carts = [];
  const taken = [];
  const flat = (x, z, r) => {
    const h = groundAt(x, z);
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7]]) if (Math.abs(groundAt(x + dx, z + dz) - h) > 0.35) return false;
    return true;
  };
  for (let tries = 0; tries < 900 && homes.length + barns.length + granaries.length < 17; tries++) {
    const a = rand() * 6.28, d = 8 + rand() * 40;
    const x = VX + Math.cos(a) * d, z = VZ + Math.sin(a) * d;
    const kind = homes.length < 7 ? 'home' : barns.length < 2 ? 'barn' : 'granary';
    const r = kind === 'granary' ? 2.4 : kind === 'barn' ? 6 : 4.4;
    if (shape.trailDist(x, z) < r + 1.5 || !flat(x, z, r) || taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < r + tr + 2)) continue;
    taken.push([x, z, r]);
    clear.push([x, z, r + 0.5]);
    const yaw = Math.round(rand() * 3) * Math.PI / 2 + (rand() - 0.5) * 0.2;
    (kind === 'home' ? homes : kind === 'barn' ? barns : granaries).push({ x, z, yaw, s: kind === 'granary' ? 0.62 : 1, sink: 0.05, tint: [0.8 + rand() * 0.1, 0.76 + rand() * 0.08, 0.72 + rand() * 0.08] });
  }
  put('House_MudBrick_TinRoof', homes);
  put('Barn_Long_TinRoof', barns);
  put('Hut_Thatched_Round', granaries);
  for (const [x, z] of [[VX - 6, VZ + 18], [VX + 20, VZ - 6]]) if (shape.trailDist(x, z) > 2) carts.push({ x, z, yaw: rand() * 6 });
  put('Wooden_Cart', carts);
  // Market stall: tarp on poles over a table (ref 14).
  const stallTarp = tarpMaterial('#c4a576', rand);
  const st = homes[0] ? [homes[0].x + 6, homes[0].z + 3] : [VX, VZ];
  if (shape.trailDist(st[0], st[1]) > 3) {
    const sy = groundAt(st[0], st[1]);
    cloth(scene, stallTarp, v3(st[0] - 2, sy + 2.5, st[1] - 1.5), v3(st[0] + 2, sy + 2.5, st[1] - 1.5), v3(st[0] - 2, sy + 2.1, st[1] + 1.5), v3(st[0] + 2, sy + 2.1, st[1] + 1.5), 0.15);
    put('Table_Wooden', [{ x: st[0], z: st[1], yaw: 0 }]);
  }
  // Maize patch on the upper terraces (ref 12).
  const maize = [];
  for (let i = 0; i < (phone ? 160 : 320); i++) {
    const x = VX + 18 + rand() * 22, z = VZ - 40 + rand() * 18;
    if (isClear(x, z, 0.5) && slopeAt(x, z) < 0.25) maize.push({ x, z });
  }
  V.maize(scene, maize, groundAt, rand);
  // Granite kopjes on the plateau (refs 12, 14): stacked boulders.
  const kopjes = [];
  for (const [kx, kz, size] of [[160, -95, 1.2], [70, -120, 1], [200, -40, 0.9], [110, -170, 1.3], [215, -150, 1], [60, -30, 0.7], [170, -10, 0.6], [100, -90, 0.7]]) {
    let top = 0;
    for (let k = 0; k < 7; k++) {
      const a = rand() * 6.28, r = (2 + rand() * 7) * size;
      const w = (4 + rand() * 4) * size;
      kopjes.push({ x: kx + Math.cos(a) * r, z: kz + Math.sin(a) * r, yaw: rand() * 6, s: [w, w * (0.6 + rand() * 0.4), w], sink: 0.2 * w, tiltX: (rand() - 0.5) * 0.3 });
    }
    for (let k = 0; k < 3; k++) {
      const w = (3 + rand() * 2.5) * size;
      kopjes.push({ x: kx + (rand() - 0.5) * 3, z: kz + (rand() - 0.5) * 3, yaw: rand() * 6, s: [w, w * 0.9, w], y: groundAt(kx, kz) + top + 1.5 * size, tiltX: (rand() - 0.5) * 0.3 });
      top += w * 0.75;
    }
    clear.push([kx, kz, 11 * size]);
  }
  // Scattered boulders across highlands and savanna.
  for (let i = 0; i < (phone ? 70 : 120); i++) {
    const x = (rand() - 0.5) * 2 * (L.HALF - 10), z = (rand() - 0.5) * 2 * (L.HALF - 10);
    if (shape.forest(x, z) > 0.5 || inWater(x, z, 2) || !isClear(x, z, 2.5) || shape.lakeR(x, z) < 1.3) continue;
    kopjes.push({ x, z, yaw: rand() * 6, s: 0.6 + rand() * 1.6 * (shape.highland(x, z) * 0.8 + 0.4), sink: 0.25, tiltX: (rand() - 0.5) * 0.4 });
  }
  put('Boulder_Granite', kopjes);
  // Granite rock shelter beside the plateau trail (ref 10): the Meshy U of
  // boulders, open towards the trail, with a flat slab balanced on top.
  const tun = { x: 85, z: -73 };
  const tunH = pieceSize(K.Rock_Arch_Tunnel).y;
  put('Rock_Arch_Tunnel', [{ x: tun.x, z: tun.z, yaw: Math.PI, sink: 0.3 }]);
  put('Boulder_Granite', [{ x: tun.x, z: tun.z, yaw: 0.3, s: [9, 2.2, 8], y: groundAt(tun.x, tun.z) + tunH - 0.9 }]);
  clear.push([tun.x, tun.z, 8]);
  // Viewpoint: a flat slab on the cliff edge over the gorge.
  put('River_Stone_Flat', [{ x: L.VIEWPOINT.x, z: L.VIEWPOINT.z, yaw: 0.4, s: [3.5, 1.6, 3.5], sink: 0.4, tint: [1.05, 1.0, 0.92] }]);
  clear.push([L.VIEWPOINT.x, L.VIEWPOINT.z, 6]);

  // ================= Ravine camp (ref 6) =================
  await step('Building the ravine camp');
  const RC = L.RAVINE_CAMP;
  const ry = (x, z) => groundAt(x, z);
  S.tent(scene, physics, { x: RC.x - 7, z: RC.z + 2, y: ry(RC.x - 7, RC.z + 2), yaw: 1.4 }, rand);
  S.tent(scene, physics, { x: RC.x + 1, z: RC.z - 8, y: ry(RC.x + 1, RC.z - 8), yaw: 0.2, color: '#a99467' }, rand);
  S.tent(scene, physics, { x: RC.x - 4, z: RC.z + 10, y: ry(RC.x - 4, RC.z + 10), yaw: 2.4 }, rand);
  const canopyTarp = tarpMaterial('#a3946b', rand);
  const ty = ry(RC.x, RC.z);
  for (const [px, pz] of [[-2, -1.6], [2, -1.6], [-2, 1.6], [2, 1.6]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), S.structureMaterials(rand).wood);
    pole.position.set(RC.x + px, ty + 1.3, RC.z + pz);
    scene.add(pole);
  }
  cloth(scene, canopyTarp, v3(RC.x - 2.3, ty + 2.6, RC.z - 1.9), v3(RC.x + 2.3, ty + 2.6, RC.z - 1.9), v3(RC.x - 2.3, ty + 2.3, RC.z + 1.9), v3(RC.x + 2.3, ty + 2.3, RC.z + 1.9), 0.2);
  put('Table_Wooden', [{ x: RC.x, z: RC.z, yaw: 0.1 }]);
  put('Drum_Blue', [{ x: RC.x - 3, z: RC.z - 3, yaw: 1 }, { x: RC.x + 3.5, z: RC.z + 2, yaw: 2 }, { x: RC.x - 9, z: RC.z - 2, yaw: 0.4 }]);
  put('Crate_Wooden', [{ x: RC.x + 3, z: RC.z - 3, yaw: 0.3 }, { x: RC.x + 3.8, z: RC.z - 3.4, yaw: 0.1 }]);
  clear.push([RC.x, RC.z, 13]);
  const ravineRocks = [];
  for (let i = 0; i < 40; i++) {
    const s = rand() * shape.ravine.length;
    const { pos, dir } = shape.ravine.at(s);
    const side = rand() < 0.5 ? -1 : 1;
    const off = side * (8 + rand() * 5);
    const x = pos.x - dir.z * off, z = pos.z + dir.x * off;
    if (!isClear(x, z, 2.5)) continue;
    ravineRocks.push({ x, z, yaw: rand() * 6, s: 1 + rand() * 2.4, sink: 0.4 });
  }
  put('Boulder_Granite', ravineRocks);

  // ================= Footbridges and stepping stones on the streams =================
  const crossings = [];
  for (const [trail, stream, hw] of [[shape.routes.arrival, shape.creek, 2.4], [shape.routes.ravine, shape.ravineStream, 1.5]]) {
    let best = { d: Infinity };
    for (let s = 0; s < trail.length; s += 0.5) {
      const p = trail.at(s).pos;
      const n = stream.nearest(p.x, p.z, 10);
      if (n.d < best.d) best = { d: n.d, s, p };
    }
    if (best.d < 3) crossings.push({ trail, s: best.s, hw });
  }
  for (const c of crossings) {
    const half = c.hw + 2.4;
    const a = c.trail.at(c.s - half).pos, b = c.trail.at(c.s + half).pos;
    a.y = groundAt(a.x, a.z) + 0.12;
    b.y = groundAt(b.x, b.z) + 0.12;
    S.plankBridge(scene, physics, a, b, { width: 1.9, arch: 0.45 }, rand);
  }
  // Stepping stones where the grotto path crosses its stream (ref 7).
  const gs = shape.routes.caveToBreach;
  let gBest = { d: Infinity };
  for (let s = 0; s < gs.length; s += 0.5) {
    const p = gs.at(s).pos;
    const n = shape.grottoStream.nearest(p.x, p.z, 10);
    if (n.d < gBest.d) gBest = { d: n.d, p, s, y: n.y };
  }
  if (gBest.d < 3) {
    const items = [];
    for (let k = -2; k <= 2; k++) {
      const p = gs.at(gBest.s + k * 1.15).pos;
      items.push({ x: p.x, z: p.z, y: gBest.y - 0.15, yaw: rand() * 6, s: 0.8 + rand() * 0.2 });
    }
    put('River_Stone_Flat', items);
  }
  // A second set below the forest footbridge (ref 7).
  {
    const n = shape.creek.nearest(160, 192);
    const p = shape.creek.pts[n.i], q = shape.creek.pts[Math.min(n.i + 1, shape.creek.pts.length - 1)];
    const dir = new THREE.Vector3(q.x - p.x, 0, q.z - p.z).normalize();
    const items = [];
    for (let k = -2; k <= 2; k++) items.push({ x: p.x - dir.z * k * 1.2, z: p.z + dir.x * k * 1.2, y: p.y - 0.15, yaw: rand() * 6, s: 0.75 + rand() * 0.25 });
    put('River_Stone_Flat', items);
  }

  // ================= Vegetation =================
  await step('Growing the forest');
  const k = phone ? 0.55 : 1;
  const trees = [];
  const tooClose = (list, x, z, d) => list.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < d * d);
  for (let i = 0; i < 9000 && trees.length < 175 * k; i++) {
    const x = (rand() - 0.5) * 2 * (L.HALF - 6), z = (rand() - 0.5) * 2 * (L.HALF - 6);
    const f = shape.forest(x, z);
    if (rand() > f * 0.9 || inWater(x, z, 3) || !isClear(x, z, 4.5) || slopeAt(x, z) > 0.6 || tooClose(trees, x, z, 13)) continue;
    trees.push({ x, z, s: 0.8 + rand() * 0.45 });
  }
  trees.push({ x: L.BOARDWALK_HUB.x, z: L.BOARDWALK_HUB.z, s: 0.55 }); // the hub tree of ref 3
  V.rainforestTrees(scene, physics, K.Rainforest_Tree_Buttress, trees, groundAt, rand, { phone });
  const mids = [];
  for (let i = 0; i < 9000 && mids.length < 300 * k; i++) {
    const x = (rand() - 0.5) * 2 * (L.HALF - 6), z = (rand() - 0.5) * 2 * (L.HALF - 6);
    const f = Math.max(shape.forest(x, z), Math.hypot(x - L.GROTTO.x, z - L.GROTTO.z) < 26 ? 0.8 : 0);
    if (rand() > f || inWater(x, z, 1.5) || !isClear(x, z, 2) || tooClose(mids, x, z, 6) || tooClose(trees, x, z, 4)) continue;
    mids.push({ x, z, s: 0.8 + rand() * 0.5 });
  }
  V.midTrees(scene, physics, mids, groundAt, rand);

  const oil = [], coco = [];
  for (let i = 0; i < 6000 && oil.length < 130 * k; i++) {
    const x = CP.x + (rand() - 0.5) * 170, z = CP.z + (rand() - 0.5) * 150;
    const ring = Math.max(Math.abs(x - CP.x) - CP.w / 2, Math.abs(z - CP.z) - CP.d / 2);
    if (ring < 6 && !(ring < -6 && rand() < 0.08)) continue; // a few inside the yard
    if (ring > 48 || x > -32) continue; // the plantation lies west of the river
    if (inWater(x, z, 2) || !isClear(x, z, 2) || shape.ridgeZone(x, z) > 0.5 || tooClose(oil, x, z, 7) || tooClose(trees, x, z, 6)) continue;
    oil.push({ x, z, s: 0.85 + rand() * 0.35 });
  }
  for (let i = 0; i < 6000 && coco.length < 90 * k; i++) {
    const x = L.LAKE.x + (rand() - 0.5) * 210, z = L.LAKE.z + (rand() - 0.5) * 170;
    const lr = shape.lakeR(x, z);
    const nearRiver = shape.riverInfo(x, z);
    if (!((lr > 0.9 && lr < 1.6) || (nearRiver.d < nearRiver.hw + 14 && z > 95)) && !(lr < 1 && groundAt(x, z) > L.LAKE.level + 0.3)) continue;
    if (inWater(x, z, 1) || !isClear(x, z, 2) || tooClose(coco, x, z, 6)) continue;
    coco.push({ x, z, s: 0.9 + rand() * 0.3 });
  }
  V.palms(scene, physics, oil, groundAt, rand, 'oil');
  V.palms(scene, physics, coco, groundAt, rand, 'coconut');

  const scatter = (n, accept) => {
    const out = [];
    for (let i = 0; i < n * 6 && out.length < n; i++) {
      const x = (rand() - 0.5) * 2 * (L.HALF - 4), z = (rand() - 0.5) * 2 * (L.HALF - 4);
      const s = accept(x, z);
      if (s) out.push({ x, z, s: typeof s === 'number' ? s : 1 });
    }
    return out;
  };
  // Understorey near trees and along trails in the forest (seen up close).
  const nearTrail = (x, z, d) => shape.trailDist(x, z, d) < d;
  V.ferns(scene, scatter(1900 * k, (x, z) => {
    const f = shape.forest(x, z) + (Math.hypot(x - L.GROTTO.x, z - L.GROTTO.z) < 22 ? 0.8 : 0);
    return rand() < f && !inWater(x, z, 0.3) && isClear(x, z, 0.5) && slopeAt(x, z) < 0.9 ? 0.8 + rand() * 0.6 : 0;
  }), groundAt, rand);
  V.taro(scene, scatter(520 * k, (x, z) => (rand() < shape.forest(x, z) * 0.8 && !inWater(x, z, 0.3) && isClear(x, z, 0.6) && (nearTrail(x, z, 12) || rand() < 0.3) ? 1 : 0)), groundAt, rand);
  V.bananas(scene, scatter(110 * k, (x, z) => {
    const nearHome = shape.compoundRect(x, z, 22) || shape.lakeR(x, z) < 1.4 || shape.forest(x, z) > 0.6;
    return nearHome && rand() < 0.5 && !inWater(x, z, 1) && isClear(x, z, 1.2) ? 1 : 0;
  }), groundAt, rand);
  V.shrubs(scene, scatter(650 * k, (x, z) => (rand() < shape.forest(x, z) * 0.9 + 0.08 && !inWater(x, z, 0.5) && isClear(x, z, 1) ? 1 : 0)), groundAt, rand, { hue: 98, light: 26 });
  V.shrubs(scene, scatter(320 * k, (x, z) => (shape.forest(x, z) < 0.2 && rand() < 0.6 && !inWater(x, z, 1) && isClear(x, z, 1) && shape.lakeR(x, z) > 1.2 ? 1 : 0)), groundAt, rand, { hue: 70, light: 32 });
  const acacia = scatter(80 * k, (x, z) => (shape.forest(x, z) < 0.15 && (shape.highland(x, z) > 0.5 || shape.ridgeZone(x, z) > 0.5 || (z > -40 && z < 110 && x > -20)) && rand() < 0.6 && !inWater(x, z, 3) && isClear(x, z, 3) && slopeAt(x, z) < 0.5 ? 0.8 + rand() * 0.5 : 0));
  V.acacias(scene, physics, acacia, groundAt, rand);
  // Grass: dry gold on open ground, green by water; densest near routes.
  V.grass(scene, scatter(10000 * k, (x, z) => {
    if (shape.forest(x, z) > 0.45 || inWater(x, z, 0.4) || shape.compoundRect(x, z, 1) || slopeAt(x, z) > 0.8) return 0;
    if (!nearTrail(x, z, 30) && rand() < 0.88) return 0;
    return isClear(x, z, 0.2) ? 1 : 0;
  }), groundAt, rand, { hue: 48, light: 44 });
  V.grass(scene, scatter(3200 * k, (x, z) => {
    const r = shape.riverInfo(x, z);
    const wetland = shape.lakeR(x, z) < 1.5;
    const bank = r.d < r.hw + 10;
    const yard = shape.compoundRect(x, z, 14) && !shape.compoundRect(x, z, -2);
    if (!(wetland || bank || yard || shape.forest(x, z) > 0.2) || inWater(x, z, 0.3)) return 0;
    return isClear(x, z, 0.2) ? 1.1 : 0;
  }), groundAt, rand, { hue: 82, light: 34, size: 1.15 });
  V.reeds(scene, scatter(1400 * k, (x, z) => {
    const lr = shape.lakeR(x, z);
    const r = shape.riverInfo(x, z);
    const g = groundAt(x, z);
    const edge = (lr < 1.15 && g > L.LAKE.level - 0.5 && g < L.LAKE.level + 0.6) || (r.d > r.hw - 1.5 && r.d < r.hw + 3 && z > 40);
    return edge && isClear(x, z, 0.4) ? 1 : 0;
  }), groundAt, rand);
  V.lilies(scene, scatter(260 * k, (x, z) => {
    const g = groundAt(x, z);
    return shape.lakeR(x, z) < 1 && g < L.LAKE.level - 0.3 && g > L.LAKE.level - 1.0 && isClear(x, z, 0.5) ? 0.6 + rand() * 0.7 : 0;
  }), L.LAKE.level, rand);
  // Vines over the compound walls and down the grotto cliffs.
  for (let i = 0; i < 26; i++) {
    const a = -2.4 + rand() * 1.8, r = L.GROTTO.r + 1.2;
    vineItems.push([L.GROTTO.x + Math.cos(a) * r, 13 + rand() * 3, L.GROTTO.z + Math.sin(a) * r, a + Math.PI / 2, 3 + rand() * 6, 1.8]);
  }
  V.hangingVines(scene, vineItems, rand);

  // ================= Extraction logic =================
  const toWorld = (v) => scene.localToWorld(v.clone());
  const W = (x, z) => [x + origin.x, z + origin.z];
  function attachHostages(hostages, onDelivered) {
    const river = createExtraction({
      hostages, vehicle: boat, radius: 14, onDelivered,
      board: () => toWorld(J.side), route: polylineRoute(upstream), speed: 8, returnAfter: 18,
    });
    const dry = createExtraction({
      hostages, vehicle: van, radius: 12, onDelivered,
      board: () => toWorld(van.position.clone().add(new THREE.Vector3(vanLen / 2 + 0.7, 0, 0))),
      route: polylineRoute(vanRoute), speed: 12, returnAfter: 15,
    });
    return (dt, player) => {
      river.update(dt, player);
      dry.update(dt, player);
      vanBody.setNextKinematicTranslation({ x: van.position.x + origin.x, y: van.position.y + (vb.max.y - vb.min.y) * 1.5, z: van.position.z + origin.z });
      vanBody.setNextKinematicRotation(van.quaternion);
    };
  }

  // Inside the cave the sky fill fades so the rock reads darker than daylight
  // (`caveDim`, 0..1, is applied by the shared lighting).
  const camLocal = new THREE.Vector3();
  const api = {
    origin,
    root: scene,
    hostageSpots: L.HOSTAGE_SPOTS.map(([x, z]) => W(x, z)),
    hostileSpots: L.HOSTILE_SPOTS.map(([x, z]) => W(x, z)),
    surfaceAt: (x, z, y) => surfaceAt(x - origin.x, z - origin.z, y),
    groundAt: (x, z) => groundAt(x - origin.x, z - origin.z),
    // Valley-local helpers (tests and tools).
    local: { groundAt, surfaceAt, cave, shape, boardwalkPaths },
    toWorld: (x, z) => W(x, z),
    caveDim: 0,
    attachHostages,
    update(dt, player, camera) {
      waterTime.value += dt;
      updateFall(dt);
      camLocal.set(camera.position.x - origin.x, camera.position.y, camera.position.z - origin.z);
      const inCave = cave.inside(camLocal.x, camLocal.z) && camLocal.y < cave.ceilAt(camLocal.x, camLocal.z) + 0.5;
      api.caveDim = THREE.MathUtils.damp(api.caveDim, inCave ? 1 - (cave.depth(camLocal.x, camLocal.z) < 0.3 ? 0.5 : 0) : 0, 3, dt);
    },
  };
  return api;
}
