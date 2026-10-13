// Air drop arrival: the player stands on the open rear ramp of a cargo plane
// (Meshy C-130-style model, which has a real cargo bay inside), jumps, falls
// freely for a few seconds, then opens a parachute or a hang glider and
// steers for about 30 seconds before landing.
//
// Controls in the air: left/right (stick, A/D) turn, forward goes faster and
// sinks faster, back slows down and floats longer. Jump (Space / Jump button)
// jumps out of the plane, and opens the parachute or glider early.
// The descent rate adapts to the height left so the landing comes about 30 s
// after the jump (sooner over high ground).
import * as THREE from 'three';
import { loadGlb } from './player.js';
import { treeAt } from './kit/crowns.js';

const PLANE_SCALE = 20;        // model length 1.48 → about 30 m, like a C-130
const FLOOR_Y = 0.95;          // cargo floor height inside the scaled model
const RAMP_Z = -6.9;           // where the player stands, just inside the open rear
const PLANE_SPEED = 32;        // m/s (slow for a real plane; the jump zone passes quickly enough)
const DROP_HEIGHT = 135;       // floor height above the highest ground under the flight path
const FLIGHT = 28;             // seconds of flight before the plane leaves the area
const AUTO_JUMP = 16;          // the player is pushed out after this long
const FLY_TIME = 30;           // jump to landing
const KINDS = {
  parachute: { url: 'models/items/Parachute.glb', scale: 3, free: 3.0, speed: 6, fast: 9, slow: 3, turn: 0.9, open: 1.0,
    pose: { clip: 'ropeHang', rate: 1 }, camDist: 9, camHeight: 2.8 },
  glider: { url: 'models/items/Hang_Glider.glb', scale: 5, free: 1.6, speed: 11, fast: 15, slow: 7, turn: 0.7, open: 0.6,
    pose: { clip: 'barHang', rate: 1 }, camDist: 9, camHeight: 2.2 },
};

