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
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGlb } from './player.js';
import { treeAt } from './kit/crowns.js';

const PLANE_SCALE = 20;        // model length 1.48 → about 30 m, like a C-130
const FLOOR_Y = 0.95;          // cargo floor height inside the scaled model
const RAMP_Z = -6.9;           // where the player stands, just inside the open rear
const PLANE_SPEED = 32;        // m/s (slow for a real plane; the jump zone passes quickly enough)
const DROP_HEIGHT = 135;       // floor height above the highest ground under the flight path
const FLIGHT = 28;             // seconds of flight before the plane leaves the area
const APPROACH = 420;          // the plane starts this far before the landing area
const READY = 200;             // jumping is allowed this close to (or past) the area
const AUTO_PAST = 120;         // ...and the player is pushed out this far past it
const FLY_TIME = 30;           // jump to landing
// Propellers, in the model's own units (nose along -X): hub height, the
// propeller plane, radius, and each engine's place along the wing.
const PROP_Y = 0.178, PROP_X = -0.292, PROP_R = 0.098, PROP_Z = [-0.46, -0.237, 0.237, 0.46];
const PROP_SPIN = 14;          // radians a second (slowed down, so the blades can be seen turning)
const KINDS = {
  parachute: { url: 'models/items/Parachute.glb', scale: 3, free: 3.0, speed: 6, fast: 9, slow: 3, turn: 0.9, open: 1.0,
    pose: { clip: 'ropeHang', rate: 1 }, camDist: 9, camHeight: 2.8 },
  glider: { url: 'models/items/Hang_Glider.glb', scale: 5, free: 1.6, speed: 11, fast: 15, slow: 7, turn: 0.7, open: 0.6,
    pose: { clip: 'barHang', rate: 1 }, camDist: 9, camHeight: 2.2 },
};

