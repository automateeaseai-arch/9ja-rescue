// Mission flow from the 9ja Rescue Game Plan and User Flow v2.2.
//
// One mission at a time, generated from a saved seed: a random captive site
// (SITES: the valley plantation compound or the savanna kopje camp), a
// validated random arrival, seven roaming hostiles on patrol beats and eight
// health kits chosen along the way to the site, four ammunition boxes (+30 bullets each; defeated hostiles drop 10), six
// defenders on posts drawn from the site's pool, two kits in its yard, and
// one or two random captives (alternating per new mission) in random rooms.
// Stages:
//   ARRIVAL → EXPLORE → CLEAR_SITE → RESCUE → ESCORT → DSS_BOARDING →
//   DSS_DEPARTURE → COMPLETED
// Captives can be freed only when every hostile is down (site defenders
// first, then the arrow hunts the roamers); at DSS every
// freed captive boards the van at once (roaming hostiles left don't block it). The van
// leaves and, at its endpoint, the reward (5,000 RP per captive and
// 2 Mission Points) is paid once per mission ID.
//
// Silent checkpoints (save.js) after pickups, defeats, discoveries, freeing,
// DSS arrival and completion, plus every 20 s when it is safe. Knocked out:
// restart from the checkpoint or retry the mission. Pause: resume, restart,
// retry, save and exit, abandon. The menus (src/ui) choose the character and
// loadout, show the briefing from a saved draft, then start or continue here.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { RULES, SITES, ARRIVALS, ROAM_BEATS, KIT_POOL, AMMO_SPOTS, DSS_AREA } from './config.js';
import { loadAccount, saveAccount, loadMission, saveMission, clearMission, saveFailed, loadDraft, saveDraft, clearDraft } from './save.js';
import { PERSONAS } from './hostages.js';
import { sound } from './sound.js';
import { CAMP } from './world.js';

const VERSION = 1;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

