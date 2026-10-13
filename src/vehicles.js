// Drivable pickup truck and motorbike (Meshy models from the owner's pictures).
//
// Walk up to one and press V (phone: Drive) to get in or on; press again to
// get out. The left stick or W/S is throttle and brake/reverse, A/D or the
// stick's sideways push steers, Shift is a boost. Driving is arcade-style:
// each vehicle's box collider is moved by a character controller, so it
// climbs gentle slopes, slides along walls and rocks and won't drive into
// deep water. The body tilts with the ground; the bike leans into turns.
// The truck hides its driver in the cab; the rider sits on the bike.
// Driving into a guard at speed knocks them down.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGlb } from './player.js';

const TYPES = {
  truck: {
    url: 'models/vehicles/Pickup_Truck.glb', scale: 2.8, maxSpeed: 16, boost: 21, reverse: 5, accel: 6, brake: 12,
    turn: 0.75, wheelBase: 3.2, camDist: 8, camHeight: 2.4, seat: null, solidWidth: 0.95,
  },
  bike: {
    url: 'models/vehicles/Motorbike.glb', scale: 1.15, maxSpeed: 19, boost: 25, reverse: 3, accel: 8, brake: 14,
    turn: 1.1, wheelBase: 1.45, camDist: 5, camHeight: 1.9, seat: { back: 0.1, up: 0.45 }, solidWidth: 0.45,
  },
};
const ENTER_RANGE = 3.2;
const HIT_SPEED = 5;       // m/s; faster than this, a guard in the way is knocked down