// opts: scene, physics, player, fx, heightAt(x, z, yHint) walking height, waterAt(x, z), hurt(damage),
// onLand() once the player is on the ground again
export function createAirDrop({ scene, physics, player, fx, heightAt, waterAt, hurt, onLand }) {
  const group = new THREE.Group();      // the plane: local +Z is the nose, floor at y = 0
  group.visible = false;
  scene.add(group);
  let planeReady = false;
  const props = [];
  loadGlb('models/vehicles/Cargo_Plane.glb').then((gltf) => {
    const m = gltf.scene;
    m.updateMatrixWorld(true);
    stripBlades(m);
    for (const z of PROP_Z) {
      const p = buildProp();
      p.position.set(PROP_X, PROP_Y, z);
      p.rotation.x = z * 7;               // not all in step
      m.add(p);
      props.push(p);
    }
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
  // Landing area marker: a soft beam of light over the target.
  const marker = new THREE.Group();
  {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 120, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: '#7dffa0', transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 60;
    const ring = new THREE.Mesh(new THREE.RingGeometry(9, 11, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#7dffa0', transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
    ring.position.y = 0.3;
    marker.add(beam, ring);
    marker.visible = false;
    scene.add(marker);
  }
  let landAt = null, avoid = null;

  // Starts the drop. The plane flies along `heading` and passes over
  // `aim` ({ x, z }), the marked landing area; `keepOut` ({ x, z, r }) is an
  // area the steering gently pushes the flyer away from (the captive site).
  function start(kind, aim, heading, keepOut = null) {
    if (player.state.disabled) return;
    landAt = aim;
    avoid = keepOut;
    marker.position.set(aim.x, heightAt(aim.x, aim.z), aim.z);
    marker.visible = true;
    const x = aim.x - Math.sin(heading) * APPROACH, z = aim.z - Math.cos(heading) * APPROACH;
    st.kind = kind;
    st.phase = 'plane';
    st.snagged = st.crashed = st.crash = false;
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
    // Turn to face the landing area.
    st.heading = landAt ? Math.atan2(landAt.x - pos.x, landAt.z - pos.z) : st.planeHeading + Math.PI;
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
  // What the flyer ran into this step: 'tree', a wall or building ({ nx, nz },
  // the direction it faces), or null. Walls and buildings are found by casting
  // a ray along each probe's path since `prev`; floors, roofs and gentle
  // ground (surfaces facing up) are left to the landing.
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const from = new THREE.Vector3(), step = new THREE.Vector3(), prev = new THREE.Vector3();
  function collide(set) {
    yawQ.setFromAxisAngle(Yax, st.heading);
    step.subVectors(pos, prev);
    const len = step.length();
    for (const p of PROBES[set]) {
      probe.set(p[0], p[1], p[2]).applyQuaternion(yawQ).add(pos);
      if (treeAt(probe.x, probe.y, probe.z)) return 'tree';
      if (!physics || len < 1e-4 || len > 5) continue;   // (a jump in position is a teleport, not flight)
      from.copy(probe).sub(step);
      ray.origin = { x: from.x, y: from.y, z: from.z };
      ray.dir = { x: step.x / len, y: step.y / len, z: step.z / len };
      const hit = physics.castRayAndGetNormal(ray, len + 0.3, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
      if (hit && hit.normal.y < 0.6) {
        const h = Math.hypot(hit.normal.x, hit.normal.z) || 1;
        return { nx: hit.normal.x / h, nz: hit.normal.z / h };
      }
    }
    return null;
  }

  // Caught in a tree: the parachute or glider stays in the branches and the
  // player drops to the ground below.
  // Crashed into a wall or building: the canopy or wing collapses and falls
  // with the player, who bounces back off the wall.
  function snag(what) {
    st.phase = 'snag';
    st.t = 0;
    st.snagY = pos.y;
    st.crash = what !== 'tree';
    if (st.crash) {
      pos.copy(prev);
      vel.x = what.nx * 1.5; vel.z = what.nz * 1.5;
    } else { vel.x *= 0.15; vel.z *= 0.15; }
    vel.y = Math.min(vel.y, 0) * 0.3;
    fx?.punch();
  }

  // What the flyer will come down on: the ground, or the water surface above it.
  function surfaceBelow() {
    const ground = heightAt(pos.x, pos.z, pos.y);
    const w = waterAt?.(pos.x, pos.z);
    return w && w.level > ground ? { y: w.level, ground, water: w } : { y: ground, ground, water: null };
  }

  // Splash: a white ring spreading on the water and spray thrown up and out.
  const splash = (() => {
    const N = 40;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#f4f8f8', transparent: true, opacity: 0, depthWrite: false }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const dc = dot.getContext('2d'), grad = dc.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    dc.fillStyle = grad;
    dc.fillRect(0, 0, 32, 32);
    const drops = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#eef6f7', map: new THREE.CanvasTexture(dot), size: 0.14, transparent: true, opacity: 0, depthWrite: false }));
    ring.visible = drops.visible = false;
    ring.frustumCulled = drops.frustumCulled = false;
    scene.add(ring, drops);
    const v = new Float32Array(N * 3);
    let t = 99, level = 0;
    return {
      start(x, y, z, big) {
        t = 0; level = y;
        ring.position.set(x, y + 0.04, z);
        const p = geo.attributes.position.array;
        for (let i = 0; i < N; i++) {
          const a = Math.random() * 6.28, sp = (1 + Math.random() * 2.5) * (big ? 1.4 : 1);
          p[i * 3] = x; p[i * 3 + 1] = y + 0.1; p[i * 3 + 2] = z;
          v[i * 3] = Math.cos(a) * sp; v[i * 3 + 1] = (3 + Math.random() * 4) * (big ? 1.3 : 1); v[i * 3 + 2] = Math.sin(a) * sp;
        }
        geo.attributes.position.needsUpdate = true;
        ring.visible = drops.visible = true;
      },
      update(dt) {
        if (t > 2) return;
        t += dt;
        ring.scale.setScalar(0.6 + t * 3.2);
        ring.material.opacity = Math.max(0, 0.8 - t * 0.45);
        const p = geo.attributes.position.array;
        for (let i = 0; i < N; i++) {
          v[i * 3 + 1] -= 9.8 * dt;
          p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
          if (p[i * 3 + 1] < level) { p[i * 3 + 1] = level - 5; v[i * 3 + 1] = 0; v[i * 3] = v[i * 3 + 2] = 0; }
        }
        geo.attributes.position.needsUpdate = true;
        drops.material.opacity = Math.max(0, 0.95 - t * 0.6);
        if (t > 2) ring.visible = drops.visible = false;
      },
    };
  })();

  function land(ground) {
    const crashed = st.phase === 'snag' && st.crash;
    const sb = surfaceBelow();
    const w = sb.water, deep = w && w.level - w.ground > 1.3;
    // Deep water breaks the fall; the ground or shallow water doesn't.
    if (st.phase === 'snag' && !deep) hurt?.(Math.round(Math.min(35, 5 + Math.max(0, st.snagY - ground) * 1.5)));
    const snagged = st.phase === 'snag';
    st.phase = 'landed';
    st.snagged = snagged && !crashed;
    st.crashed = crashed;
    st.t = 0;
    // Into deep water: straight into swimming, head above the surface.
    // Shallow water: feet on the bottom (wading).
    player.leaveRide(pos.x, deep ? w.level - 1.25 : sb.ground, pos.z);
    st.landed = { x: pos.x, z: pos.z, y: w ? w.level : ground, heading: st.heading, water: !!w };
    marker.visible = false;
    onLand?.();
    if (w) { splash.start(pos.x, w.level, pos.z, -vel.y > 6); fx?.splash(); }
    // The glider comes down just behind the player.
    const g = gear.glider;
    if (st.kind === 'glider' && g && !snagged) g.position.set(pos.x - Math.sin(st.heading) * 1.2, st.landed.y, pos.z - Math.cos(st.heading) * 1.2);
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
    splash.update(dt);
    if (st.phase === 'off') return;
    st.t += dt;
    const s = input.state;
    const jumpPressed = input.consumeJump?.();
    if (planeReady || st.phase !== 'plane') {
      // The plane flies on (and away, once the player has jumped).
      group.position.addScaledVector(planeVel, dt);
      group.rotation.z = Math.sin(st.t * 0.7) * 0.015;
      if (group.visible) for (const p of props) p.rotation.x += dt * PROP_SPIN;
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
      // Along the path: negative before the landing area, positive past it.
      const along = (group.position.x - landAt.x) * Math.sin(st.planeHeading) + (group.position.z - landAt.z) * Math.cos(st.planeHeading);
      st.ready = along > -READY;
      if ((jumpPressed && st.ready && st.t > 0.5) || along > AUTO_PAST) jump();
      fx?.wind(0.35, 260);
      return;
    }
    if (st.phase === 'snag') {
      // Dropping out of the tree.
      vel.y = Math.max(-30, vel.y - 9.8 * dt);
      pos.addScaledVector(vel, dt);
      // A collapsed canopy or wing comes down with the player.
      const g = gear[st.kind];
      if (g && st.crash) g.position.addScaledVector(vel, dt);
      e.set(0, st.heading, 0, 'YXZ');
      player.ride({ pos: pos.clone(), heading: st.heading, show: true, quat: q.setFromEuler(e).clone(), pose: { clip: 'ropeHang', rate: 2 }, noRifle: true });
      st.camDist = 6; st.camHeight = 1.4;
      fx?.wind(0.1, 600);
      const sb = surfaceBelow();
      if (pos.y <= sb.y) land(sb.ground);
      return;
    }
    if (st.phase === 'landed') {
      // The parachute or glider settles behind the player, tips over and is gone.
      const g = gear[st.kind], L = st.landed;
      if (g && !st.snagged && L.water) {
        // On water: falls flat onto the surface, floats a moment, then sinks.
        const flat = Math.min(1, st.t * 1.4);
        g.visible = st.t < 6;
        g.quaternion.setFromEuler(e.set(-1.5 * flat, L.heading, 0, 'YXZ'));
        g.scale.y = Math.max(0.35, g.scale.y - dt * 0.6);
        g.position.y = Math.max(L.y - 0.2 - Math.max(0, st.t - 2.5) * 0.35, g.position.y - dt * 3);
        if (st.t < 0.05) splash.start(g.position.x, L.y, g.position.z, false);
      } else if (g && !st.snagged) {
        // Settles to the ground and falls over backwards, then is gone.
        g.visible = st.t < 2.6;
        g.position.y = Math.max(L.y - 0.3, g.position.y - dt * 3);
        g.quaternion.setFromEuler(e.set(-Math.min(1.45, st.t * 1.1), L.heading, 0, 'YXZ'));
        g.scale.y = Math.max(0.35, g.scale.y - dt * 0.6);
      }
      if (st.t > (L.water ? 6 : 3)) st.phase = 'off';
      fx?.wind(0, 400);
      return;
    }

    const K = KINDS[st.kind];
    const steerIn = THREE.MathUtils.clamp(s.moveX || 0, -1, 1);
    const push = THREE.MathUtils.clamp(s.moveY || 0, -1, 1);
    st.steer = THREE.MathUtils.damp(st.steer, steerIn, 4, dt);
    const sb = surfaceBelow(), ground = sb.y;

    if (st.phase === 'fall') {
      // Freefall: the air slows the plane's speed; turning the body steers a little.
      vel.y = Math.max(-38, vel.y - 9.8 * dt);
      st.heading -= st.steer * 1.2 * dt;
      // Face the direction of the drift after the exit.
      fwd.set(Math.sin(st.heading), 0, Math.cos(st.heading));
      const drift = 3 + Math.max(0, push) * 3;
      vel.x = THREE.MathUtils.damp(vel.x, fwd.x * drift, 0.8, dt);
      vel.z = THREE.MathUtils.damp(vel.z, fwd.z * drift, 0.8, dt);
      prev.copy(pos);
      pos.addScaledVector(vel, dt);
      st.bank = THREE.MathUtils.damp(st.bank, -st.steer * 0.5, 4, dt);
      // Belly down, arms and legs out (the swimming stroke, slowed).
      e.set(0.15, st.heading, st.bank, 'YXZ');
      q.setFromEuler(e);
      player.ride({ pos: pos.clone(), heading: st.heading, show: true, quat: q.clone(), pose: { clip: 'swimForward', rate: 0.35 }, noRifle: true });
      st.camDist = 6; st.camHeight = 0.6;
      fx?.wind(0.25 + Math.min(1, -vel.y / 30) * 0.6, 900 + Math.min(1, -vel.y / 30) * 1400);
      if ((jumpPressed && st.t > 0.4) || st.t > K.free) deploy();
      if (pos.y <= ground) land(sb.ground);
      else { const c = collide('fall'); if (c) snag(c); }
      return;
    }

    // Flying under the canopy or wing. Assisted steering: with no stick input
    // the flyer turns gently towards the landing area.
    st.heading -= st.steer * K.turn * dt;
    if (landAt && Math.abs(steerIn) < 0.1) {
      const dx = landAt.x - pos.x, dz = landAt.z - pos.z;
      if (Math.hypot(dx, dz) > 20) {
        const want = Math.atan2(dx, dz);
        const diff = Math.atan2(Math.sin(want - st.heading), Math.cos(want - st.heading));
        st.heading += THREE.MathUtils.clamp(diff, -1, 1) * 0.35 * dt;
      }
    }
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
    // Assisted steering: kept out of the captive site.
    if (avoid) {
      const ax = pos.x - avoid.x, az = pos.z - avoid.z, ad = Math.hypot(ax, az);
      if (ad < avoid.r + 40) {
        const push = (1 - Math.max(0, ad - avoid.r) / 40) * 7;
        vel.x += (ax / (ad || 1)) * push * dt * 3;
        vel.z += (az / (ad || 1)) * push * dt * 3;
      }
    }
    prev.copy(pos);
    pos.addScaledVector(vel, dt);
    const bodyQ = placeGear(dt);
    player.ride({ pos: pos.clone(), heading: st.heading, show: true, quat: bodyQ.clone(), pose: K.pose, noRifle: true });
    st.camDist = K.camDist; st.camHeight = K.camHeight;
    fx?.wind(0.12 + st.speed / 60, 500);
    if (pos.y <= ground + 0.02) land(sb.ground);
    else { const c = collide(st.open > 0.6 ? st.kind : 'fall'); if (c) snag(c); }
  }

  // The model's propeller blades are fixed in its mesh: cut them out (the
  // spinners stay) so code-built blades can turn in their place.
  function stripBlades(root) {
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry.index) return;
      const pos = o.geometry.attributes.position, idx = o.geometry.index.array;
      const blade = new Uint8Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.x < -0.305 || v.x > -0.2805) continue;
        for (const z of PROP_Z) {
          const r = Math.hypot(v.y - PROP_Y, v.z - z);
          if (r > 0.022 && r < PROP_R + 0.01) { blade[i] = 1; break; }
        }
      }
      const keep = [];
      for (let t = 0; t < idx.length; t += 3) {
        if (blade[idx[t]] && blade[idx[t + 1]] && blade[idx[t + 2]]) continue;
        keep.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      o.geometry.setIndex(keep);
    });
  }

  // Four dark blades and a faint disc for the blur of the spin (model units;
  // the propeller turns about the model's X axis).
  function buildProp() {
    const p = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#23272a', roughness: 0.6 });
    const blade = new THREE.BoxGeometry(0.003, PROP_R - 0.012, 0.014);
    blade.translate(0, (PROP_R - 0.012) / 2 + 0.012, 0);
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(blade, bladeMat);
      b.rotation.x = k * Math.PI / 2;
      b.rotation.y = 0.35;                 // blade pitch
      const holder = new THREE.Group();
      holder.rotation.x = k * Math.PI / 2;
      b.rotation.x = 0;
      holder.add(b);
      p.add(holder);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(PROP_R, 32).rotateY(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#2a2e30', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    p.add(disc);
    return p;
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
    get ready() { return st.phase === 'plane' && !!st.ready; },
    // Ends any drop at once (checkpoint restore, new mission).
    cancel() {
      st.phase = 'off';
      group.visible = marker.visible = false;
      for (const o of Object.values(gear)) o.visible = false;
      fx?.wind(0, 400);
    },
    get active() { return st.phase !== 'off' && st.phase !== 'landed'; },
    get snagged() { return st.phase === 'snag' || (st.phase === 'landed' && (st.snagged || st.crashed)); },
    get crashed() { return st.crash; },
    get phase() { return st.phase; },
    get kind() { return st.kind; },
    get heading() { return st.phase === 'plane' ? st.planeHeading + Math.PI : st.heading; },
    get camDist() { return st.camDist; },
    get camHeight() { return st.camHeight; },
    get timeLeft() { return Math.max(0, FLY_TIME - st.since); },
    get altitude() { return pos.y - surfaceBelow().y; },
    st,
    plane: group,
    pos,
    vel,
    gear,
    prompt,
  };
}