// ctx: { scene, camera, player, combat, hostiles, captives, pickups, grenades,
//   vehicles, airdrop, getDss(), valleyReady (promise), land, roadX, surfaceAt,
//   waterAt, origin, input, isTouch, look(yaw, pitch), applyCharacter(snapshot),
//   onMenu(where) }
export function createMission(ctx) {
  const { player, combat, hostiles, captives, pickups, grenades, vehicles, airdrop, input } = ctx;
  const W = ([x, z]) => [x + ctx.origin.x, z + ctx.origin.z];
  const named = (name) => {
    const m = /^(road|esc)(\d+)([a-z]?)$/.exec(name);
    const z = +m[2];
    const x = (m[1] === 'road' ? ctx.roadX(z) : ctx.land.roadXAt(z)) + (m[3] === 'k' ? 4 : m[3] === 'a' ? -4 : 0);
    return [x, z];
  };
  const spot = (s) => (s.valley ? W(s.valley) : typeof s.at === 'string' ? named(s.at) : s.at);
  const beatPt = (b, p) => (b.valley ? W(p) : typeof p === 'string' ? named(p) : p);
  // The mission's captive site (one of SITES, chosen per mission).
  const site = { x: 0, z: 0, r: 0, def: SITES[0] };
  let entrances = [];
  const siteOf = (id) => SITES.find((d) => d.id === id) ?? SITES[0];
  function useSite(id) {
    const def = siteOf(id);
    const to = (p) => (def.frame === 'valley' ? W(p) : [CAMP.x + p[0], CAMP.z + p[1]]);
    const c = to(def.centre);
    Object.assign(site, { x: c[0], z: c[1], r: def.radius, def, to });
    entrances = def.entrances.map(to);
    hostiles.setSite?.({ x: site.x, z: site.z });
  }
  useSite(SITES[0].id);
  const dssPos = () => ctx.getDss()?.pos ?? new THREE.Vector3(-50, 0, 40);

  // ---------------------------------------------------------------- setup
  // Pickups must be reachable: never under a roof (a closed hut or house),
  // inside a rock or in water. A blocked spot moves to the nearest open ground.
  const downRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  function blocked(x, z) {
    if (ctx.waterAt(x, z)) return true;
    const g = ctx.land.height(x, z);
    downRay.origin = { x, y: g + 30, z };
    const hit = ctx.physics.castRay(downRay, 40, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    return !!hit && g + 30 - hit.timeOfImpact > g + 0.6;
  }
  function openSpot(p) {
    if (p.id?.startsWith('kit-in')) p = { ...p, yHint: undefined };   // old saves: the inside kits move outdoors
    if (p.yHint != null || !blocked(p.x, p.z)) return p;   // authored deck and cave spots stay
    for (let r = 2; r <= 30; r += 2) {
      for (let a = 0; a < 12; a++) {
        const x = p.x + Math.cos(a * Math.PI / 6) * r, z = p.z + Math.sin(a * Math.PI / 6) * r;
        if (!blocked(x, z)) return { ...p, x, z };
      }
    }
    return p;
  }

  // A guard post must be open ground (not inside a rock, wall or crate): a
  // blocked post moves to the nearest free spot. Inside a building is fine.
  function solidAt(x, y, z) {
    let hit = false;
    ctx.physics.intersectionsWithPoint({ x, y, z }, () => { hit = true; return false; }, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    return hit;
  }
  function freePost(r) {
    const [x, z, yaw] = r.post;
    const bad = (px, pz) => ctx.waterAt(px, pz) || solidAt(px, ctx.surfaceAt(px, pz) + 1, pz);
    if (!bad(x, z)) return r;
    for (let d = 1; d <= 12; d += 1) {
      for (let a = 0; a < 12; a++) {
        const px = x + Math.cos(a * Math.PI / 6) * d, pz = z + Math.sin(a * Math.PI / 6) * d;
        if (!bad(px, pz)) return { ...r, post: [px, pz, yaw], patrol: r.patrol };
      }
    }
    return r;
  }

  function generate(seed, captiveCount, entry) {
    const r = rng(seed);
    const shuffle = (list) => list.map((v) => [r(), v]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
    // The captive site for this mission.
    const siteId = SITES[Math.floor(r() * SITES.length)].id;
    useSite(siteId);
    const to = site.to;
    const dss = dssPos();
    const far = (p, x, z, d) => Math.hypot(p[0] - x, p[1] - z) >= d;
    // Arrival: shuffled candidates, the first valid one (fallback: the first).
    const order = ARRIVALS.map((a, i) => [r(), i]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
    let arrival = null;
    for (const i of order) {
      const a = ARRIVALS[i], p = spot(a);
      if (!far(p, site.x, site.z, 140) || !far(p, dss.x, dss.z, 70)) continue;
      if (ctx.waterAt(p[0], p[1])) continue;
      arrival = { x: p[0], z: p[1], yaw: a.yaw, index: i };
      break;
    }
    if (!arrival) { const p = spot(ARRIVALS[0]); arrival = { x: p[0], z: p[1], yaw: ARRIVALS[0].yaw, index: 0 }; }
    // The way in: from the arrival to the nearest site entrance.
    const gate = entrances.reduce((b, e) => (Math.hypot(e[0] - arrival.x, e[1] - arrival.z) < Math.hypot(b[0] - arrival.x, b[1] - arrival.z) ? e : b));
    const corridor = (p) => segDist(p[0], p[1], arrival.x, arrival.z, gate[0], gate[1]);
    const pick = (pool, n, score, ok, spacing) => {
      const ranked = pool.map((p) => ({ p, s: score(p) + r() * 60 })).filter((o) => ok(o.p)).sort((a, b) => a.s - b.s);
      const out = [];
      for (let sp = spacing; out.length < n && sp >= 0; sp -= 15) {
        for (const o of ranked) {
          if (out.length >= n) break;
          if (out.includes(o.p)) continue;
          if (out.every((q) => Math.hypot(q.pos[0] - o.p.pos[0], q.pos[1] - o.p.pos[1]) >= sp)) out.push(o.p);
        }
      }
      return out;
    };
    // Seven roaming hostiles: beats near the way in, clear of the arrival.
    const beats = ROAM_BEATS.map((b) => ({ b, pos: beatPt(b, b.a), pos2: beatPt(b, b.b) }));
    const roam = pick(beats, RULES.roamers, (o) => corridor(o.pos),
      (o) => far(o.pos, arrival.x, arrival.z, 60) && far(o.pos2, arrival.x, arrival.z, 50) && far(o.pos, site.x, site.z, 60) && far(o.pos, dss.x, dss.z, 50), 45);
    // Never fewer than seven: the rest of the beats that are clear of the arrival, then any.
    for (const o of shuffle(beats)) { if (roam.length >= RULES.roamers) break; if (!roam.includes(o) && far(o.pos, arrival.x, arrival.z, 40)) roam.push(o); }
    for (const o of beats) { if (roam.length >= RULES.roamers) break; if (!roam.includes(o)) roam.push(o); }
    // Eight health kits outside the site, two inside.
    const pool = KIT_POOL.map((k) => ({ k, pos: spot(k) }));
    const kits = pick(pool, 8, (o) => corridor(o.pos) * 0.8,
      (o) => far(o.pos, arrival.x, arrival.z, 12) && far(o.pos, site.x, site.z, 55), 30);
    // Never fewer than eight: top up from the rest of the pool if the rules left too few.
    for (const o of shuffle(pool)) { if (kits.length >= 8) break; if (!kits.includes(o) && far(o.pos, site.x, site.z, site.r + 8)) kits.push(o); }
    const kitList = kits.map((o, i) => ({
      id: `kit-${i + 1}`, kind: 'health', x: o.pos[0], z: o.pos[1],
      yHint: o.k.deck ? ctx.land.height(o.pos[0], o.pos[1]) + 3 : o.k.cave ? 7.6 : undefined,
    }));
    shuffle(site.def.insideKits).slice(0, 2).forEach((p, i) => { const [wx, wz] = to(p); kitList.push({ id: `kit-in-${i + 1}`, kind: 'health', x: wx, z: wz }); });
    // Four ammunition boxes along the way in, from the spots the kits didn't take.
    const cratePool = [...pool.filter((o) => !kits.includes(o) && !o.k.deck && !o.k.cave), ...AMMO_SPOTS.map((k) => ({ k, pos: spot(k) }))];
    const awayFromKits = (o) => kits.every((q) => far(o.pos, q.pos[0], q.pos[1], 15));
    const crates = pick(cratePool, RULES.ammoCrates, (o) => corridor(o.pos) * 0.8,
      (o) => far(o.pos, arrival.x, arrival.z, 15) && far(o.pos, site.x, site.z, 55) && awayFromKits(o), 40);
    for (const o of shuffle(cratePool)) { if (crates.length >= RULES.ammoCrates) break; if (!crates.includes(o) && far(o.pos, site.x, site.z, site.r + 8)) crates.push(o); }
    const ammo = crates.map((o, i) => ({ id: `crate-${i + 1}`, kind: 'crate', x: o.pos[0], z: o.pos[1], yaw: r() * Math.PI * 2 }));
    // Eight defenders: the fixed posts, then random ones from the site's pool.
    const posts = site.def.defenders;
    const defenderPosts = [...posts.filter((d) => d[3] === 'fixed'), ...shuffle(posts.filter((d) => d[3] !== 'fixed'))].slice(0, RULES.defenders);
    // Roster by model index: the roamers first, then the site defenders.
    const roster = [
      ...roam.map((o, i) => ({ id: `roam-${i + 1}`, group: 'roam', post: [...o.pos, 0], patrol: [o.pos, o.pos2] })),
      ...defenderPosts.map(([x, z, yaw], i) => ({ id: `site-${i + 1}`, group: 'site', post: [...to([x, z]), yaw] })),
    ];
    // Captives: distinct personas.
    const personas = PERSONAS.map((p, i) => [r(), i]).sort((a, b) => a[0] - b[0]).slice(0, captiveCount).map((a) => a[1]);
    const rooms = shuffle(site.def.captiveSpots);
    const caps = personas.map((persona, i) => {
      const [x, z, yaw] = rooms[i];
      const [wx, wz] = to([x, z]);
      return { id: `captive-${i + 1}`, persona, x: wx, z: wz, yaw };
    });
    return { id: `m-${seed.toString(36)}`, version: VERSION, seed, site: siteId, entry, arrival, roster, kits: kitList, ammo, captives: caps };
  }

  function initialState(setup) {
    return {
      rev: 0, stage: 'ARRIVAL', reachedSite: false, atDss: false,
      player: { x: setup.arrival.x, z: setup.arrival.z, yaw: setup.arrival.yaw },
      hp: RULES.startHealth, mag: RULES.magazine, reserve: RULES.startReserve, grenades: setup.grenades ?? 0,
      pickups: [], hostiles: {}, captives: {},
    };
  }

  // ---------------------------------------------------------------- state
  let account = loadAccount();
  let setup = null;         // the mission's fixed setup
  let cp = null;            // latest checkpoint
  let stage = 'ARRIVAL';
  let reachedSite = false, atDss = false;
  let collected = new Set();
  let paused = false, down = false, finished = false, ready = false;
  let saveTimer = 0, flash = 0;
  // Game-time timers (they stop while paused, unlike setTimeout).
  let timers = [];
  const later = (secs, fn) => timers.push({ t: secs, fn });
  const ui = buildUi();

  function snapshot() {
    const p = player.position;
    const hs = {};
    for (const u of hostiles.units) {
      if (!u.id) continue;
      hs[u.id] = { hp: u.health, down: u.state === 'down', at: [u.model.position.x, u.model.position.z] };
    }
    const cs = {};
    for (const c of captives.units) cs[c.id] = c.state === 'boarding' ? 'following' : c.state;
    return {
      rev: (cp?.rev ?? 0) + 1, stage: ['DSS_BOARDING', 'DSS_DEPARTURE'].includes(stage) ? 'ESCORT' : stage, reachedSite, atDss,
      player: { x: p.x, y: p.y, z: p.z, yaw: player.facing },
      hp: combat.stats.health, mag: combat.stats.mag, reserve: combat.stats.reserve, grenades: grenades.count,
      pickups: [...collected], hostiles: hs, captives: cs,
    };
  }

  // A checkpoint only when the player is somewhere playable.
  function checkpoint() {
    if (!setup || down || finished || paused || stage === 'ARRIVAL') return;
    if (player.state.disabled || player.state.mode === 'drive' || player.state.mode === 'climb') return;
    cp = snapshot();
    saveMission({ setup, cp });
    saveTimer = 0;
  }

  // Puts everything as `state` describes (new mission, retry or checkpoint).
  async function apply(state, { fly = false, onProgress } = {}) {
    const prog = (f, text) => onProgress?.(f, text);
    ready = false;
    paused = false;
    ui.pause.hidden = true;
    timers = [];
    down = false;
    finished = false;
    ui.down.hidden = ui.results.hidden = true;
    airdrop.cancel();
    vehicles.leave();
    if (player.state.mode === 'drive') player.leaveRide(player.position.x, player.position.y, player.position.z);
    prog(0.05, 'Preparing the map');
    await ctx.valleyReady;
    prog(0.3, 'Loading your character');
    await ctx.applyCharacter?.(setup.character);
    prog(0.5, 'Placing hostiles and supplies');
    useSite(setup.site ?? 'compound');   // older saves: the compound
    stage = state.stage;
    siteCleared = false;
    reachedSite = state.reachedSite;
    atDss = state.atDss;
    collected = new Set(state.pickups);
    // Player.
    const pp = state.player;
    const y = pp.y ?? ctx.surfaceAt(pp.x, pp.z);
    player.teleport(pp.x, y, pp.z);
    player.setFacing(pp.yaw);
    ctx.look(pp.yaw + Math.PI, 0.25);
    player.state.disabled = false;
    Object.assign(combat.stats, { health: state.hp, mag: state.mag, reserve: state.reserve, reload: 0, burstLeft: 0, hurt: 0 });
    grenades.count = state.grenades;
    // Hostiles, pickups, captives, DSS van, vehicles.
    setup.roster = setup.roster.map(freePost);
    hostiles.configure(setup.roster.map((r) => {
      const h = state.hostiles[r.id];
      return h ? { ...r, hp: h.hp, down: h.down, at: h.at } : r;
    }));
    setup.kits = setup.kits.map(openSpot);
    setup.ammo = setup.ammo.map(openSpot);
    await pickups.configure([...setup.kits, ...setup.ammo], collected);
    for (const u of hostiles.units) if (u.id && u.state === 'down' && !collected.has(`drop-${u.id}`)) pickups.drop(dropAt(u));
    // Every kit must be there before play starts (owner, 14 Oct).
    const placed = pickups.items.filter((k) => k.kind === 'health' && k.obj.children.length).length;
    if (placed !== setup.kits.length) throw new Error(`Only ${placed} of ${setup.kits.length} first-aid kits could be placed. Tap Retry.`);
    prog(0.65, 'Bringing in the captives');
    await captives.configure(setup.captives.map((c) => ({ ...c, state: state.captives[c.id] ?? 'bound' })), player.position);
    ctx.getDss()?.reset();
    const a = setup.arrival;
    const side = (k) => [a.x + Math.cos(a.yaw) * k, a.z - Math.sin(a.yaw) * k, a.yaw];
    // Only the vehicle equipped for this mission is parked at the arrival.
    vehicles.stage('truck', setup.vehicle === 'truck' ? side(5) : null);
    vehicles.stage('bike', setup.vehicle === 'bike' ? side(-4) : null);
    prog(1, 'Ready');
    ready = true;
    // Air entry: start in the cargo plane over the arrival area.
    if (fly && setup.entry !== 'ground') {
      airdrop.start(setup.entry, { x: a.x, z: a.z }, a.yaw + Math.PI, { x: site.x, z: site.z, r: site.r + 10 });
    } else if (stage === 'ARRIVAL') arrive();
  }

  function arrive() {
    stage = 'EXPLORE';
    showTip('Collect health supplies to improve your chances before reaching the captive site.', 7);
    if (!account.tutorialDone) {
      later(7.5, () => showTip(ctx.isTouch
        ? 'Left thumb: move · Right side: look · Aim, then drag to move the crosshair onto a hostile · Jump turns to Climb at walls and rocks · Interact appears when something is near'
        : 'WASD move · Shift run · F / right mouse fire · Q aim · R reload · E punch · 1 gun · 2 unarmed · V interact · Esc pause', 9));
      account.tutorialDone = true;
      saveAccount(account);
    }
    checkpoint();
  }

  // The briefing's mission: generated once and kept as a draft (so going back
  // and forth between the menus never rerolls it) until Begin Mission.
  let forcedSeed = null;   // tests: the next briefing's seed
  function prepare() {
    const d = loadDraft();
    if (d?.setup?.version === VERSION) return d.setup;
    const count = account.captiveAlternation % 2 === 0 ? 1 : 2;
    const seed = forcedSeed ?? (Math.random() * 2 ** 31) >>> 0;
    forcedSeed = null;
    const s = generate(seed, count, 'ground');
    saveDraft({ setup: s, created: Date.now() });
    return s;
  }
  const discardDraft = () => clearDraft();

  // Begin Mission: the equipped loadout is committed with the mission (up to
  // three grenades, one parachute or glider used by the launch, which is
  // now, and the equipped vehicle), together with the character snapshot.
  function startPrepared(character, onProgress) {
    const d = loadDraft();
    if (!d?.setup) throw new Error('The briefing has expired. Open it again.');
    const inv = account.inventory, lo = account.loadout;
    const entry = lo.air && inv[lo.air] > 0 ? lo.air : 'ground';
    const g = Math.min(RULES.maxGrenades, lo.grenades, inv.grenade);
    const vehicle = lo.vehicle && inv[lo.vehicle] ? lo.vehicle : null;
    account.captiveAlternation++;
    inv.grenade -= g;
    if (entry !== 'ground') inv[entry]--;
    // The next loadout can only offer what is left.
    lo.grenades = Math.min(lo.grenades, inv.grenade, RULES.maxGrenades);
    if (lo.air && !(inv[lo.air] > 0)) lo.air = null;
    const snap = { id: character.id, name: character.name, gender: character.gender, role: character.role, skin: character.skin, assetVersion: character.assetVersion };
    setup = { ...d.setup, entry, grenades: g, vehicle, launched: entry !== 'ground', character: snap };
    cp = initialState(setup);
    saveMission({ setup, cp });
    account.activeCharacter = character.id;
    saveAccount(account);
    clearDraft();
    return apply(cp, { fly: true, onProgress });
  }

  // Same mission from its start (no new seed, no new deduction).
  function retry() {
    cp = initialState(setup);
    saveMission({ setup, cp });
    return apply(cp, { fly: true });
  }
  function restartCheckpoint() {
    if (!cp || cp.stage === 'ARRIVAL') return retry();
    return apply(cp);
  }

  // The saved mission, if there is one to continue.
  function saved() {
    const m = loadMission();
    return m?.setup?.version === VERSION && !m.completed ? m : null;
  }
  function savedSummary() {
    const m = saved();
    if (!m) return null;
    const st = m.cp?.stage ?? 'ARRIVAL';
    const text = { ARRIVAL: 'Arrival', EXPLORE: 'Collecting supplies', CLEAR_SITE: 'Clearing the captive site', RESCUE: 'Rescue in progress', ESCORT: 'Escort to DSS' }[st] ?? 'In progress';
    return { stage: st, text, place: ARRIVALS[m.setup.arrival.index]?.name ?? 'River Valley', captives: m.setup.captives.length, character: m.setup.character ?? null };
  }
  // Continue: same seed, character, place and progress; no briefing replay.
  function continueSaved(onProgress) {
    const m = saved();
    if (!m) throw new Error('There is no saved mission to continue.');
    setup = m.setup;
    cp = m.cp ?? initialState(setup);
    return apply(cp, { fly: cp.stage === 'ARRIVAL', onProgress });
  }
  // Abandoning: progress and the draft go; characters, RP and purchases stay.
  function abandon() {
    clearMission();
    clearDraft();
    stop();
    setup = null;
    cp = null;
  }
  // Leaving play for the menus (the saved mission stays).
  function stop() {
    ready = false;
    paused = false;
    timers = [];
    ui.pause.hidden = ui.down.hidden = ui.results.hidden = true;
    ui.way.hidden = ui.guide.hidden = ui.interact.hidden = ui.tip.hidden = true;
    airdrop.cancel();
    vehicles.leave();
    if (player.state.mode === 'drive') player.leaveRide(player.position.x, player.position.y, player.position.z);
  }

  // ---------------------------------------------------------------- play
  const siteUnits = () => hostiles.units.filter((u) => u.group === 'site');
  const roamUnits = () => hostiles.units.filter((u) => u.group === 'roam');
  const left = (list) => list.filter((u) => u.state !== 'down').length;

  // A defeated hostile leaves 10 bullets where they fell (owner, 14 Oct).
  const dropAt = (u) => ({ id: `drop-${u.id}`, x: u.model.position.x + 0.7, z: u.model.position.z + 0.4, yHint: u.model.position.y });
  function onDefeated(u) {
    if (!ready) return;
    if (u?.id && !collected.has(`drop-${u.id}`)) pickups.drop(dropAt(u));
    later(0, checkpoint);
  }
  function onCollect(item) { collected.add(item.id); checkpoint(); }
  function onDiscover(c) { showTip(`You found ${c.name}.`, 4); checkpoint(); }
  function onDown() {
    down = true;
    sound.ui('error', 0.5);
    ui.down.hidden = false;
  }

  // The DSS handover: every captive walks to the van and climbs in, then it leaves.
  function handover(list) {
    stage = 'DSS_BOARDING';
    const dss = ctx.getDss();
    let boarded = 0;
    list.forEach((c, i) => {
      later(i * 0.7, () => captives.sendTo(c, dss.rearDoor(), (h) => {
        h.model.visible = false;
        h.state = 'boarded';
        boarded++;
        if (boarded === list.length) {
          stage = 'DSS_DEPARTURE';
          later(1.2, () => dss.depart(() => complete(list)));
        }
      }), i * 700);
    });
  }

  function complete(list) {
    for (const c of list) c.state = 'departed';
    stage = 'COMPLETED';
    finished = true;
    sound.ui('achievement', 0.7);
    const rp = list.length * RULES.rpPerCaptive;
    const first = !account.completed.includes(setup.id);
    if (first) {
      // Paid once per mission ID, together with the completion record.
      account.completed.push(setup.id);
      account.rp += rp;
      account.missionPoints += RULES.missionPoints;
      account.missionsCompleted++;
      account.captivesRescued += list.length;
      saveAccount(account);
    }
    saveMission({ setup, cp: snapshot(), completed: true });
    ui.results.hidden = false;
    ui.resultsBody.innerHTML = `
      <div class="big">Mission complete</div>
      <div>Captives rescued: <b>${list.length}</b> (${list.map((c) => c.name).join(', ')})</div>
      <div>Reward: <b>${first ? `+${rp.toLocaleString()} RP` : 'already paid'}</b> · <b>${first ? `+${RULES.missionPoints}` : '0'} Mission Points</b></div>
      <div class="small">Total: ${account.rp.toLocaleString()} RP · ${account.missionPoints} Mission Points · ${account.missionsCompleted} mission${account.missionsCompleted === 1 ? "" : "s"} completed</div>`;
  }

  // What Interact does right now: { label, enabled, run }.
  function interaction() {
    const pp = player.position;
    if (vehicles.driving) return { label: 'Get out', enabled: true, run: () => { driveRequest = true; } };
    for (const c of captives.units) {
      if (!['bound', 'discovered'].includes(c.state) || c.model.position.distanceTo(pp) > 2.6) continue;
      const n = left(hostiles.units);
      if (n > 0) return { label: `Defeat every hostile first (${n} left)`, enabled: false };
      return {
        label: `Free ${c.name}`, enabled: true,
        run: () => {
          captives.free(c);
          sound.play('success', { volume: 0.5 });
          showTip(`${c.name} is free and following you.`, 3);
          checkpoint();
        },
      };
    }
    if (stage === 'ESCORT' && atDss) {
      return { label: 'DSS handover', enabled: true, run: tryHandover };
    }
    if (vehicles.near) return { label: vehicles.near.kind === 'bike' ? 'Ride the motorbike' : 'Drive the pickup', enabled: true, run: () => { driveRequest = true; } };
    if (ctx.isTouch && combat.stats.takedownNear) return { label: 'Takedown', enabled: true, run: () => { input.state.punch = true; } };
    return null;
  }

  function tryHandover() {
    // Every captive must be free and with you (owner, 14 Oct: remaining
    // roaming hostiles no longer block the handover).
    const want = captives.units.filter((c) => c.state === 'following');
    if (want.length < captives.units.length) { showTip(`Free every captive first: ${want.length} of ${captives.units.length} with you.`, 5); return; }
    handover(want);
  }

  let lastCounts = '', lastFocus = null, siteCleared = false;
  let driveRequest = false;
  function takeDriveRequest() { const d = driveRequest; driveRequest = false; return d; }

  // Objective text and the one active waypoint.
  function objective() {
    const pp = player.position;
    const kitsLeft = setup.kits.filter((k) => k.id.startsWith('kit-') && !k.id.startsWith('kit-in') && !collected.has(k.id));
    const got = 8 - kitsLeft.length;
    const nearest = (list, f) => list.reduce((b, o) => { const d = f(o).distanceTo(pp); return !b || d < b.d ? { o, d } : b; }, null)?.o;
    const v3 = (x, z, y) => new THREE.Vector3(x, y ?? ctx.surfaceAt(x, z), z);
    const entrance = () => { const e = entrances.reduce((b, q) => (Math.hypot(q[0] - pp.x, q[1] - pp.z) < Math.hypot(b[0] - pp.x, b[1] - pp.z) ? q : b)); return v3(e[0], e[1]); };
    const roamLeft = left(roamUnits()), siteLeft = left(siteUnits());
    switch (stage) {
      case 'ARRIVAL': return { text: airdrop.active ? 'Air entry: land in the marked area' : 'Arriving…', at: v3(setup.arrival.x, setup.arrival.z), what: 'Landing area' };
      case 'EXPLORE': {
        // The arrow leads to the nearest first-aid kit or ammunition box.
        const cratesLeft = setup.ammo.filter((a) => a.kind === 'crate' && !collected.has(a.id));
        const k = nearest([...kitsLeft, ...cratesLeft], (o) => v3(o.x, o.z, pp.y));
        const close = k && Math.hypot(k.x - pp.x, k.z - pp.z) < 160;
        return { text: `Collect health supplies (${got}/8) and ammunition, then go to the captive site`, at: close ? v3(k.x, k.z) : entrance(),
          what: close ? (k.kind === 'crate' ? 'Ammo box' : 'First-aid kit') : 'Captive site' };
      }
      case 'CLEAR_SITE': {
        // Low on bullets: the arrow leads to the nearest unopened box or dropped bullets.
        if (combat.stats.mag + combat.stats.reserve < 20) {
          const b = nearest(pickups.items.filter((k) => !k.used && k.kind !== 'health'), (k) => v3(k.x, k.z, pp.y));
          if (b && Math.hypot(b.x - pp.x, b.z - pp.z) < 200) return { text: 'Low on bullets: pick up ammunition', at: v3(b.x, b.z), what: b.kind === 'drop' ? 'Bullets' : 'Ammo box' };
        }
        const inside = Math.hypot(pp.x - site.x, pp.z - site.z) < site.r;
        const h = nearest(siteUnits().filter((u) => u.state !== 'down'), (u) => u.model.position);
        if (siteLeft > 0) return { text: `Clear the captive site: ${siteLeft} defenders left`, at: inside && h ? h.model.position : entrance(), what: inside && h ? 'Defender' : 'Captive site' };
        // Site clear: hunt down the roaming hostiles before the rescue (owner, 14 Oct).
        const r = nearest(hostiles.units.filter((u) => u.id && u.state !== 'down'), (u) => u.model.position);
        return { text: `Defeat the remaining hostiles: ${roamLeft} left`, at: r?.model.position ?? null, what: 'Hostile' };
      }
      case 'RESCUE': {
        const freed = captives.units.filter((c) => c.state === 'following').length;
        const c = nearest(captives.units.filter((u) => ['bound', 'discovered'].includes(u.state)), (u) => u.model.position);
        return { text: `Find and free the captives (${freed}/${setup.captives.length})`, at: c?.model.position ?? null, what: c ? c.name : '' };
      }
      case 'ESCORT': {
        const d = dssPos();
        return { text: atDss ? 'At DSS: the captives board the van' : 'Escort the captives to DSS by the river, west of the savanna village', at: d, what: 'DSS van' };
      }
      case 'DSS_BOARDING': return { text: 'Captives boarding the DSS van…', at: null };
      case 'DSS_DEPARTURE': return { text: 'The DSS van is leaving with the captives…', at: null };
      default: return { text: 'Mission complete', at: null };
    }
  }

  // The way to the objective: a blinking guide arrow at the top centre that
  // turns to point where to go (up = straight ahead), with what and how far;
  // and a bouncing pin over the target itself when it is on screen.
  const proj = new THREE.Vector3(), fwd = new THREE.Vector3(), to = new THREE.Vector3();
  function waypoint(at, what = '') {
    if (!at) { ui.way.hidden = ui.guide.hidden = true; return; }
    const cam = ctx.camera;
    const d = Math.hypot(at.x - player.position.x, at.z - player.position.z);
    cam.getWorldDirection(fwd).setY(0).normalize();
    to.set(at.x - cam.position.x, 0, at.z - cam.position.z).normalize();
    const ang = Math.atan2(to.x * -fwd.z + to.z * fwd.x, to.dot(fwd));
    ui.guide.hidden = false;
    ui.guideArrow.style.transform = `rotate(${(ang * 180 / Math.PI).toFixed(1)}deg)`;
    ui.guideText.textContent = `${what ? `${what} · ` : ''}${Math.round(d)} m`;
    ui.guide.classList.toggle('near', d < 15);
    proj.set(at.x, at.y + 2.0, at.z).project(cam);
    const on = proj.z < 1 && Math.abs(proj.x) < 0.9 && proj.y < 0.75 && proj.y > -0.9;
    ui.way.hidden = !on;
    if (!on) return;
    ui.way.style.left = `${(proj.x * 0.5 + 0.5) * innerWidth}px`;
    ui.way.style.top = `${(-proj.y * 0.5 + 0.5) * innerHeight}px`;
    ui.wayDist.textContent = `${Math.round(d)} m`;
  }

  function update(dt, inp = input) {
    if (inp.consumePause?.() && ready && !down && !finished) togglePause();
    if (!setup || !ready || paused) return;
    const pp = player.position;
    saveTimer += dt;
    if (timers.length) {
      const due = timers.filter((t) => (t.t -= dt) <= 0);
      timers = timers.filter((t) => t.t > 0);
      for (const t of due) t.fn();
    }
    flash -= dt;
    // Stage changes come from mission facts.
    if (stage === 'ARRIVAL' && !airdrop.active && player.state.mode !== 'drive') arrive();
    if (!reachedSite && Math.hypot(pp.x - site.x, pp.z - site.z) < site.r + 20) { reachedSite = true; checkpoint(); }
    if (stage === 'EXPLORE' && reachedSite) stage = 'CLEAR_SITE';
    // Every hostile (site and roaming) must be down before the rescue (owner, 14 Oct).
    // (A mission saved under the old rule may be in RESCUE with roamers left: back to clearing.)
    if (stage === 'RESCUE' && left(hostiles.units) > 0 && captives.units.some((c) => ['bound', 'discovered'].includes(c.state))) stage = 'CLEAR_SITE';
    if (stage === 'CLEAR_SITE' && !siteCleared && left(siteUnits()) === 0 && left(hostiles.units) > 0) {
      siteCleared = true; sound.play('success', { volume: 0.4 });
      showTip(`Site clear. Now defeat the roaming hostiles: ${left(hostiles.units)} left. The arrow shows the nearest.`, 5); checkpoint();
    }
    if (stage === 'CLEAR_SITE' && left(hostiles.units) === 0) { stage = 'RESCUE'; sound.play('success', { volume: 0.5 }); showTip('All hostiles defeated. Find and free the captives.', 4); checkpoint(); }
    if (stage === 'RESCUE' && captives.units.length && captives.units.every((c) => c.state === 'following')) {
      stage = 'ESCORT';
      showTip('Escort the captives to DSS. They follow your path: use the bridges.', 5);
      checkpoint();
    }
    const dss = dssPos();
    const near = Math.hypot(pp.x - dss.x, pp.z - dss.z) < DSS_AREA.radius;
    if (stage === 'ESCORT' && near && !atDss) { atDss = true; checkpoint(); }
    // At DSS with every captive: they board the van straight away (no button needed).
    if (stage === 'ESCORT' && atDss && captives.units.length && captives.units.every((c) => c.state === 'following')) tryHandover();
    if (!near && stage === 'ESCORT') atDss = false;
    if (saveTimer > 20 && !hostiles.units.some((u) => u.state === 'alert' && u.model.position.distanceTo(pp) < 45)) checkpoint();

    // HUD.
    const o = objective();
    ui.objective.textContent = o.text;   // kept for screen readers; the HUD shows icons
    waypoint(o.at, o.what);
    // Icon counters (owner, 14 Oct: no sentence, just icons and numbers).
    const total = left(hostiles.units), sl = left(siteUnits());
    const allH = setup.roster.length, allS = setup.roster.filter((r) => r.group === 'site').length;
    const kitsGot = 8 - setup.kits.filter((k) => k.id.startsWith('kit-') && !k.id.startsWith('kit-in') && !collected.has(k.id)).length;
    const freed = captives.units.filter((c) => ['following', 'boarding', 'boarded', 'departed'].includes(c.state)).length;
    const crateList = setup.ammo.filter((a) => a.kind === 'crate');
    const cratesGot = crateList.filter((a) => collected.has(a.id)).length;
    const counts = `${cratesGot}/${crateList.length}|${kitsGot}/8|${total}/${allH}|${sl}/${allS}|${freed}/${setup.captives.length}|${grenades.count}`;
    if (counts !== lastCounts) {
      lastCounts = counts;
      ui.cKits.textContent = `${kitsGot}/8`;
      ui.cCrates.textContent = `${cratesGot}/${crateList.length}`;
      ui.cCrates.parentElement.hidden = !crateList.length;
      ui.cHostiles.textContent = `${total}/${allH}`;
      ui.cSite.textContent = `${sl}/${allS}`;
      ui.cCaptives.textContent = `${freed}/${setup.captives.length}`;
      ui.cGrenades.textContent = grenades.count;
      ui.cGrenades.parentElement.hidden = !grenades.count;
    }
    // The stage's own counter glows.
    const focus = { EXPLORE: 'kits', CLEAR_SITE: sl > 0 ? 'site' : 'hostiles', RESCUE: 'captives' }[stage] ?? (stage === 'ESCORT' ? 'captives' : '');
    if (focus !== lastFocus) {
      lastFocus = focus;
      for (const k of ['kits', 'hostiles', 'site', 'captives']) ui.counts.querySelector(`.c-${k}`).classList.toggle('focus', k === focus);
      ui.counts.querySelector('.c-crates').classList.toggle('focus', focus === 'kits');
    }
    ui.saveWarn.hidden = !saveFailed();
    // Interact.
    const act = down ? null : interaction();
    ui.interact.hidden = !act;
    if (act) {
      ui.interact.textContent = ctx.isTouch ? act.label : `V: ${act.label}`;
      ui.interact.classList.toggle('locked', !act.enabled);
    }
    if (inp.consumeDrive?.() && act?.enabled) act.run();
    ui.tip.hidden = flash <= 0;
  }

  // ---------------------------------------------------------------- UI
  function showTip(text, secs) { ui.tip.textContent = text; flash = secs; ui.tip.hidden = false; }

  function togglePause(force) {
    paused = force ?? !paused;
    ui.pause.hidden = !paused;
    if (paused) refreshPause();
  }

  function refreshPause() {
    const inv = account.inventory;
    ui.pauseInfo.innerHTML = `${account.rp.toLocaleString()} RP · ${account.missionPoints} Mission Points · ${account.missionsCompleted} missions · ${account.captivesRescued} captives rescued<br>
      Inventory: ${inv.parachute} parachute · ${inv.glider} glider · ${inv.grenade} grenades${inv.truck ? ' · pickup' : ''}${inv.bike ? ' · motorbike' : ''}<br>
      This mission: ${setup?.character?.name ?? '-'} · ${setup?.captives.length ?? 0} captive${setup?.captives.length === 1 ? '' : 's'} · entry: ${setup?.entry ?? '-'} · ${setup?.grenades ?? 0} grenades`;
  }

  function buildUi() {
    const el = (id) => document.getElementById(id);
    const u = {
      objective: el('objective'), counts: el('counts'),
      cKits: el('c-kits'), cCrates: el('c-crates'), cHostiles: el('c-hostiles'), cSite: el('c-site'), cCaptives: el('c-captives'), cGrenades: el('c-grenades'), way: el('waypoint'), wayDist: el('way-dist'),
      guide: el('guide'), guideArrow: el('guide-arrow'), guideText: el('guide-text'),
      interact: el('interact-btn'), tip: el('tip'), down: el('down'), results: el('results'), resultsBody: el('results-body'),
      pause: el('pause'), pauseInfo: el('pause-info'), saveWarn: el('save-warn'),
    };
    // Touch handled directly (a quick second tap is not lost to double-tap handling).
    const on = (id, f) => {
      const b = el(id);
      if (!b) return;
      b.addEventListener('touchend', (e) => { e.preventDefault(); f(); }, { passive: false });
      b.addEventListener('click', f);
    };
    // Interact (phones tap the button; desktop presses V).
    const hit = (e) => { input.state.drive = true; e.preventDefault(); };
    u.interact.addEventListener('touchstart', hit, { passive: false });
    u.interact.addEventListener('click', hit);
    on('down-checkpoint', () => restartCheckpoint());
    on('down-retry', () => retry());
    on('results-again', () => ctx.onMenu?.('characters'));
    on('results-home', () => ctx.onMenu?.('home'));
    on('pause-resume', () => togglePause(false));
    on('pause-checkpoint', () => { togglePause(false); restartCheckpoint(); });
    on('pause-retry', () => { togglePause(false); retry(); });
    on('pause-exit', () => { paused = false; checkpoint(); stop(); ctx.onMenu?.('home'); });
    // Abandoning needs a second tap (no browser pop-ups: they can be blocked).
    let armed = false;
    on('pause-abandon', () => {
      const b = el('pause-abandon');
      if (!armed) {
        armed = true;
        b.textContent = 'Tap again: abandon this mission (characters, RP and purchases stay)';
        setTimeout(() => { armed = false; b.textContent = 'Abandon mission'; }, 4000);
        return;
      }
      armed = false;
      b.textContent = 'Abandon mission';
      abandon();
      ctx.onMenu?.('home');
    });
    // Test tool: RP to try the shop (until real missions have paid enough).
    on('test-rp', () => { account.rp += 50000; saveAccount(account); refreshPause(); });
    return u;
  }

  // Portrait rotation or leaving the app: save and pause; resume is the player's choice.
  const away = () => { if (ready && !finished && !down) { checkpoint(); togglePause(true); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) away(); });
  matchMedia('(orientation: portrait) and (pointer: coarse)').addEventListener?.('change', (e) => { if (e.matches) away(); });

  return {
    blocked,
    freePost,
    siteName: (id) => siteOf(id).name,
    siteInfo: (id) => siteOf(id),
    _generate: (seed, n = 1) => generate(seed, n, 'ground'),
    _forceSeed: (seed) => { forcedSeed = seed; },
    openSpot,
    spotOf: spot,
    prepare,
    discardDraft,
    startPrepared,
    continueSaved,
    savedSummary,
    abandon,
    stop,
    reloadAccount() { account = loadAccount(); },
    get ready() { return ready; },
    update,
    onDefeated,
    onCollect,
    onDiscover,
    onDown,
    takeDriveRequest,
    arrive: () => { if (stage === 'ARRIVAL') arrive(); },
    get paused() { return paused; },
    get stage() { return stage; },
    get setup() { return setup; },
    get account() { return account; },
    retry,
    restartCheckpoint,
    checkpoint,
    site,
  };
}
