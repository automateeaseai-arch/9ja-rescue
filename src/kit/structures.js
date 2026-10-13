// Code-built structures, matched to the references: concrete road bridge,
// plank footbridges, boardwalks and jetty, open sheds, an enterable store
// house, compound walls, canvas tents, a riverside shelter and the DSS boat.
// Everything walkable has physics; doors are real openings.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addFixedCollider } from '../world.js';
import { tarpMaterial, cloth } from '../camp.js';
import { addInstanced, mat } from './chunks.js';
import * as T from './textures.js';
import { weathered } from './materials.js';

const Y = new THREE.Vector3(0, 1, 0);
const quatYaw = (yaw) => new THREE.Quaternion().setFromAxisAngle(Y, yaw);

// Box with UVs scaled to real size, so textures tile at `tile` metres.
export function boxGeo(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
    }
  }
  return g;
}

// Adds a mesh at a local offset inside a placed frame (position + yaw).
function frame(x, y, z, yaw) {
  const q = quatYaw(yaw);
  const o = new THREE.Vector3(x, y, z);
  return {
    q,
    p: (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyQuaternion(q).add(o),
    add(scene, geo, material, lx, ly, lz, { shadow = true, rotY = 0, rotX = 0, rotZ = 0 } = {}) {
      const m = new THREE.Mesh(geo, material);
      m.position.copy(this.p(lx, ly, lz));
      m.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')));
      m.castShadow = shadow;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    },
    box(physics, hx, hy, hz, lx, ly, lz, rotY = 0) {
      addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(hx, hy, hz), this.p(lx, ly, lz), q.clone().multiply(quatYaw(rotY)));
    },
  };
}

