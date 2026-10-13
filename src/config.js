// Gameplay numbers and mission layout, from the 9ja Rescue Game Plan and User
// Flow v2.2 (13 Oct 2026). Values marked "default" are the plan's
// implementation defaults or our tuning; the rest are the plan's fixed rules.
// Coordinates: world metres unless marked `valley` (valley-local, converted
// with the valley origin), north is -z.

export const RULES = {
  startHealth: 100,
  maxHealth: 200,          // 100 + ten kits × 10
  kitHeal: 10,             // collectible above 100
  hostileHealth: 10,
  hostileBulletDamage: 20, // to the player
  playerBulletDamage: 2,   // also the cutlass, when it exists
  meleeDamage: 1,          // punch (and kick, when it exists)
  grenadeDamage: 4,
  magazine: 10,
  startReserve: 50,        // 10 loaded + 50 reserve
  reloadTime: 2.0,
  ammoPack: 10,
  rpPerCaptive: 5000,
  missionPoints: 2,
  maxGrenades: 3,          // equipped per mission
  prices: { bike: 20000, truck: 60000, parachute: 15000, glider: 30000, grenade: 1000 },
};

// Hostile tuning (default; the plan asks for these to be data, not constants).
export const AI = {
  viewRange: 28, viewHalfAngle: 60, crouchView: 0.5,
  shootRange: 16, burst: 3, bulletGap: 0.07, burstGap: 0.4,
  hitChanceNear: 0.25, hitChanceFar: 0.06, hitFalloff: 0.012, runningFactor: 0.6,
  maxShooters: 2,          // at most this many hostiles fire at once (fair spacing)
  reaction: 0.6,           // seconds from alert to the first shot
  searchTime: 8,           // seconds without sight before giving up
  alertRadius: 12,         // a hit alerts hostiles this close
  siteLeash: 75,           // site defenders give up chasing this far from the site
  walk: 1.6, run: 4.0,
};

// The captive site: the walled plantation compound in the River Valley.
export const SITE = {
  centre: [-80, 15],                    // valley
  radius: 48,                           // inside this the site counts as reached
  entrances: [[-48, 22], [-75, 41], [-112, 20], [-69, -11]], // valley: east, south, west gates, breach
  // Six defenders, including one inside the store house (valley x, z, facing).
  defenders: [
    [-44, 18, Math.PI / 2], [-84, 10, Math.PI], [-92, 12, -Math.PI / 2],
    [-57, 6, 0], [-75, 45, 0], [-95.5, 30.6, Math.PI / 2],
  ],
  // Captive rooms: the store house and the open storage shed.
  captiveSpots: [[-98.4, 35.2, Math.PI / 2], [-61.5, 36.6, 0]],
  // Two health kits inside the site.
  insideKits: [[-93.6, 35.4, null], [-84, 21, null]],
};

// The DSS destination: the savanna extraction point by the river (the van
// drives off north). Far from the compound: about 650 m of walking.
export const DSS_AREA = { radius: 14 };

// Arrival candidates (authored safe points). Each: [x, z, facing], world or
// valley. Validated at mission start (dry ground, far from the site and DSS,
// no hostile close by).
export const ARRIVALS = [
  { at: 'road34', yaw: Math.PI },              // savanna arrival road, facing the village
  { at: [56, -48], yaw: -2.4 },                // beside the empty savanna camp
  { at: 'esc330', yaw: 0 },                    // escarpment road, facing the valley
  { valley: [88, -140], yaw: 0.2 },            // plateau, on the north road
  { valley: [206, 218], yaw: -2.35 },          // forest arrival trail (south-east)
  { valley: [118, -40], yaw: -1.6 },           // highland terraced village
  { valley: [40, -66], yaw: -1.4 },            // viewpoint over the gorge
  { valley: [80, 204], yaw: -1.6 },            // wetland, south bank
];

// Roaming hostiles: four are chosen per mission from these patrol beats
// (two points each), favouring the way from the arrival to the site.
export const ROAM_BEATS = [
  { a: [0, -4], b: [14, -16] },                          // savanna village
  { a: [48, -56], b: [34, -44] },                        // savanna camp
  { a: 'road120', b: 'road150' },                        // savanna road south
  { a: 'esc280', b: 'esc310' },                          // escarpment road
  { valley: true, a: [110, -100], b: [122, -70] },       // plateau north road
  { valley: true, a: [112, 22], b: [106, 4] },           // highland village
  { valley: true, a: [70, -64], b: [46, -62] },          // viewpoint path
  { valley: true, a: [-70, -46], b: [-72, -28] },        // grotto path to the breach
  { valley: true, a: [14, 34], b: [30, 50] },            // east end of the bridge
  { valley: true, a: [56, 76], b: [84, 104] },           // open grass, direct route
  { valley: true, a: [150, 162], b: [128, 146] },        // arrival trail
  { valley: true, a: [80, 204], b: [40, 206] },          // wetland
  { valley: true, a: [-150, -118], b: [-136, -76] },     // ravine trail
];

// Health kits outside the site: eight are chosen per mission from these
// ([x, z, yHint]; yHint for decks and caves).
export const KIT_POOL = [
  { at: 'road14k' }, { at: [22, -30] }, { at: [40, -50] }, { at: [-44, 30] }, { at: [6, 10] },
  { at: 'esc330k' }, { at: 'esc250k' },
  { valley: [36, -54] }, { valley: [-65, -52] }, { valley: [-34, 16] }, { valley: [-152, -115] },
  { valley: [-178.5, 172], deck: true }, { valley: [-53.5, -102.5], cave: true },
  { valley: [168, 178] }, { valley: [118, -36] }, { valley: [88, -140] }, { valley: [56, 76] },
  { valley: [14, 34] }, { valley: [20, 206] }, { valley: [-130, 22] },
];

// Six fixed ammo packs (10 bullets each).
export const AMMO_SPOTS = [
  { at: [8, -8] }, { at: 'esc300a' }, { valley: [100, -112] }, { valley: [36, -60] },
  { valley: [8, 28] }, { valley: [-76, -40] },
];
