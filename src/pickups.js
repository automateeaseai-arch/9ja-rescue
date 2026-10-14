// Pickups placed by the mission (game plan v2.2): ten first-aid kits (Meshy
// model, +10 HP each, also above 100) and four ammunition boxes (+5 bullets,
// the lid opens; older saved missions still have six ammo packs, +10). Each hovers over a glowing ring (green for health,
// amber for ammo), slowly turns, and is collected once on contact.
import * as THREE from 'three';
import { sound } from './sound.js';
import { loadGlb } from './player.js';
import { RULES } from './config.js';

const RADIUS = 1.4;

function ringTexture(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${rgb},0.55)`);
  grad.addColorStop(0.55, `rgba(${rgb},0.12)`);
  grad.addColorStop(0.8, `rgba(${rgb},0.9)`);
  grad.addColorStop(0.88, `rgba(${rgb},0.15)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Olive ammunition box with a yellow band and a carry handle.
function ammoBox() {
  const g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: '#4d5a32', roughness: 0.65, metalness: 0.2 });
  const band = new THREE.MeshStandardMaterial({ color: '#d9b23a', roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2f25', roughness: 0.5, metalness: 0.5 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.2), olive);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.425, 0.05, 0.205), band);
  stripe.position.y = 0.04;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.04, 0.21), olive);
  lid.position.y = 0.15;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12, Math.PI), dark);
  handle.position.y = 0.17;
  for (const m of [box, stripe, lid, handle]) { m.castShadow = true; g.add(m); }
  return g;
}

// Code-built first-aid kit (used only if the model can't be downloaded):
// a green case with a white cross on both faces and a handle.
function codeKit() {
  const g = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: '#2f9e4f', roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.5 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.2), green);
  box.castShadow = true;
  g.add(box);
  for (const zf of [0.101, -0.101]) {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.01), white).translateZ(zf));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.01), white).translateZ(zf));
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.016, 6, 12, Math.PI), white);
  handle.position.y = 0.2;
  g.add(handle);
  g.position.y = -0.2;
  const outer = new THREE.Group();
  outer.add(g);
  outer.userData.code = true;
  return outer;
}

// Ammunition box (owner, 14 Oct): runs into it → the lid swings open and
// 5 bullets are added. Code-built for now (olive case, yellow band, brass
// rounds inside); `lid` is the part that opens, hinged at the back edge.
function codeCrate() {
  const g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: '#4d5a32', roughness: 0.7, metalness: 0.15 });
  const band = new THREE.MeshStandardMaterial({ color: '#d9b23a', roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: '#23271e', roughness: 0.8 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c8a24a', roughness: 0.35, metalness: 0.8 });
  const W = 0.8, H = 0.42, D = 0.5, T = 0.03;
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  add(new THREE.BoxGeometry(W, T, D), olive, 0, T / 2, 0);                       // floor
  add(new THREE.BoxGeometry(W, H, T), olive, 0, H / 2, D / 2 - T / 2);           // front
  add(new THREE.BoxGeometry(W, H, T), olive, 0, H / 2, -D / 2 + T / 2);          // back
  add(new THREE.BoxGeometry(T, H, D), olive, W / 2 - T / 2, H / 2, 0);           // sides
  add(new THREE.BoxGeometry(T, H, D), olive, -W / 2 + T / 2, H / 2, 0);
  add(new THREE.BoxGeometry(W + 0.005, 0.07, D + 0.005), band, 0, H * 0.62, 0);  // yellow band
  add(new THREE.BoxGeometry(W - 2 * T, 0.02, D - 2 * T), dark, 0, H * 0.55, 0);  // inside, under the rounds
  const round = new THREE.CylinderGeometry(0.018, 0.018, 0.13, 8);
  for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) add(round, brass, -0.3 + i * 0.075, H * 0.55 + 0.07, -0.16 + j * 0.08);
  // The lid: hinged along the back top edge.
  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  add(new THREE.BoxGeometry(W + 0.02, 0.05, D + 0.02), olive, 0, 0.025, D / 2, lid);
  add(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), dark, 0, 0.05, D / 2, lid);
  g.add(lid);
  g.userData.lid = lid;
  return g;
}

