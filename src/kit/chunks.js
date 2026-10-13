// Instanced copies split into map cells, so the GPU skips cells that are off
// screen or beyond a set distance (important on phones over a large map).
import * as THREE from 'three';

const CELL = 80;
const registry = [];
let distScale = 1, lodScale = 1;

// Phones draw less far (fog hides the cut-off) and switch to low-detail
// copies sooner.
export function setDistanceScale(k, lod = 1) { distScale = k; lodScale = lod; }

// Low-detail copy of a geometry by vertex clustering: vertices in the same
// grid cell merge, collapsed triangles drop out. Used for distant copies.
export function clusterSimplify(geo, cells = 12) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) / cells;
  const pos = geo.attributes.position;
  const key = new Map();
  const rep = new Int32Array(pos.count);
  const sum = [];
  for (let i = 0; i < pos.count; i++) {
    const k = Math.floor((pos.getX(i) - b.min.x) / size) + ',' + Math.floor((pos.getY(i) - b.min.y) / size) + ',' + Math.floor((pos.getZ(i) - b.min.z) / size);
    if (!key.has(k)) { key.set(k, i); sum[i] = [0, 0, 0, 0]; }
    const r = key.get(k);
    rep[i] = r;
    sum[r][0] += pos.getX(i); sum[r][1] += pos.getY(i); sum[r][2] += pos.getZ(i); sum[r][3]++;
  }
  const out = geo.clone();
  const p2 = out.attributes.position;
  for (let i = 0; i < pos.count; i++) if (rep[i] === i) p2.setXYZ(i, sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]);
  const src = geo.index ? geo.index.array : [...Array(pos.count).keys()];
  const idx = [];
  for (let t = 0; t < src.length; t += 3) {
    const a = rep[src[t]], c = rep[src[t + 1]], d = rep[src[t + 2]];
    if (a !== c && c !== d && a !== d) idx.push(a, c, d);
  }
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

// items: [{ m: Matrix4, c?: Color }]. Returns the meshes created.
// With `lo` (a low-detail geometry), cells beyond `loDist` use it instead.
export function addInstanced(scene, geometry, material, items, { maxDist = 400, shadow = true, receive = true, lo = null, loDist = 70 } = {}) {
  const cells = new Map();
  const p = new THREE.Vector3();
  for (const it of items) {
    p.setFromMatrixPosition(it.m);
    const k = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(it);
  }
  const meshes = [];
  for (const list of cells.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    const centre = new THREE.Vector3();
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (it.c) mesh.setColorAt(i, it.c);
      centre.add(p.setFromMatrixPosition(it.m));
    });
    centre.divideScalar(list.length);
    mesh.computeBoundingSphere();
    mesh.castShadow = shadow;
    mesh.receiveShadow = receive;
    mesh.userData.cull = { centre, maxDist: maxDist + CELL * 0.7 };
    scene.add(mesh);
    registry.push(mesh);
    meshes.push(mesh);
    if (lo) {
      const far = new THREE.InstancedMesh(lo, material, list.length);
      far.instanceMatrix.copy(mesh.instanceMatrix);
      if (mesh.instanceColor) far.instanceColor = mesh.instanceColor;
      far.computeBoundingSphere();
      far.castShadow = shadow;
      far.receiveShadow = receive;
      far.userData.cull = { centre, maxDist: maxDist + CELL * 0.7, minDist: loDist };
      mesh.userData.cull.maxDist = loDist;
      mesh.userData.cull.hi = true;
      scene.add(far);
      registry.push(far);
    }
  }
  return meshes;
}

// Hides cells beyond their draw distance. Call once per frame.
export function updateCulling(camPos) {
  for (const m of registry) {
    const c = m.userData.cull;
    const dx = c.centre.x - camPos.x, dz = c.centre.z - camPos.z;
    const d2 = dx * dx + dz * dz;
    const max = c.maxDist * (c.hi ? lodScale : distScale);
    const min = (c.minDist ?? 0) * lodScale;
    m.visible = d2 < max * max && d2 >= min * min;
  }
}

export function clearCulling() { registry.length = 0; }

// Convenience for building matrices.
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
export function mat(x, y, z, yaw = 0, s = 1, tiltX = 0, tiltZ = 0) {
  const sv = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(tiltX, yaw, tiltZ, 'YXZ')), sv);
}
