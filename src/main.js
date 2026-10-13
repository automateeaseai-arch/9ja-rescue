import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildWorld, groundHeight, roadX, riverX, riverLevel, RIVER_HALF_WIDTH } from './world.js';
import { createPlayer, loadCharacter, CHARACTERS, downloadStats } from './player.js';
import { createInput } from './input.js';
import { spawnHostiles } from './hostiles.js';
import { createFx } from './fx.js';
import { createCombat } from './combat.js';
import { createPickups } from './pickups.js';
import { createGrenades } from './grenades.js';
import { createVehicles } from './vehicles.js';
import { createAirDrop } from './airdrop.js';
import { createCaptives } from './hostages.js';
import { createMission } from './mission.js';
import { SITE } from './config.js';
import { buildCamp } from './camp.js';
import { buildDss } from './dss.js';
import { buildValley, prepareValley } from './valley/build.js';
import { buildLand, createAtmosphere, VALLEY_ORIGIN } from './land.js';
import * as VL from './valley/layout.js';
import { updateCulling } from './kit/chunks.js';
import { treeAt } from './kit/crowns.js';

const canvas = document.getElementById('game');
const loadingFill = document.getElementById('loading-fill');
const loadingText = document.getElementById('loading-text');

// Shows the current start-up step with a running timer, so a stall on a
// phone can be reported precisely.
let stepName = '';
const stepStart = performance.now();
const stepTimer = setInterval(() => {
  if (stepName) loadingText.textContent = `${stepName} (${Math.round((performance.now() - stepStart) / 1000)}s, ${Math.round(downloadStats.bytes / 1024)} KB downloaded)`;
}, 500);
function step(name) {
  stepName = name;
  loadingText.textContent = name;
  return new Promise((r) => setTimeout(r, 30)); // let the screen repaint
}
function showError(msg) {
  clearInterval(stepTimer);
  stepName = '';
  if (loadingText.isConnected) loadingText.textContent = `Something went wrong during "${loadingText.textContent}": ${msg}`;
}
addEventListener('error', (e) => showError(e.message));
addEventListener('unhandledrejection', (e) => showError(e.reason?.message ?? String(e.reason)));

const isPhone = matchMedia('(pointer: coarse)').matches;