// opts: heightAt(x, z, yHint), heal(amount) → bool, addAmmo(n) → bool, fx,
// onCollect(pickup)
export function createPickups(scene, { heightAt, heal, addAmmo, fx, onCollect }) {
  const items = [];
  const rings = {
    health: new THREE.MeshBasicMaterial({ map: ringTexture('80,255,120'), transparent: true, depthWrite: false, fog: false }),
    ammo: new THREE.MeshBasicMaterial({ map: ringTexture('255,196,60'), transparent: true, depthWrite: false, fog: false }),
  };
  const ringGeo = new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2);
  const prompt = document.getElementById('prompt');
  let fullHint = 0;
  // The kit model is waited for before a mission starts (three tries); if it
  // still can't be fetched, a code-built kit stands in, so no kit is ever
  // invisible.
  let kitModel = null;
  const kitReady = (async () => {
    for (let i = 0; i < 3 && !kitModel; i++) {
      try {
        const gltf = await loadGlb('models/items/First_Aid_Kit.glb');
        gltf.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        kitModel = gltf.scene;
      } catch (err) { console.error('first-aid kit model', err); }
    }
    if (!kitModel) kitModel = codeKit();
  })();
  // A faint green (or amber) beam above each pickup, seen over grass and bushes.
  const beamGeo = new THREE.CylinderGeometry(0.09, 0.16, 7, 8, 1, true).translate(0, 3.5, 0);
  const beams = {
    health: new THREE.MeshBasicMaterial({ color: '#7dff9a', transparent: true, opacity: 0.28, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    ammo: new THREE.MeshBasicMaterial({ color: '#ffc43c', transparent: true, opacity: 0.2, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  };

  function clear() {
    for (const it of items) scene.remove(it.g);
    items.length = 0;
  }

  // list: [{ id, kind: 'health'|'ammo', x, z, yHint? }]; collected: Set of ids.
  async function configure(list, collected = new Set()) {
    clear();
    await kitReady;
    for (const p of list) {
      const g = new THREE.Group();
      let obj;
      if (p.kind === 'health') {
        obj = kitModel.clone();
        if (!kitModel.userData.code) obj.scale.setScalar(0.32); // about 60 cm wide, easy to spot
      } else if (p.kind === 'crate') {
        obj = codeCrate();
        obj.rotation.y = p.yaw ?? 0;
      } else obj = ammoBox();
      g.add(obj);
      const ring = new THREE.Mesh(ringGeo, rings[p.kind === 'crate' ? 'ammo' : p.kind].clone());
      g.add(ring);
      const beam = new THREE.Mesh(beamGeo, beams[p.kind === 'crate' ? 'ammo' : p.kind]);
      g.add(beam);
      g.position.set(p.x, heightAt(p.x, p.z, p.yHint), p.z);
      scene.add(g);
      const used = collected.has(p.id);
      g.visible = !used;
      const it = { ...p, g, obj, ring, beam, used, open: 0, phase: Math.random() * 6 };
      if (p.kind === 'crate') showCrate(it, used ? 1 : 0);
      items.push(it);
    }
  }

  // An ammunition box stays where it is; once used it is shown open, without its ring and beam.
  function showCrate(it, open) {
    it.open = open;
    it.g.visible = true;
    it.ring.visible = it.beam.visible = !it.used;
    it.obj.userData.lid.rotation.x = -open * 1.9;
  }

  return {
    items,
    configure,
    ready: kitReady,
    // For tests: how the kits are drawn ('model' or 'code').
    get kitKind() { return kitModel ? (kitModel.userData.code ? 'code' : 'model') : 'loading'; },
    setCollected(collected) {
      for (const it of items) {
        it.used = collected.has(it.id);
        if (it.kind === 'crate') showCrate(it, it.used ? 1 : 0);
        else it.g.visible = !it.used;
      }
    },
    update(dt, player) {
      const p = player.position;
      const t = performance.now() / 1000;
      fullHint -= dt;
      for (const k of items) {
        const d = Math.hypot(p.x - k.x, p.z - k.z);
        if (k.kind === 'crate') {
          // The lid swings open after the box is used.
          if (k.used && k.open < 1) showCrate(k, Math.min(1, k.open + dt * 2.5));
          k.g.visible = d < 120;
          if (d < 60) k.g.position.y = heightAt(k.x, k.z, k.yHint);
          if (k.used) continue;
        }
        if (k.used) continue;
        k.g.visible = d < 120;
        if (!k.g.visible) continue;
        // Walking height can change once the valley has finished building.
        if (d < 60) k.g.position.y = heightAt(k.x, k.z, k.yHint);
        if (k.kind !== 'crate') {
          k.obj.position.y = (k.kind === 'health' ? 0.6 : 0.75) + Math.sin(t * 2 + k.phase) * 0.08;
          k.obj.rotation.y += dt * 0.9;
        }
        k.ring.position.y = 0.04;
        k.ring.material.opacity = 0.75 + Math.sin(t * 3 + k.phase) * 0.25;
        if (d < RADIUS && Math.abs(p.y - k.g.position.y) < 1.5 && !player.state.disabled) {
          const ok = k.kind === 'health' ? heal(RULES.kitHeal) : addAmmo(k.kind === 'crate' ? RULES.ammoCrate : RULES.ammoPack);
          if (ok) {
            k.used = true;
            if (k.kind === 'crate') { showCrate(k, 0); sound.play('impact', { volume: 0.25, rate: 1.6 }); }
            else k.g.visible = false;
            if (k.kind === 'health') fx?.chime();
            else { sound.play('bonus', { volume: 0.45 }); fx?.reload?.(); }
            onCollect?.(k);
          } else fullHint = 0.3;
        }
      }
      if (fullHint > 0 && prompt.hidden) {
        prompt.hidden = false;
        prompt.textContent = 'Health full (200): first-aid kit left for later';
      }
    },
  };
}
