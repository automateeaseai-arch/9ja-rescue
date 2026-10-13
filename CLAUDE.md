# 9ja Rescue — project notes for Claude

Landscape, third-person 3D rescue game for **mobile web browsers** (fictional Nigerian locations; non-graphic combat). The owner is not a programmer and directs the work in plain language. The full rules are in the game design document (not in this repo; the owner can re-upload `9ja_Rescue_Game_Design_Document.docx`). `README.md` holds the **asset register** with every model's file, size, Meshy task IDs and cost; keep it up to date.

## How to work with the owner
- **Follow their lead.** Do only the step they ask for; don't plan or build missions, menus or features they haven't requested.
- **Keep replies brief.** They have usage limits and read on a phone.
- **Be economical with Meshy credits.** Characters cost at most 40 credits (generation + mobile optimisation + rigging; currently 35). Give a credit estimate before spending, and prefer free code solutions: copies of existing models, procedural textures, code-built structures.
- **Always rig and optimise characters for mobile.**
- **Test before reporting.** Use headless Chromium screenshots and the `window.game.simulate()` hook. Say plainly what was only tested on a computer and not on a phone.
- **After each change:** commit and push to the working branch, rebuild the share copy, and republish the artifact link below.

## Where things live
- Playable link (private claude.ai artifact; republish to the same URL): https://claude.ai/artifact/2a5tDXarnH6abmbXxjHrzP
- Branch: `ccr-8667c989-hiwgos` on `automateeaseai-arch/9ja-rescue`
- Meshy API: `https://api.meshy.ai` (the proxy injects the key; check balance with `GET /openapi/v1/balance`). Credits reset monthly around **13 November 2026**. **Balance (13 Oct, after the River Valley kit): 635 credits.** Environment budget agreed by the owner: 700 ceiling, 660 used (`docs/river-valley.md` has the ledger).

## Tech stack
Three.js 0.170 (graphics), Rapier 0.14 compat (physics), Vite 5 (dev server/build). Run `npm install`, then `npm run dev` (port 5173). Asset tools use gltf-transform, sharp and meshoptimizer (dev dependencies).

## Code map (`src/`)
| File | What it does |
|---|---|
| `main.js` | Start-up with step and KB counter on the loading screen (errors shown on screen), renderer (lower resolution and shadows on phones), camera with wall collision, game loop. Test hooks on `window.game`: `look(yaw,pitch)`, `player.teleport(x,y,z)`, `simulate(seconds, input)`, `hostages`. |
| `player.js` | Model loading (`loadGlb`: meshopt decoder; base64 text in the share build; downloads abandoned after 30 s without data, one retry). Characters load on demand when switched to. Rapier kinematic character controller: walk 1.7 m/s, run 5 m/s, jump about 1.4 m high with forward momentum. Animation blending: idle/walk/run, plus arms-only aim/fire while Fire is held. |
| `anims.js` | Shared clips (Idle, shooting, sit cross-legged) in `public/models/anims/Shared_Anims.glb`, retargeted to any character (rotations only, hip height scaled). Upper/lower body split helpers. |
| `input.js` | WASD/Shift/Space, F or right mouse to fire, drag to look; phone: floating left joystick, right-side swipe to look, Jump and Fire buttons. |
| `world.js` | Terrain (rolling hills, flattened at the village, camp and DSS; carved river bed), dirt road, camp track and DSS track. Sky shader with clouds, bright daylight, dust. Code-built acacias, bushes and grass on canvas-painted textures with wind sway. Meshy huts, houses and boulders copied many times. Stacked granite kopjes with a crack and lichen shader (`makeGranite`). `rockCollider`/`placeCopies` helpers. Exports `CAMP`, `DSS`, `riverX`, `groundHeight`. |
| `camp.js` | Captive camp at (50, -62): enterable stick-lattice hut, tarp canopy, stick fences, flapping tarps (`tarpMaterial`, `cloth`), Meshy crates, drums and tables, code jerry cans and clay pots. `HOSTAGE_SPOTS`. |
| `dss.js` | DSS extraction at (-55, 38) by a code-built river with rapids. Meshy SUV and van, canopy, cases. Hostages following the player walk to the van's rear doors and board; the van drives north and returns after 15 s. 5,000 RP per hostage, shown on the HUD only. |
| `hostages.js` | 10 hostages sit in the camp; reaching one makes them follow in single file; `sendTo()` walks them to a point (used for boarding). |
| `hostiles.js` | 10 hostiles stand in rows in the village (or at guard posts passed in `opts.spots`), idle, face the player and raise their rifles within 20 m. No AI or damage yet. |
| `land.js` | Joins the savanna and the valley into **one continuous world**: blended ground and road over the escarpment, plants and rocks in the open country, `createAtmosphere` (light and haze change gradually north → south), `createWorldHeight`. |
| `valley/` | **River Valley**, the southern part of the world (centred on `ORIGIN` (-77, 500); built in the background after start; its own coordinates inside a moved group, with colliders offset). `layout.js`: every location, route, boardwalk, captive spot and guard post, plus the seed. `heights.js`: terrain shape (highlands, west ridge, terraces, ravine, grotto bowl, trails, creeks, river, lake). `build.js`: assembles everything and returns `spawn`, `surfaceAt` (raycast walking height for NPCs on decks), `attachHostages` (boat and van extraction) and `update`. |
| `kit/` | Reusable environment kit: `catalogue.js` (Meshy pieces with size, collision, weathering, LOD; `loadKit`, `place`), `terrain.js` (heightfield from any function, holes, exact `groundAt`), `water.js` (river/creek ribbons, lakes, waterfall), `vegetation.js` (rainforest trees, sub-canopy, palms, banana, ferns, cocoyam, grass, reeds, lilies, vines, maize, acacia), `structures.js` (concrete and plank bridges, boardwalks, jetty, shelter, open shed, enterable code building, compound wall, tent, tank, puddles, DSS boat), `cave.js` (passages and chambers, skylight, open mouths), `materials.js` (weathering and rock shaders), `chunks.js` (instancing per map cell, distance culling, low-detail copies), `extraction.js`. |

