# Game plan v2.2: what is built (13 Oct 2026)

Source: `9ja_Rescue_Game_Plan_and_User_Flow_v2.docx` (version 2.2, 13 October 2026), uploaded by the owner. The owner's instructions:
- Organise the game by the plan.
- Place the hostages, first-aid kits, DSS pick-up and hostiles where the plan says.
- Ignore any other characters in the plan.

The owner will hand over the 2D introductory UI and briefing at the end.

Code: `src/mission.js` (flow), `src/config.js` (all numbers and places), `src/save.js` (saving).

## Done in the game

**Mission flow**
- One mission at a time, generated from a saved seed.
- Stages, gated by mission facts: Arrival → Explore → Clear site → Rescue → Escort → DSS boarding → DSS departure → Completed.

**Arrival**
- A random arrival is drawn from 8 authored safe points (savanna road, savanna camp, escarpment road, plateau north road, forest trail, terraced village, viewpoint, wetland).
- It is checked to be dry and far from the site (140 m) and from DSS (70 m). A fallback point is used if none passes.
- Retry and Continue keep the same seed and arrival.

**Hostiles: exactly 10**
- 4 roaming hostiles walk patrol beats. They are chosen from 13 beats along the way from the arrival to the site, at least 60 m from the arrival.
- 6 defend the compound, including one inside the store house.
- None respawn, and each counts once. Group membership is kept through reloads.

**Health kits: exactly 10**
- 8 outside, chosen from 20 spots along the way in; 2 inside the compound walls, in the open yard (never inside a building).
- Each gives +10 HP once, also above 100, up to 200.

**Ammo:** 6 fixed packs of 10 bullets.

**Captives**
- 1 or 2 captives, alternating with each new mission, picked at random from the 10 approved hostage personas.
- They sit in the store house and the storage shed.

**Plan values**
- Player: 100 HP to start, 200 maximum.
- Hostiles: 10 HP each; each hostile bullet that hits the player does 20 HP.
- Player bullets do 2 HP; a punch does 1 HP.
- Gun: 10-round magazine plus 50 reserve, 2 s reload.
- Grenades: 4 HP each, at most 3 per mission.
- Reward: 5,000 RP per captive plus 2 Mission Points, paid once per mission ID.

**Enemy behaviour**
- Hostiles guard or patrol, detect the player (sight cone and line of sight), pursue, attack, search, then return.
- At most two fire at once, and at most one bullet of each round of three can hit.
- They flinch when hit without getting stun-locked.
- Site defenders give up a chase beyond 75 m from the site.

**Captives**
- They call "Help!" when you are near.
- They can be freed only when the six site defenders are down; before that the button says "Clear the captive site first (N left)".
- They follow your exact path (so they use doors and bridges) and crouch while fighting is near.
- They catch up along your path if they fall far behind out of danger.
- They can't be hurt.

**DSS handover**
- The DSS point is the van by the savanna river. Escorting at a run takes about 2.5 minutes from the compound.
- Handover needs all 10 hostiles down and every captive present.
- Captives walk to the van's rear doors and board one by one. The van drives off, and completion is recorded when it reaches its endpoint.

**HUD**
- HP with its number (the bar runs to 200, with a mark at 100), hostile counts (total and site), and one short objective.
- One waypoint with distance, which becomes an arrow at the screen edge when the target is off screen.
- Ammo shown beside Reload.

**Phone controls** (section 10)
- Joystick, Fire (largest), Aim toggle, Jump above Fire, Crouch below Aim.
- Reload by the ammo count.
- Interact (Free, DSS handover, Drive, Get out, Takedown).
- Weapon selector (Gun / Unarmed; Unarmed turns Fire into Punch).
- Grenade (only when carried) and Pause.
- Combat buttons hide while swimming, driving or in the air.

**Saving and recovery**
- Silent saving after pickups, defeats, site arrival, finding and freeing captives, DSS arrival and completion. It also saves every 20 s when no hostile is fighting nearby, and when the game is put away.
- Knocked out: Restart from checkpoint or Retry mission.
- Pause: Resume, Restart from checkpoint, Retry, New mission (with a confirmation).
- Reopening the page continues the mission.
- Phones pause when turned to portrait or when the browser is put in the background.

