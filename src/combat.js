// The player's side of combat (game plan v2.2 values): shooting (hold Fire)
// with a 10-round magazine and a 2 s reload, punching (1 HP; a takedown from
// behind on a guard who hasn't noticed you), health from 100 up to 200 with
// first-aid kits (no automatic healing), being hit and being knocked out.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RULES } from './config.js';

// Fire held: rounds of 3 bullets, 0.07 s apart, with 0.4 s between rounds.
// Every press fires a round (owner, 17 Oct: "it should always fire every time
// I press it"): presses are counted (up to 2 waiting), kept through a round,
// the gap or a reload, and a tapped round may follow 0.15 s after the last.
const BURST = 3, BULLET_GAP = 0.07, BURST_GAP = 0.4, TAP_GAP = 0.15, MAX_QUEUED = 2;
const SHOT_DAMAGE = RULES.playerBulletDamage;   // five hits defeat a hostile
const HEAD_DAMAGE = RULES.playerBulletDamage;
// Melee by attack: punch and kick 1 HP, cutlass slash 2 HP (as a bullet).
const MELEE = {
  punch: { damage: RULES.meleeDamage, reach: 1.7 },
  kick: { damage: RULES.meleeDamage, reach: 1.9 },
  slash: { damage: RULES.playerBulletDamage, reach: 2.1 },
};
const RANGE = 90;
const MAX_HEALTH = RULES.maxHealth;

