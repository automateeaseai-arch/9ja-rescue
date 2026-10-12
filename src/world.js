// Placeholder savanna village built from simple shapes.
// Each piece gets a matching physics collider, so it can later be swapped for a
// real model (Meshy GLB) without changing gameplay code.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const WORLD_SIZE = 240;

// Seeded random so the layout is the same every time the page loads.
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
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

function addFixedCollider(physics, desc, position, rotation) {
  const body = physics.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation ?? { x: 0, y: 0, z: 0, w: 1 })
  );
  physics.createCollider(desc, body);
}

function buildGround(scene, physics) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 120, 120);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const dry = new THREE.Color('#c9a66b');
  const grass = new THREE.Color('#8c8a45');
  const dirt = new THREE.Color('#a8714a');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeight(x, z);
    pos.setY(i, y);
    const patch = (Math.sin(x * 0.3) * Math.cos(z * 0.27) + 1) * 0.5;
    c.copy(dry).lerp(grass, patch * 0.6);
    // Packed red earth around the village centre.
    c.lerp(dirt, 1 - THREE.MathUtils.smoothstep(Math.hypot(x, z), 8, 26));
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

function buildRoundHut(scene, physics, x, z, rot) {
  const y = groundHeight(x, z);
  const group = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.5, 2.6, 20),
    new THREE.MeshStandardMaterial({ color: '#b5643c', roughness: 0.95 })
  );
  wall.position.y = 1.3;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(3.3, 2.4, 20),
    new THREE.MeshStandardMaterial({ color: '#d8b35a', roughness: 1 })
  );
  roof.position.y = 3.7;
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1.8),
    new THREE.MeshStandardMaterial({ color: '#2a1a12' })
  );
  door.position.set(0, 0.9, 2.51);
  group.add(wall, roof, door);
  group.position.set(x, y, z);
  group.rotation.y = rot;
  group.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  scene.add(group);
  addFixedCollider(physics, RAPIER.ColliderDesc.cylinder(1.3, 2.5), { x, y: y + 1.3, z });
}

// A rectangular mud-brick house with a real doorway you can walk through —
// a stand-in for the "searchable building" in the first mission.
function buildHouse(scene, physics, cx, cz) {
  const y = groundHeight(cx, cz);
  const mat = new THREE.MeshStandardMaterial({ color: '#a65a35', roughness: 0.95 });
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
  // Lintel above the door.
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR, 0.6, T), mat);
  lintel.position.set(cx, y + H - 0.3, cz + D / 2);
  scene.add(lintel);
  // Corrugated-iron style roof (visual only, raised so the camera fits inside).
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(W + 1, 0.15, D + 1),
    new THREE.MeshStandardMaterial({ color: '#8d8f8a', metalness: 0.4, roughness: 0.6 })
  );
  roof.position.set(cx, y + H + 0.1, cz);
  roof.rotation.x = 0.05;
  roof.castShadow = true;
  scene.add(roof);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: '#6b4a33' })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, y + 0.02, cz);
  floor.receiveShadow = true;
  scene.add(floor);
  return roof;
}

function buildBoulder(scene, physics, x, z, size, rand) {
  const geo = new THREE.IcosahedronGeometry(size, 2);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(0.8 + rand() * 0.35);
    v.y *= 0.75;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: '#8b8580', roughness: 0.9, flatShading: true })
  );
  const y = groundHeight(x, z) + size * 0.3;
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(p.array));
  if (hull) addFixedCollider(physics, hull, mesh.position);
}

function buildTree(scene, physics, x, z, kind, rand) {
  const y = groundHeight(x, z);
  const group = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: '#6e5a48', roughness: 1 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#5f7a32', roughness: 1, flatShading: true });
  let trunkRadius;
  if (kind === 'baobab') {
    trunkRadius = 1.1;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.3, 6, 10), bark);
    trunk.position.y = 3;
    group.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 2.5, 6), bark);
      branch.position.set(Math.cos(a) * 0.9, 6.6, Math.sin(a) * 0.9);
      branch.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
      group.add(branch);
      const tuft = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), leaf);
      tuft.position.set(Math.cos(a) * 1.9, 7.7, Math.sin(a) * 1.9);
      group.add(tuft);
    }
  } else {
    // Acacia: thin trunk, flat umbrella canopy.
    trunkRadius = 0.25;
    const h = 3.5 + rand() * 2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, h, 6), bark);
    trunk.position.y = h / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.2;
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(3 + rand(), 2.2, 0.8, 9), leaf);
    canopy.position.y = h + 0.3;
    group.add(trunk, canopy);
  }
  group.position.set(x, y, z);
  group.rotation.y = rand() * Math.PI * 2;
  group.traverse((o) => { o.castShadow = o.receiveShadow = true; });
  scene.add(group);
  addFixedCollider(physics, RAPIER.ColliderDesc.cylinder(3, trunkRadius), { x, y: y + 3, z });
}

function buildGrass(scene, rand) {
  const count = 3500;
  const geo = new THREE.ConeGeometry(0.08, 0.7, 3);
  geo.translate(0, 0.35, 0);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ color: '#c2a35a', roughness: 1 }),
    count
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    let x, z;
    do {
      x = (rand() - 0.5) * WORLD_SIZE * 0.9;
      z = (rand() - 0.5) * WORLD_SIZE * 0.9;
    } while (Math.hypot(x, z) < 22);
    q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.4, rand() * 6, (rand() - 0.5) * 0.4));
    const k = 0.6 + rand() * 0.9;
    s.set(k, k, k);
    m.compose(new THREE.Vector3(x, groundHeight(x, z), z), q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color.setHSL(0.11 + rand() * 0.04, 0.45, 0.45 + rand() * 0.15));
  }
  scene.add(mesh);
}

export function buildWorld(scene, physics) {
  const rand = makeRandom(9);

  scene.background = new THREE.Color('#e9c99a');
  scene.fog = new THREE.Fog('#e9c99a', 60, 150);

  scene.add(new THREE.HemisphereLight('#fff1d6', '#7a5a3a', 1.2));
  const sun = new THREE.DirectionalLight('#ffe2b0', 2.4);
  sun.position.set(40, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -45;
  sc.right = sc.top = 45;
  sc.far = 200;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  buildGround(scene, physics);

  // Village: ring of round huts around a central compound house.
  const huts = [
    [-14, -6, 0.6], [-9, -15, 0.2], [2, -17, 0], [13, -12, -0.5],
    [16, 2, -1.4], [-16, 6, 1.9], [9, 14, 3.4],
  ];
  for (const [x, z, r] of huts) buildRoundHut(scene, physics, x, z, r);
  const houseRoof = buildHouse(scene, physics, 0, -4);

  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = 28 + rand() * 80;
    buildBoulder(scene, physics, Math.cos(a) * d, Math.sin(a) * d, 1 + rand() * 3, rand);
  }
  for (let i = 0; i < 45; i++) {
    const a = rand() * Math.PI * 2;
    const d = 24 + rand() * 90;
    buildTree(scene, physics, Math.cos(a) * d, Math.sin(a) * d, rand() < 0.2 ? 'baobab' : 'acacia', rand);
  }
  buildGrass(scene, rand);

  return { sun, houseRoof };
}
