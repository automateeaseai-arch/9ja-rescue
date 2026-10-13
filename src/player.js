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

  // Rifle (Meshy model from the owner's picture): in the right hand while
  // aiming, slung across the back otherwise. Placed in world space each frame.
  const RIFLE_SCALE = 0.45;                                  // about 85 cm long
  const GRIP = new THREE.Vector3(0.32, 0.22, 0).multiplyScalar(RIFLE_SCALE);
  const MUZZLE = new THREE.Vector3(-0.97, 0.43, 0);
  const RIFLE_SIZE = new THREE.Vector3(RIFLE_SCALE, RIFLE_SCALE, RIFLE_SCALE);
  let rifle = null;
  loadGlb('models/items/Rifle.glb').then((gltf) => {
    rifle = gltf.scene;
    rifle.scale.setScalar(RIFLE_SCALE);
    rifle.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    rifle.matrixAutoUpdate = false;
    scene.add(rifle);
  }).catch((err) => console.error(err));

  let model = null, mixer = null, actions = null;
  let vy = 0;
  let grounded = false;
  let speed = 0;
  let facing = Math.PI; // start facing -Z (towards the village house)
  let airborne = false;
  let aim = 0;
  const airVel = new THREE.Vector3();
  // Punch: a code-driven arm swing laid over whatever the legs are doing.
  const PUNCH_TIME = 0.45, PUNCH_STRIKE = 0.13;
  let punchT = -1;
  let bones = {};
  const state = { disabled: false, strike: false, aiming: false };

  function setCharacter(entry) {
    if (model) root.remove(model);
    model = cloneSkinned(entry.gltf.scene);
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    });
    root.add(model);
    bones = {};
    model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
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

  // Turns `bone` so that its child points along world direction `dir`, by weight w.
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
  function pointBone(bone, child, dir, w) {
    if (!bone || !child || w <= 0) return;
    bone.getWorldPosition(_a);
    child.getWorldPosition(_b);
    _b.sub(_a).normalize();
    _q.setFromUnitVectors(_b, dir);
    bone.getWorldQuaternion(_qw).premultiply(_q);
    bone.parent.getWorldQuaternion(_qp).invert();
    bone.quaternion.slerp(_qp.multiply(_qw), w);
    bone.updateMatrixWorld(true);
  }
  const punchDir = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  function punchPose(w) {
    if (w <= 0 || !bones.RightArm) return;
    model.updateMatrixWorld(true);
    // Turn the chest so the right shoulder leads, then drive the arm out straight.
    const sp = bones.Spine01;
    if (sp) {
      sp.getWorldQuaternion(_qw).premultiply(_q.setFromAxisAngle(yAxis, 0.45 * w));
      sp.parent.getWorldQuaternion(_qp).invert();
      sp.quaternion.copy(_qp.multiply(_qw));
      sp.updateMatrixWorld(true);
    }
    punchDir.set(Math.sin(facing), 0, Math.cos(facing));
    punchDir.y = 0.12;
    punchDir.normalize();
    pointBone(bones.RightArm, bones.RightForeArm, punchDir, w);
    pointBone(bones.RightForeArm, bones.RightHand, punchDir, w);
  }

  const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _p = new THREE.Vector3(), _basis = new THREE.Matrix4();
  // Orients the rifle so its barrel points along `dir` with its top towards `up`,
  // then moves it so local point `anchor` (scaled) sits at `at`.
  function placeRifle(dir, up, at, anchor) {
    _x.copy(dir).negate();                              // the model's muzzle is at local -X
    _y.copy(up).addScaledVector(_x, -_x.dot(up)).normalize();
    _z.crossVectors(_x, _y);
    _basis.makeBasis(_x, _y, _z);
    rifle.matrix.copy(_basis).scale(RIFLE_SIZE);
    _p.copy(anchor).applyMatrix4(_basis);
    rifle.matrix.setPosition(at.x - _p.x, at.y - _p.y, at.z - _p.z);
    rifle.matrixWorldNeedsUpdate = true;
  }
  const _dir = new THREE.Vector3(), _up = new THREE.Vector3(), _at = new THREE.Vector3(), _c = new THREE.Vector3(0, 0.3 * RIFLE_SCALE, 0);
  function updateRifle(pitch) {
    if (!rifle || !model) return;
    rifle.visible = root.visible;
    const fx = Math.sin(facing), fz = Math.cos(facing);
    if (aim > 0.5 && bones.RightHand) {
      _dir.set(fx * Math.cos(pitch), -Math.sin(pitch), fz * Math.cos(pitch));
      bones.RightHand.getWorldPosition(_at);
      placeRifle(_dir, _up.set(0, 1, 0), _at, GRIP);
    } else {
      // Across the back, barrel up over the left shoulder, sights facing out.
      const sp = bones.Spine02 ?? bones.Spine01;
      if (sp) sp.getWorldPosition(_at); else _at.copy(root.position).y += 1.3;
      _at.x -= fx * 0.3; // outside the backpack
      _at.z -= fz * 0.3;
      _dir.set(fz * 0.55, 0.85, -fx * 0.55).normalize();   // up and towards the left shoulder
      placeRifle(_dir, _up.set(-fx, 0, -fz), _at, _c);
    }
  }

  function update(dt, input, cameraYaw, cameraPitch = 0.2) {
    const s = input.state;
    const mag = state.disabled ? 0 : Math.min(1, Math.hypot(s.moveX, s.moveY));
    if (input.consumePunch?.() && punchT < 0 && !state.disabled) punchT = 0;
    if (punchT >= 0) {
      const before = punchT;
      punchT += dt;
      if (before < PUNCH_STRIKE && punchT >= PUNCH_STRIKE) state.strike = true;
      if (punchT > PUNCH_TIME) punchT = -1;
    }
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
      if (input.consumeJump() && !state.disabled) {
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
    // While aiming, the character turns to face where the camera looks.
    state.aiming = s.fire && !state.disabled;
    if (state.aiming || mag > 0.05) {
      const targetFacing = state.aiming ? Math.atan2(forward.x, forward.z) : Math.atan2(move.x, move.z);
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
      aim = THREE.MathUtils.damp(aim, state.aiming && punchT < 0 ? 1 : 0, 12, dt);
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
      if (punchT >= 0) {
        const t = punchT;
        punchPose(t < PUNCH_STRIKE ? t / PUNCH_STRIKE : t < 0.2 ? 1 : 1 - (t - 0.2) / (PUNCH_TIME - 0.2));
      }
      model.updateMatrixWorld(true);
      updateRifle(cameraPitch);
    }
  }

  const _m = new THREE.Vector3();

  return {
    root,
    setCharacter,
    teleport(x, y, z) { body.setTranslation({ x, y: y + FOOT_OFFSET + 0.1, z }, true); },
    update,
    get position() { return root.position; },
    get facing() { return facing; },
    get speed() { return speed; },
    get aimWeight() { return aim; },
    state,
    // Where shots leave from: the right hand, a little forward.
    muzzle(out = _m) {
      if (rifle && aim > 0.5) return out.copy(MUZZLE).applyMatrix4(rifle.matrix);
      if (bones.RightHand) bones.RightHand.getWorldPosition(out);
      else out.copy(root.position).y += 1.4;
      out.x += Math.sin(facing) * 0.35;
      out.z += Math.cos(facing) * 0.35;
      return out;
    },
  };
}