let shared = null;
export function structureMaterials(rand) {
  if (shared) return shared;
  shared = {
    concrete: weathered(new THREE.MeshStandardMaterial({ map: T.concreteTexture(rand), roughness: 0.95 }), { grime: 0.5, moss: 0.4, streaks: 0.7 }),
    plaster: weathered(new THREE.MeshStandardMaterial({ map: T.plasterTexture(rand, '#d6d1c1'), roughness: 0.95 }), { grime: 0.65, moss: 0.75, streaks: 0.9 }),
    plasterTan: weathered(new THREE.MeshStandardMaterial({ map: T.plasterTexture(rand, '#cdb48c'), roughness: 0.95 }), { grime: 0.5, moss: 0.3, streaks: 0.6 }),
    rust: new THREE.MeshStandardMaterial({ map: T.corrugatedTexture(rand), roughness: 0.75, metalness: 0.25, side: THREE.DoubleSide }),
    rustGreen: new THREE.MeshStandardMaterial({ map: T.corrugatedTexture(rand, '#5f7258'), roughness: 0.75, metalness: 0.25, side: THREE.DoubleSide }),
    planks: new THREE.MeshStandardMaterial({ map: T.planksTexture(rand), roughness: 0.9 }),
    planksWet: new THREE.MeshStandardMaterial({ map: T.planksTexture(rand, 28, 26), roughness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ map: T.barkTexture(rand, '#6e5a44'), roughness: 1 }),
    rope: new THREE.MeshStandardMaterial({ color: '#a08460', roughness: 1 }),
    floor: new THREE.MeshStandardMaterial({ color: '#7d6a55', roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1c1a17', roughness: 1 }),
    shutter: new THREE.MeshStandardMaterial({ map: T.planksTexture(rand, 200, 30), roughness: 0.9 }),
    blueDoor: new THREE.MeshStandardMaterial({ map: T.corrugatedTexture(rand, '#4d6f8a'), roughness: 0.7, metalness: 0.3 }),
  };
  return shared;
}

// ---- Concrete road bridge with a central pier (reference 11) ----
// Runs along local x, centred at (x, z); `deck` is the walking height.
export function concreteBridge(scene, physics, { x, z, length, width, deck, yaw = 0, bedAt }, rand) {
  const M = structureMaterials(rand);
  const f = frame(x, 0, z, yaw);
  const th = 0.7;
  f.add(scene, boxGeo(length, th, width, 3), M.concrete, 0, deck - th / 2, 0);
  f.box(physics, length / 2, th / 2, width / 2, 0, deck - th / 2, 0);
  // Edge beams and parapets with square posts.
  for (const side of [-1, 1]) {
    const zz = side * (width / 2 - 0.15);
    f.add(scene, boxGeo(length, 0.25, 0.3, 2), M.concrete, 0, deck + 0.85, zz);
    f.add(scene, boxGeo(length, 0.35, 0.35, 2), M.concrete, 0, deck + 0.18, zz);
    f.box(physics, length / 2, 0.55, 0.15, 0, deck + 0.55, zz);
    for (let px = -length / 2 + 0.3; px <= length / 2; px += 2.2) f.add(scene, boxGeo(0.3, 0.7, 0.3, 1), M.concrete, px, deck + 0.55, zz);
    f.add(scene, boxGeo(length, 0.6, 0.25, 2), M.concrete, 0, deck - th - 0.3, side * (width / 2 - 0.1)); // fascia beam
  }
  // Pier and abutments down to the bed.
  for (const px of [0, -length / 2 + 0.6, length / 2 - 0.6]) {
    const w = f.p(px, 0, 0);
    const bed = bedAt(w.x, w.z) - 1.5;
    const h = deck - th - bed;
    const pierW = px === 0 ? 2.2 : 1.2;
    f.add(scene, boxGeo(pierW, h, width - 0.4, 2), M.concrete, px, bed + h / 2, 0);
    f.box(physics, pierW / 2, h / 2, (width - 0.4) / 2, px, bed + h / 2, 0);
    if (px === 0) f.add(scene, boxGeo(pierW + 0.6, 1.2, width + 0.2, 2), M.concrete, px, bed + 1.2, 0);
  }
}

// ---- Plank footbridge between two deck points (references 7 and 16) ----
export function plankBridge(scene, physics, a, b, { width = 1.8, arch = 0.4, rails = true } = {}, rand) {
  const M = structureMaterials(rand);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.hypot(dir.x, dir.z);
  const yaw = Math.atan2(-dir.z, dir.x);
  const mid = a.clone().lerp(b, 0.5);
  const f = frame(mid.x, 0, mid.z, yaw);
  const yAt = (t) => THREE.MathUtils.lerp(a.y, b.y, t) + Math.sin(t * Math.PI) * arch;
  const plank = boxGeo(0.28, 0.08, width, 1);
  const planks = [];
  for (let s = 0.15; s < len; s += 0.32) {
    const t = s / len;
    const p = f.p(s - len / 2, yAt(t), 0);
    planks.push({ m: mat(p.x, p.y, p.z, yaw, 1, 0, 0), c: new THREE.Color().setScalar(0.85 + rand() * 0.3) });
  }
  addInstanced(scene, plank, M.planks, planks, { maxDist: 160 });
  // Walkable deck in a few straight pieces following the arch.
  const pieces = 4;
  for (let i = 0; i < pieces; i++) {
    const t0 = i / pieces, t1 = (i + 1) / pieces;
    const y0 = yAt(t0), y1 = yAt(t1);
    const c = f.p((t0 + t1) / 2 * len - len / 2, (y0 + y1) / 2 - 0.05, 0);
    const pitch = Math.atan2(y1 - y0, len / pieces);
    const q = f.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch));
    addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(len / pieces / 2 + 0.05, 0.06, width / 2), c, q);
  }
  // Log posts and rails.
  const post = new THREE.CylinderGeometry(0.09, 0.11, 1, 6);
  for (const side of [-1, 1]) {
    for (let s = 0; s <= len + 0.01; s += len / 4) {
      const t = s / len;
      f.add(scene, post, M.wood, s - len / 2, yAt(t) + (rails ? 0.1 : -0.6), side * width / 2, { shadow: true }).scale.set(1, rails ? 2.2 : 1.6, 1);
    }
    if (rails) {
      for (const hgt of [0.5, 1.0]) {
        const rail = new THREE.CylinderGeometry(0.05, 0.05, len, 5);
        rail.rotateZ(Math.PI / 2);
        f.add(scene, rail, M.wood, 0, (a.y + b.y) / 2 + arch * 0.7 + hgt, side * width / 2);
      }
      f.box(physics, len / 2, 0.5, 0.06, 0, (a.y + b.y) / 2 + arch * 0.6 + 0.6, side * width / 2);
    }
  }
}

