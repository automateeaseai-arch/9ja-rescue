// Where the trees are, for things that fly: each tree is stored as one or
// two upright cylinders (its crown, and its trunk below it). Used by the air
// drop so the parachute and glider catch in trees. Valley trees are built in
// valley coordinates; `physics.offset` (set by the valley) moves them.
const CELL = 24;
const cells = new Map();
const key = (cx, cz) => cx * 100003 + cz;

// x, z: centre; y0..y1: height range; r: radius.
export function addTreeShape(physics, x, z, y0, y1, r) {
  const o = physics?.offset;
  if (o) { x += o.x; z += o.z; }
  const t = { x, z, y0, y1, r };
  // Listed in every cell the cylinder touches.
  for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
    for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
      const k = key(cx, cz);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(t);
    }
  }
}

// The tree shape containing point (x, y, z), grown by `pad`, or null.
export function treeAt(x, y, z, pad = 0) {
  const list = cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return null;
  for (const t of list) {
    if (y < t.y0 - pad || y > t.y1 + pad) continue;
    const dx = x - t.x, dz = z - t.z, r = t.r + pad;
    if (dx * dx + dz * dz < r * r) return t;
  }
  return null;
}
