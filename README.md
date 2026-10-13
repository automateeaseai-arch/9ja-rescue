# 9ja Rescue

Landscape, third-person 3D rescue game for mobile web browsers. See the game design document for the full rules.

## Tools
- **Three.js**: 3D graphics, model loading (GLB) and animation
- **Rapier**: physics (collisions, walking on terrain, jumping)
- **Vite**: local web server and production build

## Run it
```
npm install
npm run dev      # opens http://localhost:5173
npm run build    # production files in dist/
```

## Controls
- Desktop: WASD move, Shift run, Space jump, drag the mouse to look
- Phone (landscape): left thumb is a floating joystick (push far to run), swipe on the right side to look, Jump button

## Layout
- `src/main.js`: start-up, camera and game loop
- `src/world.js`: savanna area (terrain, huts, enterable house, boulders, trees, grass) with colliders
- `src/land.js`: joins the savanna and River Valley into one continuous world
- `src/valley/`: River Valley (layout, terrain shape, assembly); `src/kit/`: reusable environment kit
- `src/player.js`: character loading, movement and Walk/Run animation blending
- `src/input.js`: keyboard, mouse and touch controls
- `public/models/`: runtime GLB models

## Asset register
| Asset | File | Size | Height | Skeleton | Clips | In game |
|---|---|---|---|---|---|---|
| Hunter | `public/models/Hunter_mobile.glb` | 3,004,656 B (SHA256 `7b1572a5…aef2`) | 1.80 m | 24 joints (Meshy) | BaseClip, Walk, Run | Loads, walks, runs. Tested in desktop Chromium only |
| Forest Scout (female hunter) | `public/models/Female_Hunter_Forest_Scout_mobile.glb` | 3,219,056 B (SHA256 `9bd8cf3c…14b2`) | 1.70 m | same 24 joints | ReferencePose, Walk, Run | Loads, walks, runs. Tested in desktop Chromium only |
| Female Soldier (woodland patrol) | `public/models/Female_Soldier_Woodland_mobile.glb` | 1,726,580 B (SHA256 `c41ef6d1…3968`), 15,542 tris, 1 material, 1024 px texture. Meshy gen `01a13124-46ac-7057-b115-2c10ab2bd53a`, rig `01a13125-c086-74be-88bc-275b52480683`, 35 credits | 1.70 m | same 24 joints | ReferencePose, Walk, Run | Loads, walks, runs. Tested in desktop Chromium only |
| Male Soldier (woodland patrol) | `public/models/Male_Soldier_Woodland_mobile.glb` | 1,775,440 B (SHA256 `a7dbc2a2…ea94a`), 15,482 tris, 1 material, 1024 px texture. Meshy gen `01a13167-12d0-7284-a430-27acc3af6563`, rig `01a13169-0bbd-71f9-a007-10def49e2b80`, 35 credits | 1.80 m | same 24 joints | ReferencePose, Walk, Run | Loads, walks, runs. Tested in desktop Chromium only |
| Hostile North 01, Olive Jacket | `public/models/hostiles/Hostile_North_01_OliveJacket.glb` | 1,664,884 B (SHA256 `d8266a3b…488f`), 15,488 tris. Gen `01a1317c-3cc1-7433-9595-dfb8eab09d37`, rig `01a1317d-d740-75a0-9439-fa74b07324d8`, 35 credits | 1.80 m | same 24 joints | ReferencePose, Walk, Run | Stands in village. Rifle is part of the mesh |
| Hostile North 02, Dark Robe | `public/models/hostiles/Hostile_North_02_DarkRobe.glb` | 1,685,476 B (SHA256 `ca4a9ba6…240f`), 15,195 tris. Gen `01a1317c-3cd0-7748-9306-e68bd9721493`, rig `01a1317d-fd1b-7370-b8ee-b6a7d0667223`, 35 credits | 1.80 m | same 24 joints | ReferencePose, Walk, Run | Stands in village. Rifle is part of the mesh |
| Hostile North 03, Black Scarf | `public/models/hostiles/Hostile_North_03_BlackScarf.glb` | 1,750,280 B (SHA256 `2317a2b3…f71d`), 15,471 tris. Gen `01a1317c-3cbb-773b-a70e-13ca9fbc003d`, rig `01a1317d-ff94-7210-b88d-4e0bcca7cabb`, 35 credits | 1.80 m | same 24 joints | ReferencePose, Walk, Run | Stands in village. Rifle is part of the mesh |
| Hostile North 04, Sand Robe | `public/models/hostiles/Hostile_North_04_SandRobe.glb` | 1,660,532 B (SHA256 `9786727a…c9b2`), 14,644 tris. Gen `01a1317c-3cd7-7577-bfde-db06ea0fb1fe`, rig `01a1317e-0419-711a-8bc8-687237043e0a`, 35 credits | 1.80 m | same 24 joints | ReferencePose, Walk, Run | Stands in village. Rifle is part of the mesh |
| Hostile North 05, Brown Shirt | `public/models/hostiles/Hostile_North_05_BrownShirt.glb` | 1,602,504 B (SHA256 `a006a029…895b`), 15,524 tris. Gen `01a1317c-3ca1-70ed-a4c2-dc79854fdfc8`, rig `01a1317d-d0e7-72e6-938b-e41b61795ff8`, 35 credits | 1.80 m | same 24 joints | ReferencePose, Walk, Run | Stands in village. Rifle is part of the mesh |
| Hostile South 01, Red Polo | `public/models/hostiles/Hostile_South_01_RedPolo.glb` | 1,588,200 B (SHA256 `6f37ea57…cfe7`), 15,485 tris. Gen `01a1318c-434e-7481-8b42-33b8e8f4070a`, rig `01a1318d-8e96-7537-91e8-3fd11461f81b`, 35 credits | 1.80 m | same 24 joints | ReferencePose, Walk, Run | Stands in village. Rifle is part of the mesh |
| Hostile South 02, Denim Vest | `public/models/hostiles/Hostile_South_02_DenimVest.glb` | 1,571,940 B (SHA256 `cd0cff6d…cb24`), 15,514 tris. Gen `01a1318c-4320-73eb-aa9c-d91b57264546`, rig `01a1318d-8d67-763a-b5aa-972021986252`, 35 credits | 1.80 m | same 24 joints | ReferencePose, Walk, Run | Stands in village. Rifle is part of the mesh |
| Hostile South 03, Blue Headwrap | `public/models/hostiles/Hostile_South_03_BlueHeadwrap.glb` | 1,547,020 B (SHA256 `ad31597e…5d`), 15,566 tris. Gen `01a1318c-4285-7753-9ea7-ab21a42cc18b`, rig `01a1318d-891e-74b3-b737-f57c5aa0fb2d`, 35 credits | 1.80 m | same 24 joints | ReferencePose, Walk, Run | Stands in village. Rifle is part of the mesh |
| Hostile South 04, Balaclava | `public/models/hostiles/Hostile_South_04_Balaclava.glb` | 1,575,252 B (SHA256 `3077077e…bbea`), 15,555 tris. Gen `01a1318c-430b-769c-938a-6e83f48bf4be`, rig `01a1318d-8836-7757-b19f-03c16f3078b4`, 35 credits | 1.80 m | same 24 joints | ReferencePose, Walk, Run | Stands in village. Rifle is part of the mesh |
| Hostile South 05, Navy Polo | `public/models/hostiles/Hostile_South_05_NavyPolo.glb` | 1,538,088 B (SHA256 `033c7a4f…dab3`), 15,554 tris. Gen `01a1318c-42a9-765a-b533-1f87c4dd97d2`, rig `01a1318d-8d3a-73b0-bead-0e3fde7169ab`, 35 credits | 1.80 m | same 24 joints | ReferencePose, Walk, Run | Stands in village. Rifle is part of the mesh |
| Hostage 01 BusDriver | `public/models/hostages/Hostage_01_BusDriver.glb` | 1,291,508 B (SHA256 `64a8526e…7f76`), 15,579 tris. Gen `01a13198-5ea5-76f0-aa81-00f9b5c97afb`, rig `01a13199-7ef9-7598-b50c-05a3340ea10f`, 35 credits | 1.62–1.78 m | same 24 joints | ReferencePose, Walk, Run | Follows player when reached; walk/run tested |
| Hostage 02 CassavaTrader | `public/models/hostages/Hostage_02_CassavaTrader.glb` | 1,547,056 B (SHA256 `b40eb638…b8d9`), 15,486 tris. Gen `01a13198-5f2f-7495-8879-67857b904f6c`, rig `01a1319a-1a5c-751e-9bce-d7bb14e5dfc3`, 35 credits | 1.62–1.78 m | same 24 joints | ReferencePose, Walk, Run | Follows player when reached; walk/run tested |
| Hostage 03 Lecturer | `public/models/hostages/Hostage_03_Lecturer.glb` | 1,351,832 B (SHA256 `abf8fc85…0c26`), 15,508 tris. Gen `01a13198-5e7e-755b-bfa9-bac4897d010f`, rig `01a13199-a14b-7494-9559-1b758a05d9d5`, 35 credits | 1.62–1.78 m | same 24 joints | ReferencePose, Walk, Run | Follows player when reached; walk/run tested |
| Hostage 04 Doctor | `public/models/hostages/Hostage_04_Doctor.glb` | 1,369,072 B (SHA256 `d6db7715…b72f`), 15,468 tris. Gen `01a13198-5ec9-7238-b732-005c83a2871f`, rig `01a13199-cdf5-7366-a5ff-5a21b9139ea0`, 35 credits | 1.62–1.78 m | same 24 joints | ReferencePose, Walk, Run | Follows player when reached; walk/run tested |
| Hostage 05 CivilServiceDirector | `public/models/hostages/Hostage_05_CivilServiceDirector.glb` | 1,456,628 B (SHA256 `e4237cfe…fb8a`), 15,443 tris. Gen `01a13198-5e76-75c6-8bae-334b8c5f910a`, rig `01a1319a-1c7d-70dd-af62-f870a6ec1700`, 35 credits | 1.62–1.78 m | same 24 joints | ReferencePose, Walk, Run | Follows player when reached; walk/run tested |
| Hostage 06 NYSC Female | `public/models/hostages/Hostage_06_NYSC_Female.glb` | 1,592,640 B (SHA256 `f8e01dbb…d2cc`), 15,484 tris. Gen `01a13198-5f21-7554-9929-e058ae2da0f5`, rig `01a1319a-1f88-734f-9109-ead218a63429`, 35 credits | 1.62–1.78 m | same 24 joints | ReferencePose, Walk, Run | Follows player when reached; walk/run tested |
| Hostage 07 NYSC Male | `public/models/hostages/Hostage_07_NYSC_Male.glb` | 1,592,932 B (SHA256 `881d3695…095e`), 15,569 tris. Gen `01a13198-5ec2-7260-a43c-03dc60f5596a`, rig `01a1319a-197d-7419-8583-c493c9caf8b1`, 35 credits | 1.62–1.78 m | same 24 joints | ReferencePose, Walk, Run | Follows player when reached; walk/run tested |
| Hostage 08 Student | `public/models/hostages/Hostage_08_Student.glb` | 1,396,228 B (SHA256 `c3c8a78b…87f0`), 15,186 tris. Gen `01a13198-5e9e-7005-8ed7-88df5984f545`, rig `01a1319a-1e12-77e1-9b8d-27968a8fdb2b`, 35 credits | 1.62–1.78 m | same 24 joints | ReferencePose, Walk, Run | Follows player when reached; walk/run tested |
| Hostage 09 KanoGoldSeller | `public/models/hostages/Hostage_09_KanoGoldSeller.glb` | 1,557,096 B (SHA256 `d87d2f06…e995`), 15,368 tris. Gen `01a13198-5ea7-7175-8a82-dcfe18206e49`, rig `01a1319a-215d-7017-83a0-77636c6f3d8c`, 35 credits | 1.62–1.78 m | same 24 joints | ReferencePose, Walk, Run | Follows player when reached; walk/run tested |
| Hostage 10 Businessman | `public/models/hostages/Hostage_10_Businessman.glb` | 1,283,248 B (SHA256 `5022dec3…d3a8`), 15,421 tris. Gen `01a13198-5f1c-77fb-8b96-0db68b963cff`, rig `01a1319a-1fb8-77d2-b51c-ff6bed6bdf66`, 35 credits | 1.62–1.78 m | same 24 joints | ReferencePose, Walk, Run | Follows player when reached; walk/run tested |

