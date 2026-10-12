// Northern savanna arrival area.
// Boulders, huts and houses are Meshy models copied many times (one draw call
// per model). Trees, bushes, grass, the road, sky and dust are built in code so
// they can move with the wind at no generation cost.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGlb } from './player.js';

const WORLD_SIZE = 320;
const wind = { time: { value: 0 } };

// Seeded random so the layout is the same every time the page loads.
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// The dirt road winds in from the south to the village centre.
export function roadX(z) {
  return Math.sin(z * 0.045) * 7;
}

// Gentle rolling ground, flat in the middle where the village sits.
export function groundHeight(x, z) {
  const hills =
    Math.sin(x * 0.045) * Math.cos(z * 0.04) * 3.2 +
    Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.09 + 0.7) * 0.9;
  const d = Math.hypot(x, z);
  const flatten = THREE.MathUtils.smoothstep(d, 22, 50);
  return hills * flatten;
}

function onRoad(x, z, margin = 0) {
  return z > 4 && Math.abs(x - roadX(z)) < 2.6 + margin;
}

// Bends vertices sideways over time, more strongly the higher they are.
// `stiffness` sets how much of the sway the lower part of the mesh receives.
function addWind(material, strength, stiffness = 1.5) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 anchor = instanceMatrix[3].xz;
        #else
          vec2 anchor = modelMatrix[3].xz;
        #endif
        float bend = pow(max(transformed.y, 0.0), ${stiffness.toFixed(2)});
        float gust = sin(uTime * 0.6 + anchor.x * 0.05) * 0.5 + 0.7;
        float sway = sin(uTime * 1.7 + anchor.x * 0.35 + anchor.y * 0.27)
                   + 0.35 * sin(uTime * 4.1 + transformed.x * 3.0 + anchor.y);
        transformed.x += sway * bend * ${strength.toFixed(3)} * gust;
        transformed.z += sway * bend * ${(strength * 0.5).toFixed(3)} * gust;`
      );
  };
  return material;
}

function addFixedCollider(physics, desc, position, rotation) {
  const body = physics.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation ?? { x: 0, y: 0, z: 0, w: 1 })
  );
  physics.createCollider(desc, body);
}

// Gradient sky dome with a warm golden-hour glow around the sun.
function buildSky(scene, sunDir) {
  const geo = new THREE.SphereGeometry(380, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSun: { value: sunDir.clone().normalize() },
      uTop: { value: new THREE.Color('#5d8fc9') },
      uHorizon: { value: new THREE.Color('#f3c98d') },
      uGlow: { value: new THREE.Color('#ffb347') },
      uTime: wind.time,
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uSun, uTop, uHorizon, uGlow; uniform float uTime; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
        float s = max(dot(vDir, uSun), 0.0);
        col += uGlow * (pow(s, 8.0) * 0.6 + pow(s, 200.0) * 2.0);
        // Soft drifting clouds.
        vec2 uv = vDir.xz / max(vDir.y, 0.08) * 1.4 + vec2(uTime * 0.008, 0.0);
        float c = noise(uv) * 0.6 + noise(uv * 2.3) * 0.3 + noise(uv * 5.1) * 0.1;
        c = smoothstep(0.55, 0.85, c) * smoothstep(0.03, 0.25, vDir.y);
        col = mix(col, mix(vec3(1.0, 0.93, 0.82), uGlow, 0.25 + 0.5 * pow(s, 4.0)), c * 0.8);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

function buildGround(scene, physics) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const dry = new THREE.Color('#c9a160');
  const grass = new THREE.Color('#8d8a42');
  const dirt = new THREE.Color('#b0673c');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));
    const patch = (Math.sin(x * 0.3) * Math.cos(z * 0.27) + 1) * 0.5;
    c.copy(dry).lerp(grass, patch * 0.55);
    // Packed red earth around the village and along the road.
    c.lerp(dirt, 1 - THREE.MathUtils.smoothstep(Math.hypot(x, z), 8, 26));
    if (z > 4) c.lerp(dirt, 1 - THREE.MathUtils.smoothstep(Math.abs(x - roadX(z)), 1.6, 3.4));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  scene.add(mesh);

  const vertices = new Float32Array(pos.array);
  const indices = new Uint32Array(geo.index.array);
  addFixedCollider(physics, RAPIER.ColliderDesc.trimesh(vertices, indices), { x: 0, y: 0, z: 0 });
}

// A rectangular mud-brick house with a real doorway you can walk through —
// a stand-in for the "searchable building" in the first mission.
function buildHouse(scene, physics, cx, cz) {
  const y = groundHeight(cx, cz);
  const mat = new THREE.MeshStandardMaterial({ color: '#b0683f', roughness: 0.95 });
  const W = 10, D = 7, H = 3.2, T = 0.4, DOOR = 1.6;
  const walls = [
    // [width, depth, x, z]
    [W, T, 0, -D / 2],                                   // back
    [T, D, -W / 2, 0],                                   // left
    [T, D, W / 2, 0],                                    // right
    [(W - DOOR) / 2, T, -(W + DOOR) / 4, D / 2],         // front-left of door
    [(W - DOOR) / 2, T, (W + DOOR) / 4, D / 2],          // front-right of door
    [T, D / 2, 0, -D / 4],                               // inner partition
  ];
  for (const [w, d, x, z] of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), mat);
    m.position.set(cx + x, y + H / 2, cz + z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(w / 2, H / 2, d / 2), m.position);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR, 0.6, T), mat);
  lintel.position.set(cx, y + H - 0.3, cz + D / 2);
  scene.add(lintel);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(W + 1, 0.15, D + 1),
    new THREE.MeshStandardMaterial({ color: '#8a6a4f', metalness: 0.4, roughness: 0.7 })
  );
  roof.position.set(cx, y + H + 0.1, cz);
  roof.rotation.x = 0.05;
  roof.castShadow = true;
  scene.add(roof);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#6b4a33' }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, y + 0.02, cz);
  floor.receiveShadow = true;
  scene.add(floor);
}

// Trees are instanced: one trunk mesh and one canopy mesh per species.
function buildTrees(scene, physics, rand, spots) {
  const bark = new THREE.MeshStandardMaterial({ color: '#5e4a3a', roughness: 1 });
  const leaf = addWind(new THREE.MeshStandardMaterial({ color: '#6f7f32', roughness: 1, flatShading: true }), 0.05, 1.0);

  // Acacia: leaning trunk with a flat umbrella of leaf clumps.
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const clump = new THREE.IcosahedronGeometry(1, 1);
  clump.scale(1.5, 0.6, 1.5);

  const trunks = new THREE.InstancedMesh(trunkGeo, bark, spots.length);
  const canopy = new THREE.InstancedMesh(clump, leaf, spots.length * 7);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  let k = 0;
  spots.forEach(([x, z], i) => {
    const y = groundHeight(x, z);
    const h = 3.5 + rand() * 2.5;
    const lean = (rand() - 0.5) * 0.25;
    q.setFromEuler(e.set(lean, rand() * 6.28, lean));
    m.compose(v.set(x, y, z), q, s.set(1, h, 1));
    trunks.setMatrixAt(i, m);
    const spread = 1.6 + rand() * 1.2;
    for (let c = 0; c < 7; c++) {
      const a = (c / 7) * 6.28 + rand();
      const r = c === 0 ? 0 : spread * (0.6 + rand() * 0.5);
      m.compose(
        v.set(x + Math.cos(a) * r, y + h + 0.2 + rand() * 0.5, z + Math.sin(a) * r),
        q.setFromEuler(e.set(0, rand() * 6.28, 0)),
        s.setScalar(0.9 + rand() * 0.6)
      );
      canopy.setMatrixAt(k, m);
      canopy.setColorAt(k, color.setHSL(0.18 + rand() * 0.05, 0.4, 0.38 + rand() * 0.1));
      k++;
    }
    addFixedCollider(physics, RAPIER.ColliderDesc.cylinder(2, 0.3), { x, y: y + 2, z });
  });
  trunks.castShadow = canopy.castShadow = true;
  trunks.receiveShadow = canopy.receiveShadow = true;
  scene.add(trunks, canopy);
}

function buildBushes(scene, rand) {
  const count = 260;
  const geo = new THREE.IcosahedronGeometry(0.7, 1);
  geo.scale(1, 0.75, 1);
  geo.translate(0, 0.45, 0);
  const mat = addWind(new THREE.MeshStandardMaterial({ color: '#7d8a3a', roughness: 1, flatShading: true }), 0.06, 1.2);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    let x, z;
    do {
      x = (rand() - 0.5) * WORLD_SIZE * 0.85;
      z = (rand() - 0.5) * WORLD_SIZE * 0.85;
    } while (Math.hypot(x, z) < 24 || onRoad(x, z, 1.5));
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
    const k = 0.6 + rand() * 1.4;
    m.compose(new THREE.Vector3(x, groundHeight(x, z), z), q, s.set(k, k * (0.7 + rand() * 0.6), k));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color.setHSL(0.15 + rand() * 0.07, 0.45, 0.3 + rand() * 0.12));
  }
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

// Tall dry grass tufts that sway in the wind.
function buildGrass(scene, rand) {
  const count = 12000;
  const blade = new THREE.PlaneGeometry(0.2, 0.8, 1, 3);
  blade.translate(0, 0.4, 0);
  // Taper each blade to a point.
  const bp = blade.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setX(i, bp.getX(i) * (1 - bp.getY(i) / 0.85));
  const geo = new THREE.BufferGeometry();
  // Three crossed blades per tuft so it reads from every angle.
  const parts = [0, 1, 2].map((k) => blade.clone().rotateY((k * Math.PI) / 3));
  const merged = parts.reduce((acc, g) => {
    acc.pos.push(...g.attributes.position.array);
    acc.nor.push(...g.attributes.normal.array);
    const base = acc.count;
    acc.idx.push(...g.index.array.map((i) => i + base));
    acc.count += g.attributes.position.count;
    return acc;
  }, { pos: [], nor: [], idx: [], count: 0 });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(merged.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(merged.nor, 3));
  geo.setIndex(merged.idx);
  const mat = addWind(
    new THREE.MeshStandardMaterial({ color: '#d4b26a', roughness: 1, side: THREE.DoubleSide }),
    0.22, 2.0
  );
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    let x, z;
    do {
      x = (rand() - 0.5) * WORLD_SIZE * 0.8;
      z = (rand() - 0.5) * WORLD_SIZE * 0.8;
    } while (Math.hypot(x, z) < 20 || onRoad(x, z));
    q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.3, rand() * 6.28, (rand() - 0.5) * 0.3));
    const k = 0.6 + rand() * 0.9;
    m.compose(new THREE.Vector3(x, groundHeight(x, z), z), q, s.set(k, k * (0.8 + rand() * 0.6), k));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color.setHSL(0.1 + rand() * 0.04, 0.5, 0.45 + rand() * 0.15));
  }
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// Specks of dust drifting across the road in the low sun.
function buildDust(scene, rand) {
  const count = 400;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (rand() - 0.5) * 60;
    pos[i * 3 + 1] = rand() * 4;
    pos[i * 3 + 2] = (rand() - 0.5) * 60;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(geo, new THREE.PointsMaterial({
    color: '#ffe0a8', size: 0.06, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  dust.frustumCulled = false;
  scene.add(dust);
  return (dt, center) => {
    const a = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      a[i * 3] += dt * (0.8 + (i % 7) * 0.1);
      a[i * 3 + 1] += Math.sin(wind.time.value * 0.7 + i) * dt * 0.1;
      a[i * 3 + 2] += dt * 0.3;
      // Keep the dust in a 60 m box around the player.
      for (const [axis, half] of [[0, 30], [2, 30]]) {
        const c = axis === 0 ? center.x : center.z;
        if (a[i * 3 + axis] - c > half) a[i * 3 + axis] -= half * 2;
        if (a[i * 3 + axis] - c < -half) a[i * 3 + axis] += half * 2;
      }
    }
    geo.attributes.position.needsUpdate = true;
  };
}

// Bakes a loaded GLB into a single geometry + material for instancing.
function bakeModel(gltf) {
  gltf.scene.updateMatrixWorld(true);
  let mesh;
  gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  return { geo, mat: mesh.material, box: geo.boundingBox };
}

// Places copies of one Meshy model. `items` are [x, z, rotation, scale, sink].
function placeCopies(scene, model, items, makeCollider) {
  const mesh = new THREE.InstancedMesh(model.geo, model.mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const color = new THREE.Color();
  items.forEach(([x, z, rot, scale, sink = 0, tilt = 0], i) => {
    const y = groundHeight(x, z) - sink * scale;
    q.setFromEuler(e.set(tilt, rot, tilt * 0.5));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, scale, scale));
    mesh.setMatrixAt(i, m);
    // Slight tint so repeated copies don't look identical.
    const t = 0.88 + ((i * 37) % 13) / 13 * 0.24;
    mesh.setColorAt(i, color.setRGB(t, t * (0.88 + ((i * 11) % 7) / 100), t * 0.78));
    makeCollider?.(x, y, z, rot, scale, q);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}

async function addMeshyPieces(scene, physics, rand) {
  const [boulder, house, hut] = (await Promise.all([
    loadGlb('models/env/Boulder_Granite.glb'),
    loadGlb('models/env/House_MudBrick_TinRoof.glb'),
    loadGlb('models/env/Hut_Thatched_Round.glb'),
  ])).map(bakeModel);

  // Scattered boulders and small clusters across the savanna.
  const rocks = [];
  for (let i = 0; i < 70; i++) {
    const a = rand() * 6.28;
    const d = 26 + rand() * 110;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (onRoad(x, z, 2)) continue;
    const n = rand() < 0.4 ? 2 + Math.floor(rand() * 3) : 1;
    for (let k = 0; k < n; k++) {
      rocks.push([x + (rand() - 0.5) * 4, z + (rand() - 0.5) * 4, rand() * 6.28, 0.6 + rand() * 1.6, 0.15 + rand() * 0.2, (rand() - 0.5) * 0.4]);
    }
  }
  // Roadside rocks like the foreground of the arrival picture.
  for (let z = 14; z < 120; z += 7 + rand() * 6) {
    const side = rand() < 0.5 ? -1 : 1;
    rocks.push([roadX(z) + side * (4 + rand() * 3), z, rand() * 6.28, 0.7 + rand() * 0.9, 0.2, (rand() - 0.5) * 0.3]);
  }
  // Rocks collide as a slightly shrunk box, which is cheap and stable.
  const rb = boulder.box;
  placeCopies(scene, boulder, rocks, (x, y, z, rot, s, q) => {
    const hx = (rb.max.x - rb.min.x) * s * 0.4, hy = (rb.max.y - rb.min.y) * s * 0.45, hz = (rb.max.z - rb.min.z) * s * 0.4;
    addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x, y: y + hy, z }, q);
  });

  // Distant granite hills (kopjes): big stacked copies of the same boulder.
  const hills = [];
  for (const [cx, cz] of [[-95, -60], [70, -105], [120, 20], [-120, 55], [30, 140], [-40, -130]]) {
    for (let k = 0; k < 14; k++) {
      const r = rand() * 18;
      const a = rand() * 6.28;
      const big = 6 + rand() * 9 - r * 0.25;
      hills.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, rand() * 6.28, big, 0.1 - (18 - r) * 0.02, (rand() - 0.5) * 0.5]);
    }
  }
  placeCopies(scene, boulder, hills);

  // Village: thatched huts in a ring and tin-roof houses around the enterable house.
  const hutSpots = [[-14, -6, 0.6], [-9, -15, 0.2], [2, -17, 0], [13, -12, -0.5], [16, 2, -1.4], [-16, 6, 1.9], [9, 14, 3.4], [-22, -12, 1], [21, -6, 2]];
  const hutScale = 2.6;
  placeCopies(scene, hut, hutSpots.map(([x, z, r]) => [x, z, r, hutScale]), (x, y, z, rot, s) => {
    const r = Math.max(hut.box.max.x, hut.box.max.z) * s * 0.92;
    const h = (hut.box.max.y - hut.box.min.y) * s;
    addFixedCollider(physics, RAPIER.ColliderDesc.cylinder(h / 2, r), { x, y: y + h / 2, z });
  });
  const houseSpots = [[-24, 2, 1.3], [24, 10, -1.8], [-6, -28, 0.1], [12, -26, -0.3], [28, -18, -1.2]];
  const houseScale = 3.6;
  placeCopies(scene, house, houseSpots.map(([x, z, r]) => [x, z, r, houseScale]), (x, y, z, rot, s, q) => {
    const b = house.box;
    const hx = (b.max.x - b.min.x) * s / 2, hy = (b.max.y - b.min.y) * s / 2, hz = (b.max.z - b.min.z) * s / 2;
    addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(hx * 0.9, hy, hz * 0.9), { x, y: y + hy, z }, q);
  });
}

export function buildWorld(scene, physics) {
  const rand = makeRandom(9);

  const sunDir = new THREE.Vector3(-60, 22, -70);
  const sky = buildSky(scene, sunDir);
  scene.fog = new THREE.Fog('#efc68f', 70, 260);

  scene.add(new THREE.HemisphereLight('#ffe3b8', '#6e4f33', 1.1));
  const sun = new THREE.DirectionalLight('#ffc77a', 2.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -45;
  sc.right = sc.top = 45;
  sc.far = 250;
  sun.shadow.bias = -0.0005;
  sun.userData.offset = sunDir.clone().normalize().multiplyScalar(90);
  scene.add(sun, sun.target);

  buildGround(scene, physics);
  buildHouse(scene, physics, 0, -4);

  const treeSpots = [];
  for (let i = 0; i < 90; i++) {
    const a = rand() * 6.28;
    const d = 22 + rand() * 120;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!onRoad(x, z, 2.5)) treeSpots.push([x, z]);
  }
  // A big shade tree beside the road at the arrival point.
  treeSpots.push([roadX(20) - 7, 20]);
  buildTrees(scene, physics, rand, treeSpots);
  buildBushes(scene, rand);
  buildGrass(scene, rand);
  const updateDust = buildDust(scene, rand);

  const ready = addMeshyPieces(scene, physics, rand).catch((err) => console.error(err));

  return {
    sun,
    ready,
    update(dt, playerPos) {
      wind.time.value += dt;
      sky.position.copy(playerPos);
      updateDust(dt, playerPos);
    },
  };
}
