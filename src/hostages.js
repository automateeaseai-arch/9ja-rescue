// Captives for the mission (game plan v2.2). Only the one or two persona
// models this mission needs are loaded. Each captive moves through the
// states bound → discovered → following → boarding → boarded → departed.
// Bound captives sit and call "Help!" when the player is near; the mission
// frees them (Interact) once the site is clear. Followers walk the player's
// own path (a breadcrumb trail), so they use the same doors and bridges;
// they crouch and wait while hostiles are fighting nearby, can't be hurt,
// and if one falls far behind out of danger they catch up on the trail.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGlb, makeInPlace } from './player.js';
import { loadSharedAnims, retarget } from './anims.js';

export const PERSONAS = [
  { name: 'Bus Driver', url: 'models/hostages/Hostage_01_BusDriver.glb' },
  { name: 'Cassava Trader', url: 'models/hostages/Hostage_02_CassavaTrader.glb' },
  { name: 'Lecturer', url: 'models/hostages/Hostage_03_Lecturer.glb' },
  { name: 'Doctor', url: 'models/hostages/Hostage_04_Doctor.glb' },
  { name: 'Civil Service Director', url: 'models/hostages/Hostage_05_CivilServiceDirector.glb' },
  { name: 'NYSC corps member (female)', url: 'models/hostages/Hostage_06_NYSC_Female.glb' },
  { name: 'NYSC corps member (male)', url: 'models/hostages/Hostage_07_NYSC_Male.glb' },
  { name: 'Student', url: 'models/hostages/Hostage_08_Student.glb' },
  { name: 'Kano gold seller', url: 'models/hostages/Hostage_09_KanoGoldSeller.glb' },
  { name: 'Businessman', url: 'models/hostages/Hostage_10_Businessman.glb' },
];

const GAP = 1.7;          // metres between people in the line
const WALK_SPEED = 1.7;
const RUN_SPEED = 4.5;
const HELP_RANGE = 35;    // calls for help are heard this far
const DISCOVER = 8;       // close enough to be found
const DANGER = 25;        // fighting this close sends followers into cover

function bubbleTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.roundRect(6, 6, 116, 40, 14);
  g.moveTo(52, 44); g.lineTo(64, 60); g.lineTo(72, 44);
  g.fill();
  g.font = 'bold 26px system-ui, sans-serif';
  g.fillStyle = '#c0281c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Help!', 64, 27);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// opts: heightAt(x, z, yHint), onDiscover(captive)
