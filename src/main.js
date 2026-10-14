import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildWorld, groundHeight, roadX, riverX, riverLevel, RIVER_HALF_WIDTH } from './world.js';
import { createPlayer, loadCharacter, downloadStats } from './player.js';
import { createInput } from './input.js';
import { spawnHostiles } from './hostiles.js';
import { createFx } from './fx.js';
import { sound } from './sound.js';
import { settings } from './settings.js';
import { createAmbience } from './ambience.js';
import { createCombat } from './combat.js';
import { createPickups } from './pickups.js';
import { createGrenades } from './grenades.js';
import { createVehicles } from './vehicles.js';
import { createAirDrop } from './airdrop.js';
import { createCaptives } from './hostages.js';
import { createMission } from './mission.js';
import { SITES } from './config.js';
import { buildCamp } from './camp.js';
import { buildDss } from './dss.js';
import { buildValley, prepareValley } from './valley/build.js';
import { buildLand, createAtmosphere, VALLEY_ORIGIN } from './land.js';
import * as VL from './valley/layout.js';
import { updateCulling } from './kit/chunks.js';
import { treeAt } from './kit/crowns.js';
import { tintSkin } from './skin.js';
import { createScreens } from './ui/screens.js';
import { look as lookOf } from './ui/characters.js';

const canvas = document.getElementById('game');
// The 2D screens (01 Splash … 13 Mission loading) run from the first moment;
// the splash shows the real start-up progress below.
const screens = createScreens();

// Start-up steps with their share of the splash bar; the step text carries a
// running timer and download count, so a stall on a phone can be reported precisely.
let stepName = '', stepFrom = 0;
const stepStart = performance.now();
const stepTimer = setInterval(() => {
  if (stepName) screens.splashProgress(stepFrom, `${stepName} (${Math.round((performance.now() - stepStart) / 1000)} s, ${Math.round(downloadStats.bytes / 1024)} KB)`);
}, 500);
function step(name, at) {
  stepName = name;
  stepFrom = at;
  screens.splashProgress(at, name);
  return new Promise((r) => setTimeout(r, 30)); // let the screen repaint
}
function showError(msg) {
  clearInterval(stepTimer);
  screens.fatal(`Something went wrong during "${stepName || 'loading'}": ${msg}`);
  stepName = '';
}
addEventListener('error', (e) => showError(e.message));
addEventListener('unhandledrejection', (e) => {
  // Mission loading reports its own failures (with Retry) on screen 13.
  if (screens.playing || screens.ownsError?.(e.reason)) return;
  showError(e.reason?.message ?? String(e.reason));
});

const isPhone = matchMedia('(pointer: coarse)').matches;

