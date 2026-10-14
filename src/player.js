// Third-person player: a Meshy-rigged GLB driven by a Rapier character controller.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadSharedAnims, retarget, upperBody, lowerBody, rotationsOnly } from './anims.js';
import { sound } from './sound.js';

export const CHARACTERS = [
  { name: 'Hunter', url: 'models/Hunter_mobile.glb' },
  { name: 'Forest Scout', url: 'models/Female_Hunter_Forest_Scout_mobile.glb' },
  { name: 'Female Soldier', url: 'models/Female_Soldier_Woodland_mobile.glb' },
  { name: 'Male Soldier', url: 'models/Male_Soldier_Woodland_mobile.glb' },
];

const WALK_SPEED = 1.7;   // metres per second
const RUN_SPEED = 5.0;
const JUMP_SPEED = 7.0;      // ~1.35 m high
// Meshy Regular_Jump clip times (s): take-off, tucked at the top, back to standing.
const JUMP_TAKEOFF = 0.42, JUMP_TUCK = 0.85, JUMP_END = 1.5;
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

const CROUCH_SPEED = 1.2;
const SWIM_SPEED = 1.1, SWIM_FAST = 2.0;
const SWIM_DEPTH = 1.25;     // feet below the water surface while swimming
const CLIMB_SPEED = 0.9;     // metres per second up a wall or rock
const CLIMB_HANDS = 1.2;     // feet this far below the top: the hands are over the edge and stop
const CLIMB_MIN = 1.0, CLIMB_MAX = 3.8; // ledge heights (above the feet) that can be climbed
const PUNCH_RATE = 1.6;      // jab clip playback speed
const PUNCH_STRIKE = 0.52;   // clip time (s) when the fist lands
const THROW_RATE = 1.8;      // throw clip playback speed
const THROW_START = 0.6;     // clip time the throw starts from (skips the slow wind-up)
const THROW_RELEASE = 1.83;  // clip time (s) when the grenade leaves the hand
const THROW_LEN = 2.45;      // clip time (s) when the throw is finished
const PUNCH_LEN = 1.15;      // clip time (s) when the jab is back in guard
// Melee attacks (Meshy clips): playback rate, clip time of the hit, clip time it ends.
// The slash (cutlass) and jab play on the arms; the kick uses the whole body.
const MELEE = {
  punch: { action: 'punch', rate: PUNCH_RATE, strike: PUNCH_STRIKE, len: PUNCH_LEN, full: false },
  slash: { action: 'slash', rate: 1.5, strike: 0.5, len: 1.2, full: false },
  kick: { action: 'kick', rate: 1.4, strike: 0.55, len: 1.2, full: true },
};

