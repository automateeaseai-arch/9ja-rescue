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
  ammoPack: 10,            // old saved missions' ammo packs
  ammoCrate: 30,           // each of the four ammunition boxes (owner, 14 Oct: 5 → 30)
  ammoDrop: 10,            // bullets left by each defeated hostile (owner, 14 Oct)
  ammoCrates: 4,
  rpPerCaptive: 5000,
  missionPoints: 2,
  maxGrenades: 3,
  roamers: 7,              // hostiles: 7 roaming + 8 at the site = 15 (owner, 14 Oct)
  defenders: 8,          // equipped per mission
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
  hearShot: 45,            // the player's gunshots are heard this far (m)
  hearAlert: 18,           // closer than this, a guard knows where the shot came from
  investigateTime: 12,     // seconds a guard searches around a heard shot
  siteLeash: 75,           // site defenders give up chasing this far from the site
  walk: 1.6, run: 4.0,
};

// Captive sites: each mission picks one at random (owner, 14 Oct: missions
// must differ). Per mission, six defender posts are drawn from the site's
// pool (`fixed` posts are always manned), the captives are put in random
// rooms, and two health kits lie in the open yard. Coordinates are in the
// site's frame: `valley` (valley-local) or `camp` (metres from CAMP in world.js).
export const SITES = [
  {
    id: 'compound', frame: 'valley', name: 'walled plantation compound',
    brief: 'Our drone saw activity at the <b>walled plantation compound</b> west of the river in the River Valley.',
    held: 'The captives are held inside the compound buildings.',
    centre: [-80, 15],                    // valley
    radius: 48,                           // inside this the site counts as reached
    entrances: [[-48, 22], [-75, 41], [-112, 20], [-69, -11]], // east, south, west gates, breach
    defenders: [
      [-44, 18, Math.PI / 2], [-84, 10, Math.PI], [-92, 12, -Math.PI / 2],
      [-57, 6, 0], [-75, 45, 0], [-95.5, 30.6, Math.PI / 2, 'fixed'],   // store house guard
      [-66, 24, 0.8], [-88, 0, Math.PI], [-104, 20, -Math.PI / 2], [-70, -6, 0.3], [-62, 34, 0.2],
    ],
    // Captive rooms: the store house and the open storage shed.
    captiveSpots: [[-98.4, 35.2, Math.PI / 2], [-61.5, 36.6, 0]],
    // Health kits inside the walls, out in the open yard (never inside a building).
    insideKits: [[-79, 14], [-72, 27], [-86, 22], [-66, 12]],
  },
  {
    id: 'camp', frame: 'camp', name: 'kopje camp',
    brief: 'Our drone saw activity at the <b>bush camp among the granite kopjes</b> north-east of the savanna village.',
    held: 'The captives are held in the stick hut and under the tarp canopy.',
    centre: [0, 0],
    radius: 24,
    entrances: [[-9, 11], [16, 3], [3, -17]],   // the track from the village, and gaps between the rocks
    defenders: [
      [-6, 9, 2.5, 'fixed'], [5, 1.5, 0], [10, 4, 1.2], [12, -6, 2], [-3, -9, -2.6], [-11, -1, -1.6],
      [8, -9, 3], [-12, 6, -0.6], [1, 7, 0.4], [15, 1, 1.6],
    ],
    captiveSpots: [[4, -5, 0], [6.5, -4.5, 0], [-8, -5.5, 0.4], [-10.5, -4.5, 0.2]],
    insideKits: [[2, 4], [-4, 1], [9, 1], [-2, -2]],
  },
];

// The DSS destination: the savanna extraction point by the river (the van
// drives off north). Far from the compound: about 650 m of walking.
export const DSS_AREA = { radius: 14 };

// Arrival candidates (authored safe points). Each: [x, z, facing], world or
// valley. Validated at mission start (dry ground, far from the site and DSS,
// no hostile close by).
export const ARRIVALS = [
  { at: 'road34', yaw: Math.PI, name: 'Savanna road', area: 'the savanna road south of the village', image: 'savanna-village' },
  { at: [56, -48], yaw: -2.4, name: 'Savanna camp', area: 'the empty camp among the savanna kopjes', image: 'savanna-kopjes' },
  { at: [-120, 100], yaw: 2.33, name: 'Western grassland', area: 'the open grassland west of the DSS river', image: 'savanna-village' },
  { at: [-140, -60], yaw: 1.58, name: 'North-west hills', area: 'the dry hills in the north-west', image: 'savanna-village' },
  { at: [-80, -140], yaw: 1.03, name: 'Northern bush', area: 'the thorn bush in the far north', image: 'savanna-village' },
  { at: [120, 80], yaw: -2.68, name: 'Eastern plain', area: 'the eastern plain', image: 'savanna-village' },
  { at: [40, 120], yaw: 3.09, name: 'Southern farms', area: 'the farmland south of the village', image: 'savanna-village' },
  { at: [-20, 140], yaw: 2.81, name: 'South-west track', area: 'the track near the escarpment foot', image: 'savanna-village' },
  { at: 'esc330', yaw: 0, name: 'Escarpment road', area: 'the road over the escarpment', image: 'rock-arch' },
  { valley: [88, -140], yaw: 0.2, name: 'Plateau road', area: 'the plateau north road above the valley', image: '06' },
  { valley: [206, 218], yaw: -2.35, name: 'Forest trail', area: 'the red-mud forest trail in the south-east', image: 'forest-trail' },
  { valley: [118, -40], yaw: -1.6, name: 'Terraced village', area: 'the highland terraced village', image: 'terraces' },
  { valley: [40, -66], yaw: -1.4, name: 'Gorge viewpoint', area: 'the viewpoint over the rocky gorge', image: '08' },
  { valley: [80, 204], yaw: -1.6, name: 'Wetland', area: 'the wetland on the south bank', image: 'wetland' },
];

// Roaming hostiles: four are chosen per mission from these patrol beats
// (two points each), favouring the way from the arrival to the site.
export const ROAM_BEATS = [
  { a: [0, -4], b: [14, -16] },                          // savanna village
  { a: [48, -56], b: [34, -44] },                        // savanna camp
  { a: 'road120', b: 'road150' },                        // savanna road south
  { a: [-100, -60], b: [-80, -40] },                     // north-west hills
  { a: [-60, -120], b: [-40, -100] },                    // northern bush
  { a: [100, 40], b: [100, 0] },                         // eastern plain
  { a: [20, 100], b: [40, 80] },                         // southern farms
  { a: [-20, 60], b: [0, 80] },                          // south of the village
  { a: [-120, -20], b: [-100, 0] },                      // western grassland
  { a: [120, -80], b: [120, -60] },                      // north-east
  { a: [-40, -60], b: [-20, -80] },                      // north of the village
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
  { at: [-120, 40] }, { at: [-60, -80] }, { at: [0, 100] }, { at: [80, 40] }, { at: [100, -40] },
  { at: [-100, -100] }, { at: [60, 100] }, { at: [-20, -120] }, { at: [120, 0] }, { at: [-80, -20] },
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
