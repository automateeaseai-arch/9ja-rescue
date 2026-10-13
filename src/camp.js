// Captive camp, modelled on the reference "captive compound" picture:
// a stick-lattice hut with an olive tarp roof (enterable), an open tarp
// canopy, stick fences, and Meshy crates, blue drums and tables.
// Sticks and tarps are built in code so tarps can flap and doors are real.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGlb } from './player.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CAMP, groundHeight, makeRandom, addFixedCollider, bakeModel, placeCopies, canvasTexture,
  rockCollider, makeGranite,
} from './world.js';

const tarpTime = { value: 0 };

// Cloth that ripples gently, more at its free edges (uv.y near 1).
function tarpMaterial(color, rand) {
  const map = canvasTexture(128, (g, n) => {
    g.fillStyle = color;
    g.fillRect(0, 0, n, n);
    // Stains, fading and seams so the canvas doesn't look flat.
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '40,30,20' : '255,240,210'},${0.04 + rand() * 0.08})`;
      g.beginPath();
      g.ellipse(rand() * n, rand() * n, 4 + rand() * 18, 3 + rand() * 10, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < n; x += n / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, n); g.stroke(); }
  });
  const mat = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.95 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = tarpTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float edge = 0.25 + pow(max(uv.y, 1.0 - uv.y), 2.0);
        transformed += normalize(objectNormal) * (
          sin(uTime * 2.6 + position.x * 1.9 + position.z * 1.3) * 0.045 * edge +
          sin(uTime * 5.3 + position.x * 4.0) * 0.012 * edge);`);
  };
  return mat;
}

// A sagging cloth panel spanning four corners: a→b along the top edge,
// c→d along the bottom (free) edge.
function cloth(scene, mat, a, b, c, d, sag = 0.12) {
  const geo = new THREE.PlaneGeometry(1, 1, 10, 5);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const top = new THREE.Vector3(), bottom = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    top.lerpVectors(a, b, u);
    bottom.lerpVectors(c, d, u);
    p.lerpVectors(bottom, top, v);
    p.y -= Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * sag;
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// One instanced mesh holds every stick in the camp.
function stickBuilder() {
  const sticks = [];
  const add = (a, b, r = 0.05) => sticks.push([a, b, r]);
  const build = (scene, rand) => {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 5);
    const mat = new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 1 });
    const mesh = new THREE.InstancedMesh(geo, mat, sticks.length);
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    sticks.forEach(([a, b, r], i) => {
      dir.subVectors(b, a);
      const len = dir.length();
      q.setFromUnitVectors(up, dir.normalize());
      m.compose(mid.addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
      mesh.setMatrixAt(i, m);
      const t = 0.75 + rand() * 0.45;
      mesh.setColorAt(i, color.setRGB(t, t * 0.93, t * 0.85));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  };
  return { add, build };
}

// Converts camp-local coordinates (metres from the camp centre) to world.
const W = (x, y, z) => new THREE.Vector3(CAMP.x + x, groundHeight(CAMP.x + x, CAMP.z + z) + y, CAMP.z + z);

// Stick-lattice hut with a doorway in the front (+z) wall and a sagging tarp roof.
function buildHut(scene, physics, sticks, tarp, cx, cz, w, d, h) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const DOOR = 1.4;
  const wall = (ax, az, bx, bz, door) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / 0.32);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const inDoor = door && Math.abs(t - 0.5) * len < DOOR / 2;
      const top = inDoor ? h : h + (i % 5 === 0 ? 0.4 : 0);
      if (!inDoor) sticks.add(W(x, -0.1, z), W(x, top, z), i % 5 === 0 ? 0.07 : 0.035);
    }
    // Horizontal rails tie the uprights together (broken by the doorway).
    for (const y of [0.4, 1.2, 2.0]) {
      if (door && y < 2.0) {
        const cut = DOOR / 2 / len;
        sticks.add(W(ax, y, az), W(ax + (bx - ax) * (0.5 - cut), y, az + (bz - az) * (0.5 - cut)), 0.04);
        sticks.add(W(ax + (bx - ax) * (0.5 + cut), y, az + (bz - az) * (0.5 + cut)), W(bx, y, bz), 0.04);
      } else {
        sticks.add(W(ax, y, az), W(bx, y, bz), 0.04);
      }
    }
    // Physics: solid wall, with a gap for the door.
    const ang = Math.atan2(bz - az, bx - ax);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);
    const segs = door ? [[0, (len - DOOR) / 2], [(len + DOOR) / 2, len]] : [[0, len]];
    for (const [s0, s1] of segs) {
      const c = (s0 + s1) / 2 / len;
      const p = W(ax + (bx - ax) * c, h / 2, az + (bz - az) * c);
      addFixedCollider(physics, RAPIER.ColliderDesc.cuboid((s1 - s0) / 2, h / 2, 0.12), p, q);
    }
  };
  wall(x0, z1, x1, z1, true); // front, with door
  wall(x0, z0, x1, z0, false);
  wall(x0, z0, x0, z1, false);
  wall(x1, z0, x1, z1, false);

  // Ridge pole and gable tarp roof hanging past the walls.
  const ridge = h + 0.9;
  sticks.add(W(cx, -0.1, z0 - 0.2), W(cx, ridge, z0 - 0.2), 0.08);
  sticks.add(W(cx, -0.1, z1 + 0.2), W(cx, ridge, z1 + 0.2), 0.08);
  sticks.add(W(cx, ridge, z0 - 0.4), W(cx, ridge, z1 + 0.4), 0.06);
  for (const side of [-1, 1]) {
    const eaveX = cx + side * (w / 2 + 0.6);
    cloth(scene, tarp,
      W(cx, ridge + 0.05, z0 - 0.6), W(cx, ridge + 0.05, z1 + 0.6),
      W(eaveX, h - 0.15, z0 - 0.6), W(eaveX, h - 0.15, z1 + 0.6), 0.15);
  }
  // Packed earth floor inside.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: '#8a5634', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.copy(W(cx, 0.03, cz));
  floor.receiveShadow = true;
  scene.add(floor);
}

