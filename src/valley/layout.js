// River Valley layout: every location, route and mission-critical spot in one
// place. Coordinates are metres; north is -z. Heights (third value in a path
// point) are only used where noted.
//
// Reference images (owner's set, in the order supplied):
//  1 jetty + shelter + SUV        → riverside extraction
//  2 thatched stilt village       → wetland homes
//  3 boardwalk hub + big tree     → wetland boardwalk network
//  4 depot warehouse + jetty      → depot inside the plantation compound
//  5 overgrown plantation         → plantation compound (captive objective)
//  6 ravine camp                  → optional ravine camp
//  7 jungle stepping stones       → forest creek crossing
//  8 waterfall grotto             → waterfall grotto
//  9 cave chambers + skylight     → cave interior
// 10 rock tunnel                  → cave entrance
// 11 concrete bridge              → exposed bridge over the river
// 12 rocky farmstead              → highland village (upper terraces)
// 13 dry savanna village          → highland village granaries, valley floor
// 14 terraced village             → highland terraced village
// 15 rocky river                  → gorge with stepping-stone crossing
// 16 red-mud jungle trail         → forest arrival trail

export const SEED = 2026;
export const HALF = 260; // the valley spans -260..260 on both axes
export const GRID = 2;   // terrain vertex spacing

// Main river, north to south, ending in the wetland lake.
export const RIVER = [
  [-6, -275], [-10, -220], [-2, -170], [-12, -120], [-10, -88], [-16, -50],
  [-14, -10], [-16, 30], [-26, 70], [-48, 105], [-85, 135], [-125, 158], [-168, 178],
];
export const LAKE = { x: -190, z: 178, rx: 72, rz: 58, level: 0.6 };

// Forest creek crossing the arrival trail (reference 7 and 16).
export const CREEK = [[238, 92], [205, 135], [172, 170], [150, 205], [138, 265]];

// Locations.
export const SPAWN = { x: 206, z: 218, yaw: -2.35 }; // facing north-west up the trail
export const COMPOUND = { x: -80, z: 15, w: 64, d: 52 }; // walled plantation/depot compound
export const GATES = {
  east: { x: -48, z: 22 },
  south: { x: -75, z: 41 },
  west: { x: -112, z: 20 },
  breach: { x: -69, z: -11 }, // broken wall, reached from the grotto path
};
export const BRIDGE = { x: -16, z: 30, length: 34, width: 5.2, deck: 8.0 };
export const GROTTO = { x: -74, z: -58, r: 13, pool: 7.5, fallTop: 15.5 };
export const VILLAGE = { x: 125, z: -28 };
export const VIEWPOINT = { x: 40, z: -58 };
export const RAVINE_CAMP = { x: -156, z: -128 };
export const JETTY = { x: -58, z: 98, length: 13, dir: 0.18 }; // dir: yaw of the jetty (points out into the river)
export const DRY_EXTRACTION = { x: -165, z: 26 };
export const STEPPING = { x: -10, z: -92 }; // stepping-stone ford in the gorge

// Cave: passages (polylines) and chambers. Floors are absolute heights.
export const CAVE = {
  height: 5.5,
  passages: [
    { pts: [[-27, -86], [-36, -85], [-44, -83]], w: 5.5 },
    { pts: [[-50, -82], [-53, -92], [-54, -100]], w: 4.2 },             // to the supply chamber
    { pts: [[-52, -78], [-58, -72], [-62, -67], [-64, -61]], w: 5.0 },  // out to the grotto
  ],
  chambers: [
    { x: -50, z: -82, r: 9, h: 9.5, skylight: 3.2 },  // skylight chamber (reference 9)
    { x: -55, z: -104, r: 6, h: 6.0 },               // optional supply chamber
  ],
  floor: { east: 6.4, west: 6.6 },
  entrance: { x: -29, z: -86, yaw: -Math.PI / 2 }, // rock tunnel mouth, facing the gorge
};

