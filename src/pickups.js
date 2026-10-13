// First-aid kits along the routes (Meshy model from the owner's picture).
// Each hovers over a glowing green ring and slowly turns; walking into one
// while hurt restores health. Each kit can be used once.
import * as THREE from 'three';
import { loadGlb } from './player.js';

const HEAL = 50;
const RADIUS = 1.4;

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(80,255,120,0.55)');
  grad.addColorStop(0.55, 'rgba(60,255,110,0.12)');
  grad.addColorStop(0.8, 'rgba(90,255,140,0.9)');
  grad.addColorStop(0.88, 'rgba(60,255,110,0.15)');
  grad.addColorStop(1, 'rgba(60,255,110,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// spots: [x, z, yHint?] in world coordinates (yHint for kits inside caves or on decks).
// heightAt(x, z, yHint) gives the walking height. heal(amount) returns false at full health.
export function createPickups(scene, { spots, heightAt, heal, fx }) {
  const kits = [];
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, fog: false, color: '#7dffa0' });
  const ringGeo = new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2);
  const prompt = document.getElementById('prompt');
  let fullHint = 0;

  loadGlb('models/items/First_Aid_Kit.glb').then((gltf) => {
    gltf.scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    for (const [x, z, yHint] of spots) {
      const g = new THREE.Group();
      const kit = gltf.scene.clone();
      kit.scale.setScalar(0.32); // about 60 cm wide, easy to spot
      kit.position.y = -0.1;
      g.add(kit);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      g.add(ring);
      g.position.set(x, heightAt(x, z, yHint), z);
      scene.add(g);
      kits.push({ g, kit, ring, x, z, yHint, used: false, phase: Math.random() * 6 });
    }
  }).catch((err) => console.error(err));

  return {
    kits,
    update(dt, player) {
      const p = player.position;
      const t = performance.now() / 1000;
      fullHint -= dt;
      for (const k of kits) {
        if (k.used) continue;
        const d = Math.hypot(p.x - k.x, p.z - k.z);
        k.g.visible = d < 120;
        if (!k.g.visible) continue;
        // Walking height can change once the valley has finished building.
        if (d < 60) k.g.position.y = heightAt(k.x, k.z, k.yHint);
        k.kit.position.y = 0.6 + Math.sin(t * 2 + k.phase) * 0.08;
        k.kit.rotation.y += dt * 0.9;
        k.ring.position.y = 0.04;
        k.ring.material.opacity = 0.75 + Math.sin(t * 3 + k.phase) * 0.25;
        if (d < RADIUS && Math.abs(p.y - k.g.position.y) < 1.5) {
          if (heal(HEAL)) {
            k.used = true;
            k.g.visible = false;
            fx?.chime();
          } else fullHint = 0.3;
        }
      }
      if (fullHint > 0 && prompt.hidden) {
        prompt.hidden = false;
        prompt.textContent = 'Health full: first-aid kit left for later';
      }
    },
  };
}
