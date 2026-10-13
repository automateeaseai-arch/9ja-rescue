// Code-built plants on painted textures, all instanced and swaying in the
// wind: rainforest canopy (on the Meshy buttress trunk), oil and coconut
// palms, bananas, ferns, cocoyam, grass, reeds, lilies, vines, maize and
// savanna acacias. Every function takes a list of spots and a height lookup.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addWind, addFixedCollider } from '../world.js';
import { addInstanced, mat } from './chunks.js';
import * as T from './textures.js';

const tmpC = new THREE.Color();
const tint = (rand, lo = 0.82, span = 0.3, warm = 1) => {
  const t = lo + rand() * span;
  return new THREE.Color(t * warm, t, t * (2 - warm) * 0.95);
};

function cardMat(map, wind = 0.06, stiff = 1.4, base = 0, extra = {}) {
  return addWind(new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, ...extra }), wind, stiff, base);
}

// Upright card crossed `n` times around the vertical axis, base at y = 0.
function crossedCards(w, h, n = 3, segs = 2) {
  const card = new THREE.PlaneGeometry(w, h, 1, segs);
  card.translate(0, h / 2, 0);
  return mergeGeometries(Array.from({ length: n }, (_, k) => card.clone().rotateY((k * Math.PI) / n)));
}

// A long leaf card bent downward along its length (palm frond, banana leaf):
// base at the origin, pointing along +x, drooping by `droop` at the tip.
function bentLeaf(len, wid, droop, lift = 0.3, segs = 6) {
  const g = new THREE.PlaneGeometry(len, wid, segs, 1);
  g.translate(len / 2, 0, 0);
  g.rotateX(-Math.PI / 2); // lie flat (width along z)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / len;
    p.setY(i, lift * len * t - droop * t * t * len);
    // Slight V-fold across the width.
    p.setY(i, p.getY(i) - Math.abs(p.getZ(i)) * 0.25);
  }
  g.computeVertexNormals();
  return g;
}

// ---- Rainforest trees: Meshy buttress trunk + tall code trunk + canopy ----
export function rainforestTrees(scene, physics, trunkModel, spots, heightAt, rand, { phone = false } = {}) {
  const bark = new THREE.MeshStandardMaterial({ map: T.barkTexture(rand, '#8a8270'), roughness: 1 });
  const upper = new THREE.CylinderGeometry(0.42, 0.62, 1, 8, 1, true);
  upper.translate(0, 0.5, 0);
  const branch = new THREE.CylinderGeometry(0.12, 0.26, 1, 6, 1, true);
  branch.translate(0, 0.5, 0);
  const leafTex = T.broadleafTexture(rand, 98, 26);
  const canopyMat = cardMat(leafTex, 0.05, 1, 1);
  const card = new THREE.PlaneGeometry(1, 1);
  card.rotateX(-Math.PI / 2);
  const vineMat = cardMat(T.vineTexture(rand), 0.12, 0.6, 0.2);
  const vine = new THREE.PlaneGeometry(1, 1);
  vine.translate(0, -0.5, 0);

  const trunkH = trunkModel.box.max.y - trunkModel.box.min.y;
  const trunks = [], uppers = [], branches = [], cards = [], vines = [];
  const cardsPer = phone ? 22 : 34;
  for (const { x, z, s = 1 } of spots) {
    const y = heightAt(x, z) - 0.3;
    const meshyScale = 4.2 * s;            // buttress roots ~7 m across, 8 m tall
    const yaw = rand() * 6.28;
    trunks.push({ m: mat(x, y, z, yaw, meshyScale), c: new THREE.Color(0.72, 0.68, 0.6).multiplyScalar(0.85 + rand() * 0.25) });
    const joinY = y + trunkH * meshyScale * 0.8;
    const total = (16 + rand() * 8) * s;
    const upH = total - (joinY - y);
    uppers.push({ m: mat(x, joinY, z, yaw, [1.15 * s, upH, 1.15 * s]), c: tint(rand, 0.8, 0.2) });
    const top = joinY + upH;
    // Spreading limbs carry a broad crown plus a lower tier of foliage.
    const crownR = (7.5 + rand() * 3.5) * s;
    for (let b = 0; b < 5; b++) {
      const a = yaw + b * 1.26 + rand() * 0.5;
      const by = top - 3 - rand() * 4;
      branches.push({ m: mat(x, by, z, a, [1.2 * s, (5 + rand() * 3) * s, 1.2 * s], 0.9 + rand() * 0.35, 0), c: tint(rand, 0.8, 0.2) });
    }
    for (let c = 0; c < cardsPer; c++) {
      const tier = c < cardsPer * 0.7 ? 0 : 1;
      const a = rand() * 6.28, r = Math.sqrt(rand()) * crownR * (tier ? 0.75 : 1);
      const cy = tier ? top - 5.5 + rand() * 2 : top - 1.5 + rand() * 3.5 - (r / crownR) * 2.5;
      cards.push({
        m: mat(x + Math.cos(a) * r, cy, z + Math.sin(a) * r, rand() * 6.28, crownR * (0.7 + rand() * 0.5), (rand() - 0.5) * 1.2, (rand() - 0.5) * 1.2),
        c: tint(rand, 0.72, 0.4, 0.97),
      });
    }
    // Lianas hanging from the crown.
    for (let v = 0; v < 4; v++) {
      const a = rand() * 6.28, r = crownR * (0.3 + rand() * 0.5), len = 5 + rand() * 8;
      vines.push({ m: mat(x + Math.cos(a) * r, top - 2, z + Math.sin(a) * r, rand() * 6.28, [1.8, len, 1.8]), c: tint(rand) });
    }
    addFixedCollider(physics, RAPIER.ColliderDesc.cylinder(3, 0.9 * s), { x, y: y + 3, z });
  }
  addInstanced(scene, trunkModel.geo, trunkModel.mat, trunks, { maxDist: 260, lo: trunkModel.lo, loDist: 90 });
  addInstanced(scene, upper, bark, uppers, { maxDist: 300 });
  addInstanced(scene, branch, bark, branches, { maxDist: 260 });
  addInstanced(scene, card, canopyMat, cards, { maxDist: 320 });
  addInstanced(scene, vine, vineMat, vines, { maxDist: 120, shadow: false });
}

