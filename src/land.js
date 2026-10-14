// The land that joins the savanna (north) to the River Valley (south) and
// surrounds both, so the whole game is one continuous place.
//
// Its height blends the two areas' own ground at their edges into open,
// rolling country, so there are no seams: the savanna plain rises gently
// over an escarpment onto the valley's rocky plateau. The savanna road runs
// on through it. The light and haze shift gradually from the warm dry north
// to the humid valley as the player walks south.
import * as THREE from 'three';
import { groundHeight, roadX, riverX, WORLD_SIZE } from './world.js';
import { makeRandom, fbm2, noise2, smooth, clamp, lerp } from './kit/util.js';
import { buildTerrain } from './kit/terrain.js';
import * as V from './kit/vegetation.js';
import { loadKit, place } from './kit/catalogue.js';
import * as VL from './valley/layout.js';

const HS = WORLD_SIZE / 2;
export const SAVANNA_RECT = { x0: -HS, x1: HS, z0: -HS, z1: HS };
export const VALLEY_ORIGIN = VL.ORIGIN;
export const VALLEY_RECT = { x0: VL.ORIGIN.x - VL.HALF, x1: VL.ORIGIN.x + VL.HALF, z0: VL.ORIGIN.z - VL.HALF, z1: VL.ORIGIN.z + VL.HALF };
const BOUNDS = { minX: -480, maxX: 330, minZ: -330, maxZ: 840 };
const BLEND = 70; // metres over which an area's own ground fades into open country
// The road from the savanna to the valley plateau.
const ROAD = { x: (roadX(HS) + VL.ORIGIN.x + VL.ROUTES.northRoad[0][0]) / 2, z0: HS - 10, z1: VALLEY_RECT.z0 + 10 };

function rectDist(x, z, r) {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
}
export const inRect = (x, z, r, m = 0) => x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m;

// Open country: broad low hills.
function wild(x, z) {
  return 3 + (fbm2(x * 0.007 + 11, z * 0.007) - 0.5) * 16 + (noise2(x * 0.035, z * 0.035) - 0.5) * 2.5;
}

// One height function for the whole world (valleyH is valley-local).
export function createWorldHeight(valleyH) {
  const savH = (x, z) => groundHeight(clamp(x, -HS, HS), clamp(z, -HS, HS));
  const valH = (x, z) => valleyH(clamp(x, VALLEY_RECT.x0, VALLEY_RECT.x1) - VL.ORIGIN.x, clamp(z, VALLEY_RECT.z0, VALLEY_RECT.z1) - VL.ORIGIN.z);
  const roadW = (x, z) => (z > ROAD.z0 - 20 && z < ROAD.z1 + 20 ? 1 - smooth(Math.abs(x - roadXAt(z)), 5, 16) : 0);
  function roadXAt(z) {
    const t = clamp((z - HS) / (VALLEY_RECT.z0 - HS), 0, 1);
    return lerp(roadX(HS), VL.ORIGIN.x + VL.ROUTES.northRoad[0][0], smooth(t, 0, 1));
  }
  function height(x, z) {
    const ds = rectDist(x, z, SAVANNA_RECT), dv = rectDist(x, z, VALLEY_RECT);
    if (ds === 0) return groundHeight(x, z);
    if (dv === 0) return valleyH(x - VL.ORIGIN.x, z - VL.ORIGIN.z);
    const ws = 1 - smooth(ds, 0, BLEND), wv = 1 - smooth(dv, 0, BLEND);
    // Open country takes over away from both areas, but never on the road.
    const ww = smooth(Math.min(ds, dv), 0, BLEND) * (1 - roadW(x, z));
    let num = ww * wild(x, z), den = ww;
    if (ws > 0) { num += ws * savH(x, z); den += ws; }
    if (wv > 0) { num += wv * valH(x, z); den += wv; }
    if (den < 1e-4) {
      // On the road between the areas: a straight, even climb.
      const t = clamp((z - HS) / (VALLEY_RECT.z0 - HS), 0, 1);
      return lerp(savH(x, HS), valH(x, VALLEY_RECT.z0), smooth(t, 0, 1));
    }
    return num / den;
  }
  return { height, roadW, roadXAt, ds: (x, z) => rectDist(x, z, SAVANNA_RECT), dv: (x, z) => rectDist(x, z, VALLEY_RECT) };
}

