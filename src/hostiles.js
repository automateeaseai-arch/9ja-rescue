// Hostiles: fifteen per mission (owner, 14 Oct; the plan had ten). The mission
// gives each a place with `configure(roster)`: seven roam patrol beats between
// the arrival and the captive site, eight defend the site. The ten character
// models are shared (models 11-15 are copies of 1-5).
// Every hostile has 10 HP; each hit on the player does 20 HP. At most two
// fire at once, so a group can't drop the player in an instant. Site
// defenders give up a chase that leads too far from the site.
//
// Guards stand at their post looking around. They only notice the player
// in front of them (a 120° view cone, clear line of sight, within 28 m, or
// 14 m while the player crouches);
// noticing takes a moment, shown by "?" turning to "!". Anyone behind them
// goes unseen, so they can be taken down with a punch from behind. Once
// alerted they chase, stop with a clear shot and fire rounds of 3 bullets
// 0.4 s apart; if they lose
// the player they search the last place they saw them, then go back to their
// post. Gunshots are heard up to 45 m: within 18 m the guard attacks, further
// away they come to look. When a guard is hit, every guard within 12 m is alerted at once and
// attacks too. Knocked-out guards play Meshy's knock-down (hit from the
// front) or fall-forward (from behind) clip. Each has a capsule collider and walks with a character controller,
// so they can't pass through walls, rocks or the player.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGlb, makeInPlace } from './player.js';
import { loadSharedAnims, retarget, upperBody, lowerBody } from './anims.js';
import { groundHeight } from './world.js';
import { AI, RULES } from './config.js';

const HOSTILES = [
  { name: 'Olive Jacket', url: 'models/hostiles/Hostile_North_01_OliveJacket.glb' },
  { name: 'Dark Robe', url: 'models/hostiles/Hostile_North_02_DarkRobe.glb' },
  { name: 'Black Scarf', url: 'models/hostiles/Hostile_North_03_BlackScarf.glb' },
  { name: 'Sand Robe', url: 'models/hostiles/Hostile_North_04_SandRobe.glb' },
  { name: 'Brown Shirt', url: 'models/hostiles/Hostile_North_05_BrownShirt.glb' },
  { name: 'Red Polo', url: 'models/hostiles/Hostile_South_01_RedPolo.glb' },
  { name: 'Denim Vest', url: 'models/hostiles/Hostile_South_02_DenimVest.glb' },
  { name: 'Blue Headwrap', url: 'models/hostiles/Hostile_South_03_BlueHeadwrap.glb' },
  { name: 'Balaclava', url: 'models/hostiles/Hostile_South_04_Balaclava.glb' },
  { name: 'Navy Polo', url: 'models/hostiles/Hostile_South_05_NavyPolo.glb' },
];

export const VIEW_RANGE = AI.viewRange;    // metres
export const VIEW_COS = Math.cos(THREE.MathUtils.degToRad(AI.viewHalfAngle)); // half-angle of the view cone
const CROUCH_VIEW = AI.crouchView;         // crouching halves how far away they notice the player
const ALERT_RADIUS = AI.alertRadius;       // a hit alerts every guard this close
const SHOOT_RANGE = AI.shootRange;         // stop and shoot within this distance
const BURST = AI.burst, BULLET_GAP = AI.bulletGap, BURST_GAP = AI.burstGap; // rounds of 3 bullets, 0.4 s between rounds
const WALK = AI.walk, RUN = AI.run;        // the player runs at 5, so they can be outrun
const ACTIVE_RANGE = 140;                  // guards further away are frozen (saves work)
const HALF = 0.55, RADIUS = 0.3, FOOT = HALF + RADIUS;
export const MAX_HEALTH = RULES.hostileHealth;

