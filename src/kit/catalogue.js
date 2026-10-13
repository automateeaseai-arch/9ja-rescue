// Catalogue of the Meshy environment pieces: file, default size, collision
// and weathering. Layouts refer to pieces by name and only give positions,
// so new villages, camps or riversides need no new generations.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGlb } from '../player.js';
import { bakeModel, addFixedCollider } from '../world.js';
import { addInstanced, mat, clusterSimplify } from './chunks.js';
import { weathered, rockSurface } from './materials.js';
import { doorwayFor, cutDoorway, interiorGeometry, interiorMaterial, addRoomColliders } from './doors.js';

// scale: metres per model unit (models are ~1.9 units across).
// collider: 'box' (fitted, `shrink` x/z), 'trimesh' (exact, walk-through
// shapes), 'none'. `look` picks a weathering shader.
export const CATALOGUE = {
  // New River Valley kit (Meshy text-to-3D, 30 credits each)
  Stilt_House_Thatch: { file: 'valley/Stilt_House_Thatch', scale: 5, collider: 'box', shrink: 0.75, look: { grime: 0.25, moss: 0.5 } },
  Stilt_House_Tin: { file: 'valley/Stilt_House_Tin', scale: 5, collider: 'box', shrink: 0.75, look: { grime: 0.4, moss: 0.55, streaks: 0.7 } },
  Depot_Warehouse: { file: 'valley/Depot_Warehouse', scale: 7, collider: 'box', shrink: 0.92, look: { grime: 0.6, moss: 0.35, streaks: 0.8 } },
  Plantation_House: { file: 'valley/Plantation_House', scale: 7.5, collider: 'box', shrink: 0.8, look: { grime: 0.55, moss: 0.7, streaks: 0.9 } },
  Palm_Oil_Mill: { file: 'valley/Palm_Oil_Mill', scale: 2.4, collider: 'box', shrink: 0.9, look: { grime: 0.5, moss: 0.2 } },
  Barn_Long_TinRoof: { file: 'valley/Barn_Long_TinRoof', scale: 6, collider: 'box', shrink: 0.9, look: { grime: 0.5, moss: 0.05 } },
  Rock_Arch_Tunnel: { file: 'valley/Rock_Arch_Tunnel', scale: 7, collider: 'trimesh', rock: { tone: [1.05, 1.0, 0.92], moss: 0.15, lichen: 0.8 } },
  Cave_Chamber_Skylight: { file: 'valley/Cave_Chamber_Skylight', scale: 9, collider: 'trimesh', rock: { tone: [1, 0.97, 0.92], moss: 0.15, lichen: 0.3, cracks: 0.4 } },
  Cliff_Overhang_Mossy: { file: 'valley/Cliff_Overhang_Mossy', scale: 9, collider: 'box', shrink: 0.8, rock: { tone: [1.15, 1.12, 1.05], moss: 0.6, lichen: 0.2 }, lod: 14 },
  Cliff_Sandstone_Section: { file: 'valley/Cliff_Sandstone_Section', scale: 6.5, collider: 'box', shrink: 0.85, rock: { tone: [0.98, 0.93, 0.86], moss: 0.12, lichen: 0.45 }, lod: 12 },
  River_Stone_Flat: { file: 'valley/River_Stone_Flat', scale: 0.8, collider: 'box', shrink: 0.85, rock: { tone: [0.95, 0.95, 0.95], moss: 0.5, lichen: 0.2 }, lod: 8 },
  Stone_Wall_Dry: { file: 'valley/Stone_Wall_Dry', scale: 2.2, collider: 'box', shrink: 0.95, rock: { tone: [0.98, 0.94, 0.9], moss: 0.1, lichen: 0.35, cracks: 0.2 }, lod: 10 },
  Rainforest_Tree_Buttress: { file: 'valley/Rainforest_Tree_Buttress', scale: 4.2, collider: 'none', lod: 10 },
  Wooden_Cart: { file: 'valley/Wooden_Cart', scale: 1.6, collider: 'box', shrink: 0.9 },
  Dugout_Canoe: { file: 'valley/Dugout_Canoe', scale: [3, 1.6, 2], collider: 'none' },
  // Pieces from the savanna kit, reused here
  Boulder_Granite: { file: 'env/Boulder_Granite', scale: 1, collider: 'box', shrink: 1, rock: { tone: [1, 1, 1], moss: 0.15, lichen: 0.9 }, lod: 9 },
  House_MudBrick_TinRoof: { file: 'env/House_MudBrick_TinRoof', scale: 3.6, collider: 'box', shrink: 0.9, look: { grime: 0.4, moss: 0.05 } },
  Hut_Thatched_Round: { file: 'env/Hut_Thatched_Round', scale: 2.6, collider: 'cylinder' },
  Crate_Wooden: { file: 'env/Crate_Wooden', scale: 0.55, collider: 'box', shrink: 0.9 },
  Drum_Blue: { file: 'env/Drum_Blue', scale: 0.47, collider: 'box', shrink: 0.8 },
  Table_Wooden: { file: 'env/Table_Wooden', scale: 0.95, collider: 'box', shrink: 0.85 },
  Vehicle_SUV_Dark: { file: 'env/Vehicle_SUV_Dark', scale: 2.55, collider: 'box', shrink: 0.9 },
  Vehicle_Van_Grey: { file: 'env/Vehicle_Van_Grey', scale: 3.0, collider: 'none' },
};