// opts: scene, player, fx, heightAt(x, z, yHint) walking height, waterAt(x, z), hurt(damage)
export function createAirDrop({ scene, player, fx, heightAt, waterAt, hurt }) {
  const group = new THREE.Group();      // the plane: local +Z is the nose, floor at y = 0
  group.visible = false;
  scene.add(group);
  let planeReady = false;
  loadGlb('models/vehicles/Cargo_Plane.glb').then((gltf) => {
    const m = gltf.scene;
    m.scale.setScalar(PLANE_SCALE);
    m.rotation.y = Math.PI / 2;          // the model's nose is along its local -X
    m.position.y = -FLOOR_Y;
    m.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.material.side = THREE.FrontSide; } });
    group.add(m);
    planeReady = true;
  }).catch((err) => console.error(err));
  group.add(buildCargo());

  const gear = {};
  for (const [k, K] of Object.entries(KINDS)) {
    loadGlb(K.url).then((gltf) => {
      const o = gltf.scene.clone();
      o.scale.setScalar(K.scale);
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
      o.visible = false;
      scene.add(o);
      gear[k] = o;
    }).catch((err) => console.error(err));
  }

  const st = {
    phase: 'off',       // off, plane, fall, fly, landed
    kind: 'parachute',
    t: 0,               // seconds in this phase
    since: 0,           // seconds since the jump
    heading: 0,         // player's travel direction in the air
    planeHeading: 0,
    steer: 0, bank: 0, open: 0, speed: 0,
    camDist: 3.4, camHeight: 1.5,
    landed: null,
  };
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const planeVel = new THREE.Vector3();
  const prompt = document.getElementById('prompt');

  // Starts the drop: the plane flies along `heading` from (x, z).
  function start(kind, x, z, heading) {
    if (player.state.disabled) return;
    st.kind = kind;
    st.phase = 'plane';
    st.snagged = false;
    st.t = 0;
    st.planeHeading = heading;
    // Fly above the highest ground under the path.
    let top = 0;
    for (let d = 0; d <= PLANE_SPEED * FLIGHT; d += 20) top = Math.max(top, heightAt(x + Math.sin(heading) * d, z + Math.cos(heading) * d));
    group.position.set(x, top + DROP_HEIGHT, z);
    group.rotation.set(0, heading, 0);
    group.visible = true;
    planeVel.set(Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(PLANE_SPEED);
    for (const o of Object.values(gear)) o.visible = false;
  }

  function jump() {
    st.phase = 'fall';
    st.t = st.since = 0;
    st.open = 0;
    // Out of the ramp backwards with most of the plane's speed; the air slows you.
    vel.copy(planeVel).multiplyScalar(0.7);
    vel.addScaledVector(planeVel, -2.5 / PLANE_SPEED);
    vel.y = 1.5;
    st.heading = st.planeHeading + Math.PI;
    st.speed = 0;
  }

  function deploy() {
    st.phase = 'fly';
    st.t = 0;
    st.speed = Math.hypot(vel.x, vel.z);
    const g = gear[st.kind];
    if (g) g.visible = true;
  }

  // Points that can catch in a tree, in the flyer's frame (x across, y up, z forward):
  // the body, and the canopy or wing (centre and tips).
  const PROBES = {
    parachute: [[0, 0.3, 0], [0, 1.2, 0], [0, 5.0, 0.3], [-2.6, 4.2, 0.3], [2.6, 4.2, 0.3]],
    glider: [[0, 0.3, 0], [0, 1.2, 0], [0, 4.4, 0], [-4.3, 4.6, -0.3], [4.3, 4.6, -0.3]],
    fall: [[0, 0.3, 0], [0, 1.0, 0]],
  };
  const probe = new THREE.Vector3(), yawQ = new THREE.Quaternion(), Yax = new THREE.Vector3(0, 1, 0);
  function hitsTree(set) {
    yawQ.setFromAxisAngle(Yax, st.heading);
    for (const p of PROBES[set]) {
      probe.set(p[0], p[1], p[2]).applyQuaternion(yawQ).add(pos);
      if (treeAt(probe.x, probe.y, probe.z)) return true;
    }
    return false;
  }

  // Caught in a tree: the parachute or glider stays in the branches and the
  // player drops to the ground below.
  function snag() {
    st.phase = 'snag';
    st.t = 0;
    st.snagY = pos.y;
    vel.x *= 0.15; vel.z *= 0.15;
    vel.y = Math.min(vel.y, 0) * 0.3;
    fx?.punch();
  }

  function land(ground) {
    if (st.phase === 'snag') hurt?.(Math.round(Math.min(35, 5 + Math.max(0, st.snagY - ground) * 1.5)));
    const snagged = st.phase === 'snag';
    st.phase = 'landed';
    st.snagged = snagged;
    st.t = 0;
    const w = waterAt?.(pos.x, pos.z);
    player.leaveRide(pos.x, w && w.level > ground ? Math.max(ground, w.level - 1.2) : ground, pos.z);
    st.landed = { x: pos.x, z: pos.z, y: ground, heading: st.heading };
    // The glider comes down just behind the player.
    const g = gear.glider;
    if (st.kind === 'glider' && g && !snagged) g.position.set(pos.x - Math.sin(st.heading) * 1.2, ground, pos.z - Math.cos(st.heading) * 1.2);
  }

  const q = new THREE.Quaternion(), e = new THREE.Euler(), seat = new THREE.Vector3(), up = new THREE.Vector3();
  const hands = new THREE.Vector3();
  function placeGear(dt) {
    const K = KINDS[st.kind], g = gear[st.kind];
    // Opening: the canopy or wing unfolds over a moment.
    st.open = Math.min(1, st.open + dt / K.open);
    const k = 1 - Math.pow(1 - st.open, 3);
    if (st.kind === 'parachute') {
      // Hanging under the canopy: upright, swinging into turns.
      e.set(0, st.heading, st.bank * 0.8, 'YXZ');
      q.setFromEuler(e);
      if (g) {
        g.quaternion.copy(q);
        g.scale.set(K.scale * (0.3 + 0.7 * k), K.scale * (0.5 + 0.5 * k), K.scale);
        // The control bar (about 0.68 of the model's height) sits at the hands.
        up.set(0, 1, 0).applyQuaternion(q);
        g.position.copy(pos).addScaledVector(up, 2.05 - 0.68 * g.scale.y);
        seat.set(0, 0, 0.45).applyQuaternion(q);    // the pack hangs in front, so the player stays in view
        g.position.add(seat);
      }
      return q;
    }
    // Glider: lying forward, hands on the bar, wing above.
    e.set(1.15, st.heading, st.bank, 'YXZ');
    q.setFromEuler(e);
    if (g) {
      const wq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, st.heading, st.bank, 'YXZ'));
      g.quaternion.copy(wq);
      g.scale.set(K.scale * (0.2 + 0.8 * k), K.scale, K.scale);
      hands.set(0, 2.05, 0).applyQuaternion(q).add(pos);
      g.position.copy(hands).add(up.set(0, -0.15, 0));
    }
    return q;
  }

  const fwd = new THREE.Vector3();
  function update(dt, input) {
    if (st.phase === 'off') return;
    st.t += dt;
    const s = input.state;
    const jumpPressed = input.consumeJump?.();
    if (planeReady || st.phase !== 'plane') {
      // The plane flies on (and away, once the player has jumped).
      group.position.addScaledVector(planeVel, dt);
      group.rotation.z = Math.sin(st.t * 0.7) * 0.015;
      group.position.y += Math.sin(st.t * 0.9) * 0.01;
    }
    group.updateMatrixWorld();
    if (st.phase !== 'plane' && st.since > FLIGHT) group.visible = false;
    if (st.phase !== 'plane') st.since += dt;

    if (st.phase === 'plane') {
      // Standing at the open ramp, looking out of the back.
      pos.set(0, 0, RAMP_Z).applyMatrix4(group.matrixWorld);
      player.ride({ pos: pos.clone(), heading: st.planeHeading + Math.PI, show: true, pose: { clip: 'idle', rate: 1 }, quat: null });
      st.camDist = 2.7; st.camHeight = 1.7;
      if ((jumpPressed && st.t > 0.5) || st.t > AUTO_JUMP) jump();
      fx?.wind(0.35, 260);
      return;
    }
    if (st.phase === 'snag') {
      // Dropping out of the tree.
      vel.y = Math.max(-30, vel.y - 9.8 * dt);
      pos.addScaledVector(vel, dt);
      e.set(0, st.heading, 0, 'YXZ');
      player.ride({ pos: pos.clone(), heading: st.heading, show: true, quat: q.setFromEuler(e).clone(), pose: { clip: 'ropeHang', rate: 2 }, noRifle: true });
      st.camDist = 6; st.camHeight = 1.4;
      fx?.wind(0.1, 600);
      const ground = heightAt(pos.x, pos.z, pos.y);
      if (pos.y <= ground) land(ground);
      return;
    }
    if (st.phase === 'landed') {
      // The parachute or glider settles behind the player, tips over and is gone.
      const g = gear[st.kind], L = st.landed;
      if (g && !st.snagged) {
        // Settles to the ground and falls over backwards, then is gone.
        g.visible = st.t < 2.6;
        g.position.y = Math.max(L.y - 0.3, g.position.y - dt * 3);
        g.quaternion.setFromEuler(e.set(-Math.min(1.45, st.t * 1.1), L.heading, 0, 'YXZ'));
        g.scale.y = Math.max(0.35, g.scale.y - dt * 0.6);
      }
      if (st.t > 3) st.phase = 'off';
      fx?.wind(0, 400);
      return;
    }

    const K = KINDS[st.kind];
    const steerIn = THREE.MathUtils.clamp(s.moveX, -1, 1);
    const push = THREE.MathUtils.clamp(s.moveY, -1, 1);
    st.steer = THREE.MathUtils.damp(st.steer, steerIn, 4, dt);
    const ground = heightAt(pos.x, pos.z, pos.y);

    if (st.phase === 'fall') {
      // Freefall: the air slows the plane's speed; turning the body steers a little.
      vel.y = Math.max(-38, vel.y - 9.8 * dt);
      st.heading -= st.steer * 1.2 * dt;
      // Face the direction of the drift after the exit.
      fwd.set(Math.sin(st.heading), 0, Math.cos(st.heading));
      const drift = 3 + Math.max(0, push) * 3;
      vel.x = THREE.MathUtils.damp(vel.x, fwd.x * drift, 0.8, dt);
      vel.z = THREE.MathUtils.damp(vel.z, fwd.z * drift, 0.8, dt);
      pos.addScaledVector(vel, dt);
      st.bank = THREE.MathUtils.damp(st.bank, -st.steer * 0.5, 4, dt);
      // Belly down, arms and legs out (the swimming stroke, slowed).
      e.set(0.15, st.heading, st.bank, 'YXZ');
      q.setFromEuler(e);
      player.ride({ pos: pos.clone(), heading: st.heading, show: true, quat: q.clone(), pose: { clip: 'swimForward', rate: 0.35 }, noRifle: true });
      st.camDist = 6; st.camHeight = 0.6;
      fx?.wind(0.25 + Math.min(1, -vel.y / 30) * 0.6, 900 + Math.min(1, -vel.y / 30) * 1400);
      if ((jumpPressed && st.t > 0.4) || st.t > K.free) deploy();
      if (pos.y <= ground) land(ground);
      else if (hitsTree('fall')) snag();
      return;
    }

    // Flying under the canopy or wing.
    st.heading -= st.steer * K.turn * dt;
    st.bank = THREE.MathUtils.damp(st.bank, -st.steer * 0.35, 3, dt);
    const target = push > 0.1 ? THREE.MathUtils.lerp(K.speed, K.fast, push) : push < -0.1 ? THREE.MathUtils.lerp(K.speed, K.slow, -push) : K.speed;
    st.speed = THREE.MathUtils.damp(st.speed, target, 1.5, dt);
    fwd.set(Math.sin(st.heading), 0, Math.cos(st.heading));
    // Sink so the landing comes about 30 s after the jump; faster flying sinks faster.
    const left = Math.max(1, FLY_TIME - st.since);
    const h = Math.max(0, pos.y - ground);
    let sink = THREE.MathUtils.clamp(h / left, 1.2, 9) * (1 + Math.max(0, push) * 0.35 - Math.max(0, -push) * 0.25);
    // Opening shock: the fast fall is braked over the opening time.
    vel.y = THREE.MathUtils.damp(vel.y, -sink, 2.5, dt);
    vel.x = THREE.MathUtils.damp(vel.x, fwd.x * st.speed, 2, dt);
    vel.z = THREE.MathUtils.damp(vel.z, fwd.z * st.speed, 2, dt);
    pos.addScaledVector(vel, dt);
    const bodyQ = placeGear(dt);
    player.ride({ pos: pos.clone(), heading: st.heading, show: true, quat: bodyQ.clone(), pose: K.pose, noRifle: true });
    st.camDist = K.camDist; st.camHeight = K.camHeight;
    fx?.wind(0.12 + st.speed / 60, 500);
    if (pos.y <= ground + 0.02) land(ground);
    else if (st.open > 0.6 && hitsTree(st.kind)) snag();
  }

  // Code-built cargo details inside the Meshy bay: floor rails, red webbing
  // seats along the walls, strapped crates and a green jump light by the door.
  function buildCargo() {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#59605a', roughness: 0.6, metalness: 0.5 });
    const rail = new THREE.MeshStandardMaterial({ color: '#8b918c', roughness: 0.4, metalness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: '#8e2a22', roughness: 0.9 });
    const strap = new THREE.MeshStandardMaterial({ color: '#d6a52c', roughness: 0.8 });
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    // Floor panels with roller rails.
    box(3.0, 0.04, 17.5, metal, 0, 0.0, 2.2);
    for (const x of [-1.05, -0.35, 0.35, 1.05]) box(0.08, 0.06, 17.5, rail, x, 0.04, 2.2);
    for (let z = -6.4; z < 11; z += 1.2) box(3.0, 0.03, 0.05, rail, 0, 0.035, z);
    // Red webbing seats along both walls.
    for (const side of [-1, 1]) {
      box(0.45, 0.06, 9, red, side * 1.32, 0.45, 4);
      box(0.06, 0.6, 9, red, side * 1.55, 0.8, 4);
    }
    // Green light by the door: time to jump.
    const lamp = box(0.1, 0.08, 0.05, new THREE.MeshBasicMaterial({ color: '#4dff6a' }), 1.45, 2.1, -6.0);
    lamp.rotation.y = Math.PI / 2;
    // Crates strapped down between the seats.
    loadGlb('models/env/Crate_Wooden.glb').then((gltf) => {
      const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
      const sc = 0.95 / Math.max(size.x, size.z);
      [[-0.55, 3.4], [0.55, 3.4], [0, 5.2], [-0.5, 7.4], [0.5, 7.4]].forEach(([x, z], i) => {
        const c = gltf.scene.clone();
        c.scale.setScalar(sc);
        c.position.set(x, 0.05, z);
        c.rotation.y = i * 0.4;
        g.add(c);
        box(0.06, 0.02, 1.0, strap, x, size.y * sc + 0.07, z);
      });
    }).catch((err) => console.error(err));
    return g;
  }

  return {
    update,
    start,
    get active() { return st.phase !== 'off' && st.phase !== 'landed'; },
    get snagged() { return st.phase === 'snag' || (st.phase === 'landed' && st.snagged); },
    get phase() { return st.phase; },
    get kind() { return st.kind; },
    get heading() { return st.phase === 'plane' ? st.planeHeading + Math.PI : st.heading; },
    get camDist() { return st.camDist; },
    get camHeight() { return st.camHeight; },
    get timeLeft() { return Math.max(0, FLY_TIME - st.since); },
    get altitude() { return pos.y - heightAt(pos.x, pos.z, pos.y); },
    st,
    plane: group,
    gear,
    prompt,
  };
}