// ---- Boardwalks on stilts with rope rails (references 2 and 3) ----
// `path` is a kit Path; deck height is `deckY` (number or function of s).
export function boardwalk(scene, physics, path, { width = 2.2, deckY, bedAt, rails = true, openings = [] }, rand, collect) {
  // No rails where another walk joins ([x, z, radius] openings).
  const open = (x, z) => openings.some(([ox, oz, r]) => Math.hypot(x - ox, z - oz) < r);
  const M = structureMaterials(rand);
  const plank = boxGeo(0.26, 0.07, width, 1);
  const post = new THREE.CylinderGeometry(0.1, 0.12, 1, 6);
  post.translate(0, 0.5, 0);
  const items = collect ?? { planks: [], posts: [], ropes: [] };
  const yAt = (s) => (typeof deckY === 'function' ? deckY(s) : deckY);
  for (let s = 0.1; s < path.length; s += 0.3) {
    const { pos, dir } = path.at(s);
    const yaw = Math.atan2(-dir.z, dir.x);
    items.planks.push({ w: width, m: mat(pos.x, yAt(s), pos.z, yaw, 1, 0, (rand() - 0.5) * 0.04), c: new THREE.Color().setScalar(0.78 + rand() * 0.35) });
  }
  let prev = null;
  for (let s = 0; s <= path.length; s += 2.4) {
    const { pos, dir } = path.at(s);
    const nx = -dir.z, nz = dir.x;
    const top = yAt(s);
    for (const side of [-1, 1]) {
      const px = pos.x + nx * side * (width / 2 + 0.05), pz = pos.z + nz * side * (width / 2 + 0.05);
      const bed = bedAt(px, pz) - 0.8;
      const tall = rails && Math.round(s / 2.4) % 2 === 0 && !open(px, pz);
      const h = top - bed + (tall ? 1.05 : -0.05);
      items.posts.push({ m: mat(px, bed, pz, 0, [1, h, 1]), c: new THREE.Color().setScalar(0.75 + rand() * 0.3) });
      if (tall && rails) {
        const p = new THREE.Vector3(px, top + 0.9, pz);
        if (prev?.[side]) items.ropes.push([prev[side], p]);
        prev = prev ?? {};
        prev[side] = p;
      } else if (rails && open(px, pz) && prev) prev[side] = null;
    }
    // Deck collider for this stretch.
    const s1 = Math.min(path.length, s + 2.4);
    if (s1 - s > 0.2) {
      const a = path.at(s).pos, b = path.at(s1).pos;
      const c = a.clone().lerp(b, 0.5);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
      // Tilted to follow ramps at the shore ends, so there is no step.
      const q = quatYaw(yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(yAt(s1) - yAt(s), len)));
      addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(len / 2 + 0.15, 0.06, width / 2), { x: c.x, y: (yAt(s) + yAt(s1)) / 2 - 0.04, z: c.z }, q);
      if (rails) {
        for (const side of [-1, 1]) {
          const rx = c.x + -(b.z - a.z) / len * side * (width / 2 + 0.05), rz = c.z + (b.x - a.x) / len * side * (width / 2 + 0.05);
          if (open(rx, rz)) continue;
          addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(len / 2 + 0.1, 0.45, 0.05), { x: rx, y: (yAt(s) + yAt(s1)) / 2 + 0.5, z: rz }, q);
        }
      }
    }
  }
  if (!collect) flushBoardwalks(scene, items, rand);
  return items;
}

// Builds the instanced meshes for one or more boardwalks collected together.
export function flushBoardwalks(scene, items, rand) {
  const M = structureMaterials(rand);
  // Planks were sized for each walk's width; rebuild per width group.
  const byWidth = new Map();
  for (const it of items.planks) {
    const k = it.w ?? 0;
    if (!byWidth.has(k)) byWidth.set(k, []);
    byWidth.get(k).push(it);
  }
  for (const [w, list] of byWidth) addInstanced(scene, boxGeo(0.26, 0.07, w || 2.2, 1), M.planksWet, list, { maxDist: 220 });
  const post = new THREE.CylinderGeometry(0.1, 0.12, 1, 6);
  post.translate(0, 0.5, 0);
  addInstanced(scene, post, M.wood, items.posts, { maxDist: 220 });
  // Ropes as thin cylinders between tall posts, sagging slightly.
  const rope = new THREE.CylinderGeometry(0.025, 0.025, 1, 4);
  rope.translate(0, 0.5, 0);
  const ropeItems = [];
  for (const [a, b] of items.ropes) {
    const mid = a.clone().lerp(b, 0.5);
    mid.y -= 0.12;
    for (const [p, q] of [[a, mid], [mid, b]]) {
      const d = new THREE.Vector3().subVectors(q, p);
      const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize()), new THREE.Vector3(1, d.length(), 1));
      ropeItems.push({ m });
    }
  }
  addInstanced(scene, rope, M.rope, ropeItems, { maxDist: 120, shadow: false });
}