async function start() {
  await step('Starting physics');
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
  await step('Building the savanna');
  if (isPhone) { camera.far = 300; camera.updateProjectionMatrix(); }
  const world = buildWorld(scene, physics, { phone: isPhone });
  if (isPhone) world.sky.scale.setScalar(0.75);
  const sun = world.sun;
  let updateCamp = () => {};
  buildCamp(scene, physics).then((f) => { updateCamp = f; }).catch((err) => console.error(err));
  await step('Joining the river valley');
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

  await step('Loading character');
  loadingFill.style.width = '60%';
  // Arrival point: on the dirt road south of the village, facing it.
  const spawn = new THREE.Vector3(roadX(34), groundHeight(roadX(34), 34), 34);
  let grenades = null;
  const player = await createPlayer(scene, physics, spawn, {
    waterAt, canThrow: () => !!grenades?.ready, onThrow: () => grenades.begin(),
  });
  let charIndex = 0;
  player.setCharacter(await loadCharacter(charIndex));
  loadingFill.style.width = '100%';

  // Character switching stands in for the saved-character screens (2D, later).
  const characters = {
    busy: false,
    async next() {
      if (this.busy) return;
      this.busy = true;
      const target = (charIndex + 1) % CHARACTERS.length;
      try {
        player.setCharacter(await loadCharacter(target));
        charIndex = target;
      } catch (err) {
        console.error(err);
      }
      this.busy = false;
    },
  };

  const toWorld = ([x, z]) => [x + VALLEY_ORIGIN.x, z + VALLEY_ORIGIN.z];
  const siteCentre = toWorld(SITE.centre);
  const crouchBtn = document.getElementById('crouch-btn');
  const fx = createFx(scene);
  let combat = null, mission = null;
  // Ten hostiles; the mission places them (four roaming, six at the site).
  const hostiles = spawnHostiles(scene, {
    heightAt: surfaceAt, physics, fx, site: { x: siteCentre[0], z: siteCentre[1] },
    onShootPlayer: (damage) => combat?.hurt(damage),
    onDefeated: (u) => mission?.onDefeated(u),
  });
  combat = createCombat({
    physics, camera, player, hostiles, fx, isTouch: input.isTouch, onDown: () => mission?.onDown(),
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
  const pickups = createPickups(scene, {
    heightAt: surfaceAt, heal: (n) => combat.heal(n), addAmmo: (n) => combat.addAmmo(n), fx,
    onCollect: (it) => mission?.onCollect(it),
  });
  let dss = null;
  buildDss(scene, physics).then((d) => { dss = d; }).catch((err) => console.error(err));
  let valleyDone;
  const valleyReady = new Promise((r) => { valleyDone = r; });

  await step('Preparing graphics');
  renderer.compile(scene, camera);
  clearInterval(stepTimer);
  stepName = '';
  document.getElementById('loading').remove();
  document.getElementById('hud').hidden = false;
  document.getElementById('help').hidden = false;
  if (!input.isTouch) setTimeout(() => { document.getElementById('help').hidden = true; }, 20000);
  // Weapon selector: Gun shows Fire, Aim and Reload; Unarmed turns Fire into Punch.
  const setWeaponUi = (w) => {
    document.getElementById('weapon-gun').classList.toggle('on', w === 'gun');
    document.getElementById('weapon-unarmed').classList.toggle('on', w === 'unarmed');
    document.getElementById('fire-btn').textContent = w === 'gun' ? 'Fire' : 'Punch';
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
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  mission = createMission({
    scene, camera, player, combat, hostiles, captives, pickups, grenades, vehicles, airdrop, input, characters,
    getDss: () => dss, valleyReady, land, roadX, surfaceAt, waterAt, origin: VALLEY_ORIGIN, isTouch: input.isTouch,
    look: (y, p) => { yaw = y; pitch = p; },
  });
  mission.begin().catch((err) => { console.error(err); showError(err.message); });

  function updateCamera(dt) {
    const look = input.consumeLook();
    yaw -= look.x * 0.004;
    pitch = THREE.MathUtils.clamp(pitch + look.y * 0.003, -0.5, 1.1);

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
    // Pull the camera in if a wall or rock is between it and the player.
    ray.origin = { x: head.x, y: head.y, z: head.z };
    ray.dir = { x: camOffset.x, y: camOffset.y, z: camOffset.z };
    // Closer over the shoulder while aiming; further back in a vehicle or in the air.
    const wantDist = air ? airdrop.camDist : car ? car.T.camDist : player.state.aiming ? 2.8 : CAM_DIST;
    const hit = physics.castRay(ray, Math.max(camDist, wantDist), true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
    camDist = air === 'plane' ? wantDist : THREE.MathUtils.damp(camDist, wantDist, 3, dt || 1);
    let dist = hit ? Math.max(0.6, Math.min(camDist, hit.timeOfImpact - 0.25)) : camDist;
    // In the air, come in closer rather than sit inside a tree's leaves.
    if (air) {
      while (dist > 3 && treeAt(head.x + camOffset.x * dist, head.y + camOffset.y * dist, head.z + camOffset.z * dist, 0.5)) dist -= 0.5;
    }

    camera.position.copy(head).addScaledVector(camOffset, dist);
    // Slight over-the-shoulder offset to the right (centred in a vehicle).
    const side = car || air ? 0 : 0.5;
    camera.position.x += Math.cos(yaw) * side;
    camera.position.z -= Math.sin(yaw) * side;
    camTarget.copy(head);
    camTarget.x += Math.cos(yaw) * side;
    camTarget.z -= Math.sin(yaw) * side;
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

  const clock = new THREE.Clock();
  const FIXED = 1 / 60;
  let acc = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    input.update();
    acc += dt;
    if (mission.paused) acc = 0;   // pause freezes the game (and the descent timer)
    while (acc >= FIXED) {
      airdrop.update(FIXED, input);
      vehicles.update(FIXED, vehicleInput);
      player.update(FIXED, input, yaw, pitch);
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
      'fire-btn': !busy && !swim, 'aim-btn': !busy && !swim && gun, 'reload-btn': !busy && !swim && gun,
      'crouch-btn': !busy && !swim, 'throw-btn': !busy && !swim && grenades.count > 0,
      'jump-btn': !vehicles.driving && !player.state.disabled,
    };
    if (input.isTouch) for (const [id, v] of Object.entries(show)) document.getElementById(id).hidden = !v;
    document.getElementById('ammo').hidden = !gun || busy;
    document.getElementById('weapons').hidden = busy;
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
    scene, camera, player, physics, renderer,
    captives, valley, land, surfaceAt, hostiles, combat, pickups, grenades, vehicles, airdrop, mission, input,
    get dss() { return dss; },
    look(y, p) { yaw = y; pitch = p; },
    // Runs game logic without rendering, for automated tests.
    simulate(seconds, move = { moveX: 0, moveY: 0, run: false }) {
      const idle = { state: move, consumeJump: () => { const j = !!move.jump; move.jump = false; return j; },
        consumeDrive: () => { const d = !!move.drive; move.drive = false; return d; },
        consumeThrow: () => { const t = !!move.throw; move.throw = false; return t; },
        consumeCrouch: () => { const c = !!move.crouch; move.crouch = false; return c; }, consumePunch: () => { const p = !!move.punch; move.punch = false; return p; } };
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
}

start().catch((err) => {
  console.error(err);
  showError(err.message);
});
