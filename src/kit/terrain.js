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

// `size` is the full width; `step` the vertex spacing. `colorAt(x, z, h, slope)`
// returns [r, g, b, wet]. `holeAt(x, z, hMax)` removes triangles (centre point, highest corner).
export function buildTerrain(scene, physics, { size, step, heightAt, colorAt, holeAt }) {
  const n = Math.round(size / step) + 1;
  const half = size / 2;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) heights[j * n + i] = heightAt(-half + i * step, -half + j * step);
  }
  const H = (i, j) => heights[THREE.MathUtils.clamp(j, 0, n - 1) * n + THREE.MathUtils.clamp(i, 0, n - 1)];

  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const wet = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = -half + i * step, z = -half + j * step, h = heights[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const sx = (H(i + 1, j) - H(i - 1, j)) / (2 * step);
      const sz = (H(i, j + 1) - H(i, j - 1)) / (2 * step);
      const slope = Math.hypot(sx, sz);
      const [r, g, b, w] = colorAt(x, z, h, slope);
      col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
      wet[k] = w;
    }
  }
  // Same triangulation as THREE.PlaneGeometry, so heightAt below is exact.
  const idx = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = (j + 1) * n + i, c = (j + 1) * n + i + 1, d = j * n + i + 1;
      const x = -half + (i + 0.5) * step, z = -half + (j + 0.5) * step;
      // Hole test per triangle, given its highest corner.
      const hi1 = Math.max(heights[a], heights[b], heights[d]), hi2 = Math.max(heights[b], heights[c], heights[d]);
      if (holeAt?.(x - step * 0.17, z - step * 0.17, hi1) !== true) idx.push(a, b, d);
      if (holeAt?.(x + step * 0.17, z + step * 0.17, hi2) !== true) idx.push(b, c, d);
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
    const fx = (x + half) / step, fz = (z + half) / step;
    const i = THREE.MathUtils.clamp(Math.floor(fx), 0, n - 2), j = THREE.MathUtils.clamp(Math.floor(fz), 0, n - 2);
    const u = fx - i, v = fz - j;
    const ha = H(i, j), hb = H(i, j + 1), hc = H(i + 1, j + 1), hd = H(i + 1, j);
    return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }
  return { mesh, groundAt, heights, n, step, half };
}
