// Words over people's heads (owner, 17 Oct): guards shout in Pidgin when they
// spot the player, freed captives thank them by name, and a small "+10 ammo"
// rises over a guard who goes down. Plain page elements placed over the 3D
// view each frame; hidden behind the camera or far away.
import * as THREE from 'three';

const MAX_DIST = 45;

export function createPopups(camera) {
  const root = document.createElement('div');
  root.id = 'popups';
  document.body.appendChild(root);
  const list = [];
  const v = new THREE.Vector3();

  // at: () => Vector3 (followed each frame). kind: 'shout' | 'thanks' | 'score'.
  function show(at, html, { kind = 'shout', secs = 2.4, lift = 0 } = {}) {
    const el = document.createElement('div');
    el.className = `popup ${kind}`;
    el.innerHTML = html;
    root.appendChild(el);
    const p = { at, el, t: 0, secs, lift };
    list.push(p);
    return p;
  }

  function update(dt) {
    const w = innerWidth, h = innerHeight;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.t += dt;
      if (p.t >= p.secs) { p.el.remove(); list.splice(i, 1); continue; }
      v.copy(p.at());
      v.y += p.lift * p.t;
      const far = v.distanceTo(camera.position) > MAX_DIST;
      v.project(camera);
      const off = far || v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      p.el.style.display = off ? 'none' : '';
      if (off) continue;
      const fade = Math.min(1, p.t / 0.12, (p.secs - p.t) / 0.4);
      p.el.style.opacity = fade.toFixed(2);
      p.el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  function clear() { for (const p of list) p.el.remove(); list.length = 0; }
  return { show, update, clear };
}

// Guards (Pidgin): on spotting the player, and on hearing a shot.
export const SHOUTS = {
  alert: ['Who dey there?!', 'Oya, stop there!', 'Catch am!', 'Hey! Who be dat?!', 'Na enemy! Shoot am!', 'E don enter! Oya!', 'Stop there, I say!'],
  heard: ['Wetin be dat?', 'Who dey shoot?', 'Una hear dat?', 'Check am, quick!'],
};
// Freed captives, with their name.
export const THANKS = [
  (n, role) => `Thank you! God bless you!<small>${n} · ${role}</small>`,
  (n, role) => `Thank God! You came for me!<small>${n} · ${role}</small>`,
  (n, role) => `I'm ${n}. Please, take me home!<small>${role}</small>`,
  (n, role) => `God bless you! I'll follow you.<small>${n} · ${role}</small>`,
  (n, role) => `Thank you, my hero!<small>${n} · ${role}</small>`,
];
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
