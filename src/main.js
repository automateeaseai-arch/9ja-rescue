import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildWorld, groundHeight, roadX } from './world.js';
import { createPlayer, loadCharacter, CHARACTERS } from './player.js';
import { createInput } from './input.js';
import { spawnHostiles } from './hostiles.js';
import { spawnHostages } from './hostages.js';

const canvas = document.getElementById('game');
const loadingFill = document.getElementById('loading-fill');
const loadingText = document.getElementById('loading-text');

// Shows the current start-up step with a running timer, so a stall on a
// phone can be reported precisely.
let stepName = '';
const stepStart = performance.now();
const stepTimer = setInterval(() => {
  if (stepName) loadingText.textContent = `${stepName} (${Math.round((performance.now() - stepStart) / 1000)}s)`;
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
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

  await step('Building the savanna');
  const world = buildWorld(scene, physics, { phone: isPhone });
  const { sun } = world;
  const input = createInput(canvas);

  await step('Loading character');
  loadingFill.style.width = '60%';
  // Arrival point: on the dirt road south of the village, facing it.
  const spawn = new THREE.Vector3(roadX(34), groundHeight(roadX(34), 34), 34);
  const player = createPlayer(scene, physics, spawn);
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

  // Hostiles stream in after the game starts, one at a time.
  const updateHostiles = spawnHostiles(scene);
  const objective = document.querySelector('#hud .objective');
  objective.textContent = 'Walk up to a hostage and they follow you';
  const updateHostages = spawnHostages(scene, (name, count, total) => {
    objective.textContent = `${name} is following you · ${count} of ${total} rescued`;
  });

  await step('Preparing graphics');
  renderer.compile(scene, camera);
  clearInterval(stepTimer);
  stepName = '';
  document.getElementById('loading').remove();
  document.getElementById('hud').hidden = false;
  document.getElementById('help').hidden = false;
  if (input.isTouch) document.getElementById('jump-btn').hidden = false;

  // Orbit camera behind the player's shoulder.
  let yaw = 0;
  let pitch = 0.25;
  const CAM_DIST = 4.2;
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
    const dist = hit ? Math.max(0.6, hit.timeOfImpact - 0.25) : CAM_DIST;

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
    world.update(dt, player.position);
    updateHostiles(dt, player.position);
    updateHostages(dt, player);
    updateCamera(dt);
    renderer.render(scene, camera);
  });

  // Handy for debugging from the browser console.
  window.game = {
    scene, camera, player, physics, renderer,
    look(y, p) { yaw = y; pitch = p; },
  };
}

start().catch((err) => {
  console.error(err);
  showError(err.message);
});