// ---- Sub-canopy trees: slim trunks with rounded leafy crowns at 4-10 m,
// filling the forest between the floor and the high canopy. ----
export function midTrees(scene, physics, spots, heightAt, rand) {
  const bark = new THREE.MeshStandardMaterial({ map: T.barkTexture(rand, '#6f6556'), roughness: 1 });
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1, 6, 1, true);
  trunk.translate(0, 0.5, 0);
  const card = new THREE.PlaneGeometry(1, 1);
  card.rotateX(-Math.PI / 2);
  const m = cardMat(T.broadleafTexture(rand, 102, 27), 0.07, 1, 1);
  const trunks = [], cards = [];
  for (const { x, z, s = 1 } of spots) {
    const y = heightAt(x, z) - 0.1;
    const h = (4 + rand() * 5) * s, r = (2 + rand() * 1.5) * s;
    trunks.push({ m: mat(x, y, z, rand() * 6, [s, h, s], (rand() - 0.5) * 0.15), c: tint(rand, 0.8, 0.3) });
    for (let c = 0; c < 12; c++) {
      const a = rand() * 6.28, rr = Math.sqrt(rand()) * r;
      cards.push({ m: mat(x + Math.cos(a) * rr, y + h - 0.5 + rand() * 2.2 - rr * 0.3, z + Math.sin(a) * rr, rand() * 6, r * (0.8 + rand() * 0.5), (rand() - 0.5) * 1.4, (rand() - 0.5) * 1.4), c: tint(rand, 0.75, 0.4) });
    }
    addFixedCollider(physics, RAPIER.ColliderDesc.cylinder(1.5, 0.22 * s), { x, y: y + 1.5, z });
  }
  addInstanced(scene, trunk, bark, trunks, { maxDist: 180 });
  addInstanced(scene, card, m, cards, { maxDist: 200 });
}

