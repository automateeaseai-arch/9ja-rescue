// Meshy models from the owner's pictures, placed in the world to be seen
// (not usable yet): a hang glider at the valley viewpoint over the gorge, and a
// parachute drifting down over the savanna (it lands, then starts again).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGlb } from './player.js';

const MODELS = {
  glider: { url: 'models/items/Hang_Glider.glb', scale: 5.0 },      // about 9.5 m wingspan
  parachute: { url: 'models/items/Parachute.glb', scale: 4.0 },     // canopy about 7.5 m wide
};

// spots: { glider: [x, z, yaw], parachute: [x, z] } in world coordinates.
export function createShowcase(scene, physics, { spots, heightAt }) {
  const objs = {};
  const solid = (obj, x, y, z, yaw) => {
    // A box collider matching the model, so the player can't walk through it.
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const local = new THREE.Box3().setFromObject(obj.clone().rotateY(-yaw)).getSize(new THREE.Vector3());
    const body = physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + size.y / 2, z)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)));
    physics.createCollider(RAPIER.ColliderDesc.cuboid(local.x / 2 * 0.95, size.y / 2, local.z / 2 * 0.95), body);
  };
  const place = (name, [x, z, yaw = 0], { collide = true } = {}) => loadGlb(MODELS[name].url).then((gltf) => {
    const o = gltf.scene;
    o.scale.setScalar(MODELS[name].scale);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const y = heightAt(x, z);
    o.position.set(x, y, z);
    o.rotation.set(0, yaw, 0);
    if (collide) solid(o, x, y, z, yaw);
    scene.add(o);
    objs[name] = o;
  }).catch((err) => console.error(err));

  place('glider', spots.glider);
  place('parachute', [spots.parachute[0], spots.parachute[1], 0], { collide: false });

  // Parachute: drifts down from 70 m, sways, lands, waits, then starts again.
  let t = 0;
  update.objs = objs;
  return update;
  function update(dt) {
    const p = objs.parachute;
    if (!p) return;
    t += dt;
    const [x0, z0] = spots.parachute;
    const ground = heightAt(x0, z0);
    const fall = 2.6 * t;
    const h = Math.max(0, 70 - fall);
    p.position.set(x0 + Math.sin(t * 0.25) * 6, ground + h, z0 + Math.cos(t * 0.2) * 4);
    p.rotation.z = Math.sin(t * 0.9) * 0.06 * (h > 0 ? 1 : 0);
    p.rotation.y += dt * 0.05;
    p.visible = h > 0 || fall < 70 + 8;   // rests a few seconds on landing
    if (fall > 70 + 8 * 2.6) t = 0;
  }
}