// Round deck around a tree trunk (the boardwalk hub of reference 3).
export function roundPlatform(scene, physics, { x, z, r, deckY, bedAt }, rand) {
  const M = structureMaterials(rand);
  const ring = new THREE.RingGeometry(1.2, r, 28, 1);
  ring.rotateX(-Math.PI / 2);
  const uv = ring.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r, uv.getY(i) * r);
  const deck = new THREE.Mesh(ring, M.planksWet);
  deck.position.set(x, deckY, z);
  deck.receiveShadow = true;
  scene.add(deck);
  addFixedCollider(physics, RAPIER.ColliderDesc.cylinder(0.06, r), { x, y: deckY - 0.04, z });
  const post = new THREE.CylinderGeometry(0.12, 0.14, 1, 6);
  post.translate(0, 0.5, 0);
  const posts = [];
  for (let a = 0; a < 6.28; a += 0.6) {
    const px = x + Math.cos(a) * (r - 0.2), pz = z + Math.sin(a) * (r - 0.2);
    const bed = bedAt(px, pz) - 0.8;
    posts.push({ m: mat(px, bed, pz, 0, [1, deckY - bed, 1]) });
  }
  addInstanced(scene, post, M.wood, posts, { maxDist: 200 });
}

// ---- Jetty (reference 1): straight boardwalk out into the water, railings,
// mooring posts and a life ring. Returns the end point for the boat. ----
export function jetty(scene, physics, { x, z, yaw, length, width = 2.6, deckY, bedAt }, rand) {
  const M = structureMaterials(rand);
  const f = frame(x, 0, z, yaw);
  f.add(scene, boxGeo(length, 0.12, width, 2), M.planksWet, length / 2, deckY - 0.06, 0);
  f.box(physics, length / 2, 0.06, width / 2, length / 2, deckY - 0.06, 0);
  const post = new THREE.CylinderGeometry(0.13, 0.15, 1, 7);
  post.translate(0, 0.5, 0);
  for (let s = 0; s <= length; s += 2.2) {
    for (const side of [-1, 1]) {
      const w = f.p(s, 0, side * (width / 2 + 0.05));
      const bed = bedAt(w.x, w.z) - 0.8;
      const tall = side < 0 || s > length - 3;
      const m = f.add(scene, post, M.wood, s, bed, side * (width / 2 + 0.05));
      m.scale.set(1, deckY - bed + (tall ? 1.1 : 0.15), 1);
    }
  }
  // Railing on the upstream side, open on the boat side.
  for (const hgt of [0.55, 1.0]) {
    const rail = boxGeo(length, 0.08, 0.08, 1);
    f.add(scene, rail, M.wood, length / 2, deckY + hgt, -(width / 2 + 0.05));
  }
  f.box(physics, length / 2, 0.55, 0.06, length / 2, deckY + 0.55, -(width / 2 + 0.05));
  // Life ring on a post.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.09, 8, 18), new THREE.MeshStandardMaterial({ color: '#e0532a', roughness: 0.6 }));
  ring.position.copy(f.p(length * 0.55, deckY + 0.75, -(width / 2 + 0.12)));
  ring.quaternion.copy(f.q);
  ring.castShadow = true;
  scene.add(ring);
  return { end: f.p(length - 1, deckY, width / 2 + 1.6), side: f.p(length * 0.6, deckY, width / 2 - 0.3), f };
}