// ---- Palms ----
// kind 'oil': stocky trunk with old frond stubs, dense arching crown (ref. 5).
// kind 'coconut': tall, slender, leaning trunk, airy crown (refs. 2, 3).
export function palms(scene, physics, spots, heightAt, rand, kind = 'oil') {
  const oil = kind === 'oil';
  const trunkMat = new THREE.MeshStandardMaterial({ map: T.barkTexture(rand, oil ? '#6a5a45' : '#8b8070'), roughness: 1 });
  const segs = 5;
  const seg = new THREE.CylinderGeometry(oil ? 0.32 : 0.17, oil ? 0.38 : 0.22, 1, 7, 1, true);
  seg.translate(0, 0.5, 0);
  const frondTex = T.palmFrondTexture(rand, oil ? 82 : 90);
  const frondMat = cardMat(frondTex, 0.07, 1.2, 0.3);
  const frond = bentLeaf(oil ? 4.6 : 4.2, 1.6, oil ? 0.42 : 0.55, 0.28);
  const segItems = [], frondItems = [];
  for (const { x, z, s = 1 } of spots) {
    const y = heightAt(x, z) - 0.2;
    const height = (oil ? 7 + rand() * 4 : 11 + rand() * 7) * s;
    const leanDir = rand() * 6.28, lean = (oil ? 0.05 : 0.18) * rand();
    let px = x, py = y, pz = z;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const tilt = lean * (1 + t * 2);
      const l = height / segs;
      segItems.push({ m: mat(px, py, pz, leanDir, [s, l * 1.04, s], tilt), c: tint(rand, 0.8, 0.25) });
      px += Math.sin(tilt) * Math.sin(leanDir) * l; // tilt is about the local X axis after yaw
      pz += Math.sin(tilt) * Math.cos(leanDir) * l;
      py += Math.cos(tilt) * l;
    }
    const n = oil ? 18 : 14;
    for (let f = 0; f < n; f++) {
      const a = (f / n) * Math.PI * 2 + rand() * 0.3;
      const up = (f % 3 === 0 ? -0.5 : f % 3 === 1 ? 0.0 : 0.35) + (rand() - 0.5) * 0.3;
      frondItems.push({ m: mat(px, py - 0.2, pz, a, s * (0.85 + rand() * 0.3), 0, up), c: tint(rand, 0.8, 0.3, f % 4 === 0 ? 1.08 : 0.98) });
    }
    addFixedCollider(physics, RAPIER.ColliderDesc.cylinder(1.5, oil ? 0.45 : 0.3), { x, y: y + 1.5, z });
  }
  addInstanced(scene, seg, trunkMat, segItems, { maxDist: 300 });
  addInstanced(scene, frond, frondMat, frondItems, { maxDist: 300 });
}

// ---- Understorey ----
export function bananas(scene, spots, heightAt, rand) {
  const stemMat = new THREE.MeshStandardMaterial({ color: '#6d7a3a', roughness: 0.9 });
  const stem = new THREE.CylinderGeometry(0.11, 0.16, 1, 6, 1, true);
  stem.translate(0, 0.5, 0);
  const leafMat = cardMat(T.bananaTexture(rand), 0.1, 1.2, 0.4);
  const leafG = bentLeaf(2.4, 0.8, 0.35, 0.55, 5);
  const stems = [], leaves = [];
  for (const { x, z, s = 1 } of spots) {
    const y = heightAt(x, z) - 0.1;
    const h = (2.2 + rand() * 1.2) * s;
    stems.push({ m: mat(x, y, z, 0, [s, h, s]) });
    for (let f = 0; f < 7; f++) {
      leaves.push({ m: mat(x, y + h - 0.2 + rand() * 0.4, z, (f / 7) * 6.28 + rand() * 0.4, s * (0.8 + rand() * 0.4), 0, -0.1 + rand() * 0.5), c: tint(rand, 0.85, 0.3) });
    }
  }
  addInstanced(scene, stem, stemMat, stems, { maxDist: 140 });
  addInstanced(scene, leafG, leafMat, leaves, { maxDist: 160 });
}

export function ferns(scene, spots, heightAt, rand, maxDist = 90) {
  const g = crossedCards(1.8, 1.4, 3);
  const m = cardMat(T.fernTexture(rand), 0.09, 1.3);
  addInstanced(scene, g, m, spots.map(({ x, z, s = 1 }) => ({
    m: mat(x, heightAt(x, z) - 0.05, z, rand() * 6.28, s * (0.7 + rand() * 0.6), (rand() - 0.5) * 0.3),
    c: tint(rand, 0.8, 0.35),
  })), { maxDist, shadow: false });
}

export function taro(scene, spots, heightAt, rand) {
  const g = crossedCards(1.6, 1.3, 2);
  const m = cardMat(T.taroTexture(rand), 0.08, 1.2);
  addInstanced(scene, g, m, spots.map(({ x, z, s = 1 }) => ({
    m: mat(x, heightAt(x, z) - 0.05, z, rand() * 6.28, s * (0.7 + rand() * 0.6)),
    c: tint(rand, 0.85, 0.3),
  })), { maxDist: 90, shadow: false });
}

// Shrubs: leafy crossed cards (green rainforest or dusty savanna).
export function shrubs(scene, spots, heightAt, rand, { hue = 95, light = 28, maxDist = 160 } = {}) {
  const g = crossedCards(2.2, 1.8, 3, 1);
  const m = cardMat(T.broadleafTexture(rand, hue, light), 0.06, 1.2);
  addInstanced(scene, g, m, spots.map(({ x, z, s = 1 }) => ({
    m: mat(x, heightAt(x, z) - 0.15, z, rand() * 6.28, s * (0.7 + rand() * 0.8)),
    c: tint(rand, 0.8, 0.35),
  })), { maxDist, shadow: true });
}

