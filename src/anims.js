// Shared animation clips from the Meshy library, generated on the Female
// Soldier's rig and reused on every character (all models share the same
// 24-bone Meshy skeleton):
//   Shared_Anims.glb: Idle, shooting, sitting cross-legged
//   Combat_Anims.glb: jab, knock-down, fall forward, swim idle/forward,
//                     crouch idle/walk, climbing up a wall
//   Throw_Anim.glb:   over-shoulder throw (grenades)
//   Air_Anims.glb:    rope hang (under the parachute), bar hang (hang glider)
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
  const [a, b, c, d] = await Promise.all([
    loadGlb('models/anims/Shared_Anims.glb'), loadGlb('models/anims/Combat_Anims.glb'), loadGlb('models/anims/Throw_Anim.glb'),
    loadGlb('models/anims/Air_Anims.glb'),
  ]);
  // Each clip remembers its source skeleton's hip height for retargeting.
  const from = (gltf, n) => {
    const clip = gltf.animations.find((x) => x.name.includes(n));
    clip.userData = { hipsY: hipsHeight(gltf.scene) };
    return clip;
  };
  shared = {
    hipsY: hipsHeight(a.scene),
    idle: from(a, 'Idle'),
    shoot: from(a, 'Walk_Forward_While_Shooting_inplace'),
    sit: from(a, 'Sit_Cross_Legged_on_Floor'),
    punch: from(b, 'Right_Jab_from_Guard'),
    knockDown: from(b, 'Knock_Down'),
    fallForward: from(b, 'Shot_and_Fall_Forward'),
    swimIdle: from(b, 'Swim_Idle'),
    swimForward: from(b, 'Swim_Forward'),
    crouchWalk: from(b, 'Cautious_Crouch_Walk_Forward'),
    crouchIdle: from(b, 'CrouchLookAroundBow'),
    climb: from(b, 'climbing_up_wall'),
    throw: from(c, 'Over_Shoulder_Throw'),
    ropeHang: from(d, 'Rope_Hang_Idle'),
    barHang: from(d, 'Bar_Hang_Idle'),
  };
  return shared;
}

// Fits a shared clip to another character: only rotations carry over (bone
// lengths differ between people), and hip height is scaled to their size.
// motion: 'inplace' (default) keeps the hips over the character's position;
// 'keep' keeps their sideways travel from the first frame (falls);
// 'loopUp' also removes a steady climb in height, so a climbing loop stays
// in place while the game moves the character up.
export function retarget(clip, targetRoot, motion = 'inplace') {
  const scale = hipsHeight(targetRoot) / (clip.userData?.hipsY ?? shared.hipsY);
  const tracks = [];
  for (const t of clip.tracks) {
    if (t.name.endsWith('.quaternion')) tracks.push(t.clone());
    else if (t.name === 'Hips.position') {
      const c = t.clone();
      const v = c.values;
      const x0 = v[0], z0 = v[2];
      const tm = c.times, n = v.length / 3, y0 = v[1], rise = v[v.length - 2] - y0;
      for (let i = 0; i < v.length; i += 3) {
        const k = i / 3;
        if (motion === 'keep') { v[i] = (v[i] - x0) * scale; v[i + 2] = (v[i + 2] - z0) * scale; } else { v[i] = 0; v[i + 2] = 0; }
        if (motion === 'loopUp') v[i + 1] -= rise * (tm[k] - tm[0]) / (tm[n - 1] - tm[0] || 1);
        v[i + 1] *= scale;
      }
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