// Open-sided canopy on poles: olive tarp roof, tan back wall, blue side cloth.
function buildCanopy(scene, sticks, tarps, cx, cz, w, d, h) {
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 1]) {
      const x = cx + sx * w / 2, z = cz + sz * d / 2;
      sticks.add(W(x, -0.1, z), W(x, h + (sz < 0 ? 0.4 : 0) + 0.2, z), 0.07);
    }
  }
  sticks.add(W(cx - w / 2, h + 0.4, cz - d / 2), W(cx + w / 2, h + 0.4, cz - d / 2), 0.05);
  sticks.add(W(cx - w / 2, h, cz + d / 2), W(cx + w / 2, h, cz + d / 2), 0.05);
  // Roof slopes from the high back rail to the low front rail.
  cloth(scene, tarps.olive,
    W(cx - w / 2 - 0.5, h + 0.65, cz - d / 2 - 0.3), W(cx + w / 2 + 0.5, h + 0.65, cz - d / 2 - 0.3),
    W(cx - w / 2 - 0.5, h + 0.2, cz + d / 2 + 0.4), W(cx + w / 2 + 0.5, h + 0.2, cz + d / 2 + 0.4), 0.18);
  // Tan cloth wall at the back, blue cloth hung on the left side.
  cloth(scene, tarps.tan,
    W(cx - w / 2, h + 0.4, cz - d / 2), W(cx + w / 2, h + 0.4, cz - d / 2),
    W(cx - w / 2, 0.1, cz - d / 2), W(cx + w / 2, 0.1, cz - d / 2), 0.05);
  cloth(scene, tarps.blue,
    W(cx - w / 2, 1.9, cz - d * 0.2), W(cx - w / 2, 1.9, cz + d * 0.35),
    W(cx - w / 2, 0.6, cz - d * 0.2), W(cx - w / 2, 0.6, cz + d * 0.35), 0.05);
}

// Stick fence: posts with rails and a few cross braces, like the reference.
function buildFence(physics, sticks, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.round(len / 1.1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    sticks.add(W(x, -0.1, z), W(x, 1.35 + (i % 2) * 0.15, z), 0.06);
    if (i < n) {
      const t2 = (i + 1) / n;
      const x2 = ax + (bx - ax) * t2, z2 = az + (bz - az) * t2;
      sticks.add(W(x, 0.3, z), W(x2, 1.1, z2), 0.03);
    }
  }
  for (const y of [0.45, 0.9, 1.25]) sticks.add(W(ax, y, az), W(bx, y, bz), 0.035);
  const ang = Math.atan2(bz - az, bx - ax);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);
  addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(len / 2, 0.7, 0.1), W((ax + bx) / 2, 0.7, (az + bz) / 2), q);
}

