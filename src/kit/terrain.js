// Heightfield terrain built from any height function: a grid mesh with
// per-vertex colour and wetness, optional holes (e.g. cave mouths), a
// matching physics trimesh and an exact height lookup.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { addFixedCollider } from '../world.js';

// Ground shader: world-space detail so close-up ground isn't flat colour —
// soil mottling, grit, and shinier wet mud where `aWet` is high.
export function terrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWet;\nvarying float vWet;\nvarying vec3 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = aWet;\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vWet; varying vec3 vGround;
        float th(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(th(i), th(i + vec2(1, 0)), f.x), mix(th(i + vec2(0, 1)), th(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 gp = vGround.xz;
        float mott = tn(gp * 0.35) * 0.5 + tn(gp * 1.3) * 0.3 + tn(gp * 4.7) * 0.2;
        float grit = smoothstep(0.62, 0.9, tn(gp * 7.3)) * smoothstep(0.5, 0.8, tn(gp * 2.1 + 9.0));
        vec3 gcol = diffuseColor.rgb * (0.72 + 0.56 * mott) * (0.9 + 0.2 * tn(gp * 0.07));
        gcol = mix(gcol, gcol * 1.25 + 0.03, grit * 0.3 * (1.0 - vWet));
        // Wet mud is darker and slightly richer.
        gcol *= 1.0 - vWet * 0.22 * (0.6 + 0.4 * tn(gp * 0.8));
        diffuseColor.rgb = gcol;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(1.0, 0.42, smoothstep(0.35, 1.0, vWet) * (0.6 + 0.4 * tn(gp * 0.6)));`);
  };
  return mat;
}

// Square grid of `size` centred on the origin, or any rectangle via
// `bounds` {minX, maxX, minZ, maxZ}. `step` is the vertex spacing.
// `colorAt(x, z, h, slope)` returns [r, g, b, wet]. `holeAt(x, z, hMax)`
// removes a triangle (given its centre and highest corner).
export function buildTerrain(scene, physics, { size, step, bounds, heightAt, colorAt, holeAt, lift = 0 }) {
  const b = bounds ?? { minX: -size / 2, maxX: size / 2, minZ: -size / 2, maxZ: size / 2 };
  const nx = Math.round((b.maxX - b.minX) / step) + 1, nz = Math.round((b.maxZ - b.minZ) / step) + 1;
  const heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) heights[j * nx + i] = heightAt(b.minX + i * step, b.minZ + j * step) + lift;
  }
  const H = (i, j) => heights[THREE.MathUtils.clamp(j, 0, nz - 1) * nx + THREE.MathUtils.clamp(i, 0, nx - 1)];

  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const wet = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = b.minX + i * step, z = b.minZ + j * step, h = heights[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const sx = (H(i + 1, j) - H(i - 1, j)) / (2 * step);
      const sz = (H(i, j + 1) - H(i, j - 1)) / (2 * step);
      const [r, g, bl, w] = colorAt(x, z, h, Math.hypot(sx, sz));
      col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = bl;
      wet[k] = w;
    }
  }
  // Same triangulation as THREE.PlaneGeometry, so groundAt below is exact.
  const idx = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, bb = (j + 1) * nx + i, c = (j + 1) * nx + i + 1, d = j * nx + i + 1;
      const x = b.minX + (i + 0.5) * step, z = b.minZ + (j + 0.5) * step;
      // Hole test per triangle, given its highest corner.
      const hi1 = Math.max(heights[a], heights[bb], heights[d]), hi2 = Math.max(heights[bb], heights[c], heights[d]);
      if (holeAt?.(x - step * 0.17, z - step * 0.17, hi1) !== true) idx.push(a, bb, d);
      if (holeAt?.(x + step * 0.17, z + step * 0.17, hi2) !== true) idx.push(bb, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aWet', new THREE.BufferAttribute(wet, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, terrainMaterial());
  mesh.receiveShadow = true;
  scene.add(mesh);
  addFixedCollider(physics, RAPIER.ColliderDesc.trimesh(pos, new Uint32Array(idx)), { x: 0, y: 0, z: 0 });

  function groundAt(x, z) {
    const fx = (x - b.minX) / step, fz = (z - b.minZ) / step;
    const i = THREE.MathUtils.clamp(Math.floor(fx), 0, nx - 2), j = THREE.MathUtils.clamp(Math.floor(fz), 0, nz - 2);
    const u = fx - i, v = fz - j;
    const ha = H(i, j), hb = H(i, j + 1), hc = H(i + 1, j + 1), hd = H(i + 1, j);
    return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }
  return { mesh, groundAt, heights, step, bounds: b };
}