export function grass(scene, spots, heightAt, rand, { hue = 70, light = 34, size = 1, maxDist = 75 } = {}) {
  const g = crossedCards(1.1, 0.9, 3, 2);
  const m = cardMat(T.grassTuftTexture(rand, hue, light), 0.2, 2.0);
  addInstanced(scene, g, m, spots.map(({ x, z, s = 1 }) => {
    const k = size * s * (0.7 + rand() * 0.7);
    return { m: mat(x, heightAt(x, z) - 0.02, z, rand() * 6.28, [k, k * (0.8 + rand() * 0.5), k]), c: tint(rand, 0.82, 0.3) };
  }), { maxDist, shadow: false });
}

export function reeds(scene, spots, heightAt, rand) {
  const g = crossedCards(1.2, 2.2, 3, 3);
  const m = cardMat(T.grassTuftTexture(rand, 78, 32, 90), 0.16, 1.6);
  addInstanced(scene, g, m, spots.map(({ x, z, s = 1 }) => ({
    m: mat(x, heightAt(x, z) - 0.1, z, rand() * 6.28, s * (0.7 + rand() * 0.6)),
    c: tint(rand, 0.85, 0.3),
  })), { maxDist: 110, shadow: false });
}

// Lily pads float on the surface at `level`.
export function lilies(scene, spots, level, rand) {
  const g = new THREE.PlaneGeometry(3, 3);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ map: T.lilyTexture(rand), alphaTest: 0.4, roughness: 0.5 });
  addInstanced(scene, g, m, spots.map(({ x, z, s = 1 }) => ({ m: mat(x, level + 0.03, z, rand() * 6.28, s), c: tint(rand, 0.85, 0.3) })), { maxDist: 150, shadow: false });
}

// Hanging vines from walls, cliffs or branches: [x, y, z, yaw, length].
export function hangingVines(scene, items, rand) {
  const g = new THREE.PlaneGeometry(1, 1);
  g.translate(0, -0.5, 0);
  const m = cardMat(T.vineTexture(rand), 0.1, 0.6, 0.2);
  addInstanced(scene, g, m, items.map(([x, y, z, yaw, len, w = 1.6]) => ({ m: mat(x, y, z, yaw, [w, len, 1]), c: tint(rand) })), { maxDist: 120, shadow: false });
}

export function maize(scene, spots, heightAt, rand) {
  const g = crossedCards(1.2, 2.1, 2, 2);
  const m = cardMat(T.maizeTexture(rand), 0.14, 1.5);
  addInstanced(scene, g, m, spots.map(({ x, z }) => ({ m: mat(x, heightAt(x, z) - 0.05, z, rand() * 6.28, 0.8 + rand() * 0.4), c: tint(rand, 0.85, 0.25) })), { maxDist: 140, shadow: false });
}

// Savanna trees with flat umbrella crowns (highlands, refs. 11–14).
export function acacias(scene, physics, spots, heightAt, rand) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.3, 1, 7);
  trunk.translate(0, 0.5, 0);
  parts.push(trunk);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.CylinderGeometry(0.05, 0.12, 0.6, 5);
    b.translate(0, 0.3, 0); b.rotateZ(0.7); b.rotateY((i / 3) * Math.PI * 2); b.translate(0, 0.85, 0);
    parts.push(b);
  }
  const trunkG = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  const bark = new THREE.MeshStandardMaterial({ color: '#5a463a', roughness: 1 });
  const card = new THREE.PlaneGeometry(1, 1);
  card.rotateX(-Math.PI / 2);
  const leaf = cardMat(T.broadleafTexture(rand, 72, 30), 0.06, 1, 1);
  const trunks = [], cards = [];
  for (const { x, z, s = 1 } of spots) {
    const y = heightAt(x, z);
    const h = (3 + rand() * 2) * s, w = (2.4 + rand() * 1.4) * s;
    trunks.push({ m: mat(x, y, z, rand() * 6.28, [s, h, s], (rand() - 0.5) * 0.2) });
    for (let c = 0; c < 20; c++) {
      const a = rand() * 6.28, r = Math.sqrt(rand()) * w * 0.8;
      cards.push({ m: mat(x + Math.cos(a) * r, y + h * 1.22 + rand() * 1.2 - (r / w) * 0.6, z + Math.sin(a) * r, rand() * 6.28, w * (0.6 + rand() * 0.4), (rand() - 0.5) * 1.2, (rand() - 0.5) * 1.2), c: tint(rand, 0.85, 0.3) });
    }
    addFixedCollider(physics, RAPIER.ColliderDesc.cylinder(2, 0.3 * s), { x, y: y + 2, z });
  }
  addInstanced(scene, trunkG, bark, trunks, { maxDist: 300 });
  addInstanced(scene, card, leaf, cards, { maxDist: 300 });
}
