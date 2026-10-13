// Water: flowing rivers and creeks, a calm wetland lake, a waterfall with
// mist. Built in code so it moves (a Meshy model would be frozen).
import * as THREE from 'three';
import { canvasTexture } from '../world.js';

export const waterTime = { value: 0 };

// Shared water shader on top of MeshStandardMaterial: rippled normals for
// sun glints, sky reflection at grazing angles, shallow edges see-through,
// white water where it is shallow or fast.
export function waterMaterial({ shallow = '#7fa59a', deep = '#2e5a57', sky = '#cfdde3', opacity = 0.9, flowSpeed = 1.0, ripple = 1.0, foam: foamAmt = 1.0 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.06, metalness: 0.0, transparent: true, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFlow;\nattribute float aShallow;\nvarying vec2 vFlow; varying float vShallow; varying vec3 vWW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlow = aFlow; vShallow = aShallow; vWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; varying vec2 vFlow; varying float vShallow; varying vec3 vWW;
        float qh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float qn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(qh(i), qh(i + vec2(1, 0)), f.x), mix(qh(i + vec2(0, 1)), qh(i + vec2(1, 1)), f.x), f.y); }
        float waves(vec2 p) {
          vec2 off = vFlow * uTime * ${flowSpeed.toFixed(2)};
          return qn(p * 0.9 - off) * 0.5 + qn(p * 2.3 - off * 1.4 + 7.0) * 0.3 + qn(p * 5.1 - off * 1.9 + 3.0) * 0.2;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 wp = vWW.xz;
        float w = waves(wp);
        vec3 viewDirW = normalize(cameraPosition - vWW);
        float fres = pow(1.0 - clamp(viewDirW.y, 0.0, 1.0), 4.0);
        vec3 col = mix(vec3(${new THREE.Color(deep).toArray().map((v) => v.toFixed(3)).join(',')}), vec3(${new THREE.Color(shallow).toArray().map((v) => v.toFixed(3)).join(',')}), clamp(vShallow * 0.8 + w * 0.25, 0.0, 1.0));
        col = mix(col, vec3(${new THREE.Color(sky).toArray().map((v) => v.toFixed(3)).join(',')}), fres * 0.45);
        float speed = length(vFlow);
        // White water only where it is both shallow and moving fast (rapids).
        float rough = vShallow * smoothstep(0.6, 1.6, speed);
        float foam = smoothstep(0.55, 0.85, w * 0.7 + rough * 0.6) * clamp(rough * 1.6, 0.0, 1.0);
        foam *= ${foamAmt.toFixed(2)};
        col = mix(col, vec3(0.9, 0.93, 0.92), foam * 0.85);
        diffuseColor.rgb = col;
        diffuseColor.a = clamp(mix(${opacity.toFixed(2)}, 0.55, vShallow * 0.6) + foam * 0.4 + fres * 0.15, 0.0, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float e = 0.15;
        float gx = waves(wp + vec2(e, 0.0)) - waves(wp - vec2(e, 0.0));
        float gz = waves(wp + vec2(0.0, e)) - waves(wp - vec2(0.0, e));
        vec3 wn = normalize(vec3(-gx * ${(1.6 * ripple).toFixed(2)}, 1.0, -gz * ${(1.6 * ripple).toFixed(2)}));
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`);
  };
  return mat;
}

// A ribbon of water following a Path. `levelAt(s)` and `halfWidthAt(pt)` set
// the surface; `groundAt` lets shallow water foam over the rocks.
export function buildRiverStrip(scene, path, { levelAt, halfWidthAt, groundAt, material, across = 6, skip }) {
  const pos = [], flow = [], shallow = [], idx = [];
  const pts = path.pts;
  let rows = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (skip?.(p.x, p.z)) continue;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    const tx = dx / len, tz = dz / len;
    const hw = halfWidthAt(p) + 1.2;
    const y = levelAt(path.cum[i], p);
    for (let k = 0; k <= across; k++) {
      const u = k / across - 0.5;
      const x = p.x - tz * u * 2 * hw, z = p.z + tx * u * 2 * hw;
      pos.push(x, y, z);
      // Fastest mid-stream; speeds up where the bed is shallow (rapids).
      const depth = groundAt ? y - groundAt(x, z) : 1;
      const sh = THREE.MathUtils.clamp(1 - depth / 0.9, 0, 1);
      const sp = (1 - Math.abs(u) * 1.6) * (1 + sh * 1.5);
      flow.push(tx * sp, tz * sp);
      shallow.push(sh);
    }
    if (rows > 0) {
      const r0 = (rows - 1) * (across + 1), r1 = rows * (across + 1);
      for (let k = 0; k < across; k++) idx.push(r0 + k, r0 + k + 1, r1 + k, r0 + k + 1, r1 + k + 1, r1 + k);
    }
    rows++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  geo.setAttribute('aShallow', new THREE.Float32BufferAttribute(shallow, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Make sure normals point up whatever the winding.
  const nrm = geo.attributes.normal;
  let flip = false;
  for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) { flip = true; break; }
  if (flip) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}

// Still water over an ellipse or disc (lake, pool).
export function buildPond(scene, { x, z, rx, rz = rx, level, groundAt, material, rings = 18, segs = 48, scale = 1.25 }) {
  const pos = [], flow = [], shallow = [], idx = [];
  for (let r = 0; r <= rings; r++) {
    for (let s = 0; s < segs; s++) {
      const t = (r / rings) * scale, a = (s / segs) * Math.PI * 2;
      const px = x + Math.cos(a) * rx * t, pz = z + Math.sin(a) * rz * t;
      pos.push(px, level, pz);
      const depth = groundAt ? level - groundAt(px, pz) : 1;
      shallow.push(THREE.MathUtils.clamp(1 - depth / 0.8, 0, 1) * 0.8);
      flow.push(0.08, 0.04);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = r * segs + s, b = r * segs + ((s + 1) % segs), c = (r + 1) * segs + s, d = (r + 1) * segs + ((s + 1) % segs);
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  geo.setAttribute('aShallow', new THREE.Float32BufferAttribute(shallow, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  if (geo.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}

// Waterfall: a curtain of falling water from `top` to `bottom` (Vector3s at
// the centre of the lip and the plunge point), `width` metres wide, with mist.
export function buildWaterfall(scene, { top, bottom, width, rand }) {
  const rows = 14, cols = 8;
  const pos = [], uv = [], idx = [];
  const out = new THREE.Vector3().subVectors(bottom, top).setY(0);
  const outLen = out.length();
  out.normalize();
  const side = new THREE.Vector3(-out.z, 0, out.x);
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    // Water arcs out from the lip and falls (a parabola).
    const y = THREE.MathUtils.lerp(top.y, bottom.y, v);
    const fwd = Math.sqrt(v) * outLen;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols - 0.5;
      const spread = 1 + v * 0.35;
      const p = top.clone().addScaledVector(out, fwd).addScaledVector(side, u * width * spread);
      pos.push(p.x, y, p.z);
      uv.push(c / cols, v);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.3 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFallUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFallUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; varying vec2 vFallUv;
        float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 q = vec2(vFallUv.x * 26.0, vFallUv.y * 5.0 - uTime * 2.4);
        float streak = fn(q) * 0.6 + fn(q * vec2(2.0, 3.0) + 5.0) * 0.4;
        float edge = smoothstep(0.0, 0.12, vFallUv.x) * smoothstep(1.0, 0.88, vFallUv.x);
        vec3 col = mix(vec3(0.62, 0.76, 0.74), vec3(0.97, 0.99, 0.98), smoothstep(0.35, 0.75, streak));
        diffuseColor.rgb = col;
        diffuseColor.a = edge * (0.55 + 0.45 * smoothstep(0.3, 0.7, streak)) * (0.75 + 0.25 * vFallUv.y);`);
  };
  const fall = new THREE.Mesh(geo, mat);
  fall.renderOrder = 2;
  scene.add(fall);

  // Mist and spray: soft sprites drifting up from the plunge pool.
  const mistTex = canvasTexture(64, (g, n) => {
    const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  });
  const count = 60;
  const mp = new Float32Array(count * 3);
  const seeds = [];
  for (let i = 0; i < count; i++) seeds.push([rand() * 6.28, rand() * width * 0.7, rand()]);
  const mgeo = new THREE.BufferGeometry();
  mgeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const mist = new THREE.Points(mgeo, new THREE.PointsMaterial({ map: mistTex, size: 2.6, transparent: true, depthWrite: false, opacity: 0.5, color: '#f4f7f6' }));
  mist.frustumCulled = false;
  scene.add(mist);
  return (dt) => {
    const t = waterTime.value;
    for (let i = 0; i < count; i++) {
      const [a, r, ph] = seeds[i];
      const life = (t * 0.35 + ph) % 1;
      mp[i * 3] = bottom.x + Math.cos(a + t * 0.1) * (r * 0.5 + life * 2.5);
      mp[i * 3 + 1] = bottom.y + 0.2 + life * 4.5;
      mp[i * 3 + 2] = bottom.z + Math.sin(a + t * 0.1) * (r * 0.5 + life * 2.5);
    }
    mgeo.attributes.position.needsUpdate = true;
  };
}
