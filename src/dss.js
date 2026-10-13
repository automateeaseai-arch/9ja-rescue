// DSS extraction point beside the river, modelled on the reference art:
// a dark SUV and a grey van (Meshy) parked under a big shade tree, a tarp
// canopy with a table and olive equipment cases, and a rocky river with rapids.
//
// The mission runs the handover (game plan v2.2): captives walk to the van's
// open rear doors and climb in (`rearDoor`), then `depart` drives the van
// north to its endpoint and reports when it gets there. `reset` parks it again.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGlb } from './player.js';
import {
  DSS, groundHeight, riverX, riverLevel, RIVER_HALF_WIDTH, makeRandom, addFixedCollider,
  bakeModel, placeCopies, rockCollider, makeGranite,
} from './world.js';
import { tarpMaterial, cloth } from './camp.js';

const time = { value: 0 };

const W = (x, y, z) => new THREE.Vector3(DSS.x + x, groundHeight(DSS.x + x, DSS.z + z) + y, DSS.z + z);

// Flowing water: a strip following the river, with moving ripples and
// white water where it runs fast over rocks.
function buildRiver(scene) {
  const Z0 = -160, Z1 = 160, SEG = 160;
  const geo = new THREE.PlaneGeometry(1, 1, 4, SEG);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) + 0.5;            // 0..1 across
    const v = pos.getY(i) + 0.5;            // 0..1 along
    const z = Z1 - (Z1 - Z0) * v; // reversed so the surface faces up
    const x = riverX(z) + (u - 0.5) * (RIVER_HALF_WIDTH + 1.5) * 2;
    pos.setXYZ(i, x, riverLevel(z), z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: '#4f8f9a', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.88,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; varying vec3 vWaterPos;
        float wh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float wn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Flow runs south (+z).
        vec2 p = vWaterPos.xz * vec2(0.9, 0.35) - vec2(0.0, uTime * 1.6);
        float rip = wn(p * 2.0) * 0.6 + wn(p * 5.0 + 3.0) * 0.4;
        float foam = smoothstep(0.72, 0.9, wn(p * 3.0 + uTime * 0.3) * 0.7 + wn(vWaterPos.xz * 0.15) * 0.5);
        vec3 col = mix(vec3(0.16, 0.36, 0.38), vec3(0.42, 0.66, 0.68), rip);
        col = mix(col, vec3(0.93, 0.96, 0.95), foam * 0.85);
        diffuseColor.rgb = col;
        diffuseColor.a = mix(0.82, 1.0, foam);`);
  };
  const water = new THREE.Mesh(geo, mat);
  water.receiveShadow = true;
  scene.add(water);
}

// Olive equipment cases with lids and latches (code-built, instanced).
function addCases(scene, physics, spots) {
  const body = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: '#4a5634', roughness: 0.7 }), spots.length * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach(([x, z, lift, rot, w, h, d], i) => {
    const y = groundHeight(x, z) + lift;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    m.compose(new THREE.Vector3(x, y + h / 2, z), q, new THREE.Vector3(w, h, d));
    mesh.setMatrixAt(i * 2, m);
    // Slightly wider lid band.
    m.compose(new THREE.Vector3(x, y + h - 0.04, z), q, new THREE.Vector3(w + 0.03, 0.08, d + 0.03));
    mesh.setMatrixAt(i * 2 + 1, m);
    if (lift === 0) addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2), { x, y: y + h / 2, z }, q);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

export async function buildDss(scene, physics) {
  const rand = makeRandom(57);
  buildRiver(scene);

  // Tarp canopy over the equipment, as in the reference.
  const tan = tarpMaterial('#a8935c', rand);
  const poles = new THREE.MeshStandardMaterial({ color: '#5b5040', roughness: 0.8, metalness: 0.3 });
  for (const [x, z] of [[4, 6], [10, 6], [4, 11], [10, 11]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), poles);
    p.position.copy(W(x, 1.3, z));
    p.castShadow = true;
    scene.add(p);
  }
  cloth(scene, tan, W(3.6, 2.75, 5.6), W(10.4, 2.75, 5.6), W(3.6, 2.45, 11.4), W(10.4, 2.45, 11.4), 0.2);

  addCases(scene, physics, [
    [5.2, 9.5, 0, 0.05, 1.0, 0.6, 0.6], [6.4, 9.6, 0, -0.05, 1.0, 0.6, 0.6], [5.8, 9.5, 0.6, 0.1, 0.8, 0.45, 0.5],
    [3.4, 8.2, 0, 0.3, 0.9, 0.55, 0.55], [9.6, 9.8, 0, 0.1, 0.7, 0.9, 0.6],
  ].map(([x, z, ...r]) => [DSS.x + x, DSS.z + z, ...r]));

  const [suv, van, table, boulder] = (await Promise.all([
    loadGlb('models/env/Vehicle_SUV_Dark.glb'),
    loadGlb('models/env/Vehicle_Van_Grey.glb'),
    loadGlb('models/env/Table_Wooden.glb'),
    loadGlb('models/env/Boulder_Granite.glb'),
  ])).map(bakeModel);

  // Folding table under the canopy (the camp's Meshy table, reused).
  placeCopies(scene, table, [[DSS.x + 7.8, DSS.z + 8.4, 0, 1.0]], rockCollider(physics, table.box));

  // River rocks: copies of the granite boulder, solid, some breaking the surface.
  makeGranite(boulder);
  const rocks = [];
  for (let i = 0; i < 70; i++) {
    const z = DSS.z - 70 + rand() * 140;
    const x = riverX(z) + (rand() - 0.5) * (RIVER_HALF_WIDTH * 2 + 4);
    rocks.push([x, z, rand() * 6.28, 0.4 + rand() * 1.1, 0.3, (rand() - 0.5) * 0.4]);
  }
  placeCopies(scene, boulder, rocks, rockCollider(physics, boulder.box));

  // Vehicles face north (-z); their rear doors open towards the arriving player.
  // The Meshy models' fronts point along local -x, so turn them -90°.
  const FACE_NORTH = -Math.PI / 2;
  placeCopies(scene, suv, [[DSS.x - 1, DSS.z + 3, FACE_NORTH, 2.55, 0.02]], rockCollider(physics, suv.box));

  const vanScale = 3.0;
  const vanMesh = new THREE.Mesh(van.geo, van.mat);
  vanMesh.scale.setScalar(vanScale);
  vanMesh.castShadow = vanMesh.receiveShadow = true;
  scene.add(vanMesh);
  const parked = W(4.5, -0.05, 2);
  const vanLength = (van.box.max.x - van.box.min.x) * vanScale;
  const vanHalf = new THREE.Vector3(
    (van.box.max.z - van.box.min.z) * vanScale * 0.38,
    (van.box.max.y - van.box.min.y) * vanScale * 0.5,
    vanLength * 0.5
  );
  const vanBody = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  physics.createCollider(RAPIER.ColliderDesc.cuboid(vanHalf.x, vanHalf.y, vanHalf.z), vanBody);

  const van3 = { pos: parked.clone(), speed: 0, state: 'parked', timer: 0, aboard: 0 };
  const placeVan = () => {
    vanMesh.position.copy(van3.pos);
    vanMesh.rotation.y = FACE_NORTH;
    vanBody.setNextKinematicTranslation({ x: van3.pos.x, y: van3.pos.y + vanHalf.y, z: van3.pos.z });
  };
  placeVan();

  // Point just behind the van's open rear doors.
  const rearDoor = () => new THREE.Vector3(van3.pos.x, 0, van3.pos.z + vanLength / 2 + 0.6);

  const DEPART_TIME = 9;   // seconds from pulling away to the departure endpoint
  let onGone = null;

  return {
    get pos() { return parked; },
    rearDoor,
    // Drives off north; `done` runs at the departure endpoint.
    depart(done) { if (van3.state === 'parked') { van3.state = 'leaving'; van3.timer = 0; onGone = done; } },
    reset() {
      van3.pos.copy(parked);
      van3.speed = 0;
      van3.timer = 0;
      van3.state = 'parked';
      vanMesh.visible = true;
      onGone = null;
      placeVan();
    },
    get state() { return van3.state; },
    update(dt) {
      time.value += dt;
      if (van3.state !== 'leaving') return;
      van3.speed = Math.min(14, van3.speed + 3 * dt);
      van3.pos.z -= van3.speed * dt;
      van3.pos.y = groundHeight(van3.pos.x, van3.pos.z) - 0.05;
      van3.timer += dt;
      if (van3.timer > DEPART_TIME) {
        vanMesh.visible = false;
        van3.state = 'away';
        const f = onGone; onGone = null;
        f?.();
      }
      placeVan();
    },
  };
}
