// Third-person player: a Meshy-rigged GLB driven by a Rapier character controller.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const CHARACTERS = [
  { name: 'Hunter', url: 'models/Hunter_mobile.glb' },
  { name: 'Forest Scout', url: 'models/Female_Hunter_Forest_Scout_mobile.glb' },
  { name: 'Female Soldier', url: 'models/Female_Soldier_Woodland_mobile.glb' },
];

const WALK_SPEED = 1.7;   // metres per second
const RUN_SPEED = 5.0;
const JUMP_SPEED = 5.5;
const GRAVITY = -18;
const CAPSULE_HALF = 0.55;
const CAPSULE_RADIUS = 0.35;
const FOOT_OFFSET = CAPSULE_HALF + CAPSULE_RADIUS; // body centre → feet

// Meshy clips may carry forward motion on the hips; the controller moves the
// character, so keep the animation in place (keep only the hips' height).
function makeInPlace(clip) {
  for (const track of clip.tracks) {
    if (track.name === 'Hips.position') {
      const v = track.values;
      const x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
  return clip;
}

export async function loadCharacters(onProgress) {
  const loader = new GLTFLoader();
  const results = [];
  for (let i = 0; i < CHARACTERS.length; i++) {
    let gltf;
    if (import.meta.env.VITE_MODELS_AS_TEXT) {
      // The shareable claude.ai build can't host .glb files, so models ship as base64 text.
      const text = await (await fetch(`${CHARACTERS[i].url}.b64.txt`)).text();
      const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
      gltf = await loader.parseAsync(bytes.buffer, '');
      onProgress((i + 1) / CHARACTERS.length);
    } else {
      gltf = await loader.loadAsync(CHARACTERS[i].url, (e) => {
        if (e.total) onProgress((i + e.loaded / e.total) / CHARACTERS.length);
      });
    }
    results.push({ ...CHARACTERS[i], gltf });
  }
  onProgress(1);
  return results;
}

export function createPlayer(scene, physics, spawn) {
  const body = physics.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + FOOT_OFFSET + 0.2, spawn.z)
  );
  const collider = physics.createCollider(RAPIER.ColliderDesc.capsule(CAPSULE_HALF, CAPSULE_RADIUS), body);
  const controller = physics.createCharacterController(0.02);
  controller.enableAutostep(0.45, 0.25, true);
  controller.enableSnapToGround(0.4);
  controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(50));
  controller.setApplyImpulsesToDynamicBodies(true);

  const root = new THREE.Group();
  scene.add(root);

  let model = null, mixer = null, actions = null;
  let vy = 0;
  let grounded = false;
  let speed = 0;
  let facing = Math.PI; // start facing -Z (towards the village house)

  function setCharacter(entry) {
    if (model) root.remove(model);
    model = cloneSkinned(entry.gltf.scene);
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    root.add(model);
    mixer = new THREE.AnimationMixer(model);
    const clips = entry.gltf.animations.map((c) => makeInPlace(c.clone()));
    const walk = clips.find((c) => c.name === 'Walk');
    const run = clips.find((c) => c.name === 'Run');
    // No idle clip exists yet; hold a single frame of the walk as a stand-in.
    const idle = THREE.AnimationUtils.subclip(walk, 'IdleHold', 0, 1, 30);
    actions = {
      idle: mixer.clipAction(idle),
      walk: mixer.clipAction(walk),
      run: mixer.clipAction(run),
    };
    for (const a of Object.values(actions)) { a.play(); a.setEffectiveWeight(0); }
    actions.idle.setEffectiveWeight(1);
  }

  const move = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  function update(dt, input, cameraYaw) {
    const s = input.state;
    const mag = Math.min(1, Math.hypot(s.moveX, s.moveY));
    // Movement is relative to where the camera is looking.
    forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    right.set(-forward.z, 0, forward.x);
    move.set(0, 0, 0).addScaledVector(forward, s.moveY).addScaledVector(right, s.moveX);
    if (move.lengthSq() > 0) move.normalize();

    const targetSpeed = mag < 0.05 ? 0 : (s.run ? RUN_SPEED : WALK_SPEED * Math.max(mag, 0.6));
    speed = THREE.MathUtils.damp(speed, targetSpeed, 10, dt);

    if (grounded) {
      vy = -1;
      if (input.consumeJump()) vy = JUMP_SPEED;
    } else {
      input.consumeJump();
      vy += GRAVITY * dt;
    }

    const desired = { x: move.x * speed * dt, y: vy * dt, z: move.z * speed * dt };
    controller.computeColliderMovement(collider, desired);
    const corrected = controller.computedMovement();
    grounded = controller.computedGrounded();
    const p = body.translation();
    const next = { x: p.x + corrected.x, y: p.y + corrected.y, z: p.z + corrected.z };
    if (next.y < -30) { next.x = 0; next.y = 5; next.z = 12; vy = 0; } // fell out of the world
    body.setNextKinematicTranslation(next);

    // Visuals follow the physics body.
    root.position.set(next.x, next.y - FOOT_OFFSET, next.z);
    if (mag > 0.05) {
      const targetFacing = Math.atan2(move.x, move.z);
      let diff = targetFacing - facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      facing += diff * Math.min(1, dt * 12);
    }
    root.rotation.y = facing;

    if (mixer) {
      const walkW = THREE.MathUtils.clamp(speed / WALK_SPEED, 0, 1) *
        (1 - THREE.MathUtils.clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1));
      const runW = THREE.MathUtils.clamp((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
      actions.idle.setEffectiveWeight(Math.max(0, 1 - walkW - runW));
      actions.walk.setEffectiveWeight(walkW);
      actions.run.setEffectiveWeight(runW);
      actions.walk.timeScale = Math.max(0.6, speed / WALK_SPEED);
      actions.run.timeScale = Math.max(0.7, speed / RUN_SPEED);
      mixer.update(dt);
    }
  }

  return {
    root,
    setCharacter,
    update,
    get position() { return root.position; },
  };
}
