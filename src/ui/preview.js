// Character preview for screens 08 and 09: the approved player model on a
// glowing ring, standing in the shared Idle pose, with the chosen skin tone.
// Drag to rotate; it turns slowly by itself unless reduced motion is asked for.
// One small renderer, created on first use and paused when no preview shows.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadCharacter } from '../player.js';
import { loadSharedAnims, retarget } from '../anims.js';
import { tintSkin } from '../skin.js';

let R = null;

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,190,80,0)');
  grad.addColorStop(0.72, 'rgba(255,190,80,0.05)');
  grad.addColorStop(0.86, 'rgba(255,214,120,0.95)');
  grad.addColorStop(0.92, 'rgba(255,170,60,0.35)');
  grad.addColorStop(1, 'rgba(255,150,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function init() {
  const canvas = document.createElement('canvas');
  canvas.className = 'preview-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight('#fff1dc', '#5a4632', 1.7));
  const sun = new THREE.DirectionalLight('#ffd7a0', 2.6);
  sun.position.set(-2, 4, 3);
  const rim = new THREE.DirectionalLight('#ffe2b0', 1.4);
  rim.position.set(2.5, 3, -3);
  scene.add(sun, rim);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }));
  ring.position.y = 0.01;
  scene.add(ring);
  const holder = new THREE.Group();
  scene.add(holder);
  R = { canvas, renderer, scene, camera, holder, ring, model: null, mixer: null, key: null, yaw: -0.35, spin: 0, host: null, running: false, clock: new THREE.Clock(), token: 0, tone: null, t: 0, dragging: false };

  // Drag to rotate.
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, yaw: R.yaw }; R.dragging = true; canvas.setPointerCapture(e.pointerId); R.spin = 0; });
  canvas.addEventListener('pointermove', (e) => { if (drag) R.yaw = drag.yaw + (e.clientX - drag.x) * 0.012; });
  const end = () => { drag = null; R.dragging = false; R.spin = 2.5; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  return R;
}

function frame() {
  if (!R.running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(R.clock.getDelta(), 0.1);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  R.spin = Math.max(0, R.spin - dt);
  R.t += dt;
  // Idle: sway gently around the front view (mostly facing the player).
  if (!reduce && R.spin <= 0 && R.autoTurn && !R.dragging) {
    const want = -0.25 + Math.sin(R.t * 0.45) * 0.55;
    R.yaw += Math.atan2(Math.sin(want - R.yaw), Math.cos(want - R.yaw)) * Math.min(1, dt * 1.5);
  }
  R.holder.rotation.y = R.yaw;
  if (R.mixer && !reduce) R.mixer.update(dt);
  const w = R.canvas.clientWidth, h = R.canvas.clientHeight;
  if (w && h && (R.canvas.width !== Math.round(w * R.renderer.getPixelRatio()) || R.canvas.height !== Math.round(h * R.renderer.getPixelRatio()))) {
    R.renderer.setSize(w, h, false);
    R.camera.aspect = w / h;
    R.camera.updateProjectionMatrix();
  }
  R.renderer.render(R.scene, R.camera);
}

// Shows the preview inside `host` (an element). opts: { model, skin, autoTurn, fit: 'full' }
export async function showPreview(host, { model, skin, autoTurn = true }) {
  if (!R) init();
  host.appendChild(R.canvas);
  R.host = host;
  R.autoTurn = autoTurn;
  R.camera.position.set(0, 1.0, 6.2);
  R.camera.lookAt(0, 0.88, 0);
  if (!R.running) { R.running = true; R.clock.getDelta(); requestAnimationFrame(frame); }
  host.classList.add('loading');
  const my = ++R.token;
  if (R.key !== model) {
    const [entry, shared] = await Promise.all([loadCharacter(model), loadSharedAnims()]);
    if (my !== R.token) return;
    if (R.model) R.holder.remove(R.model);
    R.model = cloneSkinned(entry.gltf.scene);
    R.holder.add(R.model);
    R.mixer = new THREE.AnimationMixer(R.model);
    R.mixer.clipAction(retarget(shared.idle, R.model)).play();
    R.key = model;
    R.tone = undefined;
  }
  setPreviewSkin(skin);
  host.classList.remove('loading');
}

export function setPreviewSkin(t) {
  if (!R?.model || R.tone === t) return;
  tintSkin(R.model, t);
  R.tone = t;
}

export function hidePreview() {
  if (!R) return;
  R.running = false;
  R.token++;
  R.canvas.remove();
}