const C = (h) => new THREE.Color(h);
const PAL = {
  savDry: C('#c4a560'), savGrass: C('#7e8a3a'), valGold: C('#b39a6c'), valGrass: C('#88874f'),
  wildDry: C('#b39d62'), wildGrass: C('#7f8a40'), road: C('#b8724a'), rock: C('#9a8e7c'), gravel: C('#958a77'),
};

export function buildLand(scene, physics, { valleyH, phone = false }) {
  const rand = makeRandom(77);
  const W = createWorldHeight(valleyH);
  const colorAt = (x, z, h, slope) => {
    const ds = W.ds(x, z), dv = W.dv(x, z);
    const n = fbm2(x * 0.03, z * 0.03);
    const sav = PAL.savDry.clone().lerp(PAL.savGrass, smooth(n, 0.3, 0.75) * 0.6);
    const val = PAL.valGold.clone().lerp(PAL.valGrass, 0.4 + smooth(n, 0.3, 0.7) * 0.4);
    const wl = PAL.wildDry.clone().lerp(PAL.wildGrass, smooth(n, 0.3, 0.7) * 0.7);
    // Colour drifts from the savanna's palette to the plateau's going south.
    const towardsValley = smooth(z, HS, VALLEY_RECT.z0 + 40);
    const c = sav.lerp(val, towardsValley).lerp(wl, smooth(Math.min(ds, dv), 30, 160) * 0.5);
    c.lerp(PAL.rock, smooth(slope, 0.55, 1.1));
    // A dry gravel bed where the two rivers' channels meet at the escarpment.
    const bed = 1 - smooth(Math.abs(x - riverX(HS)), 3, 9);
    if (z > HS && z < VALLEY_RECT.z0) c.lerp(PAL.gravel, bed * 0.6);
    const rd = Math.abs(x - W.roadXAt(z));
    if (z > ROAD.z0 - 12 && z < ROAD.z1 + 12) c.lerp(PAL.road, 1 - smooth(rd, 1.6, 3.4));
    return [c.r, c.g, c.b, 0];
  };
  // Under the two areas this land tucks just beneath their own ground (so the
  // edges overlap without gaps); deeper inside them it is left out.
  const inside = (x, z, m) => inRect(x, z, SAVANNA_RECT, m) || inRect(x, z, VALLEY_RECT, m);
  const terrain = buildTerrain(scene, physics, {
    bounds: BOUNDS, step: 6,
    heightAt: (x, z) => W.height(x, z) - (inside(x, z, 0) ? 0.3 : 0),
    colorAt,
    holeAt: (x, z) => inside(x, z, 9),
  });

  // Plants and rocks in the open country: dry savanna trees and scrub near
  // the north, plateau scrub near the valley, kept off the road.
  const ok = (x, z, r = 1) => !inside(x, z, -r - 2) && W.roadW(x, z) < 0.2 && Math.abs(x - W.roadXAt(z)) > 6 + r;
  const spots = (n, maxOut, accept = () => true) => {
    const out = [];
    for (let i = 0; i < n * 8 && out.length < n; i++) {
      const x = lerp(BOUNDS.minX + 10, BOUNDS.maxX - 10, rand()), z = lerp(BOUNDS.minZ + 10, BOUNDS.maxZ - 10, rand());
      const d = Math.min(W.ds(x, z), W.dv(x, z));
      if (d > maxOut || !ok(x, z) || !accept(x, z)) continue;
      out.push({ x, z, s: 0.8 + rand() * 0.5 });
    }
    return out;
  };
  const k = phone ? 0.55 : 1;
  const groundAt = terrain.groundAt;
  V.acacias(scene, physics, spots(90 * k, 220), groundAt, rand);
  V.shrubs(scene, spots(260 * k, 160), groundAt, rand, { hue: 70, light: 32 });
  // Greener woodland beside the valley's forested south and east.
  const lush = (x, z) => z > VL.ORIGIN.z + 40 || x > VALLEY_RECT.x1;
  V.midTrees(scene, physics, spots(70 * k, 120, lush), groundAt, rand);
  V.shrubs(scene, spots(200 * k, 100, lush), groundAt, rand, { hue: 98, light: 27 });
  // Grass along the road, where it is seen up close.
  const grass = [];
  for (let i = 0; i < 1600 * k; i++) {
    const z = lerp(ROAD.z0, ROAD.z1, rand());
    const x = W.roadXAt(z) + (rand() < 0.5 ? -1 : 1) * (3 + rand() * 30);
    if (!inside(x, z, -1)) grass.push({ x, z });
  }
  V.grass(scene, grass, groundAt, rand, { hue: 48, light: 44 });

  // Boulders scattered over the escarpment, and rocks round the two river
  // springs where each river begins.
  loadKit(['Boulder_Granite']).then(({ Boulder_Granite: boulder }) => {
    const rocks = spots(110 * k, 160).map((p) => ({ ...p, yaw: rand() * 6, s: 0.6 + rand() * 1.8, sink: 0.3, tiltX: (rand() - 0.5) * 0.4 }));
    for (const [sx, sz] of [[riverX(HS), HS + 2], [VL.ORIGIN.x - 6, VALLEY_RECT.z0 + 8], [riverX(-HS), -HS - 2]]) {
      for (let i = 0; i < 9; i++) {
        const a = rand() * 6.28, r = 2 + rand() * 6;
        rocks.push({ x: sx + Math.cos(a) * r, z: sz + Math.sin(a) * r, yaw: rand() * 6, s: 0.8 + rand() * 1.4, sink: 0.4 });
      }
    }
    place(scene, physics, boulder, rocks, W.height, { lowOnly: false });
  }).catch((err) => console.error(err));

  return { height: W.height, groundAt, roadXAt: W.roadXAt };
}