North and Middle Belt share the North hostiles. Source sheets 017–021 from `9ja_Rescue_Hostiles_North_Refs.zip`; 022 is a group shot of the same five and 023 (Wiry Civilian Scout) was skipped pending role confirmation. South hostiles come from sheets 012–016 in `9ja_Rescue_Hostiles_South_Refs.zip`. Hostages come from `9ja_Rescue_Victims_Refs.zip`, using the later revision where a persona had two sheets (030–039).

All runtime GLBs are compressed for slow phone connections (WebP textures at 1024 px, meshopt geometry and animation; loaded with three.js MeshoptDecoder). Sizes and checksums in the tables are from before compression; the uncompressed originals are in git history.

All models face +Z, have their origin at the feet and use metres. Shared clips in `public/models/anims/Shared_Anims.glb` (121 KB, skeleton only): Idle, Walk_Forward_While_Shooting_inplace (used upper-body only as aim/fire) and Sit_Cross_Legged_on_Floor, from Meshy animation task `01a13412-067c-716c-9e81-5ff310512d61` on the Female Soldier rig (9 credits). They are retargeted to every character at runtime (rotations only, hip height scaled).

Combat and movement clips in `public/models/anims/Combat_Anims.glb` (291 KB, skeleton only): Right_Jab_from_Guard (punch), Knock_Down (guard hit from the front), Shot_and_Fall_Forward (guard taken down from behind), Swim_Idle, Swim_Forward, Cautious_Crouch_Walk_Forward, CrouchLookAroundBow (crouch idle), climbing_up_wall. Meshy animation task `01a13562-44f5-76ca-80df-c401c679b078` (8 × 3 = 24 credits) on a fresh rig of the Female Soldier, `01a13561-eb82-75c4-92a3-b19eb0f45746` (5 credits; the old rig task had expired on Meshy). Retargeted the same way; falls keep their travel, the climb loop has its rise removed.

