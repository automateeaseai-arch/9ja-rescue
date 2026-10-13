// Hostages are held in the captive camp. Walk up to one and
// they follow you in single file — a simple stand-in for the rescue mechanic
// and a way to check each model's walk animation.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGlb, idlePose, makeInPlace } from './player.js';
import { groundHeight } from './world.js';
import { HOSTAGE_SPOTS } from './camp.js';

const HOSTAGES = [
  { name: 'Bus Driver', url: 'models/hostages/Hostage_01_BusDriver.glb' },
  { name: 'Cassava Trader', url: 'models/hostages/Hostage_02_CassavaTrader.glb' },
  { name: 'Lecturer', url: 'models/hostages/Hostage_03_Lecturer.glb' },
  { name: 'Doctor', url: 'models/hostages/Hostage_04_Doctor.glb' },
  { name: 'Civil Service Director', url: 'models/hostages/Hostage_05_CivilServiceDirector.glb' },
  { name: 'NYSC (female)', url: 'models/hostages/Hostage_06_NYSC_Female.glb' },
  { name: 'NYSC (male)', url: 'models/hostages/Hostage_07_NYSC_Male.glb' },
  { name: 'Student', url: 'models/hostages/Hostage_08_Student.glb' },
  { name: 'Kano Gold Seller', url: 'models/hostages/Hostage_09_KanoGoldSeller.glb' },
  { name: 'Businessman', url: 'models/hostages/Hostage_10_Businessman.glb' },
];

const RESCUE_RADIUS = 2.2;
const FOLLOW_GAP = 1.4;   // metres between people in the line
const WALK_SPEED = 1.7;
const RUN_SPEED = 4.5;

export function spawnHostages(scene, onRescue) {
  const units = [];
  const line = []; // rescued hostages, in follow order

  (async () => {
    for (let i = 0; i < HOSTAGES.length; i++) {
      try {
        const gltf = await loadGlb(HOSTAGES[i].url);
        const model = cloneSkinned(gltf.scene);
        model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
        const [x, z] = HOSTAGE_SPOTS[i];
        model.position.set(x, groundHeight(x, z), z);
        model.rotation.y = 0; // face out of the compound, towards the village
        scene.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const clip = (n) => gltf.animations.find((c) => c.name === n);
        const actions = {
          idle: mixer.clipAction(idlePose(gltf)),
          walk: mixer.clipAction(makeInPlace(clip('Walk'))),
          run: mixer.clipAction(makeInPlace(clip('Run'))),
        };
        for (const a of Object.values(actions)) { a.play(); a.setEffectiveWeight(0); }
        actions.idle.setEffectiveWeight(1);
        units.push({ name: HOSTAGES[i].name, model, mixer, actions, speed: 0, following: false });
      } catch (err) {
        console.error(err);
      }
    }
  })();

  const target = new THREE.Vector3();
  const delta = new THREE.Vector3();

  return function update(dt, player) {
    for (const u of units) {
      if (!u.following && u.model.position.distanceTo(player.position) < RESCUE_RADIUS) {
        u.following = true;
        line.push(u);
        onRescue?.(u.name, line.length, HOSTAGES.length);
      }
    }

    // Each rescued hostage walks towards the person ahead of them in the line.
    let leader = player.position;
    for (const u of line) {
      target.copy(leader);
      delta.subVectors(target, u.model.position).setY(0);
      const dist = delta.length();
      let want = 0;
      if (dist > FOLLOW_GAP) want = dist > 4 ? RUN_SPEED : WALK_SPEED;
      u.speed = THREE.MathUtils.damp(u.speed, want, 8, dt);
      if (dist > 0.01) {
        const step = Math.min(u.speed * dt, Math.max(0, dist - FOLLOW_GAP * 0.9));
        u.model.position.addScaledVector(delta.normalize(), step);
        u.model.rotation.y = Math.atan2(delta.x, delta.z);
      }
      u.model.position.y = groundHeight(u.model.position.x, u.model.position.z);
      leader = u.model.position;
    }

    for (const u of units) {
      const s = u.speed;
      const runW = THREE.MathUtils.clamp((s - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
      const walkW = THREE.MathUtils.clamp(s / WALK_SPEED, 0, 1) * (1 - runW);
      u.actions.idle.setEffectiveWeight(Math.max(0, 1 - walkW - runW));
      u.actions.walk.setEffectiveWeight(walkW);
      u.actions.run.setEffectiveWeight(runW);
      u.mixer.update(dt);
    }
  };
}