// ---- Open-sided riverside shelter with benches (reference 1) ----
export function shelter(scene, physics, { x, z, y, yaw, w = 8, d = 4.5, h = 3 }, rand) {
  const M = structureMaterials(rand);
  const f = frame(x, y, z, yaw);
  const post = boxGeo(0.18, h + 0.4, 0.18, 1);
  for (const px of [-w / 2, 0, w / 2]) {
    for (const pz of [-d / 2, d / 2]) {
      f.add(scene, post, M.wood, px, (h + 0.4) / 2 + (pz < 0 ? 0.3 : 0), pz);
      f.box(physics, 0.1, (h + 0.4) / 2, 0.1, px, (h + 0.4) / 2, pz);
    }
  }
  // Single pitched corrugated roof, mossy green and rusty.
  f.add(scene, boxGeo(w + 1.2, 0.05, d + 1.4, 1.5), M.rustGreen, 0, h + 0.55, 0, { rotX: 0.14 });
  f.add(scene, boxGeo(w, 0.15, 0.15, 1), M.wood, 0, h + 0.75, -d / 2);
  f.add(scene, boxGeo(w, 0.15, 0.15, 1), M.wood, 0, h + 0.4, d / 2);
  f.add(scene, new THREE.PlaneGeometry(w, d), M.planks, 0, 0.03, 0, { rotX: -Math.PI / 2, shadow: false });
  // Benches along the back.
  for (const bx of [-w / 4, w / 4]) {
    f.add(scene, boxGeo(w / 2 - 0.4, 0.07, 0.45, 1), M.planks, bx, 0.48, -d / 2 + 0.5);
    f.add(scene, boxGeo(w / 2 - 0.4, 0.5, 0.06, 1), M.planks, bx, 0.85, -d / 2 + 0.25);
    f.box(physics, (w / 2 - 0.4) / 2, 0.25, 0.25, bx, 0.25, -d / 2 + 0.5);
  }
  // Orange life jackets on the bench.
  const jacket = boxGeo(0.45, 0.55, 0.16, 1);
  const orange = new THREE.MeshStandardMaterial({ color: '#e2582a', roughness: 0.7 });
  for (let i = 0; i < 4; i++) f.add(scene, jacket, orange, -w / 4 + i * 0.5 - 0.6, 0.82, -d / 2 + 0.42, { rotX: -0.2 });
}

// ---- Open storage shed: timber posts, rusty gable roof, concrete slab ----
export function openShed(scene, physics, { x, z, y, yaw = 0, w, d, h = 3.6, back = false }, rand) {
  const M = structureMaterials(rand);
  const f = frame(x, y, z, yaw);
  f.add(scene, boxGeo(w + 0.6, 0.25, d + 0.6, 2), M.concrete, 0, 0.0, 0);
  addFixedCollider(physics, RAPIER.ColliderDesc.cuboid((w + 0.6) / 2, 0.125, (d + 0.6) / 2), f.p(0, 0, 0), f.q);
  const post = boxGeo(0.22, h, 0.22, 1);
  const nx = Math.max(2, Math.round(w / 3.2));
  for (let i = 0; i <= nx; i++) {
    for (const pz of [-d / 2, d / 2]) {
      const px = -w / 2 + (i / nx) * w;
      f.add(scene, post, M.wood, px, h / 2 + 0.12, pz);
      f.box(physics, 0.11, h / 2, 0.11, px, h / 2 + 0.12, pz);
    }
  }
  const ridge = 1.3;
  const slope = Math.atan2(ridge, d / 2);
  const panel = Math.hypot(ridge, d / 2) + 0.6;
  for (const side of [-1, 1]) {
    f.add(scene, boxGeo(w + 1, 0.05, panel, 1.4), M.rust, 0, h + 0.12 + ridge / 2, side * d / 4, { rotX: side * slope });
    f.add(scene, boxGeo(w, 0.14, 0.14, 1), M.wood, 0, h + 0.12, side * d / 2);
  }
  f.add(scene, boxGeo(w + 0.4, 0.16, 0.16, 1), M.wood, 0, h + 0.12 + ridge, 0);
  if (back) {
    // Corrugated sheet wall at the back.
    f.add(scene, boxGeo(w, h, 0.05, 1.4), M.rust, 0, h / 2 + 0.12, -d / 2 - 0.05);
    f.box(physics, w / 2, h / 2, 0.08, 0, h / 2 + 0.12, -d / 2 - 0.05);
  }
}