// Loads the named pieces (in parallel) and bakes them for instancing.
export async function loadKit(names) {
  const out = {};
  await Promise.all(names.map(async (n) => {
    const def = CATALOGUE[n];
    const model = bakeModel(await loadGlb(`models/${def.file}.glb`));
    if (def.look) model.mat = weathered(model.mat, def.look);
    if (def.rock) model.mat = rockSurface(model.mat, def.rock);
    // Buildings get a real doorway and a room inside (doors.js).
    model.door = doorwayFor(n);
    if (model.door) {
      model.mat = cutDoorway(model.mat, model.door);
      model.interior = interiorGeometry(model.door);
    }
    model.def = def;
    model.name = n;
    // Distant copies of heavily repeated pieces use a lighter mesh.
    if (def.lod) model.lo = clusterSimplify(model.geo, def.lod);
    out[n] = model;
  }));
  return out;
}

// Places copies of a piece. items: { x, z, y?, yaw, s (multiplier or
// [sx,sy,sz]), sink (metres), tiltX, tiltZ, tint }. `heightAt` supplies y.
export function place(scene, physics, model, items, heightAt, { maxDist = 300, shadow = true, collider, lowOnly = false } = {}) {
  const def = model.def;
  const b = model.box;
  const kind = collider ?? def.collider;
  const list = [];
  for (const it of items) {
    const base = Array.isArray(def.scale) ? def.scale : [def.scale, def.scale, def.scale];
    const mul = Array.isArray(it.s) ? it.s : [it.s ?? 1, it.s ?? 1, it.s ?? 1];
    const sv = base.map((v, i) => v * mul[i]);
    const y = (it.y ?? heightAt(it.x, it.z)) - (it.sink ?? 0);
    const m = mat(it.x, y, it.z, it.yaw ?? 0, sv, it.tiltX ?? 0, it.tiltZ ?? 0);
    const t = it.tint ?? 0.9 + ((list.length * 37) % 11) / 11 * 0.2;
    list.push({ m, c: Array.isArray(t) ? new THREE.Color(...t) : new THREE.Color(t, t, t) });
    if (model.door && kind !== 'none') {
      addRoomColliders(physics, model.door, m);
    } else if (kind === 'box') {
      const shrink = def.shrink ?? 0.9;
      const hx = (b.max.x - b.min.x) * sv[0] / 2 * shrink, hy = (b.max.y - b.min.y) * sv[1] / 2, hz = (b.max.z - b.min.z) * sv[2] / 2 * shrink;
      const cx = (b.max.x + b.min.x) / 2 * sv[0], cz = (b.max.z + b.min.z) / 2 * sv[2];
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(m));
      const off = new THREE.Vector3(cx, 0, cz).applyQuaternion(q);
      addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x: it.x + off.x, y: y + b.min.y * sv[1] + hy, z: it.z + off.z }, q);
    } else if (kind === 'cylinder') {
      const r = Math.max(b.max.x, b.max.z) * sv[0] * 0.92, h = (b.max.y - b.min.y) * sv[1];
      addFixedCollider(physics, RAPIER.ColliderDesc.cylinder(h / 2, r), { x: it.x, y: y + h / 2, z: it.z });
    } else if (kind === 'trimesh') {
      const g = model.geo.clone().applyMatrix4(m);
      const idx = g.index ? new Uint32Array(g.index.array) : new Uint32Array([...Array(g.attributes.position.count).keys()]);
      addFixedCollider(physics, RAPIER.ColliderDesc.trimesh(new Float32Array(g.attributes.position.array), idx), { x: 0, y: 0, z: 0 });
    }
  }
  if (model.interior) addInstanced(scene, model.interior, interiorMaterial(), list.map((it) => ({ m: it.m })), { maxDist: Math.min(maxDist, 120), shadow: false });
  // lowOnly: small or background copies always use the light mesh.
  if (lowOnly && model.lo) return addInstanced(scene, model.lo, model.mat, list, { maxDist, shadow });
  return addInstanced(scene, model.geo, model.mat, list, { maxDist, shadow, lo: model.lo, loDist: model.def.loDist ?? 90 });
}

// Height of a piece in metres at a given multiplier (for stacking and fitting).
export function pieceSize(model, s = 1) {
  const base = Array.isArray(model.def.scale) ? model.def.scale : [model.def.scale, model.def.scale, model.def.scale];
  const b = model.box;
  return new THREE.Vector3((b.max.x - b.min.x) * base[0] * s, (b.max.y - b.min.y) * base[1] * s, (b.max.z - b.min.z) * base[2] * s);
}