// Routes. Each is walkable end to end; mission-critical ones are validated.
export const ROUTES = {
  // Shared start: arrival trail through the rainforest to the fork.
  arrival: [[210, 226], [196, 205], [184, 192], [168, 178], [150, 162], [128, 146], [108, 128]],
  // Direct and exposed: open grass to the concrete bridge, straight to the east gate.
  direct: [[108, 128], [84, 104], [56, 76], [30, 50], [14, 34], [1, 30], [-33, 30], [-42, 26], [-48, 22]],
  // Long and concealed: up through the terraced village, along the plateau edge,
  // down into the gorge, over the stepping stones and through the cave.
  concealed: [
    [108, 128], [118, 100], [122, 60], [112, 22], [104, 6], [112, -10], [130, -20], [118, -36], [124, -52],
    [100, -62], [70, -64], [44, -62], [33, -72], [24, -86], [12, -94], [0, -93], [-16, -91], [-24, -88],
  ],
  caveToBreach: [[-66, -59], [-70, -46], [-72, -30], [-70, -18], [-69, -11]],
  // Southern route along the river's south bank and over the wetland boardwalks.
  wetland: [[150, 162], [125, 185], [80, 204], [20, 206], [-40, 204], [-86, 200], [-108, 198]],
  wetlandToJetty: [[-204, 110], [-176, 108], [-130, 104], [-96, 100], [-70, 96]],
  // Escort routes from the captives to the two extraction points.
  escortRiver: [[-75, 41], [-73, 58], [-68, 76], [-64, 90], [-60, 96]],
  escortDry: [[-112, 20], [-130, 22], [-150, 24], [-160, 25]],
  ravine: [[-117, 20], [-124, 0], [-130, -30], [-136, -70], [-144, -100], [-152, -122]],
  gorgeTrail: [[24, -86], [16, -120], [12, -160]],
};

// Boardwalk network over the wetland (deck at lake level + 1.2 m).
export const BOARDWALKS = [
  { pts: [[-104, 198], [-126, 192], [-146, 186], [-166, 180], [-182, 172]], w: 2.4 }, // over the river mouth
  { pts: [[-182, 172], [-192, 154], [-198, 138], [-202, 122], [-204, 110]], w: 2.4 },   // to the north-west shore
  { pts: [[-182, 172], [-200, 180], [-214, 188]], w: 2.0 },                             // to house C
  { pts: [[-182, 172], [-176, 158]], w: 1.8 },                                         // to house B
  { pts: [[-192, 154], [-212, 152]], w: 1.8 },                                         // to house D
  { pts: [[-166, 180], [-168, 198]], w: 1.8 },                                         // to house E
];
export const BOARDWALK_HUB = { x: -182, z: 172, r: 5 }; // platform round the big tree (reference 3)
export const STILT_HOUSES = [
  { x: -173, z: 152, rot: 0.3, kind: 'thatch' },
  { x: -219, z: 191, rot: -1.9, kind: 'tin' },
  { x: -218, z: 150, rot: 1.6, kind: 'thatch' },
  { x: -169, z: 204, rot: 3.1, kind: 'tin' },
  { x: -206, z: 210, rot: 2.6, kind: 'thatch' },
  { x: -150, z: 208, rot: -2.8, kind: 'thatch' },
];

// Spots for the ten hostages (inside the searchable compound).
export const HOSTAGE_SPOTS = [
  // Store house (south-west), enterable.
  [-99, 31], [-96.5, 31], [-94, 31], [-99, 35.5], [-96.5, 35.5], [-94, 35.5],
  // Open storage shed (south-east).
  [-64, 34], [-61.5, 34.5], [-59, 34], [-61.5, 37],
];

// Hostile guard posts (standing, not yet patrolling).
export const HOSTILE_SPOTS = [
  [-44, 18], [-44, 27],          // east gate
  [-84, 10], [-75, 10],          // in front of the plantation house
  [-57, 6],                      // mill shed
  [-70, 45], [-80, 45],          // south gate
  [-92, 12],                     // depot door
  [-35, 34], [-152, -118],       // bridge west end, ravine camp
];

// Areas that must stay clear of scattered rocks and plants (with margins).
export const KEEP_CLEAR_PATH_W = 3.2;