// ---- Enterable plastered building with door, shuttered windows, floor and
// a corrugated roof. Door in the front wall (+z local). ----
export function codeBuilding(scene, physics, { x, z, y, yaw = 0, w, d, h = 3, door = 1.3, plaster = 'plaster', roofOverhang = 0.5 }, rand) {
  const M = structureMaterials(rand);
  const f = frame(x, y, z, yaw);
  const T_ = 0.3;
  const wall = M[plaster];
  const walls = [
    [w, T_, 0, -d / 2],
    [T_, d, -w / 2, 0],
    [T_, d, w / 2, 0],
    [(w - door) / 2, T_, -(w + door) / 4, d / 2],
    [(w - door) / 2, T_, (w + door) / 4, d / 2],
  ];
  for (const [ww, dd, lx, lz] of walls) {
    f.add(scene, boxGeo(ww, h, dd, 2.5), wall, lx, h / 2, lz);
    f.box(physics, ww / 2, h / 2, dd / 2, lx, h / 2, lz);
  }
  f.add(scene, boxGeo(door, h - 2.2, T_, 2.5), wall, 0, 2.2 + (h - 2.2) / 2, d / 2);
  // Door leaf swung open inside, and a dark door frame.
  f.add(scene, boxGeo(door - 0.1, 2.1, 0.06, 1), M.shutter, -door / 2 + 0.05, 1.05, d / 2 - 0.55, { rotY: -1.2 });
  // Windows: dark recesses with open timber shutters.
  for (const side of [-1, 1]) {
    const lx = side * (w / 2 + T_ / 2 + 0.01);
    f.add(scene, boxGeo(0.02, 0.9, 1.0, 1), M.dark, lx, 1.7, -d / 6);
    f.add(scene, boxGeo(0.04, 0.95, 0.5, 1), M.shutter, lx + side * 0.12, 1.7, -d / 6 - 0.72, { rotY: side * 0.4 });
  }
  f.add(scene, boxGeo(1.0, 0.9, 0.02, 1), M.dark, -w / 4, 1.7, -d / 2 - 0.16);
  // Floor (packed earth inside) and roof.
  f.add(scene, new THREE.PlaneGeometry(w - T_, d - T_), M.floor, 0, 0.03, 0, { rotX: -Math.PI / 2, shadow: false });
  const pitch = 0.12;
  f.add(scene, boxGeo(w + roofOverhang * 2, 0.05, d + roofOverhang * 2, 1.4), M.rust, 0, h + 0.05 + Math.sin(pitch) * d / 2, 0, { rotX: pitch });
  // Ceiling so the inside reads as a room from the camera.
  f.add(scene, new THREE.PlaneGeometry(w, d), M.floor, 0, h - 0.02, 0, { rotX: Math.PI / 2, shadow: false });
  return f;
}

// ---- Compound wall: plastered blockwork with pillars, broken stretches
// and rubble. `runs` is a list of [ax, az, bx, bz, gaps[]] where gaps are
// [t0, t1] fractions left open (gates, breaches). ----
export function compoundWall(scene, physics, runs, heightAt, rand) {
  const M = structureMaterials(rand);
  const H = 2.4, T_ = 0.3;
  const panels = [], pillars = [], rubble = [];
  for (const [ax, az, bx, bz, gaps = []] of runs) {
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(-(bz - az), bx - ax);
    const n = Math.ceil(len / 4);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
      const gap = gaps.find(([g0, g1]) => tm > g0 && tm < g1);
      const x = ax + (bx - ax) * tm, z = az + (bz - az) * tm;
      const y = heightAt(x, z);
      if (gap) {
        if (gap[2] === 'breach') {
          // Broken wall: a stump of blockwork and rubble.
          panels.push({ m: mat(x, y + 0.35, z, yaw, [len / n * 0.6, 0.7, 1]), c: new THREE.Color().setScalar(0.85) });
          for (let r = 0; r < 6; r++) rubble.push({ m: mat(x + (rand() - 0.5) * 3, y + 0.1, z + (rand() - 0.5) * 2.5, rand() * 6, [0.4 + rand() * 0.5, 0.25 + rand() * 0.3, 0.3 + rand() * 0.4], rand(), rand()), c: new THREE.Color().setScalar(0.7 + rand() * 0.3) });
        }
        continue;
      }
      const hh = H - (rand() < 0.2 ? rand() * 0.6 : 0);
      panels.push({ m: mat(x, y + hh / 2 - 0.2, z, yaw, [len / n, hh + 0.4, 1]), c: new THREE.Color().setScalar(0.82 + rand() * 0.22) });
      addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(len / n / 2, (hh + 0.4) / 2, T_ / 2 + 0.05), { x, y: y + hh / 2 - 0.2, z }, quatYaw(yaw));
      const px = ax + (bx - ax) * t1, pz = az + (bz - az) * t1;
      pillars.push({ m: mat(px, heightAt(px, pz) + H / 2, pz, yaw, 1), c: new THREE.Color().setScalar(0.85 + rand() * 0.2) });
    }
  }
  // Panels are unit boxes stretched per copy: tile so a 4 m panel shows the
  // texture about 1.6 times.
  addInstanced(scene, boxGeo(1, 1, T_, 0.62), M.plaster, panels, { maxDist: 260 });
  addInstanced(scene, boxGeo(0.5, H + 0.4, 0.5, 1.6), M.plaster, pillars, { maxDist: 260 });
  addInstanced(scene, new THREE.DodecahedronGeometry(1, 0), M.concrete, rubble, { maxDist: 120 });
}