**Air entry**
- Parachute or glider: one is used up when the plane launches.
- The plane flies over the arrival, and Jump appears only on the approach. The landing area is marked.
- About 30 s of steering. Assisted steering turns you towards the landing area when you aren't steering and keeps you out of the captive site.

**Vehicles:** the pickup and motorbike are parked at the arrival only when owned.

## Decisions taken (owner asked to be told)

**Locations**
- **Captive site:** the walled plantation compound in the River Valley (buildings to search, one defender inside). The savanna camp is now empty scenery.
- **DSS site:** the savanna DSS van, far from the compound. The valley jetty boat and valley van are scenery for now.

**Removed or changed**
- **Automatic health regeneration was removed.** It would make the health kits pointless.
- **Takedown kept:** punching an unaware guard from behind still defeats them at once. This was an earlier owner request; the plan does not mention it. On phones it appears on the Interact button.
- **Showcase removed:** the parachute drifting over the savanna and the glider at the viewpoint (the real ones are used now).
- **Head shots** do the same 2 HP as body shots, as the plan's fixed values say.

**Equipment and menus until the 2D menus arrive**
- The plan's shop and asset screens are 2D work. For now, the Pause menu has **test tools**: choose the entry (ground, parachute, glider), add a parachute, glider or grenades, own the pickup or motorbike, and switch character.
- The account starts with no RP and no equipment, as in the plan, so grenades and vehicles appear only after using the test tools (or buying, once the shop exists).

**Cutlass and kick (owner approved, 36 credits, 13 Oct)**
- Weapon selector: Gun, Cutlass, Unarmed. Cutlass: Fire becomes Slash (2 HP, Meshy sword-slash clip, Meshy cutlass in the hand); Aim is hidden. Unarmed: Fire is Punch (1 HP) and Aim becomes Kick (1 HP, Meshy Spartan kick).

**Owner feedback (13 Oct)**
- No first-aid kit is ever inside a building: the two site kits moved from the store house to the open compound yard; every kit is checked against roofs (now including every enterable building).
- Every building can be entered through its door (`src/kit/doors.js`).
- The direction arrow is now a blinking guide arrow at the top centre that turns towards the objective and names it with the distance, plus a bouncing pin over the target when it is on screen.
- First-aid kits must never be inside buildings that can't be entered: every kit and ammo pack is checked against roofs, rocks and water, and moved to the nearest open ground.
- Aiming: pressing Aim locks onto the nearest hostile in view; tapping a hostile picks them; swiping or dragging from Fire steers freely (finer while aiming).

## 2D start screens (13 Oct, owner's HiFi designs)
- Screens 01, 02, 03, 03A–03D, 04–10, 12, 13 built as real components (11 and 14 excluded as asked). Backgrounds: the owner's boards (old buttons painted out) and clean scenery references; items from the owner's item images; captive faces from the approved hostage sheets.
- Accounts on the device only: verification is checked (never granted by the button), reset links are single-use and expire in 30 minutes; a test inbox stands in for email.
- Three character slots; Male/Female × Hunter/Soldier (equal abilities); name rules; skin tone with a 3D preview; the mission keeps a snapshot of its character.
- Shop: buying and equipping are separate; shortfall shown; one vehicle and one parachute or glider per loadout, 0–3 grenades; deducted at Begin Mission.
- Briefing: five panels from the saved draft (location, captives, drone image, arrival and health advice, final with Begin Mission); the draft is kept until Begin Mission, so it never rerolls.
- Profile (with Sign out) is a simple panel; Rankings and Settings say they aren't built yet.

## Not done yet

**Online services**
- Real accounts and emails (device-only for now, owner's choice), cross-player rankings.

**Settings**
- Graphics, sensitivity, aim assist, button size and position, left-handed layout, vibration, subtitles, brightness, reduced motion.

**Saving**
- Cloud saving and cross-device recovery; a cross-player leaderboard (both need a backend).
- Checkpoints are not written while airborne or driving. Boarding and departure are restored as "at DSS, ready to hand over".

**Not on a real phone**
- Nothing has been tested on a real phone yet: frame rate, touch overlap and escort on a device.
