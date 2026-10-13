// Grenades: thrown in an arc where the camera looks, they explode the moment
// they touch the ground, a wall or a guard. The blast knocks out or hurts
// guards nearby (less behind cover), alerts guards within 20 m, can hurt the
// player too, shakes the camera, and leaves damage behind: a scorched crater
// mark on the ground or wall and scattered rubble.
// The grenade is the Meshy model from the owner's picture (yellow and black),
// held in the right hand during the throw.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGlb } from './player.js';

const SPEED = 15;          // m/s out of the hand
const LOFT = 0.32;         // extra upward angle (radians) above where the camera looks
const GRAVITY = -14;
const COOLDOWN = 1.5;      // seconds between throws
const RADIUS = 7;          // blast reach
const KO_RADIUS = 2.5;     // guards this close are always knocked out
const ALERT_RADIUS = 20;   // guards this close hear it
const MAX_MARKS = 16, MAX_RUBBLE = 240;

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const radial = (stops) => canvasTex(64, (g, n) => {
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr;
  g.fillRect(0, 0, n, n);
});

// Scorched crater: black centre, soot streaks, a ragged rim of churned earth.
function scorchTexture() {
  return canvasTex(256, (g, n) => {
    const c = n / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(12,9,7,0.95)');
    gr.addColorStop(0.35, 'rgba(25,18,12,0.9)');
    gr.addColorStop(0.6, 'rgba(45,32,22,0.55)');
    gr.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, n, n);
    // Soot streaks radiating out.
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r0 = n * 0.12, r1 = n * (0.3 + Math.random() * 0.2);
      g.strokeStyle = `rgba(15,10,8,${0.25 + Math.random() * 0.3})`;
      g.lineWidth = 2 + Math.random() * 5;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      g.stroke();
    }
    // Clods of thrown-up earth round the rim.
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = n * (0.2 + Math.random() * 0.15);
      g.fillStyle = `rgba(${70 + Math.random() * 30},${50 + Math.random() * 20},${32 + Math.random() * 15},0.8)`;
      g.beginPath();
      g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 1.5 + Math.random() * 4, 0, 7);
      g.fill();
    }
  });
}