export function createCaptives(scene, { heightAt, onDiscover }) {
  const units = [];
  const bubbleMat = new THREE.SpriteMaterial({ map: bubbleTexture(), transparent: true, depthTest: false, depthWrite: false, fog: false });
  let shared = null;
  let token = 0;

  function remove() {
    for (const u of units) { scene.remove(u.model); scene.remove(u.bubble); }
    units.length = 0;
  }

  // list: [{ id, persona, x, z, yaw, state }]; `near` places followers behind it.
  async function configure(list, near) {
    const my = ++token;
    remove();
    shared = shared ?? await loadSharedAnims();
    const loaded = await Promise.all(list.map((c) => loadGlb(PERSONAS[c.persona].url).catch((err) => { console.error(err); return null; })));
    if (my !== token) return;   // replaced by a newer setup meanwhile
    list.forEach((c, i) => {
      const gltf = loaded[i];
      if (!gltf) return;
      const model = cloneSkinned(gltf.scene);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      scene.add(model);
      const mixer = new THREE.AnimationMixer(model);
      const clip = (n) => gltf.animations.find((a) => a.name === n);
      const actions = {
        idle: mixer.clipAction(retarget(shared.idle, model)),
        sit: mixer.clipAction(retarget(shared.sit, model)),
        crouch: mixer.clipAction(retarget(shared.crouchIdle, model)),
        walk: mixer.clipAction(makeInPlace(clip('Walk'))),
        run: mixer.clipAction(makeInPlace(clip('Run'))),
      };
      for (const a of Object.values(actions)) { a.play(); a.setEffectiveWeight(0); }
      const bubble = new THREE.Sprite(bubbleMat);
      bubble.scale.set(1.1, 0.55, 1);
      bubble.renderOrder = 10;
      bubble.visible = false;
      scene.add(bubble);
      const u = {
        id: c.id, persona: c.persona, name: PERSONAS[c.persona].name, model, mixer, actions, bubble,
        state: c.state ?? 'bound', speed: 0, sitW: 1, crouchW: 0, cover: 0, behind: 0, destination: null,
        home: new THREE.Vector3(c.x, 0, c.z), homeYaw: c.yaw ?? 0, order: 0,
      };
      units.push(u);
      reset(u, near);
    });
  }

  // Places a captive for its state (used on setup and checkpoint restore).
  function reset(u, near) {
    u.destination = null;
    u.speed = 0;
    u.model.visible = !['boarded', 'departed'].includes(u.state);
    if (u.state === 'bound' || u.state === 'discovered') {
      u.model.position.set(u.home.x, heightAt(u.home.x, u.home.z, 3), u.home.z);
      u.model.rotation.y = u.homeYaw;
      u.sitW = 1;
    } else if (near) {
      // Following (or about to board): just behind the player.
      const k = followers().indexOf(u);
      u.model.position.set(near.x - 1.2 - k * 1.2, heightAt(near.x - 1.2 - k * 1.2, near.z, near.y + 1), near.z);
      u.sitW = 0;
    }
    trail.length = 0;
  }

  const followers = () => units.filter((u) => u.state === 'following').sort((a, b) => a.order - b.order);

  // The player's path: points every 0.7 m with distance along the trail.
  const trail = [];
  function record(p) {
    const last = trail[trail.length - 1];
    if (last && Math.hypot(p.x - last.x, p.z - last.z) < 0.7) return;
    const d = last ? last.d + Math.hypot(p.x - last.x, p.z - last.z) : 0;
    trail.push({ x: p.x, y: p.y, z: p.z, d });
    if (trail.length > 600) trail.shift();
  }
  const at = new THREE.Vector3();
  function trailPoint(dist) {
    // Point on the trail `dist` metres behind the newest point.
    if (!trail.length) return null;
    const want = trail[trail.length - 1].d - dist;
    if (want <= trail[0].d) return at.set(trail[0].x, trail[0].y, trail[0].z);
    for (let i = trail.length - 1; i > 0; i--) {
      if (trail[i - 1].d <= want) {
        const a = trail[i - 1], b = trail[i], t = (want - a.d) / Math.max(1e-6, b.d - a.d);
        return at.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
      }
    }
    return at.set(trail[0].x, trail[0].y, trail[0].z);
  }

  const delta = new THREE.Vector3();
  function walkTo(u, target, dt, gap) {
    delta.subVectors(target, u.model.position).setY(0);
    const dist = delta.length();
    const want = dist > gap ? (dist > 4 ? RUN_SPEED : WALK_SPEED) : 0;
    u.speed = THREE.MathUtils.damp(u.speed, want, 8, dt);
    if (dist > 0.01) {
      u.model.position.addScaledVector(delta.normalize(), Math.min(u.speed * dt, Math.max(0, dist - gap * 0.5)));
      if (u.speed > 0.2) u.model.rotation.y = Math.atan2(delta.x, delta.z);
    }
    u.model.position.y = heightAt(u.model.position.x, u.model.position.z, u.model.position.y + 0.5);
    return dist;
  }

  function update(dt, player, hostiles) {
    const pp = player.position;
    record(pp);
    const t = performance.now() / 1000;
    for (const u of units) {
      // Calls for help from bound captives.
      const d = u.model.position.distanceTo(pp);
      const waiting = u.state === 'bound' || u.state === 'discovered';
      u.bubble.visible = waiting && d < HELP_RANGE;
      if (u.bubble.visible) u.bubble.position.copy(u.model.position).y += 2.0 + Math.sin(t * 3 + u.order) * 0.08;
      if (u.state === 'bound' && d < DISCOVER) { u.state = 'discovered'; onDiscover?.(u); }
    }

    // Followers walk the trail behind the player, one gap apart.
    const line = followers();
    line.forEach((u, k) => {
      // Fighting nearby: crouch in place and wait.
      let danger = false;
      for (const h of hostiles.units) {
        if (h.state === 'alert' && h.model.position.distanceTo(u.model.position) < DANGER) { danger = true; break; }
      }
      u.cover = danger ? 1.5 : Math.max(0, u.cover - dt);
      if (u.cover > 0) { u.speed = THREE.MathUtils.damp(u.speed, 0, 8, dt); return; }
      const target = trailPoint(GAP * (k + 1)) ?? pp;
      walkTo(u, target, dt, 0.3);
      // Far behind and out of danger: catch up along the trail.
      u.behind = u.model.position.distanceTo(pp) > 30 ? u.behind + dt : 0;
      if (u.behind > 5) {
        const p = trailPoint(5 + GAP * k);
        if (p) u.model.position.set(p.x, heightAt(p.x, p.z, p.y + 0.5), p.z);
        u.behind = 0;
      }
    });

    // Captives heading to a set point (boarding the DSS van).
    for (const u of units) {
      if (!u.destination) continue;
      const left = walkTo(u, u.destination.point, dt, 0);
      if (left < 0.45) {
        const done = u.destination.onArrive;
        u.destination = null;
        u.speed = 0;
        done?.(u);
      }
    }

    for (const u of units) {
      if (!u.model.visible) continue;
      const s = u.speed;
      const runW = THREE.MathUtils.clamp((s - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
      const walkW = THREE.MathUtils.clamp(s / WALK_SPEED, 0, 1) * (1 - runW);
      u.sitW = THREE.MathUtils.damp(u.sitW, u.state === 'bound' || u.state === 'discovered' ? 1 : 0, 5, dt);
      u.crouchW = THREE.MathUtils.damp(u.crouchW, u.cover > 0 ? 1 : 0, 6, dt);
      const standW = Math.max(0, 1 - walkW - runW);
      u.actions.sit.setEffectiveWeight(standW * u.sitW);
      u.actions.crouch.setEffectiveWeight(standW * (1 - u.sitW) * u.crouchW);
      u.actions.idle.setEffectiveWeight(standW * (1 - u.sitW) * (1 - u.crouchW));
      u.actions.walk.setEffectiveWeight(walkW);
      u.actions.run.setEffectiveWeight(runW);
      u.mixer.update(dt);
    }
  }

  let order = 0;
  return {
    units,
    configure,
    update,
    followers,
    // Free a captive: they stand up and follow.
    free(u) { u.state = 'following'; u.order = order++; },
    // Walk to `point`, then `onArrive(u)`.
    sendTo(u, point, onArrive) { u.state = 'boarding'; u.destination = { point: point.clone(), onArrive }; },
    clearTrail() { trail.length = 0; },
  };
}
