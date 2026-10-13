// Pickups placed by the mission (game plan v2.2): ten first-aid kits (Meshy
// model, +10 HP each, also above 100) and six ammo packs (code-built olive
// box, +10 bullets). Each hovers over a glowing ring (green for health,
// amber for ammo), slowly turns, and is collected once on contact.
import * as THREE from 'three';
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
  let kitModel = null;
  const kitReady = loadGlb('models/items/First_Aid_Kit.glb').then((gltf) => {
    gltf.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    kitModel = gltf.scene;
  }).catch((err) => console.error(err));

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
        obj = kitModel ? kitModel.clone() : new THREE.Group();
        obj.scale.setScalar(0.32); // about 60 cm wide, easy to spot
      } else obj = ammoBox();
      g.add(obj);
      const ring = new THREE.Mesh(ringGeo, rings[p.kind].clone());
      g.add(ring);
      g.position.set(p.x, heightAt(p.x, p.z, p.yHint), p.z);
      scene.add(g);
      const used = collected.has(p.id);
      g.visible = !used;
      items.push({ ...p, g, obj, ring, used, phase: Math.random() * 6 });
    }
  }

  return {
    items,
    configure,
    setCollected(collected) {
      for (const it of items) { it.used = collected.has(it.id); it.g.visible = !it.used; }
    },
    update(dt, player) {
      const p = player.position;
      const t = performance.now() / 1000;
      fullHint -= dt;
      for (const k of items) {
        if (k.used) continue;
        const d = Math.hypot(p.x - k.x, p.z - k.z);
        k.g.visible = d < 120;
        if (!k.g.visible) continue;
        // Walking height can change once the valley has finished building.
        if (d < 60) k.g.position.y = heightAt(k.x, k.z, k.yHint);
        k.obj.position.y = (k.kind === 'health' ? 0.6 : 0.75) + Math.sin(t * 2 + k.phase) * 0.08;
        k.obj.rotation.y += dt * 0.9;
        k.ring.position.y = 0.04;
        k.ring.material.opacity = 0.75 + Math.sin(t * 3 + k.phase) * 0.25;
        if (d < RADIUS && Math.abs(p.y - k.g.position.y) < 1.5 && !player.state.disabled) {
          const ok = k.kind === 'health' ? heal(RULES.kitHeal) : addAmmo(RULES.ammoPack);
          if (ok) {
            k.used = true;
            k.g.visible = false;
            fx?.chime();
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