// opts.waterAt(x, z) → { level, ground } where there is water, else null.
// opts.canThrow() / opts.onThrow(): grenade cooldown, checked when a throw starts.
export async function createPlayer(scene, physics, spawn, opts = {}) {
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
  let stepDist = 0, airT = 0, strokeT = 0;
  let jumpAnim = -1, jumpW = 0;   // jump clip time (-1: not jumping) and blend weight   // footstep, landing and swim-stroke timing
  let aim = 0;
  const airVel = new THREE.Vector3();
  let punchT = -1;            // clip time of the melee attack in progress, or -1
  let melee = MELEE.punch;    // which attack that is
  let throwT = -1;            // clip time of the throw in progress, or -1
  let bones = {};
  // mode: 'ground', 'swim' or 'climb'
  // strike / release: set for one moment when a punch lands or a grenade leaves the hand.
  const state = { disabled: false, strike: false, release: false, aiming: false, crouch: false, mode: 'ground' };
  let crouchW = 0, swimMove = 0;
  const climb = { top: 0, dir: new THREE.Vector3(), over: 0, dist: 0, moved: 0 };

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
    const A = sharedAnims;
    const idle = retarget(A.idle, model);
    const crouchIdle = retarget(A.crouchIdle, model);
    const crouchWalk = retarget(A.crouchWalk, model);
    // Full-body clips, plus legs-only copies used while the arms aim or punch.
    actions = {
      idle: mixer.clipAction(idle),
      walk: mixer.clipAction(walk),
      run: mixer.clipAction(run),
      crouchIdle: mixer.clipAction(crouchIdle),
      crouchWalk: mixer.clipAction(crouchWalk),
      idleLegs: mixer.clipAction(lowerBody(idle)),
      walkLegs: mixer.clipAction(lowerBody(walk)),
      runLegs: mixer.clipAction(lowerBody(run)),
      crouchIdleLegs: mixer.clipAction(lowerBody(crouchIdle)),
      crouchWalkLegs: mixer.clipAction(lowerBody(crouchWalk)),
      shoot: mixer.clipAction(upperBody(retarget(A.shoot, model))),
      punch: mixer.clipAction(upperBody(retarget(A.punch, model))),
      throw: mixer.clipAction(upperBody(retarget(A.throw, model))),
      slash: mixer.clipAction(upperBody(retarget(A.slash, model))),
      kick: mixer.clipAction(retarget(A.kick, model)),
      swimIdle: mixer.clipAction(retarget(A.swimIdle, model)),
      swimForward: mixer.clipAction(retarget(A.swimForward, model)),
      climb: mixer.clipAction(retarget(A.climb, model, 'loopUp')),
      ropeHang: mixer.clipAction(retarget(A.ropeHang, model)),
      barHang: mixer.clipAction(retarget(A.barHang, model)),
      // Jump: rotations only (the physics does the rising), from the take-off frame.
      jump: mixer.clipAction(rotationsOnly(retarget(A.jump, model))),
      sitRide: mixer.clipAction(retarget(A.sitRide, model)),
    };
    for (const a of Object.values(actions)) { a.play(); a.setEffectiveWeight(0); }
    for (const a of [actions.punch, actions.throw, actions.slash, actions.kick, actions.jump]) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
    actions.idle.setEffectiveWeight(1);
  }

  const move = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  // Is there a wall or rock ahead with a ledge on top that can be climbed?
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const cast = (o, d, len) => {
    ray.origin = o;
    ray.dir = d;
    const hit = physics.castRay(ray, len, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
    return hit ? hit.timeOfImpact : null;
  };
  // Returns { top, over }: the ledge height and how far to move forward once
  // up. A thick top (rock, roof) is stood on; a thin wall is climbed over and
  // the player drops down the far side.
  function findLedge(p, dir) {
    const feet = p.y - FOOT_OFFSET;
    const d = { x: dir.x, y: 0, z: dir.z };
    const low = cast({ x: p.x, y: feet + 0.7, z: p.z }, d, 1.0);
    const high = cast({ x: p.x, y: feet + 1.3, z: p.z }, d, 1.0);
    if (low == null || high == null) return null;           // nothing tall in front
    const wall = Math.min(low, high);
    const topAt = (dist) => {
      const x = p.x + dir.x * dist, z = p.z + dir.z * dist;
      const down = cast({ x, y: feet + CLIMB_MAX + 0.3, z }, { x: 0, y: -1, z: 0 }, CLIMB_MAX + 1.5);
      return down == null ? -Infinity : feet + CLIMB_MAX + 0.3 - down;
    };
    const top = topAt(wall + 0.12);
    if (top - feet < CLIMB_MIN || top - feet > CLIMB_MAX) return null;
    // Head room above the top.
    if (cast({ x: p.x + dir.x * (wall + 0.12), y: top + 0.05, z: p.z + dir.z * (wall + 0.12) }, { x: 0, y: 1, z: 0 }, 1.0) != null) return null;
    // Walk the top until it ends or there is room to stand.
    for (let k = 0.3; k <= 1.5; k += 0.2) {
      const h = topAt(wall + k);
      if (h < top - 0.6) return { top, over: wall + k + 0.35 };   // thin wall: over and down
      if (k >= 0.7) return { top, over: wall + 0.6 };              // wide enough to stand on
    }
    return { top, over: wall + 0.6 };
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
  // Cutlass (Meshy model): in the right hand while it is the chosen weapon.
  // Model: blade along local -X, edge down, handle at +X.
  let cutlass = null;
  const CUT_SCALE = 0.36;                                   // about 68 cm
  const cutRot = new THREE.Euler(0, Math.PI / 2, 0);   // blade forward from the fist
  const CUT_GRIP = new THREE.Vector3(0.62, 0.12, 0);       // handle centre (model units)
  loadGlb('models/items/Cutlass.glb').then((gltf) => {
    cutlass = gltf.scene;
    cutlass.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    cutlass.matrixAutoUpdate = false;
    cutlass.visible = false;
    scene.add(cutlass);
  }).catch((err) => console.error(err));
  const _hq = new THREE.Quaternion(), _hp = new THREE.Vector3(), _cq = new THREE.Quaternion(), _cs = new THREE.Vector3(), _g = new THREE.Vector3();
  function updateCutlass() {
    if (!cutlass) return;
    cutlass.visible = root.visible && state.weapon === 'cutlass' && !!bones.RightHand && state.mode !== 'swim';
    if (!cutlass.visible) return;
    bones.RightHand.updateWorldMatrix(true, false);
    bones.RightHand.matrixWorld.decompose(_hp, _hq, _cs);
    _cq.copy(_hq).multiply(new THREE.Quaternion().setFromEuler(cutRot));
    _g.copy(CUT_GRIP).multiplyScalar(CUT_SCALE).applyQuaternion(_cq);
    cutlass.matrix.compose(_hp.sub(_g), _cq, _cs.setScalar(CUT_SCALE));
    cutlass.matrixWorldNeedsUpdate = true;
  }

  function updateRifle(pitch) {
    updateCutlass();
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

  // Riding a vehicle (or hanging from a parachute or glider): the vehicles or
  // air-drop module places the player each step. seat.pose picks the clip:
  // { clip, time } holds one frame, { clip, rate } plays it.
  let ride = null;
  const RIDE_POSE = { clip: 'sitRide', rate: 1 }; // seated, hands forward on the bars
  function updateRide(dt, input, cameraPitch) {
    for (const f of ['consumeJump', 'consumePunch', 'consumeKick', 'consumeThrow', 'consumeCrouch']) input[f]?.();
    state.aiming = false;
    state.crouch = false;
    speed = 0;
    body.setNextKinematicTranslation({ x: ride.pos.x, y: ride.pos.y + FOOT_OFFSET, z: ride.pos.z });
    root.position.copy(ride.pos);
    facing = ride.heading;
    root.visible = ride.show;
    if (ride.quat) root.quaternion.copy(ride.quat); else root.rotation.set(0, facing, 0);
    if (!mixer) return;
    for (const k of ALL) actions[k].setEffectiveWeight(0);
    const pose = ride.pose ?? RIDE_POSE;
    const a = actions[pose.clip];
    a.setEffectiveWeight(1);
    if (pose.time != null) { a.time = pose.time; a.timeScale = 0; } else a.timeScale = pose.rate ?? 1;
    mixer.update(dt);
    model.position.y = 0;
    model.updateMatrixWorld(true);
    updateRifle(cameraPitch);
    if (rifle && ride.noRifle) rifle.visible = false; // stowed in the air
  }

  function update(dt, input, cameraYaw, cameraPitch = 0.2) {
    if (state.mode === 'drive') { updateRide(dt, input, cameraPitch); return; }
    const s = input.state;
    const mag = state.disabled ? 0 : Math.min(1, Math.hypot(s.moveX, s.moveY));
    const p = body.translation();
    const feet = p.y - FOOT_OFFSET;

    // Movement is relative to where the camera is looking.
    forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    right.set(-forward.z, 0, forward.x);
    move.set(0, 0, 0).addScaledVector(forward, s.moveY).addScaledVector(right, s.moveX);
    if (move.lengthSq() > 0) move.normalize();

    // Water: swim where it is too deep to wade.
    const water = opts.waterAt?.(p.x, p.z);
    const depth = water ? water.level - water.ground : 0;
    if (state.mode === 'ground' && depth > 1.3 && feet < water.level - 0.9) {
      state.mode = 'swim';
      controller.disableSnapToGround();
    } else if (state.mode === 'swim' && depth < 1.1) {
      state.mode = 'ground';
      controller.enableSnapToGround(0.4);
    }

    const crouchPressed = input.consumeCrouch?.();
    if (crouchPressed && state.mode === 'ground' && !state.disabled) state.crouch = !state.crouch;
    if (state.mode !== 'ground') state.crouch = false;   // crouched players can move (and push the stick fully) and stay crouched
    // Melee: Fire with the cutlass slashes; punch and kick otherwise.
    state.weapon = s.weapon ?? 'gun';
    const punchIn = input.consumePunch?.(), kickIn = input.consumeKick?.();
    if ((punchIn || kickIn) && punchT < 0 && throwT < 0 && !state.disabled && state.mode === 'ground') {
      melee = kickIn ? MELEE.kick : state.weapon === 'cutlass' ? MELEE.slash : MELEE.punch;
      punchT = 0;
      actions?.[melee.action].reset().play();
    }
    if (input.consumeThrow?.() && throwT < 0 && punchT < 0 && !state.disabled && state.mode === 'ground' && opts.canThrow?.() !== false) {
      opts.onThrow?.();
      throwT = THROW_START;
      if (actions) { actions.throw.reset().play(); actions.throw.time = THROW_START; }
    }
    if (throwT >= 0) {
      const before = throwT;
      throwT += dt * THROW_RATE;
      if (before < THROW_RELEASE && throwT >= THROW_RELEASE) state.release = true;
      if (throwT > THROW_LEN) throwT = -1;
    }
    if (punchT >= 0) {
      const before = punchT;
      punchT += dt * melee.rate;
      if (before < melee.strike && punchT >= melee.strike) state.strike = melee.action;
      if (punchT > melee.len) punchT = -1;
    }

    let targetSpeed = mag < 0.05 ? 0 : (s.run ? RUN_SPEED : WALK_SPEED * Math.max(mag, 0.6));
    if (state.crouch && targetSpeed > 0) targetSpeed = CROUCH_SPEED * Math.max(mag, 0.6);
    if (state.mode === 'swim' && targetSpeed > 0) targetSpeed = s.run ? SWIM_FAST : SWIM_SPEED;
    speed = THREE.MathUtils.damp(speed, targetSpeed, 10, dt);

    const next = { x: p.x, y: p.y, z: p.z };
    const jump = input.consumeJump() && !state.disabled;
    if (state.mode === 'climb') {
      // Up the wall, then step over onto the top.
      if (climb.over === 0) {
        next.y = Math.min(climb.top + FOOT_OFFSET + 0.05, p.y + CLIMB_SPEED * dt);
        climb.below = climb.top - (next.y - FOOT_OFFSET);   // how far the feet are below the top
        if (next.y >= climb.top + FOOT_OFFSET + 0.05) climb.over = 0.001;
      } else {
        climb.over += dt;
        const step = Math.min(1.6 * dt, climb.dist - climb.moved);
        climb.moved += step;
        next.x += climb.dir.x * step;
        next.z += climb.dir.z * step;
        if (climb.moved >= climb.dist - 1e-3) { state.mode = 'ground'; vy = -1; grounded = false; }
      }
    } else if (state.mode === 'swim') {
      // Float with the head above the surface.
      vy = THREE.MathUtils.clamp((water.level - SWIM_DEPTH - feet) * 4, -2, 2);
      controller.computeColliderMovement(collider, { x: move.x * speed * dt, y: vy * dt, z: move.z * speed * dt });
      const c = controller.computedMovement();
      next.x += c.x; next.y += c.y; next.z += c.z;
      grounded = false;
      airborne = false;
    } else {
      if (grounded) {
        vy = -1;
        airVel.set(0, 0, 0);
        if (jump) {
          const dir = mag > 0.05 ? move.clone() : new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
          const ledge = findLedge(p, dir);
          if (ledge) {
            // Too high to jump: climb it.
            state.mode = 'climb';
            state.crouch = false;
            climb.top = ledge.top;
            climb.dir.copy(dir);
            climb.over = 0;
            climb.below = ledge.top - (p.y - FOOT_OFFSET);
            climb.dist = ledge.over;
            climb.moved = 0;
            facing = Math.atan2(dir.x, dir.z);
            speed = 0;
          } else {
            vy = JUMP_SPEED;
            jumpAnim = JUMP_TAKEOFF;
            state.crouch = false;
            actions?.jump.reset().play();
            if (actions) actions.jump.time = JUMP_TAKEOFF;
            // Launch forward in the direction of travel, or the way the character faces.
            airVel.copy(dir).multiplyScalar(Math.max(speed * JUMP_FORWARD_BOOST, JUMP_FORWARD_MIN));
            airborne = true;
          }
        }
      } else {
        vy += GRAVITY * dt;
      }
      if (state.mode === 'ground') {
        // In the air, momentum carries the jump; the stick only steers a little.
        let vx = move.x * speed, vz = move.z * speed;
        if (airborne) {
          airVel.x += move.x * mag * 4 * dt;
          airVel.z += move.z * mag * 4 * dt;
          vx = airVel.x;
          vz = airVel.z;
        }
        controller.computeColliderMovement(collider, { x: vx * dt, y: vy * dt, z: vz * dt });
        const c = controller.computedMovement();
        grounded = controller.computedGrounded();
        if (grounded && vy <= 0) airborne = false;
        next.x += c.x; next.y += c.y; next.z += c.z;
      }
    }
    // Footsteps: one per stride on the ground (a splash where it's wet),
    // strokes while swimming, and a thud on landing after a jump or a drop.
    if (state.mode === 'ground') {
      if (grounded && !airborne) {
        stepDist += Math.hypot(next.x - p.x, next.z - p.z);
        const stride = speed > 3 ? 1.4 : state.crouch ? 0.55 : 0.8;
        if (stepDist > stride) {
          stepDist = 0;
          if (depth > 0.12 && feet < water.level) opts.paddle?.(Math.min(0.45, 0.15 + depth * 0.35));
          else sound.step(state.crouch ? 0.2 : speed > 3 ? 0.85 : 0.55, speed > 3 ? 1.06 : 1);
        }
      }
      if (!grounded) airT += dt;
      else {
        if (airT > 0.35) sound.play('land', { volume: Math.min(1, 0.35 + airT * 0.5) });
        airT = 0;
      }
    } else {
      airT = 0;
      if (state.mode === 'swim' && speed > 0.3 && (strokeT -= dt) <= 0) { strokeT = 1.1; opts.paddle?.(0.22); }
    }
    if (next.y < -30) { next.x = 0; next.y = 5; next.z = 12; vy = 0; } // fell out of the world
    body.setNextKinematicTranslation(next);

    // Visuals follow the physics body.
    root.position.set(next.x, next.y - FOOT_OFFSET, next.z);
    // While aiming, the character turns to face where the camera looks.
    state.aiming = (s.fire || s.aim || state.holdAim) && (s.weapon ?? 'gun') === 'gun' && !state.disabled && state.mode === 'ground';
    if (state.mode !== 'climb' && (state.aiming || mag > 0.05)) {
      const targetFacing = state.aiming ? Math.atan2(forward.x, forward.z) : Math.atan2(move.x, move.z);
      let diff = targetFacing - facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      facing += diff * Math.min(1, dt * (state.mode === 'swim' ? 5 : 12));
    }
    root.rotation.y = facing;

    if (mixer) animate(dt);
    if (mixer) {
      model.updateMatrixWorld(true);
      updateRifle(cameraPitch);
    }
  }

  const ALL = ['idle', 'walk', 'run', 'crouchIdle', 'crouchWalk', 'idleLegs', 'walkLegs', 'runLegs', 'crouchIdleLegs',
    'crouchWalkLegs', 'shoot', 'punch', 'throw', 'swimIdle', 'swimForward', 'climb', 'ropeHang', 'barHang', 'slash', 'kick', 'jump', 'sitRide'];
  const W = {};
  function animate(dt) {
    for (const k of ALL) W[k] = 0;
    const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);
    crouchW = THREE.MathUtils.damp(crouchW, state.crouch ? 1 : 0, 10, dt);
    aim = THREE.MathUtils.damp(aim, state.aiming && punchT < 0 && throwT < 0 ? 1 : 0, 12, dt);
    swimMove = THREE.MathUtils.damp(swimMove, state.mode === 'swim' && speed > 0.3 ? 1 : 0, 4, dt);
    // Swimming forward lies flat: lift the body to the surface.
    model.position.y = state.mode === 'swim' ? swimMove * 0.7 : 0;
    if (state.mode === 'climb') {
      // Hand over hand while the chest is below the top; once the upper body
      // is above it (feet within 1.2 m of the top) the hands stop reaching and
      // stay planted while the body rises, then blend into a crouched step
      // over the edge (owner, 14 Oct).
      const up = climb.over ? 1 : clamp01((CLIMB_HANDS - climb.below) / CLIMB_HANDS);
      const handsOver = climb.over || climb.below < CLIMB_HANDS;
      actions.climb.timeScale = handsOver ? 0 : CLIMB_SPEED / 0.47;
      const step = climb.over ? Math.min(1, 0.4 + climb.over / 0.35) : up * 0.4;
      W.climb = 1 - step;
      W.crouchWalk = step;
    } else if (state.mode === 'swim') {
      W.swimIdle = 1 - swimMove;
      W.swimForward = swimMove;
      actions.swimForward.timeScale = Math.max(0.8, speed / 0.55);
    } else {
      const runW = clamp01((speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED));
      const walkW = clamp01(speed / (state.crouch ? CROUCH_SPEED : WALK_SPEED)) * (1 - runW);
      const idleW = Math.max(0, 1 - walkW - runW);
      // Melee: the clip fades in and out (the jab and slash on the arms, the kick on the whole body).
      const meleeW = punchT < 0 ? 0 : Math.min(1, punchT / 0.15, (melee.len - punchT) / 0.3);
      const punchW = melee.full ? 0 : meleeW, kickW = melee.full ? meleeW : 0;
      const throwW = throwT < 0 ? 0 : Math.min(1, (throwT - THROW_START) / 0.2, (THROW_LEN - throwT) / 0.4);
      const upper = Math.min(1, aim + punchW + throwW); // arms busy: the legs carry on alone
      const body = { idle: idleW * (1 - crouchW), walk: walkW * (1 - crouchW), run: runW * (1 - crouchW),
        crouchIdle: idleW * crouchW, crouchWalk: (walkW + runW) * crouchW };
      for (const [k, w] of Object.entries(body)) {
        W[k] = w * (1 - upper) * (1 - kickW);
        W[k + 'Legs'] = w * upper * (1 - kickW);
      }
      // Jumping: the jump clip plays over the legs and body (arms keep aiming).
      if (jumpAnim >= 0) {
        jumpAnim += dt;
        // Hold the tuck while still in the air; after landing, finish the clip.
        if (!grounded && jumpAnim > JUMP_TUCK) { jumpAnim = JUMP_TUCK; actions.jump.time = JUMP_TUCK; }
        if (jumpAnim > JUMP_END) jumpAnim = -1;
      }
      jumpW = THREE.MathUtils.damp(jumpW, jumpAnim >= 0 && state.mode === 'ground' ? 1 : 0, 14, dt);
      if (jumpW > 0.001) {
        for (const k of Object.keys(body)) { W[k] *= 1 - jumpW; W[k + 'Legs'] *= 1 - jumpW; }
        W.jump = jumpW * (1 - kickW);
      }
      W.shoot = aim * (1 - punchW) * (1 - throwW) * (1 - kickW);
      W.punch = melee.action === 'punch' ? punchW : 0;
      W.slash = melee.action === 'slash' ? punchW : 0;
      W.kick = kickW;
      actions.slash.timeScale = MELEE.slash.rate;
      actions.kick.timeScale = MELEE.kick.rate;
      W.throw = throwW;
      actions.throw.timeScale = THROW_RATE;
      actions.walk.timeScale = actions.walkLegs.timeScale = Math.max(0.6, speed / WALK_SPEED);
      actions.run.timeScale = actions.runLegs.timeScale = Math.max(0.7, speed / RUN_SPEED);
      actions.crouchWalk.timeScale = actions.crouchWalkLegs.timeScale = Math.max(0.6, speed / 1.3);
      actions.punch.timeScale = PUNCH_RATE;
    }
    for (const k of ALL) actions[k].setEffectiveWeight(W[k]);
    mixer.update(dt);
  }

  const _m = new THREE.Vector3();

  return {
    root,
    setCharacter,
    // Everything that draws the player (body, rifle, cutlass), e.g. to hide them from a close camera.
    get parts() { return [root, rifle, cutlass].filter(Boolean); },
    get model() { return model; },
    // Called by the vehicles module every step while driving.
    ride(seat) {
      if (state.mode !== 'drive') {
        state.mode = 'drive';
        collider.setEnabled(false);
        punchT = throwT = -1;
      }
      ride = seat;
    },
    leaveRide(x, y, z) {
      ride = null;
      collider.setEnabled(true);
      root.visible = true;
      root.rotation.set(0, facing, 0);
      this.teleport(x, y, z);
    },
    cutRot,
    setFacing(y) { facing = y; root.rotation.set(0, y, 0); },
    teleport(x, y, z) {
      body.setTranslation({ x, y: y + FOOT_OFFSET + 0.1, z }, true);
      state.mode = 'ground';
      controller.enableSnapToGround(0.4);
    },
    update,
    get position() { return root.position; },
    get crouching() { return state.crouch; },
    get throwing() { return throwT >= 0; },
    get released() { return throwT >= THROW_RELEASE; },
    hand(out = new THREE.Vector3()) { return bones.RightHand ? bones.RightHand.getWorldPosition(out) : out.copy(root.position).setY(root.position.y + 1.6); },
    findLedge: (dir) => findLedge(body.translation(), dir),
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