Throw clip in `public/models/anims/Throw_Anim.glb` (56 KB): Over_Shoulder_Throw, Meshy animation task `01a1357e-38a6-73fd-8a02-e2532d33cde4` on the same rig (3 credits). Played on the arms from 0.6 s, grenade released at 1.83 s (clip time).

Air drop clips in `public/models/anims/Air_Anims.glb` (78 KB): Rope_Hang_Idle (under the parachute) and Bar_Hang_Idle (on the hang glider, body tilted forward), Meshy animation task `01a13607-3058-730e-bcd2-c490414395fc` on the same rig (2 × 3 = 6 credits). Freefall uses the Swim_Forward clip slowed down, body belly-down.

Melee clips in `public/models/anims/Melee_Anims.glb` (61 KB): Right_Hand_Sword_Slash (cutlass, arms only, hit at 0.5 s clip time) and Spartan_Kick (whole body, hit at 0.55 s), Meshy animation task `01a13664-3ec4-7077-90c1-9b0905fec7aa` on the same rig (2 × 3 = 6 credits).

## Items register
From the owner's pictures (Meshy image-to-3D, 2K texture, remeshed; then `opt.mjs` and `squeeze.mjs`). Outside the environment budget.

| Item | File | Details | Use |
|---|---|---|---|
| Cutlass (West African machete, dark blade, riveted wooden handle) | `public/models/items/Cutlass.glb` | 135,736 B, 5,702 tris, 512 px texture. Text-to-3D preview `01a13664-40cc-7700-8866-bdc45aec8159`, refine `01a13664-ce61-7090-99b8-2aeaea249738`, 30 credits | In the right hand when the Cutlass is chosen (placed on the RightHand bone each frame, rotated 90° about Y; scale 0.36, about 68 cm). Blade along local -X, edge down |
| Rifle (carbine, olive furniture, red-dot sight) | `public/models/items/Rifle.glb` | 354,956 B, 9,956 tris, 1024 px texture. Task `01a13556-4f0c-7275-8c91-0725d8ab7857`, 30 credits | Player's rifle: in the right hand while aiming (shots leave its muzzle), slung across the back otherwise. Shown 85 cm long |
| First-aid kit (white and teal case, green cross) | `public/models/items/First_Aid_Kit.glb` | 130,604 B, 2,989 tris, 512 px texture. Task `01a13556-53d4-743b-8614-635d7ac1bfe7`, 30 credits | 11 kits along the routes, hovering over a green ring; +50 health, once each, only taken when hurt |
| Grenade (yellow and black, ring pull) | `public/models/items/Grenade.glb` | 170,160 B, 3,087 tris, 512 px texture. Task `01a13589-e0ba-72a1-9dfe-a2df570f80da`, 30 credits | Thrown grenade and held in the hand during the throw; shown 12 cm tall |
| Parachute (yellow/black canopy with harness pack) | `public/models/items/Parachute.glb` | 492,548 B, 9,974 tris, 1024 px texture. Task `01a13589-cdf0-7149-8902-b63aab397c63`, 30 credits | Air drop (`src/airdrop.js`, shown at scale 3, canopy about 5.7 m wide). Also on show drifting down over the savanna east of the arrival road |
| Hang glider (yellow/black wing, black frame) | `public/models/items/Hang_Glider.glb` | 387,236 B, 7,907 tris, 1024 px texture. Task `01a13589-d3cf-71f8-9e21-5eb60d5df0a9`, 30 credits | Air drop (`src/airdrop.js`). Also on show at the valley viewpoint over the gorge. About 9.5 m wingspan. The model is almost flat (made from a front picture), so it looks right from behind and in front, thin from the side |
| Pickup truck (green, yellow stripes, roof rack, rear bench cage) | `public/models/vehicles/Pickup_Truck.glb` | 597,012 B, 20,095 tris, 1024 px texture. Task `01a13589-d780-7471-8634-f0d37f417fbf`, 30 credits | Drivable (`src/vehicles.js`): parked east of the arrival road, facing north. About 5.3 m long. Front along local -X |
| Motorbike (green dual-sport, gold forks) | `public/models/vehicles/Motorbike.glb` | 613,508 B, 15,148 tris, 1024 px texture. Task `01a13589-dbc5-7400-bcef-700b848f616c`, 30 credits | Drivable (`src/vehicles.js`): parked west of the arrival road. About 2.2 m long. Front along local -X |
| Cargo plane (C-130 style, grey-green, open rear ramp, cargo bay inside) | `public/models/vehicles/Cargo_Plane.glb` | 432,376 B, 19,663 tris, 1024 px texture. Text-to-3D preview `01a13607-3259-7105-83ac-34892330ba89`, refine `01a13608-014e-726c-93a4-9315fd518e37`, 30 credits | Air drop (`src/airdrop.js`), shown 30 m long (scale 20). Nose along local -X; cargo floor at 0.95 model units × 20 above the base, open rear from about -7 m. Code adds floor rails, red webbing seats, strapped crates and a green jump light |