Savanna: the player arrives on the road at (roadX(34), 34) facing the village at (0, 0). The camp is north-east and the DSS point west.
River Valley (south of the savanna, reached by the road over the escarpment): rainforest trail in its south-east; captives in the walled plantation compound west of the river (store house and open shed); extraction by boat at the jetty (south) or van at the clearing (west). Reference image mapping, routes and limitations: `docs/river-valley.md`.

## Asset pipeline (`tools/`)
- `meshy-character.sh`: turnaround sheet (front/side/back in thirds) to multi-view model, auto-rig, Walk/Run, 1024 px texture (about 35 credits). Then `squeeze.mjs`.
- `meshy-prop.sh`: text prompt to static prop (30 credits). Then `opt.mjs` (centre, pivot at base) and `squeeze.mjs` (WebP textures, meshopt; optional texture size).
- `animsonly.mjs`: strips the mesh from a Meshy animation GLB, keeping the skeleton and clips.
- `recolor.mjs`: shifts strongly red texture pixels to rust (used on the plantation roof).
- `build-share.sh <outdir>`: builds the artifact copy (models as `.glb.b64.txt`, because artifacts can't serve `.glb`). Publish `<outdir>/page.html` with its `assets/` and `models/` files.
- All models share Meshy's 24-joint skeleton, face +Z (characters) and use metres. Vehicles' fronts point along local -X.
- Meshy animation library IDs: https://docs.meshy.ai/en/api/animation-library. Use `action_ids` (3 credits each) on a rig task. Female Soldier rig: `01a13125-c086-74be-88bc-275b52480683`.

## Progress so far (13 Oct 2026)
- **Characters (all rigged and mobile-optimised):**
  - **Players:** 4: Hunter, Forest Scout (both made earlier in ChatGPT), Female Soldier and Male Soldier.
  - **Hostiles:** 10 (5 North/Middle Belt, 5 South), with rifles welded into the mesh by owner choice.
  - **Hostages:** 10 (later revisions of the victim sheets).
- **Northern environment:**
  - **Arrival:** Meshy boulder, house and hut.
  - **Captive camp:** Meshy crate, drum and table.
  - **DSS point:** Meshy SUV and van.
  - **Everything else:** built in code.
- **Animations:** shared Idle, aim/fire (arms only) and Sit, used on every character.
- **Credits spent:** about 1,019 of 1,020 this month.
- **Fixes along the way:** loading on slow phone connections (all models compressed: 41.6 MB to 17.3 MB, on-demand loading); rocks made solid (colliders match the visible size); brighter lighting; higher, forward-moving jump.
- **One continuous world (13 Oct):** no area switching. The savanna road climbs gently over an escarpment onto the valley plateau. Five captives are in the savanna camp and five in the valley compound.
- **River Valley (13 Oct):**
  - **What it is:** a second area with 16 new Meshy pieces (480 credits; the broken concrete wall isn't used), and everything else built in code.
  - **Routes:** all 12 route checks pass; rescue and boarding were tested at both extraction points.
  - **Phone-mode metrics:** 56–345 draw calls and 0.25–0.71 million triangles (desktop emulation only).
- **Not yet tested on a real phone.** The owner's connection was about 25 KB/s, so the first load takes a few minutes.

## Known gaps
- Fire is animation only: no bullets, sound, damage, health or ammo.
- Hostiles don't move, patrol or fight; welded rifles stretch when they aim.
- No jump animation (3 credits); no crouch, swim, climb, cutlass, punch or kick.
- Hostages and hostiles have no colliders and walk in straight lines; the savanna van drives over the grass rather than along a road. The savanna's start view is about 1 million triangles in phone mode (grass, characters, shadows): the next item to slim.
- No swimming: the player can wade rivers and the lake. Valley stilt houses, plantation house and depot are closed shells (the store house and sheds are enterable).
- RP isn't saved; no checkpoints, menus, accounts, character creation or tutorial.
- The JS bundle is 2.7 MB, mostly the physics engine; shrinking it would speed up the first load.
- The Wiry Civilian Scout reference (role unconfirmed) wasn't modelled.

## Possible next steps (only when the owner asks)
1. Free (code): shooting (bullets/tracers, sound, hit reactions), hostile health and simple AI (patrol, chase, shoot), player health and first-aid kits, mission flow (briefing, objective, delivery reward, silent checkpoint save), a road for the van, hostage and hostile colliders.
2. After credits renew: separate rifle and cutlass props (stops welded-rifle stretching), jump/crouch/climb/swim/melee animations (3 credits each, shared by all), Middle Belt and Southern environment pieces from the owner's reference images.
3. Test on the owner's phone and tune the frame rate (grass density, shadows, pixel ratio).
