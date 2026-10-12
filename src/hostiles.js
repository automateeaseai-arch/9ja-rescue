// Northern / Middle Belt hostiles placed in the village for viewing.
// They only stand and turn to face the player for now; AI and combat come later.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGlb, idlePose } from './player.js';
import { groundHeight } from './world.js';

const HOSTILES = [
  { name: 'Olive Jacket', url: 'models/hostiles/Hostile_North_01_OliveJacket.glb' },
  { name: 'Dark Robe', url: 'models/hostiles/Hostile_North_02_DarkRobe.glb' },
  { name: 'Black Scarf', url: 'models/hostiles/Hostile_North_03_BlackScarf.glb' },
  { name: 'Sand Robe', url: 'models/hostiles/Hostile_North_04_SandRobe.glb' },
  { name: 'Brown Shirt', url: 'models/hostiles/Hostile_North_05_BrownShirt.glb' },
];

export function spawnHostiles(scene) {
  const units = [];

  (async () => {
    for (let i = 0; i < HOSTILES.length; i++) {
      try {
        const gltf = await loadGlb(HOSTILES[i].url);
        const model = cloneSkinned(gltf.scene);
        model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
        const x = -6 + i * 3;
        const z = 6;
        model.position.set(x, groundHeight(x, z), z);
        scene.add(model);
        const mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(idlePose(gltf)).play();
        units.push({ model, mixer });
      } catch (err) {
        console.error(err);
      }
    }
  })();

  return function update(dt, playerPos) {
    for (const u of units) {
      u.model.rotation.y = Math.atan2(playerPos.x - u.model.position.x, playerPos.z - u.model.position.z);
      u.mixer.update(dt);
    }
  };
}
