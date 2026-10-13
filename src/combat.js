// The player's side of combat: shooting (hold Fire), punching (a takedown
// from behind on a guard who hasn't noticed you), health, being hit and
// being knocked out.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

const FIRE_INTERVAL = 0.22;   // seconds between shots while Fire is held
const SHOT_DAMAGE = 34;       // three body hits knock a guard out
const HEAD_DAMAGE = 100;
const PUNCH_DAMAGE = 34;
const PUNCH_REACH = 1.7;
const RANGE = 90;
const MAX_HEALTH = 100;
const REGEN_DELAY = 5, REGEN_RATE = 8; // health comes back after a few seconds without being hit

// opts: scene, physics, camera, player, hostiles, fx, isTouch, respawnPoint() → Vector3
export function createCombat({ physics, camera, player, hostiles, fx, isTouch, respawnPoint }) {
  const ui = {
    cross: document.getElementById('crosshair'),
    health: document.getElementById('health'),
    fill: document.getElementById('health-fill'),
    hurt: document.getElementById('hurt'),
    prompt: document.getElementById('prompt'),
    down: document.getElementById('down'),
  };
  ui.health.hidden = false;
  const st = { health: MAX_HEALTH, sinceHit: 99, cooldown: 0, hurt: 0, downT: 0, hitMark: 0, shots: 0, hits: 0, takedowns: 0 };
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const O = new THREE.Vector3(), D = new THREE.Vector3(), P = new THREE.Vector3(), Q = new THREE.Vector3();
  const muzzle = new THREE.Vector3(), end = new THREE.Vector3();
  const assist = isTouch ? 0.12 : 0.05; // radians of aim help (more on phones)

  // Body sample points (height above feet, radius): legs, torso, chest, head.
  const PARTS = [[0.5, 0.3, 'body'], [1.0, 0.32, 'body'], [1.35, 0.3, 'body'], [1.68, 0.16, 'head']];

  function fire() {
    st.shots++;
    camera.getWorldPosition(O);
    camera.getWorldDirection(D);
    // Nearest wall, rock or ground along the aim.
    ray.origin = { x: O.x, y: O.y, z: O.z };
    ray.dir = { x: D.x, y: D.y, z: D.z };
    const wall = physics.castRay(ray, RANGE, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
    let best = null, bestT = wall ? wall.timeOfImpact : RANGE, part = 'body';
    for (const u of hostiles.units) {
      if (u.state === 'down' || !u.active) continue;
      for (const [h, r, name] of PARTS) {
        P.copy(u.model.position).y += h;
        const t = Q.subVectors(P, O).dot(D);
        if (t <= 0 || t >= bestT) continue;
        Q.copy(O).addScaledVector(D, t);
        if (Q.distanceTo(P) < r) { best = u; bestT = t; part = name; }
      }
    }
    // Aim help: a guard close to the crosshair with a clear line counts as hit.
    if (!best) {
      let bestA = assist;
      for (const u of hostiles.units) {
        if (u.state === 'down' || !u.active) continue;
        P.copy(u.model.position).y += 1.2;
        const d = P.distanceTo(O);
        if (d > RANGE || d > bestT + 2) continue;
        const a = Q.subVectors(P, O).normalize().angleTo(D);
        if (a < bestA && hostiles.clearLine(O, P)) { bestA = a; best = u; bestT = d; part = 'body'; }
      }
    }
    end.copy(O).addScaledVector(D, bestT);
    if (best) end.copy(best.model.position).y += part === 'head' ? 1.68 : 1.15;
    player.muzzle(muzzle);
    fx.flash(muzzle);
    fx.tracer(muzzle, end);
    fx.gunshot(0);
    if (best) {
      st.hits++;
      hostiles.hit(best, part === 'head' ? HEAD_DAMAGE : SHOT_DAMAGE, player.position);
      st.hitMark = 0.15;
    }
  }

  // The punch lands on the nearest guard in front, within arm's reach.
  function punch() {
    const pp = player.position, f = player.facing;
    let best = null, bestD = PUNCH_REACH;
    for (const u of hostiles.units) {
      if (u.state === 'down') continue;
      Q.subVectors(u.model.position, pp);
      if (Math.abs(Q.y) > 1.2) continue;
      Q.y = 0;
      const d = Q.length();
      if (d > bestD) continue;
      if (d > 0.3 && (Math.sin(f) * Q.x + Math.cos(f) * Q.z) / d < 0.3) continue;
      best = u; bestD = d;
    }
    if (!best) return;
    fx.punch();
    if (hostiles.canTakeDown(best, pp)) {
      hostiles.knockOut(best, pp);
      st.takedowns++;
    } else hostiles.hit(best, PUNCH_DAMAGE, pp);
  }

  function hurt(damage) {
    if (player.state.disabled) return;
    st.health = Math.max(0, st.health - damage);
    st.sinceHit = 0;
    st.hurt = 1;
    if (st.health <= 0) {
      player.state.disabled = true;
      st.downT = 3;
      ui.down.hidden = false;
      hostiles.reset();
    }
  }

  function update(dt, input) {
    if (st.downT > 0) {
      st.downT -= dt;
      if (st.downT <= 0) {
        const p = respawnPoint();
        player.teleport(p.x, p.y, p.z);
        player.state.disabled = false;
        st.health = MAX_HEALTH;
        ui.down.hidden = true;
      }
    }
    st.sinceHit += dt;
    if (st.sinceHit > REGEN_DELAY) st.health = Math.min(MAX_HEALTH, st.health + REGEN_RATE * dt);

    st.cooldown -= dt;
    if (player.state.aiming && player.aimWeight > 0.7 && st.cooldown <= 0) {
      st.cooldown = FIRE_INTERVAL;
      fire();
    }
    if (player.state.strike) {
      player.state.strike = false;
      punch();
    }

    // Takedown hint when standing behind an unaware guard.
    let near = false;
    for (const u of hostiles.units) {
      if (u.state !== 'down' && u.model.position.distanceTo(player.position) < 2.6 && hostiles.canTakeDown(u, player.position)) { near = true; break; }
    }
    ui.prompt.hidden = !near || player.state.disabled;
    if (near) ui.prompt.textContent = isTouch ? 'Punch: takedown' : 'E: takedown';

    ui.cross.hidden = !player.state.aiming;
    st.hitMark -= dt;
    ui.cross.classList.toggle('hit', st.hitMark > 0);
    st.hurt = Math.max(0, st.hurt - dt * 2.5);
    ui.hurt.style.opacity = Math.max(st.hurt * 0.8, st.health < 35 ? 0.35 : 0).toFixed(2);
    ui.fill.style.width = `${st.health}%`;
    ui.fill.style.background = st.health < 35 ? '#e0533a' : '#6fcf5a';
    fx.update(dt);
  }

  return { update, hurt, stats: st };
}
