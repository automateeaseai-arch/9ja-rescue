// Shared animation clips (Meshy library: Idle, shooting, sitting cross-legged),
// generated once on the Female Soldier's rig and reused on every character —
// all models share the same 24-bone Meshy skeleton.
import * as THREE from 'three';
import { loadGlb } from './player.js';

const LEG_BONES = new Set([
  'Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
]);
const boneOf = (track) => track.name.split('.')[0];

let shared = null;

function hipsHeight(root) {
  let h = 1;
  root.traverse((o) => { if (o.name === 'Hips') h = o.position.y; });
  return h;
}

export async function loadSharedAnims() {
  if (shared) return shared;
  const gltf = await loadGlb('models/anims/Shared_Anims.glb');
  const byName = (n) => gltf.animations.find((c) => c.name === n);
  shared = {
    hipsY: hipsHeight(gltf.scene),
    idle: byName('Idle'),
    shoot: byName('Walk_Forward_While_Shooting_inplace'),
    sit: byName('Sit_Cross_Legged_on_Floor'),
  };
  return shared;
}

// Fits a shared clip to another character: only rotations carry over (bone
// lengths differ between people), and hip height is scaled to their size.
// The hips stay over the character's position, so the body doesn't drift.
export function retarget(clip, targetRoot) {
  const scale = hipsHeight(targetRoot) / shared.hipsY;
  const tracks = [];
  for (const t of clip.tracks) {
    if (t.name.endsWith('.quaternion')) tracks.push(t.clone());
    else if (t.name === 'Hips.position') {
      const c = t.clone();
      const v = c.values;
      const x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0 * scale; v[i + 1] *= scale; v[i + 2] = z0 * scale; }
      tracks.push(c);
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// Splits a clip so the arms can shoot while the legs keep walking or standing.
export function upperBody(clip) {
  return new THREE.AnimationClip(`${clip.name}_upper`, clip.duration, clip.tracks.filter((t) => !LEG_BONES.has(boneOf(t))));
}
export function lowerBody(clip) {
  return new THREE.AnimationClip(`${clip.name}_lower`, clip.duration, clip.tracks.filter((t) => LEG_BONES.has(boneOf(t))));
}