function markTexture(ch, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(20,12,8,0.9)';
  g.strokeText(ch, 32, 34);
  g.fillStyle = color;
  g.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// opts: heightAt, physics, fx, onShootPlayer(damage, fromPos), onDefeated(unit),
// site: { x, z } (centre the defenders stay near)
export function spawnHostiles(scene, opts = {}) {
  const heightAt = opts.heightAt ?? ((x, z) => groundHeight(x, z));
  const { physics, fx } = opts;
  const units = [];
  const marks = { query: markTexture('?', '#ffd23c'), alert: markTexture('!', '#ff4a2a') };
  const controller = physics.createCharacterController(0.02);
  controller.enableAutostep(0.45, 0.25, true);
  controller.enableSnapToGround(0.4);
  controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(50));

  (async () => {
    const shared = await loadSharedAnims();
    const files = new Map();
    for (let i = 0; i < RULES.roamers + RULES.defenders; i++) {
      try {
        const def = HOSTILES[i % HOSTILES.length];
        if (!files.has(def.url)) files.set(def.url, await loadGlb(def.url));
        const gltf = files.get(def.url);
        const model = cloneSkinned(gltf.scene);
        model.rotation.order = 'YXZ'; // so the fall tilts in the model's own frame
        model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
        // Out of the way until the mission places them.
        const x = -6 + i * 3, z = -400, yaw = 0;
        const y = heightAt(x, z);
        model.position.set(x, y, z);
        model.rotation.y = yaw;
        scene.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const clip = (n) => gltf.animations.find((c) => c.name === n);
        const idleClip = retarget(shared.idle, model);
        const a = {
          idle: mixer.clipAction(idleClip),
          idleLegs: mixer.clipAction(lowerBody(idleClip)),
          aim: mixer.clipAction(upperBody(retarget(shared.shoot, model))),
          walk: mixer.clipAction(makeInPlace(clip('Walk').clone())),
          run: mixer.clipAction(makeInPlace(clip('Run').clone())),
          knockDown: mixer.clipAction(retarget(shared.knockDown, model, 'keep')),
          fallForward: mixer.clipAction(retarget(shared.fallForward, model, 'keep')),
        };
        for (const act of Object.values(a)) { act.play(); act.setEffectiveWeight(0); }
        for (const act of [a.knockDown, a.fallForward]) { act.stop(); act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; }
        a.idle.setEffectiveWeight(1);
        a.idle.time = (i * 0.37) % a.idle.getClip().duration;
        let hand = null;
        model.traverse((o) => { if (o.name === 'RightHand') hand = o; });

        const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: marks.query, transparent: true, depthWrite: false, fog: false }));
        mark.scale.setScalar(0.55);
        mark.visible = false;
        scene.add(mark);

        const u = {
          index: i, name: def.name, model, mixer, a, hand, body: null, collider: null, mark,
          post: new THREE.Vector3(x, y, z), postYaw: yaw, phase: i * 1.7,
          health: MAX_HEALTH, state: 'guard', awareness: 0, lastSeen: new THREE.Vector3(),
          sinceSeen: 99, seen: false, losTimer: i * 0.02, burst: 0, shotTimer: 1 + i * 0.13,
          speed: 0, aimW: 0, flinch: 0, stagger: 0, fall: 0, fallDir: 1, vy: 0, active: false,
          stuck: 0, side: 0, lastPos: new THREE.Vector3(x, y, z), staggerCd: 0,
          id: null, group: null, patrol: null, beat: 0, wait: 0, shooter: false,
        };
        units.push(u);
        if (roster[i]) place(u, roster[i]);
      } catch (err) {
        console.error(err);
      }
    }
  })();

  // The mission's roster: [{ id, group: 'roam'|'site', post: [x, z, yaw],
  // patrol: [[x, z], [x, z]] | null, hp?, down?, at?: [x, z] }] by model index.
  let roster = [];
  function makeBody(u, x, y, z) {
    if (u.body) physics.removeRigidBody(u.body);
    u.body = physics.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + FOOT + 0.05, z));
    u.collider = physics.createCollider(RAPIER.ColliderDesc.capsule(HALF, RADIUS), u.body);
  }
  function place(u, r) {
    const [px, pz, yaw = 0] = r.post;
    const [x, z] = r.at ?? [px, pz];
    const y = heightAt(x, z);
    Object.assign(u, {
      id: r.id, group: r.group, patrol: r.patrol ?? null, beat: 0, wait: 0,
      post: new THREE.Vector3(px, heightAt(px, pz), pz), postYaw: yaw,
      health: r.hp ?? MAX_HEALTH, awareness: 0, sinceSeen: 99, seen: false, burst: 0, shotTimer: 1,
      speed: 0, aimW: 0, flinch: 0, stagger: 0, staggerCd: 0, vy: 0, active: false, stuck: 0, side: 0,
    });
    u.model.position.set(x, y, z);
    u.model.rotation.set(0, yaw, 0);
    u.model.visible = true;
    u.mark.visible = false;
    for (const act of Object.values(u.a)) { act.setEffectiveWeight(0); }
    u.a.knockDown.stop(); u.a.fallForward.stop();
    if (r.down) {
      // Already defeated: lying where they fell.
      u.state = 'down';
      u.health = 0;
      if (u.body) { physics.removeRigidBody(u.body); u.body = null; }
      const fall = u.a.knockDown;
      fall.reset().play();
      fall.setEffectiveWeight(1);
      fall.time = fall.getClip().duration;
      u.fall = 3;
      u.mixer.update(0);
      return;
    }
    u.state = 'guard';
    u.fall = 0;
    u.a.idle.setEffectiveWeight(1);
    makeBody(u, x, y, z);
  }
  function configure(list) {
    roster = list;
    for (const u of units) if (roster[u.index]) place(u, roster[u.index]);
  }

  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const v = new THREE.Vector3(), toP = new THREE.Vector3(), muzzle = new THREE.Vector3(), aimAt = new THREE.Vector3();

  // Clear view between two points (walls, rocks, trees and ground block it; people don't).
  function clearLine(from, to) {
    v.subVectors(to, from);
    const d = v.length();
    if (d < 0.01) return true;
    v.divideScalar(d);
    ray.origin = { x: from.x, y: from.y, z: from.z };
    ray.dir = { x: v.x, y: v.y, z: v.z };
    return !physics.castRay(ray, d - 0.2, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
  }

  const eye = new THREE.Vector3(), chest = new THREE.Vector3();
  function canSee(u, playerPos) {
    eye.copy(u.model.position).y += 1.6;
    chest.copy(playerPos).y += 1.2;
    return clearLine(eye, chest);
  }

  let viewK = 1;
  // Is the player inside this guard's view cone (ignoring walls)?
  function inFront(u, playerPos) {
    toP.subVectors(playerPos, u.model.position).setY(0);
    const d = toP.length();
    if (d > VIEW_RANGE * viewK) return false;
    if (d < 0.01) return true;
    const yaw = u.model.rotation.y;
    return (Math.sin(yaw) * toP.x + Math.cos(yaw) * toP.z) / d > VIEW_COS;
  }

  function alert(u, playerPos) {
    if (u.state === 'down' || !u.body) return;
    if (u.state !== 'alert') u.shotTimer = AI.reaction; // a moment to raise the rifle
    u.state = 'alert';
    u.awareness = 1;
    u.sinceSeen = 0;
    u.lastSeen.copy(playerPos);
  }

  const left0 = (u) => Math.hypot(u.heard.x - u.model.position.x, u.heard.z - u.model.position.z);

  // A gunshot at `pos`: guards close by know where it came from and attack;
  // further away they come to look (and attack if they see the player).
  function hear(pos, radius = AI.hearShot) {
    for (const u of units) {
      if (u.state === 'down' || u.state === 'alert' || !u.body) continue;
      const d = u.model.position.distanceTo(pos);
      if (d > radius) continue;
      if (d < AI.hearAlert) { alert(u, pos); continue; }
      u.state = 'investigate';
      u.heard = (u.heard ?? new THREE.Vector3()).set(pos.x + (Math.random() - 0.5) * 6, pos.y, pos.z + (Math.random() - 0.5) * 6);
      u.investigate = AI.investigateTime;
      u.awareness = Math.max(u.awareness, 0.5);
    }
  }

  // Every other guard close by hears it and comes for the player.
  function alertNearby(u, playerPos) {
    for (const o of units) {
      if (o !== u && o.state !== 'down' && o.model.position.distanceTo(u.model.position) < ALERT_RADIUS) alert(o, playerPos);
    }
  }

  // fromPos: where the blow came from (sets the fall direction);
  // playerPos: where the guards nearby will look for the player.
  function knockOut(u, fromPos, playerPos = fromPos) {
    u.state = 'down';
    u.health = 0;
    u.fall = 0.001;
    // Fall away from the blow: forwards if hit from behind, backwards if from the front.
    toP.subVectors(fromPos, u.model.position);
    const yaw = u.model.rotation.y;
    const fromFront = Math.sin(yaw) * toP.x + Math.cos(yaw) * toP.z > 0;
    u.model.rotation.x = 0;
    for (const act of Object.values(u.a)) act.setEffectiveWeight(0);
    const fall = fromFront ? u.a.knockDown : u.a.fallForward;
    fall.reset().play();
    fall.setEffectiveWeight(1);
    u.mark.visible = false;
    alertNearby(u, playerPos);
    if (u.body) physics.removeRigidBody(u.body); // the player can step over them
    u.body = null;
    opts.onDefeated?.(u);
  }

  function face(u, x, z, dt, rate = 8) {
    const target = Math.atan2(x - u.model.position.x, z - u.model.position.z);
    let diff = target - u.model.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    u.model.rotation.y += diff * Math.min(1, dt * rate);
  }

  // Walks the guard's capsule towards (tx, tz) at `speed`; returns distance left.
  function moveTowards(u, tx, tz, speed, dt) {
    const p = u.body.translation();
    let dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) { dx /= d; dz /= d; }
    // Sidestep for a moment if stuck against something.
    if (u.side) { const s = u.side > 0 ? 1 : -1; [dx, dz] = [dx * 0.4 + dz * s, dz * 0.4 - dx * s]; }
    const step = Math.min(speed * dt, d);
    u.vy = Math.max(-20, u.vy - 18 * dt);
    controller.computeColliderMovement(u.collider, { x: dx * step, y: u.vy * dt, z: dz * step });
    const m = controller.computedMovement();
    if (controller.computedGrounded()) u.vy = -1;
    const next = { x: p.x + m.x, y: p.y + m.y, z: p.z + m.z };
    // Safety net: never sink below the ground.
    const g = heightAt(next.x, next.z, p.y - FOOT);
    if (next.y - FOOT < g - 1.5) next.y = g + FOOT + 0.05;
    u.body.setNextKinematicTranslation(next);
    u.model.position.set(next.x, next.y - FOOT, next.z);
    if (speed > 0) face(u, u.model.position.x + dx, u.model.position.z + dz, dt, 6);
    // Stuck check.
    const moved = Math.hypot(m.x, m.z) / Math.max(dt, 1e-3);
    u.stuck = moved < speed * 0.25 && d > 1 ? u.stuck + dt : 0;
    if (u.stuck > 0.8) { u.side = (Math.random() < 0.5 ? -1 : 1) * 1.0; u.stuck = 0; }
    if (u.side) u.side -= Math.sign(u.side) * dt;
    if (Math.abs(u.side) < 0.05) u.side = 0;
    return d;
  }

  function shoot(u, player) {
    if (u.hand) u.hand.getWorldPosition(muzzle);
    else muzzle.copy(u.model.position).y += 1.4;
    const yaw = u.model.rotation.y;
    muzzle.x += Math.sin(yaw) * 0.5;
    muzzle.z += Math.cos(yaw) * 0.5;
    const d = u.model.position.distanceTo(player.position);
    // Harder to hit at range and when the player runs. At most one bullet of
    // a round can hit (decided when the round starts).
    if (u.burst === 0) {
      let chance = THREE.MathUtils.clamp(AI.hitChanceNear - d * AI.hitFalloff, AI.hitChanceFar, AI.hitChanceNear);
      if (player.speed > 3) chance *= AI.runningFactor;
      u.hitBullet = Math.random() < chance ? Math.floor(Math.random() * BURST) : -1;
    }
    const hit = u.burst === u.hitBullet;
    aimAt.copy(player.position).y += 1.1 + (hit ? 0 : (Math.random() - 0.3) * 1.2);
    if (!hit) {
      aimAt.x += (Math.random() - 0.5) * 2;
      aimAt.z += (Math.random() - 0.5) * 2;
    }
    fx.flash(muzzle);
    fx.tracer(muzzle, aimAt);
    fx.gunshot(d);
    if (hit) opts.onShootPlayer?.(RULES.hostileBulletDamage, u.model.position);
  }

  function update(dt, player) {
    const pp = player.position;
    const playerDown = player.state.disabled;
    viewK = player.crouching ? CROUCH_VIEW : 1;
    // Fair spacing: only the nearest few with a clear shot may fire.
    const ready = units.filter((u) => u.state === 'alert' && u.seen && u.body).sort((a, b) => a.model.position.distanceToSquared(pp) - b.model.position.distanceToSquared(pp));
    for (const u of units) u.shooter = false;
    for (const u of ready.slice(0, AI.maxShooters)) u.shooter = true;
    for (const u of units) {
      if (!u.body && u.state !== 'down') continue;   // not placed by a mission
      const dist = u.model.position.distanceTo(pp);
      if (u.state === 'down') {
        // Play the fall once, then stay still.
        if (u.fall < 3) { u.fall += dt; u.mixer.update(dt); }
        continue;
      }
      const active = dist < ACTIVE_RANGE;
      if (!active) { u.active = false; continue; }
      if (!u.active) {
        // Waking up (e.g. after the valley finished building): settle on the ground.
        u.active = true;
        const p = u.body.translation();
        const g = heightAt(p.x, p.z);
        u.body.setTranslation({ x: p.x, y: g + FOOT + 0.05, z: p.z }, true);
        u.model.position.set(p.x, g, p.z);
      }

      // Sight checks a few times a second.
      u.losTimer -= dt;
      if (u.losTimer <= 0) {
        u.losTimer = 0.15;
        u.seen = !playerDown && (u.state === 'alert' ? dist < VIEW_RANGE * 1.5 : inFront(u, pp)) && canSee(u, pp);
      }
      if (u.seen) { u.sinceSeen = 0; u.lastSeen.copy(pp); } else u.sinceSeen += dt;

      if (u.state !== 'alert') {
        if (u.seen) {
          // Closer means quicker to notice; right in front is immediate.
          u.awareness += dt * (dist < 4 ? 10 : THREE.MathUtils.mapLinear(dist, 4, VIEW_RANGE, 2.2, 0.6));
          if (u.awareness >= 1) alert(u, pp);
        } else u.awareness = Math.max(0, u.awareness - dt * 0.25);
      }
      if (playerDown && u.state === 'alert') { u.state = 'return'; u.awareness = 0; }

      let speed = 0, shooting = false;
      u.stagger = Math.max(0, u.stagger - dt);
      u.staggerCd = Math.max(0, u.staggerCd - dt);
      if (u.state === 'alert') {
        if (u.seen && dist < SHOOT_RANGE) {
          shooting = true;
          face(u, pp.x, pp.z, dt, 10);
          moveTowards(u, u.model.position.x, u.model.position.z, 0, dt); // keep gravity and grounding
          if (u.stagger <= 0 && u.shooter) {
            u.shotTimer -= dt;
            if (u.shotTimer <= 0) {
              shoot(u, player);
              u.burst++;
              if (u.burst >= BURST) { u.burst = 0; u.shotTimer = BURST_GAP; } else u.shotTimer = BULLET_GAP;
            }
          }
        } else {
          speed = u.stagger > 0 ? 0 : RUN;
          const left = moveTowards(u, u.lastSeen.x, u.lastSeen.z, speed, dt);
          if (left < 1.2) speed = 0;
          if (u.sinceSeen > AI.searchTime) { u.state = 'return'; u.awareness = 0.4; }
        }
        // Site defenders don't follow the player across the map.
        if (u.group === 'site' && opts.site && Math.hypot(u.model.position.x - opts.site.x, u.model.position.z - opts.site.z) > AI.siteLeash) {
          u.state = 'return'; u.awareness = 0.4;
        }
      } else if (u.state === 'investigate') {
        // Heard a shot: walk briskly to where it came from and look around.
        u.awareness = Math.max(u.awareness, 0.35);
        u.investigate -= dt;
        const left = moveTowards(u, u.heard.x, u.heard.z, left0(u) > 2 ? (WALK + RUN) / 2 : 0, dt);
        speed = left > 2 ? (WALK + RUN) / 2 : 0;
        if (speed === 0) u.model.rotation.y += Math.sin(performance.now() / 600 + u.phase) * dt * 1.4;
        const far = u.group === 'site' && opts.site && Math.hypot(u.model.position.x - opts.site.x, u.model.position.z - opts.site.z) > AI.siteLeash;
        if (u.investigate <= 0 || far) { u.state = 'return'; u.awareness = 0.2; }
      } else if (u.state === 'return') {
        speed = WALK;
        if (moveTowards(u, u.post.x, u.post.z, speed, dt) < 0.4) { u.state = 'guard'; speed = 0; }
      } else if (u.patrol && u.awareness < 0.3) {
        // Roaming: walk the beat, pausing at each end to look around.
        const [tx, tz] = u.patrol[u.beat];
        if (u.wait > 0) {
          u.wait -= dt;
          moveTowards(u, u.model.position.x, u.model.position.z, 0, dt);
          u.model.rotation.y += Math.sin(performance.now() / 700 + u.phase) * dt * 0.8;
        } else {
          speed = WALK;
          if (moveTowards(u, tx, tz, speed, dt) < 0.6) { u.beat = 1 - u.beat; u.wait = 3; speed = 0; }
        }
      } else {
        // On guard: slowly look left and right around their post's direction.
        moveTowards(u, u.model.position.x, u.model.position.z, 0, dt);
        const t = performance.now() / 1000;
        const look = u.postYaw + Math.sin(t * 0.35 + u.phase) * 0.7;
        let diff = look - u.model.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        u.model.rotation.y += diff * Math.min(1, dt * 2);
        // Turn towards the player while noticing them.
        if (u.awareness > 0.3 && u.seen) face(u, pp.x, pp.z, dt, 2);
      }

      // Hit reaction: a short jolt backwards.
      u.flinch = Math.max(0, u.flinch - dt * 4);
      u.model.rotation.x = -u.flinch * 0.25;

      // Animation weights.
      u.speed = THREE.MathUtils.damp(u.speed, speed, 8, dt);
      const runW = THREE.MathUtils.clamp((u.speed - WALK) / (RUN - WALK), 0, 1);
      const walkW = THREE.MathUtils.clamp(u.speed / WALK, 0, 1) * (1 - runW);
      const idleW = Math.max(0, 1 - walkW - runW);
      u.aimW = THREE.MathUtils.damp(u.aimW, shooting || (u.state === 'alert' && u.speed < 0.5) ? 1 : 0, 6, dt);
      u.a.idle.setEffectiveWeight(idleW * (1 - u.aimW));
      u.a.idleLegs.setEffectiveWeight(idleW * u.aimW);
      u.a.aim.setEffectiveWeight(idleW * u.aimW);
      u.a.walk.setEffectiveWeight(walkW);
      u.a.run.setEffectiveWeight(runW);
      u.mixer.update(dt);

      // "?" while noticing, "!" when alerted.
      const show = u.state === 'alert' ? 'alert' : u.awareness > 0.08 ? 'query' : null;
      u.mark.visible = !!show && dist < 60;
      if (show) {
        u.mark.material.map = marks[show];
        u.mark.position.copy(u.model.position).y += 2.25;
      }
    }
  }

  return {
    // The captive site the defenders stay near (it changes per mission).
    setSite(site) { opts.site = site; },
    units,
    update,
    configure,
    // Damage from the player. `kind` is 'shot' or 'punch'.
    hit(u, damage, fromPos, playerPos = fromPos) {
      if (u.state === 'down') return;
      u.health -= damage;
      if (u.health <= 0) { knockOut(u, fromPos, playerPos); return; }
      // A brief flinch, but not again straight away (no stun lock).
      u.flinch = 1;
      if (u.staggerCd <= 0) { u.stagger = 0.35; u.staggerCd = 1.5; }
      alert(u, playerPos);
      alertNearby(u, playerPos);
    },
    alertTo: (u, playerPos) => alert(u, playerPos),
    hear,
    knockOut,
    // A takedown works on a guard who hasn't noticed the player and is
    // facing away (the player is outside their view cone).
    canTakeDown(u, playerPos) {
      return u.state !== 'down' && u.state !== 'alert' && !inFront(u, playerPos);
    },
    clearLine,
    // After the player is knocked out: everyone goes back to their post.
    reset() {
      for (const u of units) if (u.state !== 'down') { u.state = 'return'; u.awareness = 0; }
    },
  };
}