## Environment register (northern savanna)
| Piece | File | Details | Rig | In game |
|---|---|---|---|---|
| Granite boulder | `public/models/env/Boulder_Granite.glb` | 311,236 B (SHA256 `ce5870fd…4413`), 3,136 tris, 1024 px texture. Meshy text-to-3D preview `01a131e2-4c2e-76cd-8022-4a78bce22f03`, refine `01a131e2-f4af-771b-9f34-13675cc2a0e0`, 30 credits | Static, no rig | Copied ~280 times: scattered rocks, roadside rocks, distant kopje hills |
| Mud-brick house, tin roof | `public/models/env/House_MudBrick_TinRoof.glb` | 521,980 B (SHA256 `77355504…f26c`), 5,310 tris, 1024 px texture. Meshy text-to-3D preview `01a131e2-4cc4-7749-aafd-e68d3ba1d892`, refine `01a131e3-7934-74a9-8af1-89184e29b174`, 30 credits | Static, no rig | 5 copies around the village |
| Round thatched hut | `public/models/env/Hut_Thatched_Round.glb` | 435,580 B (SHA256 `89c25a6a…e967`), 4,462 tris, 1024 px texture. Meshy text-to-3D preview `01a131e2-4c77-763b-907d-cce66392c078`, refine `01a131e5-7918-7019-852a-2e6206912259`, 30 credits | Static, no rig | 9 copies in the village |
| Wooden supply crate | `public/models/env/Crate_Wooden.glb` | 80,652 B compressed (SHA256 `540f6ce9…09d4`), 1,322 tris, 512 px texture. Meshy text-to-3D preview `01a133b6-acf6-712b-9955-c5b29eff1be3`, refine `01a133b7-f64b-74fc-8b92-ce09e884d024`, 30 credits | Static, no rig | 10 copies in the camp, some stacked |
| Blue 200-litre drum | `public/models/env/Drum_Blue.glb` | 45,668 B compressed (SHA256 `c8b41e0e…6edd`), 1,533 tris, 512 px texture. Meshy text-to-3D preview `01a133b6-ad0d-7746-ac61-20d23a317e00`, refine `01a133b7-f53e-73e0-b353-41bf2acf0e65`, 30 credits | Static, no rig | 6 copies in the camp |
| Rough wooden table | `public/models/env/Table_Wooden.glb` | 86,768 B compressed (SHA256 `9dff358c…73ec`), 1,129 tris, 512 px texture. Meshy text-to-3D preview `01a133b6-ab1b-7279-b1a7-e8996e472f94`, refine `01a133b7-b578-73f0-a668-e7ca20cb7b7b`, 30 credits | Static, no rig | 4 copies in the camp |
| Dark SUV | `public/models/env/Vehicle_SUV_Dark.glb` | 297,472 B compressed (SHA256 `93859ca7…0ed2`), 6,083 tris, 1024 px texture. Meshy text-to-3D preview `01a133f8-ccfa-77cb-925d-1339d163ca7a`, refine `01a133f9-f689-74ee-8f59-aae34dda98be`, 30 credits | Static, no rig | Parked at the DSS point |
| Grey van, rear doors open | `public/models/env/Vehicle_Van_Grey.glb` | 254,120 B compressed (SHA256 `c2594deb…4f55`), 5,444 tris, 1024 px texture. Meshy text-to-3D preview `01a133f8-cfe9-72a2-80ca-b0c7971bfedd`, refine `01a133fa-39e9-730d-aebe-4b3956ca007d`, 30 credits | Static, no rig | DSS extraction van: hostages board it, it drives off and returns |

