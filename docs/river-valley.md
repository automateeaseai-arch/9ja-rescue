# River Valley environment

The southern part of the one continuous world: a river valley with an arrival trail through rainforest, rocky highlands with a terraced village, a river gorge, a cave system, a waterfall grotto, a ravine camp, the plantation/depot compound holding captives, a wetland stilt village with boardwalks, and two extraction points.

## One world
- **Layout:** the savanna is in the north (centred on 0, 0). The valley lies south of it, centred on (-77, 500) (`ORIGIN` in `valley/layout.js`), as Nigeria runs from the dry north to the wet south.
- **The joining land** (`src/land.js`):
  - **Ground:** blends each area's own ground at its edges into open rolling country, so there are no seams. The savanna plain rises gently over an escarpment onto the valley plateau.
  - **Road:** the savanna road carries straight on to the plateau's north road.
  - **Rivers:** both rivers begin at rocky springs at the escarpment.
- **Light and haze** shift gradually from the warm, clear north to the softer, humid valley as the player walks south (`createAtmosphere`).
- **Load order:** the valley is built in the background after the game starts, because it is far from the start. Each area's props are hidden when the player is far away.
- **Captives:** five in the savanna camp and five in the valley compound (store house and shed).
- **Guards:** the North/Middle Belt five in the savanna village, the southern five at the compound.
- **Extraction:** delivery works at all three DSS points, with one shared count.

## Reference images → locations
| # | Reference | Where it guides the valley | Built from |
|---|---|---|---|
| 1 | Jetty, shelter, SUV | Riverside extraction (jetty on the west bank, DSS boat, shelter with benches and life jackets, SUV, red mud and puddles) | Code jetty/shelter/boat, Meshy SUV (reused) |
| 2 | Thatched stilt village | Wetland homes on the lake | Meshy thatched stilt house, code boardwalks, reeds, lilies, palms, canoes |
| 3 | Boardwalk hub, big tree | Boardwalk network and the round platform round the hub tree | Code boardwalks with rope rails, Meshy tin-roof stilt house |
| 4 | Depot warehouse | Depot inside the compound | Meshy warehouse, crates, drums |
| 5 | Overgrown plantation | Plantation compound (captive objective): house, mill shed, walls, oil palms, puddles | Meshy plantation house + palm-oil mill, code walls/sheds/store house/tank/fruit piles |
| 6 | Ravine camp | Optional ravine camp | Code tents, tarp canopy, footbridge; Meshy table, drums, crates, boulders |
| 7 | Jungle stepping stones | Forest creek crossing and the grotto stream crossing | Meshy flat river stone, code footbridge |
| 8 | Waterfall grotto | Waterfall grotto at the ridge foot | Meshy mossy overhang cliff, code waterfall, mist and pool |
| 9 | Cave chambers + skylight | Cave interior: passages, skylight chamber, supply chamber | Code cave (walls, floor, roof, skylight), Meshy sandstone vault at the mouth |
| 10 | Rock tunnel | Granite rock shelter beside the plateau trail | Meshy boulder U + a flattened boulder slab on top |
| 11 | Concrete bridge | Exposed road bridge over the river | Code bridge with pier and parapets |
| 12 | Rocky farmstead | Upper terraces of the highland village, maize patch | Meshy dry-stone walls, mud houses (reused), barn, code maize |
| 13 | Dry savanna village | Granaries and barns; dry valley floor round the bridge | Meshy barn, thatched huts (reused), acacias |
| 14 | Terraced village | Highland terraced village with winding path, carts, market stall | Terraced ground, Meshy walls/houses/carts, code stall |
| 15 | Rocky river | River gorge with the stepping-stone ford | Meshy sandstone cliff sections, boulders, flat stones |
| 16 | Red-mud jungle trail | Forest arrival trail | Meshy buttress-root tree trunks + code canopy, ferns, cocoyam, banana, vines |

## Routes (all walked automatically with the game's physics; see "Testing")
- **Direct, exposed:** arrival trail → open grass → concrete bridge → east gate.
- **Long, concealed:** arrival trail → terraced village → plateau (rock shelter, viewpoint over the gorge) → trail cut down the gorge wall → stepping-stone ford → cave → skylight chamber (side branch to the supply chamber) → waterfall grotto → jungle path → breach in the compound's north wall.
- **Wetland:** arrival trail → south bank → boardwalks over the river mouth and through the stilt village → north-west shore → jetty.
- **Optional:** ravine camp, reached from the compound's west gate.
- **Escort:** compound south gate → jetty (boat); compound west gate → clearing (van). Both are open dirt tracks, kept clear of props.

