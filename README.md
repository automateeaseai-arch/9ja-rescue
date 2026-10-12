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

All models face +Z, have their origin at the feet and use metres. None has an idle clip yet; the game holds the first Walk frame as a stand-in.
