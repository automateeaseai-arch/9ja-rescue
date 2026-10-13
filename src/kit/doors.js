// Enterable buildings: every Meshy house, hut, stilt house, depot, plantation
// house and barn gets a real doorway. The Meshy models are closed shells, so:
//  - the doorway is cut at draw time (the shader discards the wall inside a
//    small box in the model's own coordinates, so every copy gets the hole);
//  - a simple room is built inside the shell (inward-facing walls, floor and
//    ceiling, with jambs round the doorway), so looking in or out of the
//    door shows walls, not the sky through the back of the shell;
//  - the solid box collider is replaced by walls with a gap at the door, a
//    roof slab and (on stilts) a floor and a step in front of the door.
// All sizes are in model units (the models are about 1.9 units across) and
// were measured by casting rays inside each model. The doors face +Z.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { addFixedCollider } from '../world.js';

// cut: [x0, x1, y0, y1, z0, z1] removed from the shell.
// room: rect { x0, x1, z0, z1 } or round { r }, floor y, top y (ceiling),
// door: [x0, x1, top] opening in the room's front wall (z1, or +r).
export const DOORWAYS = {
  Hut_Thatched_Round: { cut: [-0.2, 0.2, -0.05, 0.8, 0.5, 1.0], room: { r: 0.74, y: 0, top: 0.5, cone: 1.0, door: [-0.19, 0.19, 0.77] } },
  House_MudBrick_TinRoof: { cut: [-0.31, -0.03, -0.05, 0.72, 0.38, 0.62], room: { x0: -0.62, x1: 0.7, z0: -0.49, z1: 0.47, y: 0, top: 0.94, door: [-0.3, -0.04, 0.71] } },
  Stilt_House_Thatch: { cut: [-0.12, 0.15, 0.12, 0.56, 0.62, 0.9], room: { x0: -0.6, x1: 0.6, z0: -0.79, z1: 0.74, y: 0.165, top: 0.56, door: [-0.11, 0.14, 0.55] }, porch: true },
  Stilt_House_Tin: { cut: [-0.38, -0.1, 0.15, 0.63, 0.28, 0.52], room: { x0: -0.58, x1: 0.41, z0: -0.63, z1: 0.36, y: 0.2, top: 0.9, door: [-0.37, -0.11, 0.62] }, porch: true },
  Depot_Warehouse: { cut: [-0.43, -0.02, -0.05, 0.76, 0.44, 0.68], room: { x0: -0.88, x1: 0.88, z0: -0.73, z1: 0.53, y: 0, top: 1.1, door: [-0.42, -0.03, 0.75] } },
  Plantation_House: { cut: [-0.08, 0.13, -0.05, 0.39, 0.04, 0.22], room: { x0: -0.72, x1: 0.74, z0: -0.68, z1: 0.1, y: 0, top: 0.62, door: [-0.07, 0.12, 0.38] } },
  Barn_Long_TinRoof: { cut: [-0.31, 0.31, -0.05, 0.63, 0.33, 0.55], room: { x0: -0.91, x1: 0.91, z0: -0.45, z1: 0.39, y: 0, top: 0.9, door: [-0.3, 0.3, 0.62] } },
};
export const doorwayFor = (name) => DOORWAYS[name.replace(/^.*\//, '')] ?? null;

// Cuts the doorway out of a model's material (all instances share it).
export function cutDoorway(material, spec) {
  const [x0, x1, y0, y1, z0, z1] = spec.cut;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    prev?.call(material, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying vec3 vDoorP;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vDoorP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `varying vec3 vDoorP;\nvoid main() {
  if (all(greaterThan(vDoorP, vec3(${x0.toFixed(3)}, ${y0.toFixed(3)}, ${z0.toFixed(3)}))) && all(lessThan(vDoorP, vec3(${x1.toFixed(3)}, ${y1.toFixed(3)}, ${z1.toFixed(3)})))) discard;`);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${key ? key() : ''}|door${spec.cut.join(',')}`;
  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------- interior
function wallTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#8f8070';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = 120 + Math.random() * 60;
    g.fillStyle = `rgba(${v},${v * 0.78},${v * 0.55},0.18)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 2 + Math.random() * 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
let interiorMat = null;
export function interiorMaterial() {
  interiorMat ??= new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 1, color: '#b9ad9e' });
  return interiorMat;
}

// Room geometry in model units: quads facing inwards, uv in model units.
export function interiorGeometry(spec) {
  const R = spec.room;
  const pos = [], uv = [], idx = [];
  // Faces are turned towards `centre` (the middle of the room, or of the doorway for the jambs).
  let centre = new THREE.Vector3();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  const facesIn = (a, b, c) => {
    A.set(...a); B.set(...b); C.set(...c);
    N.subVectors(B, A).cross(C.clone().sub(A));
    return N.dot(centre.clone().sub(A.add(B).add(C).divideScalar(3))) >= 0;
  };
  const tri = (a, b, c, ua, ub, uc) => {
    const n = pos.length / 3;
    pos.push(...a, ...b, ...c);
    uv.push(...ua, ...ub, ...uc);
    if (facesIn(a, b, c)) idx.push(n, n + 1, n + 2); else idx.push(n, n + 2, n + 1);
  };
  const quad = (a, b, c, d, u = 0, v = 1) => {
    const n = pos.length / 3;
    for (const p of [a, b, c, d]) { pos.push(...p); uv.push(p[u] * 3, p[v] * 3); }
    if (facesIn(a, b, c)) idx.push(n, n + 1, n + 2, n, n + 2, n + 3); else idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
  };
  const y0 = R.y, y1 = R.top, [dx0, dx1, dTop] = R.door;
  if (R.r) {
    centre.set(0, (y0 + y1) / 2, 0);
    // Round hut: wall segments (the door gap at +Z), a cone ceiling and a floor.
    const N = 20, gap = Math.asin(Math.min(0.99, (dx1 - dx0) / 2 / R.r));
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      const p = (a, y) => [Math.sin(a) * R.r, y, Math.cos(a) * R.r];
      const nearDoor = Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid))) < gap + 0.02;
      if (!nearDoor) quad(p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1), 0, 1);
      // Cone ceiling (facing down and in) and floor (facing up).
      tri(p(a1, y1), p(a0, y1), [0, R.cone, 0], [0, 0], [1, 0], [0.5, 1]);
      tri(p(a0, y0 + 0.004), p(a1, y0 + 0.004), [0, y0 + 0.004, 0], [Math.sin(a0) * 2, Math.cos(a0) * 2], [Math.sin(a1) * 2, Math.cos(a1) * 2], [0, 0]);
    }
  } else {
    const { x0, x1, z0, z1 } = R;
    centre.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 1);                 // back (faces +z)
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 2, 1);                 // left (faces +x)
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 2, 1);                 // right (faces -x)
    // Front wall (faces -z) round the door.
    quad([x0, y0, z1], [dx0, y0, z1], [dx0, y1, z1], [x0, y1, z1], 0, 1);
    quad([dx1, y0, z1], [x1, y0, z1], [x1, y1, z1], [dx1, y1, z1], 0, 1);
    quad([dx0, dTop, z1], [dx1, dTop, z1], [dx1, y1, z1], [dx0, y1, z1], 0, 1);
    quad([x0, y0 + 0.004, z1], [x1, y0 + 0.004, z1], [x1, y0 + 0.004, z0], [x0, y0 + 0.004, z0], 0, 2); // floor
    quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], 0, 2);                 // ceiling (faces down)
    // Jambs from the room wall out to the cut in the shell.
    const zo = spec.cut[5];
    centre = new THREE.Vector3((dx0 + dx1) / 2, (y0 + dTop) / 2, (zo + z1) / 2);
    quad([dx0, y0, zo], [dx0, y0, z1], [dx0, dTop, z1], [dx0, dTop, zo], 2, 1);
    quad([dx1, y0, z1], [dx1, y0, zo], [dx1, dTop, zo], [dx1, dTop, z1], 2, 1);
    quad([dx0, dTop, z1], [dx1, dTop, z1], [dx1, dTop, zo], [dx0, dTop, zo], 0, 2);
    quad([dx0, y0 + 0.004, zo], [dx1, y0 + 0.004, zo], [dx1, y0 + 0.004, z1], [dx0, y0 + 0.004, z1], 0, 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- colliders
// Boxes [cx, cy, cz, hx, hy, hz] in model units.
export function roomBoxes(spec) {
  const R = spec.room, t = 0.04, out = [];
  const [dx0, dx1, dTop] = R.door;
  const y0 = R.y, y1 = R.top, hy = (y1 - y0) / 2, cy = (y0 + y1) / 2;
  if (R.r) {
    const N = 16, gap = Math.asin(Math.min(0.99, (dx1 - dx0) / 2 / R.r)) + 0.05;
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < gap + Math.PI / N) continue;
      out.push({ c: [Math.sin(a) * (R.r + t), (y0 + dTop) / 2, Math.cos(a) * (R.r + t)], h: [R.r * Math.PI / N + 0.01, (dTop - y0) / 2, t], yaw: a });
    }
    // Roof: above the doorway, so the hut can't be climbed into from the top.
    out.push({ c: [0, dTop + 0.12, 0], h: [R.r + 0.15, 0.12, R.r + 0.15] });
    return out;
  }
  const { x0, x1, z0, z1 } = R;
  const cx = (x0 + x1) / 2, hx = (x1 - x0) / 2 + t;
  out.push({ c: [cx, cy, z0 - t], h: [hx, hy, t] });                                     // back
  out.push({ c: [x0 - t, cy, (z0 + z1) / 2], h: [t, hy, (z1 - z0) / 2 + t] });           // left
  out.push({ c: [x1 + t, cy, (z0 + z1) / 2], h: [t, hy, (z1 - z0) / 2 + t] });           // right
  out.push({ c: [(x0 + dx0) / 2 - t / 2, cy, z1 + t], h: [(dx0 - x0) / 2 + t / 2, hy, t] }); // front left
  out.push({ c: [(dx1 + x1) / 2 + t / 2, cy, z1 + t], h: [(x1 - dx1) / 2 + t / 2, hy, t] }); // front right
  out.push({ c: [(dx0 + dx1) / 2, (dTop + y1) / 2 + 0.02, z1 + t], h: [(dx1 - dx0) / 2, (y1 - dTop) / 2 + 0.02, t] }); // lintel
  out.push({ c: [cx, y1 + 0.08, (z0 + z1) / 2], h: [hx + 0.06, 0.08, (z1 - z0) / 2 + 0.1] }); // roof
  if (y0 > 0.05) {
    // On stilts: a floor, and a deck in front of the door.
    out.push({ c: [cx, y0 - 0.03, (z0 + z1) / 2], h: [hx, 0.03, (z1 - z0) / 2 + t] });
    if (spec.porch) out.push({ c: [(dx0 + dx1) / 2, y0 - 0.03, z1 + 0.14], h: [(dx1 - dx0) / 2 + 0.08, 0.03, 0.14] });
  }
  return out;
}

const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
// Adds the walls for one placed copy; `m` is the copy's matrix (position, rotation, scale).
export function addRoomColliders(physics, spec, m) {
  m.decompose(_p, _q, _s);
  for (const b of roomBoxes(spec)) {
    _c.set(...b.c).applyMatrix4(m);
    const rot = b.yaw ? _qy.setFromAxisAngle(_y, b.yaw).premultiply(_q) : _q;
    // Walls stay at least 0.2 m thick so a running player can't pass through.
    const h = [b.h[0] * _s.x, b.h[1] * _s.y, b.h[2] * _s.z].map((v) => Math.max(v, 0.1));
    addFixedCollider(physics, RAPIER.ColliderDesc.cuboid(...h), { x: _c.x, y: _c.y, z: _c.z }, rot.clone());
  }
}
