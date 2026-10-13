// Northern / Middle Belt (front row) and southern (back row) hostiles placed in the village for viewing.
// They idle, turn to face the player, and raise their rifles when the player
// comes within range. Movement, AI and damage come later.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGlb } from './player.js';
import { loadSharedAnims, retarget, upperBody } from './anims.js';
import { groundHeight } from './world.js';

const HOSTILES = [
  { name: 'Olive Jacket', url: 'models/hostiles/Hostile_North_01_OliveJacket.glb' },
  { name: 'Dark Robe', url: 'models/hostiles/Hostile_North_02_DarkRobe.glb' },
  { name: 'Black Scarf', url: 'models/hostiles/Hostile_North_03_BlackScarf.glb' },
  { name: 'Sand Robe', url: 'models/hostiles/Hostile_North_04_SandRobe.glb' },
  { name: 'Brown Shirt', url: 'models/hostiles/Hostile_North_05_BrownShirt.glb' },
  { name: 'Red Polo', url: 'models/hostiles/Hostile_South_01_RedPolo.glb' },
  { name: 'Denim Vest', url: 'models/hostiles/Hostile_South_02_DenimVest.glb' },
  { name: 'Blue Headwrap', url: 'models/hostiles/Hostile_South_03_BlueHeadwrap.glb' },
  { name: 'Balaclava', url: 'models/hostiles/Hostile_South_04_Balaclava.glb' },
  { name: 'Navy Polo', url: 'models/hostiles/Hostile_South_05_NavyPolo.glb' },
];

const AIM_RANGE = 20; // metres

export function spawnHostiles(scene) {
  const units = [];

  (async () => {
    const shared = await loadSharedAnims();
    for (let i = 0; i < HOSTILES.length; i++) {
      try {
        const gltf = await loadGlb(HOSTILES[i].url);
        const model = cloneSkinned(gltf.scene);
        model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
        // North/Middle Belt in the front row, South in the row behind.
        const x = -6 + (i % 5) * 3 + (i < 5 ? 0 : 1.5);
        const z = i < 5 ? 6 : 2.5;
        model.position.set(x, groundHeight(x, z), z);
        scene.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const idle = mixer.clipAction(retarget(shared.idle, model));
        const aim = mixer.clipAction(upperBody(retarget(shared.shoot, model)));
        idle.play();
        aim.play();
        aim.setEffectiveWeight(0);
        // Start each idle at a different point so they don't move in unison.
        idle.time = (i * 0.37) % idle.getClip().duration;
        units.push({ model, mixer, idle, aim, aimW: 0 });
      } catch (err) {
        console.error(err);
      }
    }
  })();

  return function update(dt, playerPos) {
    for (const u of units) {
      u.model.rotation.y = Math.atan2(playerPos.x - u.model.position.x, playerPos.z - u.model.position.z);
      const inRange = u.model.position.distanceTo(playerPos) < AIM_RANGE;
      u.aimW = THREE.MathUtils.damp(u.aimW, inRange ? 1 : 0, 4, dt);
      u.aim.setEffectiveWeight(u.aimW);
      u.idle.setEffectiveWeight(1); // legs keep idling; arms blend towards the aim
      u.mixer.update(dt);
    }
  };
}