## Reusable kit and layout (no new generations needed for variations)
- `src/valley/layout.js`: every location, route, boardwalk, house, guard post and captive spot, plus the `SEED`.
- `src/kit/catalogue.js`: each Meshy piece with its default size, collision type, weathering and low-detail setting. `place()` puts copies anywhere.
- `src/kit/*`: terrain from any height function, water, plants, structures, cave builder, extraction logic and chunked instancing with distance culling.
- Scattered plants and rocks are rejected near trails, doorways, bridges, boardwalks, extraction points and buildings (`isClear`), so changing the seed or density can't seal a route. Houses in the village are placed only on flat ground away from the path.
- A different seed has **not** been test-built yet.

## Meshy credit ledger (environment ceiling: 700)
| Item | Credits |
|---|---|
| Earlier environment pieces (boulder, house, hut, crate, drum, table) | 180 |
| Stilt house (thatch), stilt house (tin), depot warehouse, plantation house, palm-oil mill, long barn, rock arch, cave chamber, mossy overhang cliff, sandstone cliff section, flat river stone, dry-stone wall, overgrown concrete wall, buttress-root tree, wooden cart, dugout canoe: 16 × 30 | 480 |
| Depot warehouse first attempt (failed on Meshy's side, not charged) | 0 |
| **Total** | **660 of 700** |

Balance after: 635 credits. No remeshes, rigging, animation, Ultra geometry or 4K/8K textures were bought. Lighter versions of trees and rocks are made in code at load time (free).

Pieces that came out differently from the prompt:
- **Concrete wall:** broken, mostly missing geometry, so it isn't used. The compound walls are code-built instead.
- **Rock arch:** a U of boulders with no roof. A flattened boulder slab is laid on top to make the shelter.
- **Plantation roof:** came out bright red and was recoloured to rust locally.

## Testing (desktop Chromium, software rendering; not a phone)
- **Route walk:** 13 checks pass in the single world. They include the savanna start → road over the escarpment → valley plateau, plus the direct, concealed, wetland, ravine and escort routes, the cave branches, and the grotto-to-breach path (`window.game.simulate()` with the real character controller).
- **Split rescue:** savanna camp captives were delivered at the savanna DSS van and valley captives at the jetty, counted together.
- **Phone-mode triangles across the world** (touch emulation, including the shadow pass):
  - escarpment road: 0.36 million
  - valley areas: 0.3–0.72 million
  - savanna start view: 1.0 million, mostly the savanna's existing grass, characters and shadows. This is the next thing to slim for phones.
- **Inside buildings:** every captive spot in the enterable store house can be reached.
- **Rescue test:** freed captives followed the player to the jetty and boarded the boat, which left. The same worked at the van. The test path missed two captives, which was a test-path issue: every spot was reachable on its own.
- **Phone-mode metrics** (touch emulation, phone settings: pixel ratio 1.25, 1024 shadows, shorter draw distance and earlier low detail):
  - draw calls: 56–345 per frame
  - triangles: 0.25–0.71 million (including the shadow pass)
  - The busiest view is the open bridge area.
- **Savanna:** still loads and works.

## Remaining differences, placeholders and unverified items
- **Not tested on a real phone.**
  - The frame rate is unknown, and 345 draw calls at the bridge may be too many for older phones.
  - The first load adds about 3.8 MB of models for this area.
- **Visual differences from the references:**
  - Ground is painted vertex colour plus shader detail, not photographic texture.
  - Grass and leaves are flat cards.
  - Water has no real reflections.
  - The waterfall is a textured sheet.
  - Walls and roofs of code-built buildings use painted textures.
- **Cave:**
  - Light comes from the skylight and the openings, with a warm lamp in the supply chamber.
  - There is no volumetric light shaft (it looked artificial and was removed).
- **Missing features:**
  - Hostages and hostiles still have no colliders, and hostages walk in straight lines (they can cut corners off boardwalks).
  - The player can wade through rivers and the lake (no swimming yet).
- **Stilt houses, plantation house and depot** are closed Meshy shells, so they can't be entered. The searchable captive buildings are the code-built store house and open sheds.
- **Lighting:** one daylight setting for the whole valley. Misty jungle mornings (references 1, 5, 16) and the rain in reference 3 are not separate weather states.