// ---- Canvas ridge tent (reference 6), enterable through the open front ----
export function tent(scene, physics, { x, z, y, yaw = 0, w = 3.4, d = 4.4, h = 2.4, color = '#5d6b3e' }, rand) {
  const canvas = tarpMaterial(color, rand);
  const M = structureMaterials(rand);
  const f = frame(x, y, z, yaw);
  const ridgeF = f.p(0, h, d / 2), ridgeB = f.p(0, h, -d / 2);
  for (const side of [-1, 1]) {
    cloth(scene, canvas, ridgeB, ridgeF, f.p(side * w / 2, 0.35, -d / 2), f.p(side * w / 2, 0.35, d / 2), 0.08);
    cloth(scene, canvas, f.p(side * w / 2, 0.35, -d / 2), f.p(side * w / 2, 0.35, d / 2), f.p(side * (w / 2 + 0.15), 0.0, -d / 2), f.p(side * (w / 2 + 0.15), 0.0, d / 2), 0.02);
    // Collision: the sloped canvas walls.
    const ang = Math.atan2(h, w / 2);
    const len = Math.hypot(h, w / 2);
    const q = f.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * -(Math.PI / 2 - ang)));
    addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(0.05, len / 2, d / 2), f.p(side * w / 4, h / 2, 0), q);
  }
  // Back wall (triangle) and rolled-up front flaps.
  const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w / 2, 0, 0), new THREE.Vector3(w / 2, 0, 0), new THREE.Vector3(0, h, 0)]);
  tri.computeVertexNormals();
  f.add(scene, tri, canvas, 0, 0, -d / 2);
  f.box(physics, w / 2, h / 2, 0.05, 0, h / 2, -d / 2);
  const roll = new THREE.CylinderGeometry(0.14, 0.14, h * 0.9, 8);
  for (const side of [-1, 1]) f.add(scene, roll, canvas, side * w * 0.28, h * 0.48, d / 2 + 0.05, { rotZ: side * -0.6 });
  // Poles, guy ropes and groundsheet.
  const pole = new THREE.CylinderGeometry(0.035, 0.035, h, 5);
  for (const pz of [-d / 2, d / 2]) f.add(scene, pole, M.wood, 0, h / 2, pz);
  const ropeG = new THREE.CylinderGeometry(0.012, 0.012, 1, 3);
  ropeG.translate(0, 0.5, 0);
  for (const pz of [-d / 2 - 0.1, d / 2 + 0.1]) {
    const a = f.p(0, h, pz), b = f.p(0, 0, pz + Math.sign(pz) * 1.8);
    const r = new THREE.Mesh(ropeG, M.rope);
    r.position.copy(b);
    r.quaternion.setFromUnitVectors(Y, a.clone().sub(b).normalize());
    r.scale.y = a.distanceTo(b);
    scene.add(r);
  }
  f.add(scene, new THREE.PlaneGeometry(w - 0.2, d), new THREE.MeshStandardMaterial({ color: '#4a4f38', roughness: 1 }), 0, 0.03, 0, { rotX: -Math.PI / 2, shadow: false });
}

// ---- Small props ----
export function waterTank(scene, physics, { x, z, y }, rand) {
  const M = structureMaterials(rand);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.1, 20), new THREE.MeshStandardMaterial({ color: '#3a5e86', roughness: 0.55 }));
  tank.position.set(x, y + 1.4 + 1.05, z);
  tank.castShadow = tank.receiveShadow = true;
  scene.add(tank);
  const stand = boxGeo(2.3, 1.4, 2.3, 1);
  const s = new THREE.Mesh(stand, M.concrete);
  s.position.set(x, y + 0.7, z);
  s.castShadow = true;
  scene.add(s);
  addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(1.15, 1.75, 1.15), { x, y: y + 1.75, z });
}