Trees, bushes, grass, dirt road, sky, clouds, dust and wind sway are generated in code (`src/world.js`), so they cost no credits. The enterable house in the village centre is built in code.

The captive camp (`src/camp.js`) sits 80 m north-east of the village, reached by a dirt track. Its stick-lattice hut (enterable, with doorway), tarp canopy, stick fences and flapping tarps are built in code; crates, drums and tables are Meshy copies; rocks reuse the granite boulder. The 10 hostages are held there.

The DSS extraction point (`src/dss.js`) sits west of the village by a code-built river with rapids. Hostages following the player walk to the van's rear doors and board; once all have boarded the van drives off, then returns 15 s later. Each delivered hostage awards 5,000 RP (shown on the HUD only; not yet saved).

## River Valley kit
Meshy text-to-3D (preview + refine, 30 credits each), compressed with `tools/opt.mjs` + `tools/squeeze.mjs` (1024 px WebP textures; 512 px for the cart and stone). Static, no rig. Placement and sizes live in `src/kit/catalogue.js`; see `docs/river-valley.md` for the reference mapping and credit ledger.

| Asset | File | Size | Meshy tasks (preview, refine) | Used for |
|---|---|---|---|---|
| Long mud barn, tin roof | `public/models/valley/Barn_Long_TinRoof.glb` | 314,324 B (SHA256 `5e96e25a…491a`) | `01a134bb-83a4-733d-981d-25648adbc6a5`, `01a134bd-2b86-733d-b8e3-c047da0ac402` | Highland village (refs 12, 13) |
| Sandstone cave vault | `public/models/valley/Cave_Chamber_Skylight.glb` | 248,144 B (SHA256 `e7a8dd8c…4680`) | `01a134bd-6fa5-701b-890c-036ff7893285`, `01a134be-56d9-75b2-b67c-fb0e59d7352b` | Cave mouth on the gorge (refs 9, 10); no collider |
| Mossy overhanging cliff | `public/models/valley/Cliff_Overhang_Mossy.glb` | 348,840 B (SHA256 `067ef8e0…58e0`) | `01a134bb-83ae-764b-b209-d7f8f0dca728`, `01a134bc-789f-7344-a037-f64dafa7f054` | Waterfall grotto (ref 8) |
| Layered sandstone cliff | `public/models/valley/Cliff_Sandstone_Section.glb` | 138,608 B (SHA256 `6148d481…fb8b`) | `01a134bb-837d-7081-ac29-02c578b3cd8b`, `01a134bc-4b99-7783-92ca-d4ca0eaf6016` | Gorge walls, river banks, grotto bowl (refs 11, 15) |
| Depot warehouse, blue doors | `public/models/valley/Depot_Warehouse.glb` | 373,540 B (SHA256 `d3960fd1…b623`) | `01a134c0-066c-7261-9764-3eced77c85e3`, `01a134c1-50f6-7227-8435-0616dec55f52` | Compound (ref 4). First attempt failed at Meshy, not charged |
| Dugout canoe | `public/models/valley/Dugout_Canoe.glb` | 93,684 B (SHA256 `fe3cf72a…f398`) | `01a134bd-99e5-74be-b26b-7f645a2034ab`, `01a134be-40f6-7388-8ab2-fdc0d0677d94` | Wetland and jetty (refs 2, 3, 4) |
| Rusty palm-oil mill machine | `public/models/valley/Palm_Oil_Mill.glb` | 258,060 B (SHA256 `c19e4b0d…cc38`) | `01a134bb-8338-7172-a646-4bf2eabc9179`, `01a134bc-4c6f-75ff-ae95-e4fa86516e74` | Mill shed in the compound (ref 5) |
| Colonial plantation house | `public/models/valley/Plantation_House.glb` | 426,584 B (SHA256 `a4449d53…bc2c`) | `01a134bb-8374-748f-9d73-1a3f44f73372`, `01a134bd-ab6e-70ef-b361-a0dcd3e89f36` | Compound (ref 5); red roof recoloured to rust (tools/recolor.mjs) |
| Buttress-root tree trunk | `public/models/valley/Rainforest_Tree_Buttress.glb` | 270,116 B (SHA256 `8ab490ee…8631`) | `01a134bd-1c60-710b-8092-501f62f37a9d`, `01a134bd-e436-7507-9c8b-a6d02ad688e8` | Rainforest trees with code trunks and canopy (refs 5, 16) |
| Flat river stone | `public/models/valley/River_Stone_Flat.glb` | 49,620 B (SHA256 `6d222650…6781`) | `01a134bc-2bb5-762c-8bd3-69801cbca456`, `01a134bc-d50a-75a1-b9c2-00a973f2cc3e` | Stepping stones, viewpoint slab (refs 7, 15) |
| Granite boulder U (came out without a roof) | `public/models/valley/Rock_Arch_Tunnel.glb` | 294,596 B (SHA256 `31a6dbd7…90ab`) | `01a134bb-8386-728d-af31-bb99067dfe75`, `01a134bc-6ab7-753a-b761-9b45f83c4df6` | Rock shelter with a boulder slab on top (ref 10) |
| Thatched stilt house | `public/models/valley/Stilt_House_Thatch.glb` | 301,460 B (SHA256 `dec0113b…c4f1`) | `01a134b6-9f13-76d1-9aa7-0a1e11f0b9d3`, `01a134b8-8700-77f1-a0b0-052422252b0f` | Wetland (ref 2) |
| Plastered stilt house, tin roof | `public/models/valley/Stilt_House_Tin.glb` | 328,608 B (SHA256 `330551ed…4bd5`) | `01a134bb-835e-733d-8afc-35dcd1e29c89`, `01a134bc-8c5c-704f-8b5d-671280fd944d` | Wetland (ref 3) |
| Dry-stone wall segment | `public/models/valley/Stone_Wall_Dry.glb` | 150,544 B (SHA256 `72d25a8f…7cd7`) | `01a134bc-d055-7079-a8ec-7ec95dc48815`, `01a134bd-99ea-732a-9b32-c253998b6d80` | Village terrace walls (refs 12, 14) |
| Wooden hand cart | `public/models/valley/Wooden_Cart.glb` | 143,352 B (SHA256 `5444e6d3…6fb2`) | `01a134bd-31ef-7334-a55d-1d3feca0b5fe`, `01a134bd-d91d-70a0-9084-cb29fa685a8b` | Village, compound (refs 13, 14) |
| Overgrown concrete wall | not used (geometry came out broken) | | `01a134bd-0ef1-7231-ba10-09513a2ba1c0`, `01a134bd-9770-7318-8631-13e7327d0598` | Compound walls are code-built instead |

Total for this kit: 480 credits (16 × 30). Environment total with the six earlier pieces: 660 of the 700 ceiling.
