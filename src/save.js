// Silent saving on this device (localStorage), one set of records per signed-in
// account: the account (RP, Mission Points, inventory, loadout, counters),
// the saved characters (three slots), the briefing draft and the active
// mission (its setup plus the latest checkpoint). Records are written whole,
// so related values (health with used kits, captives with boarding, the
// reward with completion) always change together. Characters and mission
// checkpoints are separate records, as the plan asks.
const ACCOUNT = '9ja.account.v1';
const MISSION = '9ja.mission.v1';
const CHARACTERS = '9ja.characters.v1';
const DRAFT = '9ja.draft.v1';
const LEGACY_CLAIMED = '9ja.legacy.claimed';

let uid = null;
const key = (k) => `${k}:${uid ?? 'guest'}`;

function read(k) {
  try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; }
}
let failed = false;
function write(k, value) {
  try {
    localStorage.setItem(k, JSON.stringify(value));
    failed = false;
    return true;
  } catch (err) {
    console.error(err);
    failed = true;   // a genuine failure is reported on screen
    return false;
  }
}

// Switches to an account's records. Progress saved before accounts existed
// (one device record) goes to the first account that signs in on this device.
export function setUser(id) {
  uid = id;
  if (!id || localStorage.getItem(LEGACY_CLAIMED)) return;
  if (localStorage.getItem(key(ACCOUNT)) == null) {
    for (const k of [ACCOUNT, MISSION]) {
      const old = localStorage.getItem(k);
      if (old != null) { localStorage.setItem(key(k), old); localStorage.removeItem(k); }
    }
  }
  localStorage.setItem(LEGACY_CLAIMED, id);
}
export const currentUser = () => uid;

export function loadAccount() {
  const a = read(key(ACCOUNT)) ?? {};
  return {
    rp: a.rp ?? 0,
    missionPoints: a.missionPoints ?? 0,
    inventory: { parachute: 0, glider: 0, grenade: 0, bike: false, truck: false, ...(a.inventory ?? {}) },
    // What the player takes on the next mission (chosen on Assets and Entry).
    loadout: { vehicle: null, grenades: 0, air: null, ...(a.loadout ?? {}) },
    activeCharacter: a.activeCharacter ?? null,
    captiveAlternation: a.captiveAlternation ?? 0,   // even: 1 captive next, odd: 2
    completed: a.completed ?? [],                     // mission IDs already paid
    missionsCompleted: a.missionsCompleted ?? 0,
    captivesRescued: a.captivesRescued ?? 0,
    tutorialDone: a.tutorialDone ?? false,
    purchases: a.purchases ?? [],                     // purchase transaction IDs
  };
}
export const saveAccount = (a) => write(key(ACCOUNT), a);
export const loadMission = () => read(key(MISSION));
export const saveMission = (m) => write(key(MISSION), m);
export function clearMission() { try { localStorage.removeItem(key(MISSION)); } catch { /* ignore */ } }
export const loadCharacters = () => read(key(CHARACTERS)) ?? [];
export const saveCharacters = (list) => write(key(CHARACTERS), list);
export const loadDraft = () => read(key(DRAFT));
export const saveDraft = (d) => write(key(DRAFT), d);
export function clearDraft() { try { localStorage.removeItem(key(DRAFT)); } catch { /* ignore */ } }
export const saveFailed = () => failed;