// opts: physics, camera, player, hostiles, fx, isTouch, onDown() (knocked out)
export function createCombat({ physics, camera, player, hostiles, fx, isTouch, onDown, aimNdc }) {
  const ui = {
    cross: document.getElementById('crosshair'),
    health: document.getElementById('health'),
    fill: document.getElementById('health-fill'),
    hurt: document.getElementById('hurt'),
    prompt: document.getElementById('prompt'),
    hp: document.getElementById('hp-value'),
    ammo: document.getElementById('ammo'),
  };
  ui.health.hidden = false;
  const st = {
    burstLeft: 0, queued: 0, health: RULES.startHealth, sinceHit: 99, cooldown: 0, hurt: 0, hitMark: 0, shots: 0, hits: 0, takedowns: 0,
    mag: RULES.magazine, reserve: RULES.startReserve, reload: 0,
  };
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const O = new THREE.Vector3(), D = new THREE.Vector3(), P = new THREE.Vector3(), Q = new THREE.Vector3();
  const muzzle = new THREE.Vector3(), end = new THREE.Vector3();
  let lastFire = false;
  const assist = isTouch ? 0.12 : 0.05; // radians of aim help (more on phones)

  // Body sample points (height above feet, radius): legs, torso, chest, head.
  const PARTS = [[0.5, 0.3, 'body'], [1.0, 0.32, 'body'], [1.35, 0.3, 'body'], [1.68, 0.16, 'head']];

  function fire() {
    st.shots++;
    st.mag--;
    camera.getWorldPosition(O);
    // Through the crosshair, which may have been dragged off the screen centre.
    const n = aimNdc?.();
    if (n && (n.x || n.y)) D.set(n.x, n.y, 0.5).unproject(camera).sub(O).normalize();
    else camera.getWorldDirection(D);
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
    hostiles.hear?.(player.position);
    if (best) {
      st.hits++;
      hostiles.hit(best, part === 'head' ? HEAD_DAMAGE : SHOT_DAMAGE, player.position);
      st.hitMark = 0.15;
    }
  }

  // A punch, kick or slash lands on the nearest guard in front, within reach.
  function punch(kind = 'punch') {
    const M = MELEE[kind] ?? MELEE.punch;
    const pp = player.position, f = player.facing;
    let best = null, bestD = M.reach;
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
    if (kind === 'slash') fx.swish?.();
    if (!best) return;
    fx.punch();
    if (hostiles.canTakeDown(best, pp)) {
      hostiles.knockOut(best, pp);
      st.takedowns++;
    } else hostiles.hit(best, M.damage, pp);
  }

  function hurt(damage) {
    if (player.state.disabled || st.invulnerable) return;
    st.health = Math.max(0, st.health - damage);
    st.sinceHit = 0;
    st.hurt = 1;
    if (st.health <= 0) {
      player.state.disabled = true;
      hostiles.reset();
      onDown?.();
    }
  }

  function startReload() {
    if (st.reload > 0 || st.mag >= RULES.magazine || st.reserve <= 0) return;
    st.reload = RULES.reloadTime;
    fx.reload();
    st.burstLeft = 0;
  }

  function update(dt, input) {
    st.sinceHit += dt;
    if (input?.consumeReload?.()) startReload();
    if (st.reload > 0) {
      st.reload -= dt;
      if (st.reload <= 0) {
        const n = Math.min(RULES.magazine - st.mag, st.reserve);
        st.mag += n;
        st.reserve -= n;
        st.reload = 0;
      }
    }
    const firing = input ? input.state.fire : player.state.aiming;
    // Each press queues a round, even a tap too short to be seen in a frame
    // (the rifle comes up first; letting go never cuts a round short).
    const gun = (input?.state.weapon ?? 'gun') === 'gun';
    let presses = input?.state.firePresses ?? 0;
    if (input) input.state.firePresses = 0;
    if (!presses && firing && !lastFire) presses = 1;   // test hook: held without a press event
    lastFire = firing;
    if (!gun || (st.mag <= 0 && st.reserve <= 0) || player.state.disabled || player.state.mode !== 'ground') st.queued = 0;
    else if (presses) st.queued = Math.min(MAX_QUEUED, (st.queued ?? 0) + presses);
    player.state.holdAim = st.queued > 0 || st.burstLeft > 0;
    const wants = firing || st.queued > 0 || st.burstLeft > 0;
    st.cooldown -= dt;
    if (st.burstLeft > 0 && !player.state.aiming) { st.burstLeft = 0; st.cooldown = BURST_GAP; }
    // A new round from a press may start sooner than one from holding Fire.
    const ready = st.burstLeft <= 0 && st.queued > 0 ? st.cooldown <= BURST_GAP - TAP_GAP : st.cooldown <= 0;
    if (wants && player.state.aiming && player.aimWeight > 0.35 && ready && st.reload <= 0) {
      if (st.mag <= 0) startReload();   // empty: reload automatically, the press waits
      else {
        if (st.burstLeft <= 0) { st.burstLeft = BURST; if (st.queued > 0) st.queued--; }
        fire();
        st.burstLeft--;
        st.cooldown = st.burstLeft > 0 ? BULLET_GAP : BURST_GAP;
        if (st.mag <= 0) { st.burstLeft = 0; startReload(); }
      }
    }
    if (player.state.strike) {
      const kind = player.state.strike;
      player.state.strike = false;
      punch(typeof kind === 'string' ? kind : 'punch');
    }

    // Takedown hint when standing behind an unaware guard.
    let near = false;
    for (const u of hostiles.units) {
      if (u.state !== 'down' && u.model.position.distanceTo(player.position) < 2.6 && hostiles.canTakeDown(u, player.position)) { near = true; break; }
    }
    // On phones the Interact button offers the takedown instead.
    st.takedownNear = near && !player.state.disabled;
    ui.prompt.hidden = !near || player.state.disabled || isTouch;
    if (near && !isTouch) ui.prompt.textContent = 'E: takedown';

    ui.cross.hidden = !player.state.aiming;
    st.hitMark -= dt;
    ui.cross.classList.toggle('hit', st.hitMark > 0);
    st.hurt = Math.max(0, st.hurt - dt * 2.5);
    ui.hurt.style.opacity = Math.max(st.hurt * 0.8, st.health < 35 ? 0.35 : 0).toFixed(2);
    // The bar covers 0-200; the first half is the normal 100.
    ui.fill.style.width = `${(st.health / MAX_HEALTH) * 100}%`;
    ui.fill.style.background = st.health < 35 ? '#e0533a' : st.health > 100 ? '#4fd08a' : '#6fcf5a';
    if (ui.hp) ui.hp.textContent = Math.ceil(st.health);
    if (ui.ammo) ui.ammo.textContent = st.reload > 0 ? 'Reloading…' : `${st.mag} / ${st.reserve}`;
    fx.update(dt);
  }

  // First-aid: +10 HP, also above 100 (to 200). Returns false only at 200.
  function heal(amount) {
    if (player.state.disabled || st.health >= MAX_HEALTH) return false;
    st.health = Math.min(MAX_HEALTH, st.health + amount);
    return true;
  }
  function addAmmo(n) { st.reserve += n; return true; }

  return { update, hurt, heal, addAmmo, startReload, stats: st };
}
