import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildWorld, groundHeight, roadX } from './world.js';
import { createPlayer, loadCharacter, CHARACTERS, downloadStats } from './player.js';
import { createInput } from './input.js';
import { spawnHostiles } from './hostiles.js';
import { createFx } from './fx.js';
import { createCombat } from './combat.js';
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

  await step('Loading character');
  loadingFill.style.width = '60%';
  // Arrival point: on the dirt road south of the village, facing it.
  const spawn = new THREE.Vector3(roadX(34), groundHeight(roadX(34), 34), 34);
  const player = await createPlayer(scene, physics, spawn);
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
  const head = new THREE.Vector3();
  const camOffset = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  function updateCamera(dt) {
    const look = input.consumeLook();
    yaw -= look.x * 0.004;
    pitch = THREE.MathUtils.clamp(pitch + look.y * 0.003, -0.5, 1.1);

    head.copy(player.position).add({ x: 0, y: 1.6, z: 0 });
    camOffset.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    );
    // Pull the camera in if a wall or rock is between it and the player.
    ray.origin = { x: head.x, y: head.y, z: head.z };
    ray.dir = { x: camOffset.x, y: camOffset.y, z: camOffset.z };
    const hit = physics.castRay(ray, CAM_DIST, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
    // Closer over the shoulder while aiming.
    camDist = THREE.MathUtils.damp(camDist, player.state.aiming ? 2.8 : CAM_DIST, 8, dt || 1);
    const dist = hit ? Math.max(0.6, Math.min(camDist, hit.timeOfImpact - 0.25)) : camDist;

    camera.position.copy(head).addScaledVector(camOffset, dist);
    // Slight over-the-shoulder offset to the right.
    camera.position.x += Math.cos(yaw) * 0.5;
    camera.position.z -= Math.sin(yaw) * 0.5;
    camTarget.copy(head);
    camTarget.x += Math.cos(yaw) * 0.5;
    camTarget.z -= Math.sin(yaw) * 0.5;
    camera.lookAt(camTarget);

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
      player.update(FIXED, input, yaw);
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
    hostages.update(dt, player);
    updateDss(dt, player);
    updateValleyExtraction(dt, player);
  }

  // Handy for debugging from the browser console.
  window.game = {
    scene, camera, player, physics, renderer,
    hostages, valley, land, surfaceAt, hostiles, combat,
    look(y, p) { yaw = y; pitch = p; },
    // Runs game logic without rendering, for automated tests.
    simulate(seconds, move = { moveX: 0, moveY: 0, run: false }) {
      const idle = { state: move, consumeJump: () => false, consumePunch: () => { const p = !!move.punch; move.punch = false; return p; } };
      for (let i = 0; i < seconds * 60; i++) {
        player.update(FIXED, idle, yaw);
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
