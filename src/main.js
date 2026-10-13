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
import { createShowcase } from './showcase.js';
import { createVehicles } from './vehicles.js';
import { spawnHostages } from './hostages.js';
import { buildCamp } from './camp.js';
import { buildDss } from './dss.js';
import { buildValley, prepareValley } from './valley/build.js';
import { buildLand, createAtmosphere, VALLEY_ORIGIN } from './land.js';
import { HOSTAGE_SPOTS as CAMP_SPOTS } from './camp.js';
import * as VL from './valley/layout.js';
import { updateCulling } from './kit/chunks.js';

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

  const switchBtn = document.getElementById('switch-char');
  const nextIndex = () => (charIndex + 1) % CHARACTERS.length;
  const updateSwitchLabel = () => {
    switchBtn.textContent = `${CHARACTERS[charIndex].name} ⇄ ${CHARACTERS[nextIndex()].name}`;
  };
  updateSwitchLabel();
  switchBtn.addEventListener('click', async () => {
    if (switchBtn.disabled) return;
    switchBtn.disabled = true;
    const target = nextIndex();
    switchBtn.textContent = `Loading ${CHARACTERS[target].name}…`;
    try {
      player.setCharacter(await loadCharacter(target));
      charIndex = target;
    } catch (err) {
      console.error(err);
    }
    switchBtn.disabled = false;
    updateSwitchLabel();
  });

  // Captives: five in the savanna camp, five in the valley's plantation
  // compound. Guards: the North/Middle Belt five in the savanna village, the
  // southern five at the compound.
  const toWorld = ([x, z]) => [x + VALLEY_ORIGIN.x, z + VALLEY_ORIGIN.z];
  const hostageSpots = [...CAMP_SPOTS.slice(0, 5), ...[0, 1, 2, 6, 7].map((i) => toWorld(VL.HOSTAGE_SPOTS[i]))];
  // Each guard faces a different way: the savanna five watch every side of
  // the village; valley guards face out from the compound.
  const SAV_YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.8];
  const hostileSpots = [
    ...[0, 1, 2, 3, 4].map((i) => [-6 + i * 3, 6, SAV_YAWS[i]]),
    ...[0, 1, 2, 3, 5].map((i) => {
      const [x, z] = VL.HOSTILE_SPOTS[i];
      return [...toWorld([x, z]), Math.atan2(x - VL.COMPOUND.x, z - VL.COMPOUND.z)];
    }),
  ];
  const objective = document.querySelector('#hud .objective');
  const crouchBtn = document.getElementById('crouch-btn');
  const fx = createFx(scene);
  let combat = null;
  const hostiles = spawnHostiles(scene, {
    spots: hostileSpots, heightAt: surfaceAt, physics, fx,
    onShootPlayer: (damage) => combat?.hurt(damage),
  });
  // Knocked out: back on your feet at the savanna road, or the valley's north road.
  const valleyStart = toWorld(VL.ROUTES.northRoad[2]);
  combat = createCombat({
    physics, camera, player, hostiles, fx, isTouch: input.isTouch,
    respawnPoint: () => (player.position.z > 300
      ? new THREE.Vector3(valleyStart[0], land.height(...valleyStart), valleyStart[1])
      : spawn.clone()),
  });
  objective.textContent = 'Hostages are held in the camp north-east of the village and in the plantation compound in the river valley to the south';
  const hostages = spawnHostages(scene, (name) => {
    objective.textContent = `${name} is following you. Take them to DSS: the vehicles by the river west of the village, or the jetty or vans in the valley`;
  }, { spots: hostageSpots, heightAt: surfaceAt });
  let deliveredCount = 0;
  const delivered = (name) => {
    deliveredCount++;
    objective.textContent = `${name} is safe with DSS · ${deliveredCount} of ${hostages.total} delivered · ${(deliveredCount * 5000).toLocaleString()} RP`;
  };
  // First-aid kits along the routes: savanna, the road south, and the valley
  // (plateau trail, cave supply chamber, grotto, near the compound, ravine camp, wetland).
  const kitSpots = [
    [roadX(14) + 3, 14], [22, -30], [40, -50], [-44, 30],
    [land.roadXAt(330) + 4, 330],
    ...[[VL.VIEWPOINT.x - 6, VL.VIEWPOINT.z + 4], [VL.GROTTO.x + 9, VL.GROTTO.z + 6], [VL.GATES.east.x + 14, VL.GATES.east.z - 6],
      [VL.RAVINE_CAMP.x + 4, VL.RAVINE_CAMP.z + 3]].map(toWorld),
    // On the boardwalk platform round the big tree (searched for from 3 m above the ground).
    (([x, z]) => [x, z, land.height(x, z) + 3])(toWorld([VL.BOARDWALK_HUB.x + 3.5, VL.BOARDWALK_HUB.z])),
    [...toWorld([VL.CAVE.chambers[1].x + 1.5, VL.CAVE.chambers[1].z + 1.5]), VL.CAVE.floor.west + 1],
  ];
  grenades = createGrenades({ scene, physics, camera, player, hostiles, fx, waterAt, hurtPlayer: (n) => combat.hurt(n) });
  const throwBtn = document.getElementById('throw-btn');
  // Drivable pickup truck and motorbike, parked by the arrival road facing north.
  const vehicles = createVehicles({
    scene, physics, player, hostiles, heightAt: surfaceAt, waterAt,
    spots: { truck: [roadX(52) + 3.6, 52, Math.PI - 0.1], bike: [roadX(42) - 3.2, 42, Math.PI + 0.3] },
  });
  const driveBtn = document.getElementById('drive-btn');
  const promptEl = document.getElementById('prompt');
  // On show: hang glider at the valley viewpoint, a parachute drifting down over the savanna.
  const updateShowcase = createShowcase(scene, physics, {
    heightAt: surfaceAt,
    spots: {
      glider: [...toWorld([VL.VIEWPOINT.x + 4, VL.VIEWPOINT.z + 6]), 0.6], parachute: [roadX(70) + 25, 70],
    },
  });
  const pickups = createPickups(scene, { spots: kitSpots, heightAt: surfaceAt, heal: (n) => combat.heal(n), fx });
  let updateDss = () => {};
  buildDss(scene, physics, hostages, delivered).then((f) => { updateDss = f; }).catch((err) => console.error(err));
  let updateValleyExtraction = () => {};

  await step('Preparing graphics');
  renderer.compile(scene, camera);
  clearInterval(stepTimer);
  stepName = '';
  document.getElementById('loading').remove();
  document.getElementById('hud').hidden = false;
  document.getElementById('help').hidden = false;
  if (input.isTouch) {
    document.getElementById('jump-btn').hidden = false;
    document.getElementById('fire-btn').hidden = false;
    document.getElementById('punch-btn').hidden = false;
    document.getElementById('crouch-btn').hidden = false;
    document.getElementById('throw-btn').hidden = false;
  }

  // The valley is far from the start, so it is built while the player begins.
  buildValley(scene, physics, { phone: isPhone, origin: VALLEY_ORIGIN, prepared }).then((v) => {
    valley = v;
    updateValleyExtraction = v.attachHostages(hostages, delivered);
    if (window.game) window.game.valley = v;
  }).catch((err) => console.error(err));

  // Orbit camera behind the player's shoulder.
  let yaw = 0;
  let pitch = 0.25;
  const CAM_DIST = 4.2;
  let camDist = CAM_DIST;
  let lastCar = null;
  const head = new THREE.Vector3();
  const camOffset = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  function updateCamera(dt) {
    const look = input.consumeLook();
    yaw -= look.x * 0.004;
    pitch = THREE.MathUtils.clamp(pitch + look.y * 0.003, -0.5, 1.1);

    const car = vehicles.driving;
    // Getting in: start looking from behind the vehicle.
    if (car && car !== lastCar) { yaw = car.heading + Math.PI; pitch = 0.3; }
    lastCar = car;
    if (car) {
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
    const hit = physics.castRay(ray, car ? car.T.camDist : CAM_DIST, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
    // Closer over the shoulder while aiming; further back in a vehicle.
    camDist = THREE.MathUtils.damp(camDist, car ? car.T.camDist : player.state.aiming ? 2.8 : CAM_DIST, 8, dt || 1);
    const dist = hit ? Math.max(0.6, Math.min(camDist, hit.timeOfImpact - 0.25)) : camDist;

    camera.position.copy(head).addScaledVector(camOffset, dist);
    // Slight over-the-shoulder offset to the right (centred in a vehicle).
    const side = car ? 0 : 0.5;
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
    while (acc >= FIXED) {
      vehicles.update(FIXED, input);
      player.update(FIXED, input, yaw, pitch);
      physics.step();
      acc -= FIXED;
    }
    updateScene(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  });

  function updateScene(dt) {
    world.update(dt, player.position);
    if (valley) {
      // Far from the valley (e.g. in the savanna) it is hidden entirely.
      const p = player.position, o = VALLEY_ORIGIN;
      const out = Math.hypot(Math.max(0, Math.abs(p.x - o.x) - VL.HALF), Math.max(0, Math.abs(p.z - o.z) - VL.HALF));
      valley.root.visible = out < (isPhone ? 150 : 230);
      valley.update(dt, player, camera);
    }
    atmosphere(player.position, valley?.caveDim ?? 0);
    updateCulling(camera.position);
    updateCamp(dt);
    hostiles.update(dt, player);
    combat.update(dt);
    crouchBtn.classList.toggle('on', player.crouching);
    pickups.update(dt, player);
    grenades.update(dt);
    updateShowcase(dt);
    throwBtn.classList.toggle('wait', !grenades.ready);
    // Get in / get out: prompt on a computer, a button on phones.
    const canDrive = !!(vehicles.near || vehicles.driving);
    if (vehicles.near && !vehicles.driving && !input.isTouch) {
      promptEl.hidden = false;
      promptEl.textContent = `V: ${vehicles.near.kind === 'bike' ? 'ride the motorbike' : 'drive the pickup'}`;
    }
    driveBtn.hidden = !(input.isTouch && canDrive);
    driveBtn.textContent = vehicles.driving ? 'Get out' : 'Drive';
    for (const id of ['fire-btn', 'punch-btn', 'crouch-btn', 'throw-btn', 'jump-btn']) {
      if (input.isTouch) document.getElementById(id).hidden = !!vehicles.driving;
    }
    hostages.update(dt, player);
    updateDss(dt, player);
    updateValleyExtraction(dt, player);
  }

  // Handy for debugging from the browser console.
  window.game = {
    scene, camera, player, physics, renderer,
    hostages, valley, land, surfaceAt, hostiles, combat, pickups, grenades, showcase: updateShowcase, vehicles,
    look(y, p) { yaw = y; pitch = p; },
    // Runs game logic without rendering, for automated tests.
    simulate(seconds, move = { moveX: 0, moveY: 0, run: false }) {
      const idle = { state: move, consumeJump: () => { const j = !!move.jump; move.jump = false; return j; },
        consumeDrive: () => { const d = !!move.drive; move.drive = false; return d; },
        consumeThrow: () => { const t = !!move.throw; move.throw = false; return t; },
        consumeCrouch: () => { const c = !!move.crouch; move.crouch = false; return c; }, consumePunch: () => { const p = !!move.punch; move.punch = false; return p; } };
      for (let i = 0; i < seconds * 60; i++) {
        vehicles.update(FIXED, idle);
        player.update(FIXED, idle, yaw, pitch);
        physics.step();
        updateScene(FIXED);
      }
      updateCamera(0);
    },
  };
}

start().catch((err) => {
  console.error(err);
  showError(err.message);
});
