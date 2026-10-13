// Shader tweaks that add weathering to Meshy models in world space, so every
// copy of a piece looks a little different and matches the references.
import * as THREE from 'three';

const NOISE = `
  float wh3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float wn3(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(wh3(i), wh3(i + vec3(1,0,0)), f.x), mix(wh3(i + vec3(0,1,0)), wh3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(wh3(i + vec3(0,0,1)), wh3(i + vec3(1,0,1)), f.x), mix(wh3(i + vec3(0,1,1)), wh3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float wfbm(vec3 p) { return wn3(p) * 0.55 + wn3(p * 2.1) * 0.3 + wn3(p * 4.3) * 0.15; }`;

// Passes world position, world normal and height above the copy's base.
function worldVaryings(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm; varying float vLocalY;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      vec4 wp = vec4(transformed, 1.0);
      vec3 wn = objectNormal;
      float baseY = modelMatrix[3].y;
      #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
        wn = mat3(instanceMatrix) * wn;
        baseY += instanceMatrix[3].y;
      #endif
      vWPos = (modelMatrix * wp).xyz;
      vWNrm = normalize(mat3(modelMatrix) * wn);
      vLocalY = vWPos.y - baseY;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm; varying float vLocalY;\n${NOISE}`);
}

// Buildings: dirt splashed up the base, dark mildew streaks running down and
// green damp. `grime` and `moss` are 0..1.
export function weathered(material, { grime = 0.5, moss = 0.3, streaks = 0.5 } = {}) {
  const mat = material.clone();
  mat.onBeforeCompile = (shader) => {
    worldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 c = diffuseColor.rgb;
      float n = wfbm(vWPos * 0.6);
      float base = 1.0 - smoothstep(0.0, 1.3 + n, vLocalY);
      c = mix(c, c * vec3(0.55, 0.47, 0.38), base * ${grime.toFixed(2)});
      float streak = smoothstep(0.55, 0.85, wn3(vec3(vWPos.x * 3.0 + vWPos.z * 3.0, vWPos.y * 0.15, 0.0))) * (0.5 + 0.5 * n);
      c = mix(c, c * vec3(0.5, 0.52, 0.42), streak * ${streaks.toFixed(2)} * 0.7);
      float damp = smoothstep(0.55, 0.8, wfbm(vWPos * 0.9 + 4.0)) * (0.4 + base);
      c = mix(c, vec3(0.30, 0.36, 0.18), damp * ${moss.toFixed(2)} * 0.6);
      diffuseColor.rgb = c;`);
  };
  return mat;
}

// Rocks: lichen and cracks everywhere, moss on upward-facing surfaces, an
// overall tone shift so one model can be granite, sandstone or wet rock.
export function rockSurface(material, { tone = [1, 1, 1], moss = 0.3, lichen = 0.5, cracks = 0.6 } = {}) {
  const mat = material.clone();
  mat.onBeforeCompile = (shader) => {
    worldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 rp = vWPos;
      vec3 c = diffuseColor.rgb * vec3(${tone.map((v) => v.toFixed(3)).join(',')});
      c *= 0.86 + 0.28 * wn3(rp * 2.3);
      float crack = 1.0 - smoothstep(0.0, 0.014, abs(wfbm(rp * 0.42) - 0.5));
      c = mix(c, c * 0.45, crack * ${cracks.toFixed(2)});
      float li = smoothstep(0.66, 0.71, wfbm(rp * 3.8 + 7.0));
      c = mix(c, vec3(0.84, 0.62, 0.28), li * ${lichen.toFixed(2)} * 0.55);
      float pale = smoothstep(0.7, 0.74, wfbm(rp * 5.0 + 21.0));
      c = mix(c, vec3(0.80, 0.80, 0.68), pale * ${lichen.toFixed(2)} * 0.4);
      float up = smoothstep(0.35, 0.85, vWNrm.y);
      float m = up * smoothstep(0.4, 0.62, wfbm(rp * 0.8 + 2.0));
      c = mix(c, vec3(0.26, 0.36, 0.14) * (0.8 + 0.4 * wn3(rp * 6.0)), m * ${moss.toFixed(2)});
      diffuseColor.rgb = c;`);
  };
  return mat;
}

// Darkens surfaces the deeper they are inside a cave (cheap ambient occlusion
// via a vertex colour), and keeps them readable.
export function caveRock(color = '#b48a5e') {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    worldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 rp = vWPos;
      float layers = sin(rp.y * 3.2 + wfbm(rp * 0.5) * 6.0) * 0.5 + 0.5;
      vec3 c = diffuseColor.rgb * (0.78 + 0.3 * layers) * (0.85 + 0.3 * wn3(rp * 1.7));
      float crack = 1.0 - smoothstep(0.0, 0.02, abs(wfbm(rp * 0.6) - 0.5));
      c = mix(c, c * 0.5, crack * 0.6);
      diffuseColor.rgb = c;`);
  };
  return mat;
}