// opts: scene, physics, player, hostiles, heightAt, waterAt, spots { truck: [x, z, heading], bike: [...] }
// heading: direction the front faces, as an angle where 0 = +z (south) and π = -z (north).
export function createVehicles({ scene, physics, player, hostiles, heightAt, waterAt, spots }) {
  const list = [];
  const controller = physics.createCharacterController(0.05);
  controller.enableAutostep(0.35, 0.3, false);
  controller.enableSnapToGround(0.6);
  controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(38));
  controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(45));

  for (const [kind, spot] of Object.entries(spots)) {
    const T = TYPES[kind];
    loadGlb(T.url).then((gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(T.scale);
      model.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      // Box collider: length along the heading, width across.
      const half = { len: size.x / 2, w: (size.z / 2) * T.solidWidth, h: size.y / 2 };
      const [x, z, heading] = spot;
      const y = heightAt(x, z) + half.h + 0.08;
      const body = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
      const collider = physics.createCollider(RAPIER.ColliderDesc.cuboid(half.w, half.h * 0.9, half.len), body);
      const v = {
        kind, T, model, body, collider, half, heading, speed: 0, vy: 0, steer: 0, lean: 0,
        pitch: 0, roll: 0, pos: new THREE.Vector3(x, y, z), hits: 0,
      };
      place(v);
      scene.add(model);
      list.push(v);
    }).catch((err) => console.error(err));
  }

  const q = new THREE.Quaternion(), qy = new THREE.Quaternion(), e = new THREE.Euler();
  const Y = new THREE.Vector3(0, 1, 0);
  // Model and collider follow the vehicle's position, heading and tilt.
  function place(v) {
    const { model, half } = v;
    e.set(v.pitch, v.heading, v.roll, 'YXZ');
    q.setFromEuler(e);
    v.body.setNextKinematicRotation(q);
    // The model's front is along its local -X: turn it to face the heading.
    model.quaternion.copy(q).multiply(qy.setFromAxisAngle(Y, Math.PI / 2));
    model.position.copy(v.pos).addScaledVector(Y.clone().applyQuaternion(q), -half.h - 0.04);
  }

  const st = { driving: null, near: null };
  const fwd = new THREE.Vector3();

  function groundAt(x, z, y) {
    return heightAt(x, z, y + 1.5);
  }

  function drive(v, dt, s) {
    const T = v.T;
    const throttle = THREE.MathUtils.clamp(s.moveY, -1, 1);
    const steerIn = THREE.MathUtils.clamp(s.moveX, -1, 1);
    const top = s.run ? T.boost : T.maxSpeed;
    // Throttle forward, brake then reverse backwards, coast to a stop otherwise.
    if (throttle > 0.05) v.speed = v.speed < 0 ? Math.min(0, v.speed + T.brake * dt) : Math.min(top * throttle, v.speed + T.accel * dt);
    else if (throttle < -0.05) v.speed = v.speed > 0 ? Math.max(0, v.speed - T.brake * dt) : Math.max(-T.reverse, v.speed - T.accel * 0.6 * dt);
    else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 3 * dt);
    if (v.speed > top) v.speed = Math.max(top, v.speed - T.brake * dt);
    v.steer = THREE.MathUtils.damp(v.steer, steerIn, 6, dt);
    // Turning rate grows with speed (like real steering geometry), capped.
    const turnRate = (v.speed / T.wheelBase) * v.steer * T.turn;
    v.heading -= THREE.MathUtils.clamp(turnRate, -1.6, 1.6) * dt;
    fwd.set(Math.sin(v.heading), 0, Math.cos(v.heading));
  }

  function move(v, dt) {
    const p = v.body.translation();
    let dx = fwd.x * v.speed * dt, dz = fwd.z * v.speed * dt;
    // Deep water ahead: stop at the edge.
    const nose = v.half.len * Math.sign(v.speed || 1);
    const w = waterAt?.(p.x + fwd.x * nose + dx, p.z + fwd.z * nose + dz);
    if (w && w.level - w.ground > 0.9) { v.speed = 0; dx = dz = 0; }
    // Guards in the way go down if hit at speed.
    if (Math.abs(v.speed) > HIT_SPEED) {
      for (const u of hostiles.units) {
        if (u.state === 'down') continue;
        const ux = u.model.position.x - p.x, uz = u.model.position.z - p.z;
        const along = ux * fwd.x + uz * fwd.z, side = Math.abs(ux * fwd.z - uz * fwd.x);
        if (Math.abs(along) < v.half.len + 0.8 && side < v.half.w + 0.5 && along * v.speed > 0) {
          hostiles.knockOut(u, v.pos, player.position);
          v.hits++;
        }
      }
    }
    v.vy = Math.max(-25, v.vy - 18 * dt);
    controller.computeColliderMovement(v.collider, { x: dx, y: v.vy * dt, z: dz }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = controller.computedMovement();
    if (controller.computedGrounded()) v.vy = -1;
    // Blocked by something solid: lose most of the speed.
    const want = Math.hypot(dx, dz), got = Math.hypot(m.x, m.z);
    if (want > 0.02 && got < want * 0.4) v.speed *= 0.5;
    v.pos.set(p.x + m.x, p.y + m.y, p.z + m.z);
    // Safety net: never sink through the ground.
    const g = groundAt(v.pos.x, v.pos.z, v.pos.y - v.half.h);
    if (v.pos.y - v.half.h < g - 1) { v.pos.y = g + v.half.h + 0.1; v.vy = 0; }
    v.body.setNextKinematicTranslation(v.pos);
  }

  // Tilt to the ground under the wheels; the bike also leans into turns.
  function tilt(v, dt) {
    const L = v.half.len * 0.8, W = Math.max(0.3, v.half.w * 0.8), y = v.pos.y - v.half.h;
    const sx = Math.cos(v.heading), sz = -Math.sin(v.heading);
    const f = groundAt(v.pos.x + fwd.x * L, v.pos.z + fwd.z * L, y);
    const b = groundAt(v.pos.x - fwd.x * L, v.pos.z - fwd.z * L, y);
    const l = groundAt(v.pos.x + sx * W, v.pos.z + sz * W, y);
    const r = groundAt(v.pos.x - sx * W, v.pos.z - sz * W, y);
    v.pitch = THREE.MathUtils.damp(v.pitch, -Math.atan2(f - b, 2 * L), 8, dt);
    let roll = Math.atan2(l - r, 2 * W);
    if (v.kind === 'bike') {
      v.lean = THREE.MathUtils.damp(v.lean, -v.steer * THREE.MathUtils.clamp(Math.abs(v.speed) / 12, 0, 1) * 0.45, 5, dt);
      roll = v.speed === 0 && st.driving !== v ? 0.12 : v.lean; // on its stand when parked
    }
    v.roll = THREE.MathUtils.damp(v.roll, roll, 8, dt);
  }

  const seat = new THREE.Vector3(), rq = new THREE.Quaternion();
  function seatPlayer(v) {
    const S = v.T.seat;
    if (!S) {
      seat.copy(v.pos);
      seat.y -= v.half.h;
      player.ride({ pos: seat, heading: v.heading, show: false });
      return;
    }
    e.set(v.pitch, v.heading, v.roll, 'YXZ');
    q.setFromEuler(e);
    seat.set(0, -v.half.h + S.up, -S.back).applyQuaternion(q).add(v.pos);
    player.ride({ pos: seat, heading: v.heading, show: true, quat: rq.copy(q) });
  }

  function exit(v) {
    // Step out on the left, else the right, else behind.
    const sx = Math.cos(v.heading), sz = -Math.sin(v.heading);
    const tries = [[sx, sz], [-sx, -sz], [-fwd.x, -fwd.z]];
    const d0 = Math.max(v.half.w, 0.5) + 0.9;
    for (const [ax, az] of tries) {
      const dd = ax === -fwd.x ? v.half.len + 1 : d0;
      const x = v.pos.x + ax * dd, z = v.pos.z + az * dd;
      const g = heightAt(x, z, v.pos.y);
      if (Math.abs(g - (v.pos.y - v.half.h)) < 1.5) { player.leaveRide(x, g, z); st.driving = null; return; }
    }
    player.leaveRide(v.pos.x + sx * d0, v.pos.y + 1, v.pos.z + sz * d0);
    st.driving = null;
  }

  return {
    // Runs in the fixed physics step, before the player.
    update(dt, input) {
      const want = input.consumeDrive?.();
      const pp = player.position;
      st.near = null;
      if (!st.driving && !player.state.disabled && player.state.mode === 'ground') {
        let best = ENTER_RANGE;
        for (const v of list) {
          const d = Math.hypot(pp.x - v.pos.x, pp.z - v.pos.z) - v.half.len * 0.5;
          if (d < best) { best = d; st.near = v; }
        }
      }
      if (want) {
        if (st.driving) exit(st.driving);
        else if (st.near) { st.driving = st.near; st.driving.vy = 0; }
      }
      if (st.driving && player.state.disabled) exit(st.driving);
      for (const v of list) {
        if (v === st.driving) drive(v, dt, input.state);
        else v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 8 * dt);
        fwd.set(Math.sin(v.heading), 0, Math.cos(v.heading));
        if (v === st.driving || Math.abs(v.speed) > 0.01 || v.vy < -1.5) move(v, dt);
        tilt(v, dt);
        place(v);
      }
      if (st.driving) seatPlayer(st.driving);
    },
    get driving() { return st.driving; },
    get near() { return st.near; },
    list,
  };
}