// Heaps of oil-palm fruit bunches (reference 5).
export function fruitPiles(scene, spots, heightAt, rand) {
  const g = new THREE.IcosahedronGeometry(0.22, 0);
  const m = new THREE.MeshStandardMaterial({ color: '#5a2418', roughness: 0.6 });
  const items = [];
  for (const [x, z, r = 1.2] of spots) {
    for (let i = 0; i < 40; i++) {
      const a = rand() * 6.28, d = Math.sqrt(rand()) * r;
      const hgt = (1 - d / r) * 0.8;
      items.push({ m: mat(x + Math.cos(a) * d, heightAt(x, z) + hgt * rand() + 0.1, z + Math.sin(a) * d, rand() * 6, 0.8 + rand() * 0.6), c: new THREE.Color().setHSL(0.02 + rand() * 0.04, 0.6, 0.18 + rand() * 0.15) });
    }
  }
  addInstanced(scene, g, m, items, { maxDist: 100 });
}

// Muddy puddles that mirror the sky (references 1, 5, 16).
export function puddles(scene, spots, heightAt) {
  const g = new THREE.CircleGeometry(1, 18);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color: '#6f6450', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.85, depthWrite: false });
  addInstanced(scene, g, m, spots.map(([x, z, rx, rz, yaw = 0]) => ({ m: mat(x, heightAt(x, z) + 0.04, z, yaw, [rx, 1, rz]) })), { maxDist: 120, shadow: false, receive: true });
}

// ---- DSS patrol boat with a canopy (reference 1) ----
export function dssBoat(rand) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#3d4247', roughness: 0.55, metalness: 0.3 });
  // Hull: a lofted shape, flat stern, pointed bow along +x.
  const shape = new THREE.Shape();
  shape.moveTo(-3.2, -1.1);
  shape.lineTo(1.8, -1.1);
  shape.quadraticCurveTo(3.4, -0.6, 3.8, 0);
  shape.quadraticCurveTo(3.4, 0.6, 1.8, 1.1);
  shape.lineTo(-3.2, 1.1);
  shape.closePath();
  const hullG = new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 });
  hullG.rotateX(-Math.PI / 2);
  const hull = new THREE.Mesh(hullG, hullMat);
  hull.position.y = -0.55;
  g.add(hull);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(6, 2), new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.8 }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(-0.4, 0.37, 0);
  g.add(deck);
  // Canopy on four poles, seats and orange life jackets, outboard motor.
  const canopy = new THREE.Mesh(boxGeo(4.2, 0.08, 2.3, 1), new THREE.MeshStandardMaterial({ color: '#4b5536', roughness: 0.9 }));
  canopy.position.set(-0.6, 2.1, 0);
  g.add(canopy);
  const pole = new THREE.CylinderGeometry(0.03, 0.03, 1.75, 5);
  const metal = new THREE.MeshStandardMaterial({ color: '#9aa0a3', metalness: 0.7, roughness: 0.35 });
  for (const px of [-2.6, 1.4]) for (const pz of [-1, 1]) { const p = new THREE.Mesh(pole, metal); p.position.set(px, 1.25, pz); g.add(p); }
  const seatMat = new THREE.MeshStandardMaterial({ color: '#22262a', roughness: 0.8 });
  const jacketMat = new THREE.MeshStandardMaterial({ color: '#e2582a', roughness: 0.7 });
  for (const px of [-1.8, -0.6, 0.6]) {
    const s = new THREE.Mesh(boxGeo(0.5, 0.45, 1.8, 1), seatMat); s.position.set(px, 0.6, 0); g.add(s);
    for (const pz of [-0.5, 0.5]) { const j = new THREE.Mesh(boxGeo(0.35, 0.45, 0.15, 1), jacketMat); j.position.set(px - 0.1, 1.0, pz); g.add(j); }
  }
  const motor = new THREE.Mesh(boxGeo(0.5, 0.9, 0.45, 1), new THREE.MeshStandardMaterial({ color: '#1f2224', roughness: 0.4, metalness: 0.4 }));
  motor.position.set(-3.45, 0.75, 0);
  g.add(motor);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
