// Third-person player: a Meshy-rigged GLB driven by a Rapier character controller.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadSharedAnims, retarget, upperBody, lowerBody } from './anims.js';

export const CHARACTERS = [
  { name: 'Hunter', url: 'models/Hunter_mobile.glb' },
  { name: 'Forest Scout', url: 'models/Female_Hunter_Forest_Scout_mobile.glb' },
  { name: 'Female Soldier', url: 'models/Female_Soldier_Woodland_mobile.glb' },
  { name: 'Male Soldier', url: 'models/Male_Soldier_Woodland_mobile.glb' },
];

const WALK_SPEED = 1.7;   // metres per second
const RUN_SPEED = 5.0;
const JUMP_SPEED = 7.0;      // ~1.35 m high
const JUMP_FORWARD_MIN = 3.5; // a jump always carries you forward at least this fast (m/s)
const JUMP_FORWARD_BOOST = 1.2;
const GRAVITY = -18;
const CAPSULE_HALF = 0.55;
const CAPSULE_RADIUS = 0.35;
const FOOT_OFFSET = CAPSULE_HALF + CAPSULE_RADIUS; // body centre → feet

// Meshy clips may carry forward motion on the hips; the controller moves the
// character, so keep the animation in place (keep only the hips' height).
export function makeInPlace(clip) {
  for (const track of clip.tracks) {
    if (track.name === 'Hips.position') {
      const v = track.values;
      const x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
  return clip;
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // models are meshopt-compressed

// Running total of bytes downloaded, shown on the loading screen.
export const downloadStats = { bytes: 0 };

// Fetch with one retry. A download is only abandoned if no data arrives for
// 30 s, so slow but steady phone connections are never cut off.
async function fetchWithRetry(url, as) {
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    let timer = setTimeout(() => ctrl.abort(), 30000);
    const stillAlive = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), 30000); };
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`${url} returned ${res.status}`);
      // Read in chunks so the loading screen can count bytes as they arrive.
      const reader = res.body.getReader();
      const chunks = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        stillAlive();
        chunks.push(value);
        downloadStats.bytes += value.length;
      }
      const blob = new Blob(chunks);
      return as === 'text' ? await blob.text() : await blob.arrayBuffer();
    } catch (err) {
      if (attempt >= 1) throw new Error(`Could not download ${url.split('/').pop()} (${err.message})`);
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function loadGlb(url) {
  let buffer;
  if (import.meta.env.VITE_MODELS_AS_TEXT) {
    // The shareable claude.ai build can't host .glb files, so models ship as base64 text.
    const bin = atob(await fetchWithRetry(`${url}.b64.txt`, 'text'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    buffer = bytes.buffer;
  } else {
    buffer = await fetchWithRetry(url, 'arrayBuffer');
  }
  return loader.parseAsync(buffer, '');
}

// Characters download only when first needed, keeping start-up small on phones.
const characterCache = new Map();
export function loadCharacter(index) {
  if (!characterCache.has(index)) {
    const entry = CHARACTERS[index];
    const p = loadGlb(entry.url).then((gltf) => ({ ...entry, gltf }));
    p.catch(() => characterCache.delete(index));
    characterCache.set(index, p);
  }
  return characterCache.get(index);
}

export async function createPlayer(scene, physics, spawn) {
  const sharedAnims = await loadSharedAnims();
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
  let airborne = false;
  let aim = 0;
  const airVel = new THREE.Vector3();

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
    const idle = retarget(sharedAnims.idle, model);
    const shoot = retarget(sharedAnims.shoot, model);
    // Full-body locomotion, plus legs-only copies used while the arms shoot.
    actions = {
      idle: mixer.clipAction(idle),
      walk: mixer.clipAction(walk),
      run: mixer.clipAction(run),
      idleLegs: mixer.clipAction(lowerBody(idle)),
      walkLegs: mixer.clipAction(lowerBody(walk)),
      runLegs: mixer.clipAction(lowerBody(run)),
      shoot: mixer.clipAction(upperBody(shoot)),
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
      airVel.set(0, 0, 0);
      if (input.consumeJump()) {
        vy = JUMP_SPEED;
        // Launch forward in the direction of travel, or the way the character faces.
        const dir = mag > 0.05 ? move.clone() : new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
        airVel.copy(dir).multiplyScalar(Math.max(speed * JUMP_FORWARD_BOOST, JUMP_FORWARD_MIN));
        airborne = true;
      }
    } else {
      input.consumeJump();
      vy += GRAVITY * dt;
    }

    // In the air, momentum carries the jump; the stick only steers a little.
    let vx = move.x * speed, vz = move.z * speed;
    if (airborne) {
      airVel.x += move.x * mag * 4 * dt;
      airVel.z += move.z * mag * 4 * dt;
      vx = airVel.x;
      vz = airVel.z;
    }
    const desired = { x: vx * dt, y: vy * dt, z: vz * dt };
    controller.computeColliderMovement(collider, desired);
    const corrected = controller.computedMovement();
    grounded = controller.computedGrounded();
    if (grounded && vy <= 0) airborne = false;
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
      const idleW = Math.max(0, 1 - walkW - runW);
      // Holding fire raises the rifle: the arms play the shooting clip while
      // the legs keep standing, walking or running.
      aim = THREE.MathUtils.damp(aim, input.state.fire ? 1 : 0, 12, dt);
      actions.idle.setEffectiveWeight(idleW * (1 - aim));
      actions.walk.setEffectiveWeight(walkW * (1 - aim));
      actions.run.setEffectiveWeight(runW * (1 - aim));
      actions.idleLegs.setEffectiveWeight(idleW * aim);
      actions.walkLegs.setEffectiveWeight(walkW * aim);
      actions.runLegs.setEffectiveWeight(runW * aim);
      actions.shoot.setEffectiveWeight(aim);
      for (const k of ['walk', 'walkLegs']) actions[k].timeScale = Math.max(0.6, speed / WALK_SPEED);
      for (const k of ['run', 'runLegs']) actions[k].timeScale = Math.max(0.7, speed / RUN_SPEED);
      mixer.update(dt);
    }
  }

  return {
    root,
    setCharacter,
    teleport(x, y, z) { body.setTranslation({ x, y: y + FOOT_OFFSET + 0.1, z }, true); },
    update,
    get position() { return root.position; },
  };
}
