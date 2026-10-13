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
- Meshy API: `https://api.meshy.ai` (the proxy injects the key; check balance with `GET /openapi/v1/balance`). Credits reset monthly around **13 November 2026**. **Balance (13 Oct, after the grenade, parachute, glider, pickup and motorbike models): 393 credits.** Environment budget agreed by the owner: 700 ceiling, 660 used (`docs/river-valley.md` has the ledger).

## Tech stack
Three.js 0.170 (graphics), Rapier 0.14 compat (physics), Vite 5 (dev server/build). Run `npm install`, then `npm run dev` (port 5173). Asset tools use gltf-transform, sharp and meshoptimizer (dev dependencies).

## Code map (`src/`)
| File | What it does |
|---|---|
| `main.js` | Start-up with step and KB counter on the loading screen (errors shown on screen), renderer (lower resolution and shadows on phones), camera with wall collision, game loop. Test hooks on `window.game`: `look(yaw,pitch)`, `player.teleport(x,y,z)`, `simulate(seconds, input)`, `hostages`. |
| `player.js` | Model loading (`loadGlb`: meshopt decoder; base64 text in the share build; downloads abandoned after 30 s without data, one retry). Characters load on demand when switched to. Rapier kinematic character controller: walk 1.7 m/s, run 5 m/s, jump about 1.4 m high with forward momentum. Modes: ground, **drive** (placed at the vehicle's seat by `vehicles.js`; collider off), **swim** (where the water is over 1.3 m deep: the valley river and the lake; head above water), **climb** (Jump facing a wall or rock 1–3.8 m high: climbs up and stands on top, or over a thin wall and drops down). **Crouch** toggle (C / Crouch button, 1.2 m/s; guards notice you at half the distance). Animation blending: idle/walk/run/crouch, arms-only aim or jab (Meshy clip, punch lands 0.33 s after the press) over the legs. Meshy rifle (`models/items/Rifle.glb`) placed in world space each frame: in the right hand pointing where the camera aims while aiming, slung across the back otherwise. |
| `anims.js` | Shared clips: Idle, shooting, sit (`Shared_Anims.glb`); jab, knock-down, fall forward, swim idle/forward, crouch idle/walk, climb (`Combat_Anims.glb`); over-shoulder throw (`Throw_Anim.glb`). `retarget(clip, model, motion)` for any character (rotations only, hip height scaled; `'keep'` keeps a fall's travel, `'loopUp'` removes the climb's rise). Upper/lower body split helpers. |
| `input.js` | WASD/Shift/Space, F or right mouse to fire, E to punch, drag to look; phone: floating left joystick, right-side swipe to look, Jump, Fire and Punch buttons. |
| `combat.js` | Player combat: hold Fire to aim (camera closes in, crosshair) and shoot rounds of 3 bullets 0.07 s apart with 0.4 s between rounds (25 damage a bullet: 4 body hits or 1 head hit knock a guard out; small aim help, more on phones); punch (3 from the front, or one **takedown** from behind on a guard who hasn't noticed you, with an on-screen hint); health bar, red edge when hit, regenerates after 5 s; knocked out → back at the savanna road or the valley's north road after 3 s. |
| `pickups.js` | First-aid kits (Meshy model) hovering over a green ring at 11 spots along the routes (savanna, road south, valley incl. the cave supply chamber and the boardwalk hub); +50 health once each, left alone at full health. Spots are listed in `main.js`. |
| `grenades.js` | G / Grenade button: Meshy over-shoulder throw clip, Meshy grenade (held in the hand during the throw) flies in an arc where the camera looks and explodes on touching ground, wall, water or a guard. Blast: within 2.5 m knocks guards out, up to 7 m hurts them (30% behind cover), alerts guards within 20 m, can hurt the player, shakes the camera. Leaves a scorched crater mark (ground or wall) and rubble (16 marks, 240 rubble pieces kept). 1.5 s between throws; unlimited grenades. |
| `vehicles.js` | **Drivable** Meshy pickup truck and motorbike, parked by the arrival road. V / Drive button (shown when near) to get in or out. Stick or W/S throttle, brake and reverse, A/D steer, Shift boost (truck 16→21 m/s, bike 19→25 m/s). Arcade: a box collider moved by a character controller (climbs up to 38°, slides on walls, stops at water over 0.9 m deep), tilts to the ground, bike leans into turns. Truck hides the driver; on the bike the player sits in a frozen crouch-walk frame. Hitting a guard above 5 m/s knocks them down. Camera swings behind the vehicle and pulls back. Runs in the fixed step before the player. |
| `showcase.js` | New Meshy models on show (not usable yet): hang glider at the valley viewpoint, parachute drifting down over the savanna on a loop. `window.game.showcase.objs`. |
| `fx.js` | Code-built tracers, muzzle flashes and synthesised gunshot/punch sounds (no downloads). |
| `world.js` | Terrain (rolling hills, flattened at the village, camp and DSS; carved river bed), dirt road, camp track and DSS track. Sky shader with clouds, bright daylight, dust. Code-built acacias, bushes and grass on canvas-painted textures with wind sway. Meshy huts, houses and boulders copied many times. Stacked granite kopjes with a crack and lichen shader (`makeGranite`). `rockCollider`/`placeCopies` helpers. Exports `CAMP`, `DSS`, `riverX`, `groundHeight`. |
| `camp.js` | Captive camp at (50, -62): enterable stick-lattice hut, tarp canopy, stick fences, flapping tarps (`tarpMaterial`, `cloth`), Meshy crates, drums and tables, code jerry cans and clay pots. `HOSTAGE_SPOTS`. |
| `dss.js` | DSS extraction at (-55, 38) by a code-built river with rapids. Meshy SUV and van, canopy, cases. Hostages following the player walk to the van's rear doors and board; the van drives north and returns after 15 s. 5,000 RP per hostage, shown on the HUD only. |
| `hostages.js` | 10 hostages sit in the camp; reaching one makes them follow in single file; `sendTo()` walks them to a point (used for boarding). |
| `hostiles.js` | 10 guards at posts (`opts.spots` with facing), looking slowly left and right. They only notice the player **in front** (120° cone, 28 m, clear line of sight); "?" then "!" above the head. Alerted: chase (4 m/s, slower than the player's run), stop within 16 m with a clear shot and fire rounds of 3 bullets with 0.4 s between rounds (5 damage, hit chance falls with distance and when the player runs). When a guard is hit (shot, punched or taken down), every guard within 12 m is alerted and attacks. Lose the player for 8 s → search, then walk back to post. Capsule colliders and character controller (walls stop them); far guards (>140 m) are frozen. Knocked-out guards play Meshy's knock-down (hit from the front) or fall-forward (from behind) clip and stay down. |
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
- Meshy animation library IDs: https://docs.meshy.ai/en/api/animation-library. Use `action_ids` (3 credits each) on a rig task. Meshy rig tasks expire: the current Female Soldier rig is `01a13561-eb82-75c4-92a3-b19eb0f45746` (13 Oct); if it is gone, re-rig an unskinned copy (5 credits).

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
- **Credits spent:** about 1,019 of 1,020 last month; this month 480 (River Valley kit) + 60 (rifle, first-aid kit).
- **Fixes along the way:** loading on slow phone connections (all models compressed: 41.6 MB to 17.3 MB, on-demand loading); rocks made solid (colliders match the visible size); brighter lighting; higher, forward-moving jump.
- **One continuous world (13 Oct):** no area switching. The savanna road climbs gently over an escarpment onto the valley plateau. Five captives are in the savanna camp and five in the valley compound.
- **River Valley (13 Oct):**
  - **What it is:** a second area with 16 new Meshy pieces (480 credits; the broken concrete wall isn't used), and everything else built in code.
  - **Routes:** all 12 route checks pass; rescue and boarding were tested at both extraction points.
  - **Phone-mode metrics:** 56–345 draw calls and 0.25–0.71 million triangles (desktop emulation only).
- **Not yet tested on a real phone.** The owner's connection was about 25 KB/s, so the first load takes a few minutes.

## Known gaps
- Combat: no ammo, reloading or grenade count; guards don't hear gunshots (only hits within 12 m alert others); knocked-out guards don't get up or respawn. Welded rifles stretch when guards aim. Guards and hostages can't swim or climb (they walk on the river and lake bed).
- No jump animation (3 credits); no cutlass or kick. No climbing ladders or ropes (walls and rocks only); no diving underwater.
- Vehicles: no wheels turning or suspension, no damage or fuel, no passengers (following hostages run behind), the rider pose on the bike is a frozen crouch frame (a Meshy riding clip would be 3 credits). Guards don't drive.
- Hostages have no colliders and walk in straight lines; the savanna van drives over the grass rather than along a road. The savanna's start view is about 1 million triangles in phone mode (grass, characters, shadows): the next item to slim.
- The savanna river is only waded (0.9 m deep). The valley lake was deepened to about 1.9 m (13 Oct) so it can be swum. Valley stilt houses, plantation house and depot are closed shells (the store house and sheds are enterable).
- RP isn't saved; no checkpoints, menus, accounts, character creation or tutorial.
- The JS bundle is 2.7 MB, mostly the physics engine; shrinking it would speed up the first load.
- The Wiry Civilian Scout reference (role unconfirmed) wasn't modelled.

## Possible next steps (only when the owner asks)
1. Free (code): first-aid kits, ammo, guards hearing gunshots, patrol routes, mission flow (briefing, objective, delivery reward, silent checkpoint save), a road for the van, hostage and hostile colliders.
2. After credits renew: separate rifle and cutlass props (stops welded-rifle stretching), jump/kick/cutlass animations (3 credits each, shared by all), Middle Belt and Southern environment pieces from the owner's reference images.
3. Test on the owner's phone and tune the frame rate (grass density, shadows, pixel ratio).
