// Extraction point: when the player brings following hostages close, they
// walk to the boarding point and climb aboard; once everyone who came is in,
// the vehicle or boat leaves along its route, then returns for the next group.
import * as THREE from 'three';

export function createExtraction({ hostages, vehicle, board, radius = 12, route, speed = 9, returnAfter = 15, onDelivered, deliveredCount }) {
  const home = { pos: vehicle.position.clone(), quat: vehicle.quaternion.clone() };
  const st = { state: 'parked', t: 0, dist: 0, v: 0, aboard: 0, boarding: 0 };
  const extras = [];

  return {
    extras,
    update(dt, player) {
      if (st.state === 'parked') {
        const near = player.position.distanceTo(vehicle.position) < radius + 4;
        if (near && hostages.line.length > 0) {
          for (const u of [...hostages.line]) {
            if (u.model.position.distanceTo(vehicle.position) > radius + 12) continue;
            st.boarding++;
            hostages.sendTo(u, board(), (h) => {
              h.model.visible = false;
              h.gone = true;
              st.boarding--;
              st.aboard++;
              const n = deliveredCount.add();
              onDelivered?.(h.name, n);
            });
          }
        }
        if (st.aboard > 0 && st.boarding === 0 && hostages.line.length === 0) {
          st.t += dt;
          if (st.t > 1.5) { st.state = 'leaving'; st.t = 0; st.dist = 0; st.v = 0; }
        }
      } else if (st.state === 'leaving') {
        st.v = Math.min(speed, st.v + speed * 0.3 * dt);
        st.dist += st.v * dt;
        const { pos, yaw, done } = route(st.dist);
        vehicle.position.copy(pos);
        vehicle.rotation.set(0, yaw, 0);
        st.t += dt;
        if (done || st.t > 20) { vehicle.visible = false; st.state = 'away'; st.t = 0; }
      } else if (st.state === 'away') {
        st.t += dt;
        if (st.t > returnAfter) {
          vehicle.position.copy(home.pos);
          vehicle.quaternion.copy(home.quat);
          vehicle.visible = true;
          st.state = 'parked';
          st.t = 0;
          st.aboard = 0;
        }
      }
      for (const e of extras) e(dt, st);
    },
    get state() { return st.state; },
  };
}

// Shared tally across extraction points.
export function counter() {
  let n = 0;
  return { add: () => ++n, get value() { return n; } };
}

// Route helper: drive along a list of Vector3 waypoints at distance d.
export function polylineRoute(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = cum[cum.length - 1];
  return (d) => {
    if (d >= total) {
      const a = points[points.length - 2], b = points[points.length - 1];
      return { pos: b.clone(), yaw: Math.atan2(b.x - a.x, b.z - a.z), done: true };
    }
    let i = 0;
    while (cum[i + 1] < d) i++;
    const t = (d - cum[i]) / (cum[i + 1] - cum[i]);
    const a = points[i], b = points[i + 1];
    return { pos: a.clone().lerp(b, t), yaw: Math.atan2(b.x - a.x, b.z - a.z), done: false };
  };
}

export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
