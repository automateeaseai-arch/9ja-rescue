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
- `src/world.js`: placeholder savanna village (terrain, huts, enterable house, boulders, trees, grass) with colliders
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

North and Middle Belt share these hostiles. Source sheets 017–021 from `9ja_Rescue_Hostiles_North_Refs.zip`; 022 is a group shot of the same five and 023 (Wiry Civilian Scout) was skipped pending role confirmation.

All models face +Z, have their origin at the feet and use metres. None has an idle clip yet; the game holds the first Walk frame as a stand-in.