// 0 over the savanna, 1 in the valley (light, haze and sounds blend with it).
export const valleyBlend = (z) => smooth(z, HS + 20, VALLEY_RECT.z0 + 80);

// Light and haze for where the player is: warm and clear over the savanna,
// softer and more humid in the valley, changing gradually in between.
export function createAtmosphere({ scene, world, phone }) {
  const sav = { fog: C('#e4e2d4'), near: 140, far: 480, hemi: 1.6, sun: 3.4, top: C('#3f8ee0'), horizon: C('#ece4cc') };
  const val = { fog: C('#dfe2d8'), near: 70, far: 300, hemi: 1.25, sun: 3.1, top: C('#4a93dc'), horizon: C('#e9e7dc') };
  const u = world.sky.material.uniforms;
  return (playerPos, caveDim = 0) => {
    const t = valleyBlend(playerPos.z);
    scene.fog.color.copy(sav.fog).lerp(val.fog, t);
    scene.fog.near = lerp(sav.near, val.near, t) * (phone ? 0.75 : 1);
    scene.fog.far = Math.min(lerp(sav.far, val.far, t), phone ? 240 : 400);
    world.hemi.intensity = lerp(sav.hemi, val.hemi, t) * (1 - caveDim * 0.55);
    world.sun.intensity = lerp(sav.sun, val.sun, t);
    u.uTop.value.copy(sav.top).lerp(val.top, t);
    u.uHorizon.value.copy(sav.horizon).lerp(val.horizon, t);
  };
}