async function start() {
  await step('Starting physics', 0.03);
  await RAPIER.init();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Phones render at a lower resolution and shadow detail to stay smooth.
  renderer.setPixelRatio(Math.min(devicePixelRatio, isPhone ? 1.25 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  // One continuous world: the savanna in the north, the River Valley to the
  // south, joined by open country that rises gently onto the valley plateau.
  await step('Building the savanna', 0.15);
  if (isPhone) { camera.far = 300; camera.updateProjectionMatrix(); }
  const world = buildWorld(scene, physics, { phone: isPhone });
  if (isPhone) world.sky.scale.setScalar(0.75);
  const sun = world.sun;
  let updateCamp = () => {};
  buildCamp(scene, physics).then((f) => { updateCamp = f; }).catch((err) => console.error(err));
  await step('Joining the river valley', 0.35);
  const prepared = prepareValley();
  const land = buildLand(scene, physics, { valleyH: prepared.heightAt, phone: isPhone });
  const atmosphere = createAtmosphere({ scene, world, phone: isPhone });
  let valley = null;

  // Walking height anywhere (ground, decks, bridges, cave floors) for NPCs.
  const downRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  function surfaceAt(x, z, yHint) {
    const g = land.height(x, z);
    downRay.origin = { x, y: yHint != null ? yHint + 0.45 : g + 0.05, z };
    const hit = physics.castRay(downRay, 6, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
    return hit ? downRay.origin.y - hit.timeOfImpact : g;
  }
  const input = createInput(canvas);

  // Water surface where the player may swim: the valley river and lake, and
  // the savanna river (too shallow to swim, so it is only waded).
  const vShape = prepared.shape;
  function waterAt(x, z) {
    const lx = x - VALLEY_ORIGIN.x, lz = z - VALLEY_ORIGIN.z;
    let level = null;
    if (Math.abs(lx) < VL.HALF && Math.abs(lz) < VL.HALF) {
      const r = vShape.riverInfo(lx, lz);
      if (r.d < r.hw) level = r.level;
      else if (vShape.lakeR(lx, lz) < 1) level = VL.LAKE.level;
    } else if (Math.abs(x - riverX(z)) < RIVER_HALF_WIDTH) level = riverLevel(z);
    return level == null ? null : { level, ground: land.height(x, z) };
  }

  await step('Loading characters', 0.5);
  // Arrival point: on the dirt road south of the village, facing it.
  const spawn = new THREE.Vector3(roadX(34), groundHeight(roadX(34), 34), 34);
  let grenades = null;
  const player = await createPlayer(scene, physics, spawn, {
    waterAt, paddle: (v) => fx.paddle(v), canThrow: () => !!grenades?.ready, onThrow: () => grenades.begin(),
  });
  player.setCharacter(await loadCharacter(0));
  // The mission's character (from its saved snapshot): model by gender and
  // role, plus the chosen skin tone.
  async function applyCharacter(snap) {
    const idx = snap ? lookOf(snap.gender, snap.role)?.model ?? 0 : 0;
    player.setCharacter(await loadCharacter(idx));
    tintSkin(player.model, snap?.skin ?? null);
  }

  const toWorld = ([x, z]) => [x + VALLEY_ORIGIN.x, z + VALLEY_ORIGIN.z];
  const siteCentre = toWorld(SITES[0].centre);
  const crouchBtn = document.getElementById('crouch-btn');
  const fx = createFx(scene);
  const ambience = createAmbience({ waterAt });
  let combat = null, mission = null;
  // Ten hostiles; the mission places them (four roaming, six at the site).
  const hostiles = spawnHostiles(scene, {
    heightAt: surfaceAt, physics, fx, site: { x: siteCentre[0], z: siteCentre[1] },
    onShootPlayer: (damage) => combat?.hurt(damage),
    onDefeated: (u) => mission?.onDefeated(u),
  });
  combat = createCombat({
    physics, camera, player, hostiles, fx, isTouch: input.isTouch, onDown: () => mission?.onDown(),
    // Where the crosshair is, in screen units -1..1 (it can be dragged off centre while aiming).
    aimNdc: () => ({ x: crossOff.x / (innerWidth / 2), y: -crossOff.y / (innerHeight / 2) }),
  });
  const captives = createCaptives(scene, { heightAt: surfaceAt, onDiscover: (c) => mission?.onDiscover(c) });
  grenades = createGrenades({ scene, physics, camera, player, hostiles, fx, waterAt, hurtPlayer: (n) => combat.hurt(n) });
  const throwBtn = document.getElementById('throw-btn');
  // Pickup truck and motorbike: parked near the arrival when owned.
  const vehicles = createVehicles({
    scene, physics, player, hostiles, heightAt: surfaceAt, waterAt,
    spots: { truck: [roadX(52) + 3.6, 52, Math.PI - 0.1], bike: [roadX(42) - 3.2, 42, Math.PI + 0.3] },
  });
  // Vehicles get in/out requests from the mission's Interact button.
  const vehicleInput = { get state() { return input.state; }, consumeDrive: () => mission?.takeDriveRequest() ?? false };
  // Air entry from the cargo plane (chosen per mission).
  const airdrop = createAirDrop({ scene, physics, player, fx, heightAt: surfaceAt, waterAt, hurt: (n) => combat.hurt(n), onLand: () => mission?.arrive() });
  const promptEl = document.getElementById('prompt');
  const jumpBtnEl = document.getElementById('jump-btn');
  const climbHint = document.getElementById('climb-hint');
  let climbCheck = 0, canClimb = false;
  const pickups = createPickups(scene, {
    heightAt: surfaceAt, heal: (n) => combat.heal(n), addAmmo: (n) => combat.addAmmo(n), fx,
    onCollect: (it) => mission?.onCollect(it),
  });
  let dss = null;
  buildDss(scene, physics).then((d) => { dss = d; }).catch((err) => console.error(err));
  let valleyDone;
  const valleyReady = new Promise((r) => { valleyDone = r; });

  await step('Preparing graphics', 0.85);
  renderer.compile(scene, camera);
  document.getElementById('hud').hidden = false;
  // Weapon selector: Gun shows Fire, Aim and Reload; Unarmed turns Fire into Punch.
  const setWeaponUi = (w) => {
    for (const k of ['gun', 'cutlass', 'unarmed']) document.getElementById(`weapon-${k}`).classList.toggle('on', w === k);
    document.getElementById('fire-btn').textContent = { gun: 'Fire', cutlass: 'Slash', unarmed: 'Punch' }[w];
    document.getElementById('aim-btn').textContent = w === 'unarmed' ? 'Kick' : 'Aim';
  };
  input.onWeapon(setWeaponUi);

  // The valley is far from the start, so it is built while the game starts;
  // the mission waits for it before placing anyone.
  buildValley(scene, physics, { phone: isPhone, origin: VALLEY_ORIGIN, prepared }).then((v) => {
    valley = v;
    if (window.game) window.game.valley = v;
    valleyDone();
  }).catch((err) => { console.error(err); valleyDone(); });

  // Orbit camera behind the player's shoulder.
  let yaw = 0;
  let pitch = 0.25;
  const CAM_DIST = 4.2;
  let camDist = CAM_DIST;
  let lastCar = null;
  let lastAir = null;
  const head = new THREE.Vector3();
  const camOffset = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  let playerHidden = false;
  const camBall = new RAPIER.Ball(0.22);   // about the size of the camera's near view
  const CAM_ROT = { x: 0, y: 0, z: 0, w: 1 };
  const CAM_FILTER = RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;

  mission = createMission({
    scene, camera, physics, player, combat, hostiles, captives, pickups, grenades, vehicles, airdrop, input, applyCharacter,
    onMenu: (where) => leavePlay(where),
    getDss: () => dss, valleyReady: Promise.all([valleyReady, world.ready]), land, roadX, surfaceAt, waterAt, origin: VALLEY_ORIGIN, isTouch: input.isTouch,
    look: (y, p) => { yaw = y; pitch = p; },
  });

  // Sound on/off in the pause menu (the same switch as on the Home screen).
  document.getElementById('pause-settings').addEventListener('click', () => settings.open(soundLabel));
  const soundBtn = document.getElementById('pause-sound');
  const soundLabel = () => { soundBtn.textContent = sound.muted ? 'Sound: off' : 'Sound: on'; };
  soundBtn.addEventListener('click', () => { sound.setMuted(!sound.muted); soundLabel(); if (!sound.muted) sound.ui('select'); });
  soundLabel();
  for (const id of ['pause', 'down', 'results']) {
    document.getElementById(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b !== soundBtn) sound.ui('press', 0.6); });
  }
  document.getElementById('pause-btn').addEventListener('click', () => sound.ui('press', 0.5));

  // Menus and play: the game loop only runs (and renders) while playing.
  let playing = false;
  function enterPlay() {
    playing = true;
    sound.preload();
    document.body.classList.remove('in-menu');
    clock.getDelta();
    if (!input.isTouch) {
      document.getElementById('help').hidden = false;
      setTimeout(() => { document.getElementById('help').hidden = true; }, 20000);
    }
  }
  function leavePlay(where) {
    playing = false;
    sound.setGameActive(false);
    document.body.classList.add('in-menu');
    for (const el of document.querySelectorAll('.touch-ctrl, #interact-btn, #crosshair, #prompt, #climb-hint, #waypoint, #guide, #tip')) el.hidden = true;
    input.state.aim = false;
    screens.show(where === 'characters' ? '05' : '04', { mode: 'mission' });
  }

  // Aiming: pressing Aim picks the nearest hostile in view; a tap on another
  // hostile picks that one; the camera then turns to keep the crosshair on
  // the target. Swiping (or dragging from Fire) steers freely, finer while aiming.
  let aimLock = null, wasAiming = false;
  // Drag-to-aim on phones: while aiming, swiping moves the crosshair itself
  // (offset from the screen centre in pixels); near the screen edge the view
  // turns that way; close to a hostile it sticks to them.
  const crossOff = { x: 0, y: 0 };
  // The crosshair's offset as angles, so the character and rifle point at it.
  const tanV = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const aimYawOff = () => Math.atan((crossOff.x / (innerWidth / 2)) * tanV() * camera.aspect);
  const aimPitchOff = () => Math.atan((crossOff.y / (innerHeight / 2)) * tanV());
  const crossEl = document.getElementById('crosshair');
  const sp = new THREE.Vector3(), chestPt = new THREE.Vector3(), headPt = new THREE.Vector3();
  const alive = () => hostiles.units.filter((u) => u.id && u.state !== 'down' && u.model.visible);
  function screenOf(u) {
    sp.copy(u.model.position).y += 1.2;
    sp.project(camera);
    return sp.z < 1 ? { x: (sp.x * 0.5 + 0.5) * innerWidth, y: (-sp.y * 0.5 + 0.5) * innerHeight } : null;
  }
  function pickNearest() {
    headPt.copy(player.position).y += 1.6;
    let best = null, bestD = Infinity;
    for (const u of alive()) {
      const d = u.model.position.distanceTo(player.position);
      const s2 = screenOf(u);
      if (d > 45 || !s2 || s2.x < 0 || s2.x > innerWidth || s2.y < 0 || s2.y > innerHeight) continue;
      chestPt.copy(u.model.position).y += 1.2;
      if (!hostiles.clearLine(headPt, chestPt)) continue;
      const c = Math.hypot(s2.x - innerWidth / 2, s2.y - innerHeight / 2);
      if (c < bestD) { bestD = c; best = u; }
    }
    return best;
  }
  function pickAt(tap) {
    let best = null, bestD = 70;
    for (const u of alive()) {
      if (u.model.position.distanceTo(player.position) > 90) continue;
      const s2 = screenOf(u);
      if (!s2) continue;
      // The whole body counts, not just the chest.
      const d = Math.hypot(s2.x - tap.x, Math.max(0, Math.abs(s2.y - tap.y) - 40));
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }
  function moveCrosshair(look, dt) {
    const hw = innerWidth / 2, hh = innerHeight / 2;
    // The finger moves the crosshair (input reports swipes at 1.6× pixels).
    crossOff.x = THREE.MathUtils.clamp(crossOff.x + (look.x / 1.6) * lookSpeed, -hw + 24, hw - 24);
    crossOff.y = THREE.MathUtils.clamp(crossOff.y + (look.y / 1.6) * lookSpeed, -hh + 24, hh - 24);
    // Near the edge the view turns towards it, faster the closer to the edge.
    const ex = Math.max(0, Math.abs(crossOff.x) - hw * 0.62), ey = Math.max(0, Math.abs(crossOff.y) - hh * 0.6);
    if (ex > 0) yaw -= Math.sign(crossOff.x) * ex * 0.012 * dt;
    if (ey > 0) pitch = THREE.MathUtils.clamp(pitch + Math.sign(crossOff.y) * ey * 0.01 * dt, -0.5, 1.1);
    // Sticky aim: within reach of a visible hostile, the crosshair settles on them.
    if (Math.hypot(look.x, look.y) < 30) {
      const c = { x: hw + crossOff.x, y: hh + crossOff.y };
      headPt.copy(player.position).y += 1.6;
      let best = null, bestD = 55;
      for (const u of alive()) {
        if (u.model.position.distanceTo(player.position) > 60) continue;
        const s2 = screenOf(u);
        if (!s2) continue;
        const d = Math.hypot(s2.x - c.x, Math.max(0, Math.abs(s2.y - c.y) - 25));
        if (d < bestD) { chestPt.copy(u.model.position).y += 1.2; if (hostiles.clearLine(headPt, chestPt)) { bestD = d; best = s2; } }
      }
      if (best) {
        const k = Math.min(1, dt * 6);
        crossOff.x += (best.x - c.x) * k;
        crossOff.y += (best.y - c.y) * k;
      }
    }
  }
  function updateAim(look, dt) {
    const tap = input.consumeTap?.();
    const aiming = player.state.aiming;
    if (tap) {
      const u = pickAt(tap);
      if (u) {
        aimLock = u;
        if (input.state.weapon === 'gun' && !aiming) input.state.aim = true;
      }
    }
    if (aiming && !wasAiming && !aimLock) aimLock = pickNearest();
    wasAiming = aiming;
    // Steering by hand releases the lock; so do putting the gun down and a defeated target.
    if (Math.hypot(look.x, look.y) > 8 || (!aiming && !input.state.aim) || aimLock?.state === 'down') aimLock = null;
    if (aimLock && aimLock.model.position.distanceTo(player.position) > 90) aimLock = null;
    crossEl.classList.toggle('locked', !!aimLock);
    if (!aimLock) return;
    headPt.copy(player.position).y += 1.6;
    chestPt.copy(aimLock.model.position).y += 1.15;
    const dx = chestPt.x - headPt.x, dy = chestPt.y - headPt.y, dz = chestPt.z - headPt.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = THREE.MathUtils.clamp(Math.asin(-dy / Math.max(0.1, Math.hypot(dx, dy, dz))), -0.5, 1.1);
    const k = Math.min(1, (dt || 0.016) * 10);
    yaw += Math.atan2(Math.sin(wantYaw - yaw), Math.cos(wantYaw - yaw)) * k;
    pitch += (wantPitch - pitch) * k;
  }

  function updateCamera(dt) {
    const look = input.consumeLook();
    // Finer turning while aiming, so small adjustments are easy.
    const fine = player.state.aiming ? 0.55 : 1;
    const dragAim = input.isTouch && player.state.aiming && !vehicles.driving && !airdrop.active;
    if (dragAim && !aimLock) moveCrosshair(look, dt || 0.016);
    else {
      yaw -= look.x * 0.004 * fine * lookSpeed;
      pitch = THREE.MathUtils.clamp(pitch + look.y * 0.003 * fine * lookSpeed, -0.5, 1.1);
      // Not aiming (or locked on): the crosshair glides back to the centre.
      const k = Math.min(1, (dt || 0.016) * 8);
      crossOff.x -= crossOff.x * k; crossOff.y -= crossOff.y * k;
    }
    crossEl.style.transform = `translate(calc(-50% + ${crossOff.x.toFixed(1)}px), calc(-50% + ${crossOff.y.toFixed(1)}px))`;
    if (!vehicles.driving && !airdrop.active) updateAim(look, dt);

    const car = vehicles.driving;
    const air = airdrop.active ? airdrop.phase : null;
    // Getting in: start looking from behind the vehicle.
    if (car && car !== lastCar) { yaw = car.heading + Math.PI; pitch = 0.3; }
    lastCar = car;
    // Boarding the plane: look past the player out of the open ramp.
    if (air === 'plane' && lastAir !== 'plane') { yaw = airdrop.heading + Math.PI; pitch = 0.5; }
    if (air === 'fall' && lastAir === 'plane') pitch = 0.45;
    if (air === 'fly' && lastAir === 'fall') pitch = 0.25;
    lastAir = air;
    if (air) {
      // In the air the camera swings round behind the direction of flight.
      if (air !== 'plane' && Math.abs(look.x) < 1) {
        const target = airdrop.heading + Math.PI;
        yaw += Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw)) * Math.min(1, (dt || 0.016) * (air === 'fall' ? 1.2 : 2));
      }
      if (air === 'plane') pitch = THREE.MathUtils.clamp(pitch, 0.1, 0.55);
      head.copy(player.position).add({ x: 0, y: airdrop.camHeight, z: 0 });
    } else if (car) {
      // Swing round behind the vehicle while it moves, unless the player is looking around.
      if (Math.abs(car.speed) > 1 && Math.abs(look.x) < 1) {
        const target = car.heading + Math.PI + (car.speed < 0 ? Math.PI : 0);
        yaw += Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw)) * Math.min(1, (dt || 0.016) * 2.5);
      }
      head.copy(car.pos).add({ x: 0, y: car.T.camHeight - car.half.h, z: 0 });
    } else head.copy(player.position).add({ x: 0, y: 1.6, z: 0 });
    camOffset.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    );
    // Nothing may come between the camera and the player: a small ball is
    // swept from the head to the shoulder point and on to the camera, and
    // the camera stops just short of the first wall, roof, rock or trunk.
    // It snaps in at once and eases back out when the way is clear.
    const side = car || air ? 0 : 0.5;   // over the right shoulder (centred in a vehicle or the air)
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);
    let sideLen = side;
    if (side) {
      const h = physics.castShape(head, CAM_ROT, { x: sx, y: 0, z: sz }, camBall, 0, side, false, CAM_FILTER);
      if (h) sideLen = Math.max(0, h.time_of_impact - 0.05);
    }
    camTarget.copy(head);
    camTarget.x += sx * sideLen;
    camTarget.z += sz * sideLen;
    // Closer over the shoulder while aiming; further back in a vehicle or in the air.
    const wantDist = air ? airdrop.camDist : car ? car.T.camDist : player.state.aiming ? 2.8 : CAM_DIST;
    // (In the plane the camera sits inside the bay on purpose.)
    const hit = air === 'plane' ? null : physics.castShape(camTarget, CAM_ROT, camOffset, camBall, 0, wantDist, false, CAM_FILTER);
    let free = hit ? Math.max(0.15, hit.time_of_impact - 0.05) : wantDist;
    // Tree trunks and (in the air) leaves have no colliders: step in past them.
    const pad = air ? 0.5 : 0.3;
    while (free > 0.4 && treeAt(camTarget.x + camOffset.x * free, camTarget.y + camOffset.y * free, camTarget.z + camOffset.z * free, pad)) free -= 0.25;
    if (air === 'plane' || free < camDist) camDist = free;
    else camDist = THREE.MathUtils.damp(camDist, free, 3, dt || 1);
    camera.position.copy(camTarget).addScaledVector(camOffset, camDist);
    // Squeezed right up to the player (backed into a corner): hide them so
    // their own body doesn't fill the view (layer 1 is not drawn).
    const close = !car && !air && camDist < 0.9;
    if (close !== playerHidden) {
      playerHidden = close;
      for (const part of player.parts) part.traverse((o) => o.layers.set(close ? 1 : 0));
    }
    camera.lookAt(camTarget);
    // Grenade blasts shake the camera.
    const sh = grenades?.shake ?? 0;
    if (sh > 0) {
      camera.position.x += (Math.random() - 0.5) * sh * 0.25;
      camera.position.y += (Math.random() - 0.5) * sh * 0.25;
    }

    // Keep the sun's shadow area centred on the player.
    sun.position.copy(player.position).add(sun.userData.offset);
    sun.target.position.copy(player.position);
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // Settings: graphics quality (resolution and shadows) and camera speed.
  let lookSpeed = 1;
  settings.onChange((st) => {
    const ratio = { low: isPhone ? 0.85 : 1, medium: isPhone ? 1.25 : 2, high: 2 }[st.graphics] ?? 1.25;
    renderer.setPixelRatio(Math.min(devicePixelRatio, ratio));
    sun.castShadow = st.graphics !== 'low';
    resize();
    lookSpeed = st.sensitivity;
  });

  const clock = new THREE.Clock();
  const FIXED = 1 / 60;
  let acc = 0;
  renderer.setAnimationLoop(() => {
    if (!playing) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    input.update();
    acc += dt;
    if (mission.paused) acc = 0;   // pause freezes the game (and the descent timer)
    sound.setGameActive(!mission.paused);
    while (acc >= FIXED) {
      airdrop.update(FIXED, input);
      vehicles.update(FIXED, vehicleInput);
      player.update(FIXED, input, yaw - aimYawOff(), pitch + aimPitchOff());
      physics.step();
      acc -= FIXED;
    }
    updateScene(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  });

  function updateScene(dt, inp = input) {
    world.update(dt, player.position);
    if (valley) {
      // Far from the valley (e.g. in the savanna) it is hidden entirely.
      const p = player.position, o = VALLEY_ORIGIN;
      const out = Math.hypot(Math.max(0, Math.abs(p.x - o.x) - VL.HALF), Math.max(0, Math.abs(p.z - o.z) - VL.HALF));
      valley.root.visible = out < (isPhone ? 150 : 230);
      valley.update(dt, player, camera);
    }
    atmosphere(player.position, valley?.caveDim ?? 0);
    ambience.update(dt, player.position, { altitude: airdrop.active ? Math.max(0, airdrop.altitude) : 0, cave: valley?.caveDim ?? 0, driving: !!vehicles.driving });
    // High up: see further (the haze starts further away and the view reaches the ground).
    const alt = airdrop.active ? Math.max(0, airdrop.altitude) : 0;
    scene.fog.near += alt * 1.6;
    scene.fog.far += alt * 2.6;
    const far = (isPhone ? 300 : 400) + alt * 2.6;
    if (Math.abs(camera.far - far) > 5) { camera.far = far; camera.updateProjectionMatrix(); }
    updateCulling(camera.position);
    updateCamp(dt);
    mission.update(dt, inp);
    if (mission.paused) return;
    hostiles.update(dt, player);
    combat.update(dt, inp);
    crouchBtn.classList.toggle('on', player.crouching);
    document.getElementById('aim-btn').classList.toggle('on', !!input.state.aim);
    pickups.update(dt, player);
    grenades.update(dt);
    throwBtn.classList.toggle('wait', !grenades.ready);
    // Contextual controls: driving and the air drop replace the combat
    // cluster; swimming hides the combat actions; Aim and Reload only with the gun.
    const gun = input.state.weapon === 'gun';
    const busy = !!vehicles.driving || airdrop.active || player.state.disabled;
    const swim = player.state.mode === 'swim';
    const show = {
      'fire-btn': !busy && !swim, 'aim-btn': !busy && !swim && input.state.weapon !== 'cutlass', 'reload-btn': !busy && !swim && gun,
      'crouch-btn': !busy && !swim, 'throw-btn': !busy && !swim && grenades.count > 0,
      'jump-btn': !vehicles.driving && !player.state.disabled,
    };
    if (input.isTouch) for (const [id, v] of Object.entries(show)) document.getElementById(id).hidden = !v;
    document.getElementById('ammo').hidden = !gun || busy;
    document.getElementById('weapons').hidden = busy;
    // Climbing: when a wall or rock in front can be climbed, Jump becomes Climb.
    if ((climbCheck -= dt) <= 0) {
      climbCheck = 0.15;
      const can = !busy && !swim && player.state.mode === 'ground'
        && !!player.findLedge(new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing)));
      if (can !== canClimb) {
        canClimb = can;
        jumpBtnEl.textContent = can ? 'Climb' : 'Jump';
        jumpBtnEl.classList.toggle('climb', can);
        if (!input.isTouch) { climbHint.hidden = !can; }
      }
    }
    // Air drop hints.
    if (airdrop.snagged) {
      promptEl.hidden = false;
      const what = airdrop.kind === 'parachute' ? 'parachute' : 'glider';
      promptEl.textContent = airdrop.crashed ? `Crashed into a wall! The ${what} collapsed` : `Caught in a tree! The ${what} is stuck`;
    } else if (airdrop.active) {
      const ph = airdrop.phase, J = input.isTouch ? 'Jump' : 'Space';
      const what = airdrop.kind === 'parachute' ? 'parachute' : 'glider';
      promptEl.hidden = false;
      promptEl.textContent = ph === 'plane' ? (airdrop.ready ? `${J}: jump now (${what})` : 'Get ready: the jump comes over the marked landing area')
        : ph === 'fall' ? `${J}: open the ${what}`
        : `${input.isTouch ? 'Stick' : 'WASD'}: steer · landing in ${Math.ceil(airdrop.timeLeft)} s`;
    }
    captives.update(dt, player, hostiles);
    dss?.update(dt);
  }

  // Handy for debugging from the browser console.
  window.game = {
    scene, camera, player, physics, renderer, RAPIER,
    captives, valley, land, surfaceAt, hostiles, combat, pickups, grenades, vehicles, airdrop, mission, input,
    get aimLock() { return aimLock; },
    get dss() { return dss; },
    look(y, p) { yaw = y; pitch = p; },
    // Runs game logic without rendering, for automated tests.
    simulate(seconds, move = { moveX: 0, moveY: 0, run: false }) {
      const idle = { state: move, consumeJump: () => { const j = !!move.jump; move.jump = false; return j; },
        consumeDrive: () => { const d = !!move.drive; move.drive = false; return d; },
        consumeThrow: () => { const t = !!move.throw; move.throw = false; return t; },
        consumeCrouch: () => { const c = !!move.crouch; move.crouch = false; return c; }, consumePunch: () => { const p = !!move.punch; move.punch = false; return p; },
        consumeKick: () => { const k = !!move.kick; move.kick = false; return k; } };
      for (let i = 0; i < seconds * 60; i++) {
        airdrop.update(FIXED, idle);
        vehicles.update(FIXED, { state: move, consumeDrive: () => mission.takeDriveRequest() });
        player.update(FIXED, idle, yaw, pitch);
        physics.step();
        updateScene(FIXED, { ...idle, consumeReload: () => { const r = !!move.reload; move.reload = false; return r; }, consumePause: () => false });
      }
      updateCamera(0);
    },
  };

  clearInterval(stepTimer);
  stepName = '';
  // Hand over to the screens: they sign in, choose the character and loadout,
  // show the briefing, then start or continue the mission here.
  screens.gameReady({
    mission,
    isTouch: input.isTouch,
    async start(character, onProgress) { await mission.startPrepared(character, onProgress); enterPlay(); },
    async continueSaved(onProgress) { await mission.continueSaved(onProgress); enterPlay(); },
    get playing() { return playing; },
  });
  window.game.screens = screens;
  window.game.enterPlay = enterPlay;
  window.game.sound = sound;
}

start().catch((err) => {
  console.error(err);
  showError(err.message);
});