// Jerry can: a ribbed steel body with a three-bar handle and a spout.
function jerryCanGeometry() {
  const parts = [];
  const body = new THREE.BoxGeometry(0.17, 0.42, 0.34, 1, 1, 1);
  body.translate(0, 0.21, 0);
  parts.push(body);
  for (const z of [-0.08, 0, 0.08]) {
    const bar = new THREE.BoxGeometry(0.04, 0.09, 0.025);
    bar.translate(0, 0.46, z);
    parts.push(bar);
  }
  const grip = new THREE.BoxGeometry(0.04, 0.025, 0.2);
  grip.translate(0, 0.5, 0);
  parts.push(grip);
  const spout = new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8);
  spout.translate(0, 0.45, 0.13);
  parts.push(spout);
  // X-shaped stiffening ribs on each face.
  for (const side of [-1, 1]) {
    for (const ang of [0.6, -0.6]) {
      const rib = new THREE.BoxGeometry(0.01, 0.42, 0.02);
      rib.rotateX(ang);
      rib.translate(side * 0.088, 0.21, 0);
      parts.push(rib);
    }
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

function addJerryCans(scene, physics, spots) {
  const mesh = new THREE.InstancedMesh(
    jerryCanGeometry(),
    new THREE.MeshStandardMaterial({ color: '#56623a', roughness: 0.6, metalness: 0.3 }),
    spots.length
  );
  const m = new THREE.Matrix4();
  spots.forEach(([x, z, lift, rot], i) => {
    const y = groundHeight(x, z) + lift;
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
    addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(0.09, 0.25, 0.17), { x, y: y + 0.25, z });
  });
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

// Clay pots: a turned (lathe) profile with a rolled rim and painted bands.
function addClayPots(scene, spots) {
  const profile = [
    [0.0, 0], [0.12, 0.01], [0.2, 0.08], [0.24, 0.2], [0.22, 0.32], [0.15, 0.4], [0.11, 0.44], [0.13, 0.47], [0.12, 0.49],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 16);
  const map = canvasTexture(64, (g, n) => {
    g.fillStyle = '#a9552c';
    g.fillRect(0, 0, n, n);
    g.fillStyle = 'rgba(60,25,10,0.35)';
    g.fillRect(0, n * 0.3, n, 3);
    g.fillRect(0, n * 0.42, n, 2);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,220,180,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * n, Math.random() * n, 3, 3);
    }
  });
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map, roughness: 0.9 }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z, lift, size], i) => {
    m.compose(new THREE.Vector3(x, groundHeight(x, z) + lift, z), new THREE.Quaternion(), new THREE.Vector3(size, size, size));
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

export async function buildCamp(scene, physics) {
  const rand = makeRandom(31);
  const sticks = stickBuilder();
  const tarps = {
    olive: tarpMaterial('#5d6b3e', rand),
    tan: tarpMaterial('#c9a46a', rand),
    blue: tarpMaterial('#3b5878', rand),
  };

  buildHut(scene, physics, sticks, tarps.olive, 5, -4, 7.5, 4.6, 2.4);
  buildCanopy(scene, sticks, tarps, -8, -4.5, 8, 4.5, 2.5);
  buildFence(physics, sticks, -14, 5, -4, 5);
  buildFence(physics, sticks, -14, -8, -14, 5);
  sticks.build(scene, rand);

  // Tree stump by the path.
  const stump = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.42, 0.7, 10),
    new THREE.MeshStandardMaterial({ color: '#7d5f45', roughness: 1 })
  );
  stump.position.copy(W(9.5, 0.35, 7));
  stump.castShadow = true;
  scene.add(stump);

  const [crate, drum, table, boulder] = (await Promise.all([
    loadGlb('models/env/Crate_Wooden.glb'),
    loadGlb('models/env/Drum_Blue.glb'),
    loadGlb('models/env/Table_Wooden.glb'),
    loadGlb('models/env/Boulder_Granite.glb'),
  ])).map(bakeModel);

  const toWorld = ([x, z, ...rest]) => [CAMP.x + x, CAMP.z + z, ...rest];
  const boxCollider = (model, shrink = 0.9) => (x, y, z, rot, s, q) => {
    const b = model.box;
    const hx = (b.max.x - b.min.x) * s / 2 * shrink, hy = (b.max.y - b.min.y) * s / 2, hz = (b.max.z - b.min.z) * s / 2 * shrink;
    addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x, y: y + hy, z }, q);
  };

  // Crates: 1.0 m long. A sink below zero lifts a crate to stack it.
  const cs = 0.55, crateH = (crate.box.max.y - crate.box.min.y) * cs;
  placeCopies(scene, crate, [
    [-2.5, 3.2, 0.1, cs], [-2.4, 3.2, 0.05, cs, -crateH / cs],
    [-0.8, 4.3, 0.3, cs], [12, 8, -0.2, cs], [13, 8.2, 0.4, cs],
    [-6, -5.5, 0.2, cs], [-9.5, -5.8, -0.1, cs], [-9.5, -5.8, 0.15, cs, -crateH / cs],
    [2.8, -1.2, 1.4, cs], [9, -3, 0.5, cs],
  ].map(toWorld), boxCollider(crate));

  // Blue 200-litre drums: 0.9 m tall.
  placeCopies(scene, drum, [
    [0.5, -1.2, 0, 0.47], [1.3, -1.6, 1, 0.47], [10.2, -1.5, 2, 0.47], [11, -0.9, 0.5, 0.47],
    [-5.2, -6, 0.3, 0.47], [-11.5, -5.5, 1.2, 0.47],
  ].map(toWorld), boxCollider(drum, 0.8));

  // Rough work tables.
  placeCopies(scene, table, [
    [-1, 0.5, 0.05, 0.95], [8.5, 4.2, -0.15, 0.95], [-8, -3.5, 0, 0.95], [-4.5, -3.8, 0.05, 0.9],
  ].map(toWorld), boxCollider(table, 0.85));

  // Lichen-covered rocks around the clearing and small stones on the track,
  // all copies of the existing granite boulder.
  const rocks = [];
  // Keep the mouth of the track (towards the village) open.
  const trackDir = Math.atan2(48, -38);
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const d = 13 + rand() * 6;
    if (Math.abs(Math.atan2(Math.sin(a - trackDir), Math.cos(a - trackDir))) < 0.5) continue;
    rocks.push([Math.cos(a) * d, Math.sin(a) * d, rand() * 6.28, 0.8 + rand() * 1.4, 0.2, (rand() - 0.5) * 0.4]);
  }
  makeGranite(boulder);
  // Big rocks are solid; the small stones on the path can be walked over.
  placeCopies(scene, boulder, rocks.map(toWorld), rockCollider(physics, boulder.box));
  const stones = [];
  for (let i = 0; i < 26; i++) {
    stones.push([2 + rand() * 8, 1 + rand() * 9, rand() * 6.28, 0.08 + rand() * 0.14, 0.2, 0]);
  }
  placeCopies(scene, boulder, stones.map(toWorld));

  // Olive jerry cans and clay pots, as in the reference picture.
  const tableTop = (table.box.max.y - table.box.min.y) * 0.95;
  const crateTop = crateH;
  addJerryCans(scene, physics, [[12, 8, crateTop, 0.3], [9.8, -0.6, 0, 1.2], [-6.8, -6, 0, 0.4]].map(toWorld));
  addClayPots(scene, [
    [-1.3, 0.4, tableTop, 1], [-0.6, 0.7, tableTop, 0.7], [7.6, 2.4, 0, 1.3], [8.4, 2.8, 0, 0.9], [2.2, 0.2, 0, 1.1],
  ].map(toWorld));

  return (dt) => { tarpTime.value += dt; };
}

// Spots for hostages inside the compound (camp-local metres): some inside
// the lattice hut, the rest under the canopy and by the fence.
export const HOSTAGE_SPOTS = [
  [3, -5], [5, -5], [7, -5], [4, -3], [6, -3],
  [-10, -4], [-8, -5], [-6, -4],
  [-11, 2], [-8, 2.5],
].map(([x, z]) => [CAMP.x + x, CAMP.z + z]);
