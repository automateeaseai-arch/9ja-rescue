// Skin tone for the player characters, done in the shader: texels whose
// colour is skin (warm orange-brown, fairly saturated, not dark) are scaled
// towards the chosen tone; clothing, camo and gear keep their colours. The
// approved models all paint skin in the same warm range, so one rule fits
// all four. Tone 0 is light, 1 is deep (see SKIN_SWATCHES in ui/characters.js).
import * as THREE from 'three';

const SWATCHES = ['#c58c62', '#a96f47', '#8d5634', '#6b3d22', '#4f2b18', '#33190d'].map((c) => new THREE.Color(c));
// The models' own average skin colour (measured from their textures).
const REF = new THREE.Color('#a37350');

export function toneColor(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1) * (SWATCHES.length - 1);
  const i = Math.min(SWATCHES.length - 2, Math.floor(x));
  return SWATCHES[i].clone().lerp(SWATCHES[i + 1], x - i);
}

const PATCH = `#include <map_fragment>
{
  vec3 s = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
  float mx = max(s.r, max(s.g, s.b)), mn = min(s.r, min(s.g, s.b));
  float sat = (mx - mn) / max(mx, 1e-3);
  float h = (s.g - s.b) / max(s.r - s.b, 1e-3);
  float m = step(s.g, s.r) * step(s.b, s.g)
    * smoothstep(0.30, 0.40, sat) * smoothstep(0.30, 0.42, mx)
    * smoothstep(0.10, 0.18, h) * (1.0 - smoothstep(0.58, 0.68, h));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uSkinScale, m * uSkinOn);
}`;

// Applies (or updates) the tone on every mesh of `root`. null removes it.
export function tintSkin(root, tone) {
  const scale = new THREE.Vector3();
  if (tone != null) {
    const want = toneColor(tone).convertSRGBToLinear(), ref = REF.clone().convertSRGBToLinear();
    scale.set(want.r / ref.r, want.g / ref.g, want.b / ref.b);
  }
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((m) => {
      if (!m.userData.skin) {
        // Own copy, so the shared model in the cache is untouched.
        m = m.clone();
        const u = { uSkinScale: { value: new THREE.Vector3(1, 1, 1) }, uSkinOn: { value: 0 } };
        m.userData.skin = u;
        m.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, u);
          sh.fragmentShader = 'uniform vec3 uSkinScale;\nuniform float uSkinOn;\n' + sh.fragmentShader.replace('#include <map_fragment>', PATCH);
        };
        m.customProgramCacheKey = () => 'skin-tone';
      }
      m.userData.skin.uSkinScale.value.copy(scale);
      m.userData.skin.uSkinOn.value = tone == null ? 0 : 1;
      return m;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}