// opts: scene, physics, camera, player, hostiles, fx, waterAt, hurtPlayer(damage)
export function createGrenades({ scene, physics, camera, player, hostiles, fx, waterAt, hurtPlayer }) {
  // Code-built stand-in until the Meshy grenade has downloaded.
  let body = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: '#4c5a2c', roughness: 0.7, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2a26', roughness: 0.5, metalness: 0.6 });
  const egg = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), olive);
  egg.scale.y = 1.3;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.03, 8), dark);
  cap.position.y = 0.065;
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.08, 0.02), dark);
  lever.position.set(0.04, 0.035, 0);
  body.add(egg, cap, lever);
  body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const held = new THREE.Group();
  held.visible = false;
  scene.add(held);
  held.add(body.clone());
  loadGlb('models/items/Grenade.glb').then((gltf) => {
    body = gltf.scene;
    body.scale.setScalar(0.065); // about 12 cm tall
    body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    held.clear();
    held.add(body.clone());
  }).catch((err) => console.error(err));

  const flying = [];
  const fireTex = radial([[0, 'rgba(255,255,230,1)'], [0.25, 'rgba(255,210,90,1)'], [0.6, 'rgba(240,110,30,0.75)'], [1, 'rgba(160,40,10,0)']]);
  const smokeTex = radial([[0, 'rgba(70,64,58,0.85)'], [0.6, 'rgba(80,74,66,0.45)'], [1, 'rgba(90,84,76,0)']]);
  const sprite = (tex, additive) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive }));
    s.visible = false;
    scene.add(s);
    return s;
  };
  // Pools for up to three explosions at once.
  const blasts = [];
  const debrisGeo = new THREE.DodecahedronGeometry(0.07, 0);
  const debrisMat = new THREE.MeshStandardMaterial({ color: '#5a4430', roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const debris = [];
    for (let k = 0; k < 14; k++) {
      const m = new THREE.Mesh(debrisGeo, debrisMat);
      m.visible = false;
      scene.add(m);
      debris.push({ m, v: new THREE.Vector3() });
    }
    blasts.push({ t: 99, fire: sprite(fireTex, true), flash: sprite(fireTex, true), smoke: Array.from({ length: 8 }, () => ({ s: sprite(smokeTex, false), v: new THREE.Vector3() })), debris, at: new THREE.Vector3() });
  }
  let bi = 0;

  // Lasting damage: scorch marks and rubble.
  const markMat = new THREE.MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const markGeo = new THREE.PlaneGeometry(4.2, 4.2);
  const marks = [];
  let mi = 0;
  const rubble = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 1 }), MAX_RUBBLE);
  rubble.count = 0;
  rubble.castShadow = true;
  rubble.frustumCulled = false;
  scene.add(rubble);
  let ri = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();

  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  const st = { cooldown: 0, shake: 0, thrown: 0, explosions: 0 };
  const v = new THREE.Vector3(), d = new THREE.Vector3(), P = new THREE.Vector3(), N = new THREE.Vector3(), Q = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);

  function addMark(at, normal) {
    let m = marks[mi % MAX_MARKS];
    if (!m) { m = new THREE.Mesh(markGeo, markMat); m.renderOrder = 1; scene.add(m); marks.push(m); }
    mi++;
    m.position.copy(at).addScaledVector(normal, 0.04);
    m.quaternion.setFromUnitVectors(up, normal);
    m.rotateZ(Math.random() * 6.28);
    const s = 0.8 + Math.random() * 0.4;
    m.scale.set(s, s, 1);
    m.visible = true;
  }

  function addRubble(at, normal) {
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * 6.28, r = 0.6 + Math.random() * 1.6;
      // Spread over the surface, then settle onto whatever is below.
      P.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      P.applyQuaternion(q).add(at).addScaledVector(normal, 0.5);
      ray.origin = { x: P.x, y: P.y + 0.5, z: P.z };
      ray.dir = { x: 0, y: -1, z: 0 };
      const hit = physics.castRay(ray, 4, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
      if (!hit) continue;
      P.y = P.y + 0.5 - hit.timeOfImpact;
      e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      const s = 0.4 + Math.random() * 0.9;
      m4.compose(P, q.setFromEuler(e), sc.set(s, s * 0.6, s));
      rubble.setMatrixAt(ri % MAX_RUBBLE, m4);
      ri++;
      rubble.count = Math.min(MAX_RUBBLE, ri);
    }
    rubble.instanceMatrix.needsUpdate = true;
  }

  function explode(at, normal, surface) {
    st.explosions++;
    st.last = { at: at.toArray().map((n) => +n.toFixed(2)), normal: normal.toArray().map((n) => +n.toFixed(2)), surface };
    const b = blasts[bi++ % blasts.length];
    b.t = 0;
    b.at.copy(at);
    b.fire.position.copy(at).addScaledVector(normal, 0.6);
    b.flash.position.copy(b.fire.position);
    for (const s of b.smoke) {
      s.s.position.copy(at).addScaledVector(normal, 0.4);
      s.v.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3).addScaledVector(normal, 1.5);
      s.s.material.rotation = Math.random() * 6;
    }
    for (const r of b.debris) {
      r.m.position.copy(at).addScaledVector(normal, 0.2);
      r.v.set((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8).addScaledVector(normal, 3);
      r.m.visible = true;
    }
    const dist = camera.position.distanceTo(at);
    fx.boom(dist);
    st.shake = Math.max(st.shake, THREE.MathUtils.clamp(1.2 - dist / 40, 0, 1));
    // Ground or wall damage (not on water).
    if (surface) { addMark(at, normal); addRubble(at, normal); }

    // Guards: knocked out close in, hurt further out; cover shields them.
    const center = Q.copy(at).addScaledVector(normal, 0.3);
    for (const u of hostiles.units) {
      if (u.state === 'down') continue;
      P.copy(u.model.position).y += 1.0;
      const dd = P.distanceTo(center);
      if (dd < RADIUS) {
        const cover = hostiles.clearLine(center, P) ? 1 : 0.3;
        const dmg = dd < KO_RADIUS && cover === 1 ? 999 : 130 * (1 - dd / RADIUS) * cover;
        hostiles.hit(u, dmg, at, player.position);
      } else if (dd < ALERT_RADIUS) hostiles.alertTo(u, player.position);
    }
    // The player isn't safe either.
    P.copy(player.position).y += 1.0;
    const pd = P.distanceTo(center);
    if (pd < RADIUS) hurtPlayer(80 * (1 - pd / RADIUS) * (hostiles.clearLine(center, P) ? 1 : 0.3));
  }

  function throwOne() {
    st.thrown++;
    const g = body.clone();
    player.hand(g.position);
    camera.getWorldDirection(d);
    // Loft the throw above the aim line.
    const pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) + LOFT;
    const yaw = Math.atan2(d.x, d.z);
    v.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(SPEED);
    scene.add(g);
    flying.push({ g, vel: v.clone(), t: 0, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0) });
  }

  // Does the segment a→b pass through a guard? Returns the guard or null.
  function hitsGuard(a, b) {
    for (const u of hostiles.units) {
      if (u.state === 'down') continue;
      const f = u.model.position;
      for (const h of [0.5, 1.0, 1.5]) {
        P.set(f.x, f.y + h, f.z);
        // Closest point on the segment to P.
        N.subVectors(b, a);
        const len2 = N.lengthSq() || 1;
        const t = THREE.MathUtils.clamp(Q.subVectors(P, a).dot(N) / len2, 0, 1);
        Q.copy(a).addScaledVector(N, t);
        if (Q.distanceTo(P) < 0.45) return Q.clone();
      }
    }
    return null;
  }

  const prev = new THREE.Vector3();
  function update(dt) {
    st.cooldown -= dt;
    st.shake = Math.max(0, st.shake - dt * 2.5);
    if (player.state.release) {
      player.state.release = false;
      throwOne();
    }
    // In the hand from the start of the throw until it is let go.
    held.visible = player.throwing && !player.released;
    if (held.visible) {
      player.hand(held.position);
      held.rotation.y = player.facing;
    }
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.t += dt;
      prev.copy(f.g.position);
      f.vel.y += GRAVITY * dt;
      f.g.position.addScaledVector(f.vel, dt);
      f.g.rotation.x += f.spin.x * dt;
      f.g.rotation.z += f.spin.y * dt;
      // What did it hit on the way: a guard, the ground or a wall, or water?
      let at = null, normal = new THREE.Vector3(0, 1, 0), surface = true;
      const guard = hitsGuard(prev, f.g.position);
      d.subVectors(f.g.position, prev);
      const len = d.length();
      if (len > 1e-4) {
        ray.origin = { x: prev.x, y: prev.y, z: prev.z };
        ray.dir = { x: d.x / len, y: d.y / len, z: d.z / len };
        const hit = physics.castRayAndGetNormal(ray, len, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
        if (hit) {
          at = prev.clone().addScaledVector(d, hit.timeOfImpact / len);
          normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        }
      }
      if (guard && (!at || guard.distanceTo(prev) < at.distanceTo(prev))) { at = guard; normal.set(0, 1, 0); surface = false; }
      const w = waterAt?.(f.g.position.x, f.g.position.z);
      if (!at && w && f.g.position.y < w.level) { at = f.g.position.clone().setY(w.level); surface = false; }
      if (!at && f.t > 6) { at = f.g.position.clone(); surface = false; }
      if (at) {
        scene.remove(f.g);
        flying.splice(i, 1);
        explode(at, normal, surface);
      }
    }
    // Explosion animation: flash, fireball, smoke rising and fading, debris.
    for (const b of blasts) {
      if (b.t > 4) continue;
      b.t += dt;
      const t = b.t;
      b.flash.visible = t < 0.08;
      b.flash.scale.setScalar(9);
      b.fire.visible = t < 0.55;
      b.fire.scale.setScalar(2 + Math.min(1, t / 0.15) * 6);
      b.fire.material.opacity = 1 - Math.max(0, (t - 0.15) / 0.4);
      for (const s of b.smoke) {
        s.s.visible = t < 4;
        s.s.position.addScaledVector(s.v, dt);
        s.v.multiplyScalar(1 - dt * 0.9);
        s.s.scale.setScalar(1.5 + t * 2.2);
        // Smoke builds up as the fireball fades, so it never darkens the flash.
        s.s.material.opacity = THREE.MathUtils.clamp((t - 0.25) / 0.35, 0, 1) * Math.max(0, 1 - t / 4) * 0.8;
      }
      for (const r of b.debris) {
        if (!r.m.visible) continue;
        r.v.y += GRAVITY * dt;
        r.m.position.addScaledVector(r.v, dt);
        r.m.rotation.x += dt * 8;
        if (t > 1.6) r.m.visible = false;
      }
    }
  }

  return {
    update,
    stats: st,
    // Starts a throw if one is ready (the throw itself happens at the release moment).
    get ready() { return st.cooldown <= 0; },
    begin() { st.cooldown = COOLDOWN; },
    get shake() { return st.shake; },
  };
}
