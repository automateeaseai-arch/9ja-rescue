// Silent saving on this device (localStorage). Two records, as the plan asks:
// the account (RP, Mission Points, inventory, counters) and the active
// mission (its setup plus the latest checkpoint). Both are written whole,
// so related values (health with used kits, captives with boarding, the
// reward with completion) always change together.
// Characters and the 2D menus will add their own records later.
const ACCOUNT = '9ja.account.v1';
const MISSION = '9ja.mission.v1';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
let failed = false;
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    failed = false;
    return true;
  } catch (err) {
    console.error(err);
    failed = true;   // a genuine failure is reported on screen
    return false;
  }
}

export function loadAccount() {
  const a = read(ACCOUNT) ?? {};
  return {
    rp: a.rp ?? 0,
    missionPoints: a.missionPoints ?? 0,
    inventory: { parachute: 0, glider: 0, grenade: 0, bike: false, truck: false, ...(a.inventory ?? {}) },
    captiveAlternation: a.captiveAlternation ?? 0,   // even: 1 captive next, odd: 2
    completed: a.completed ?? [],                     // mission IDs already paid
    missionsCompleted: a.missionsCompleted ?? 0,
    captivesRescued: a.captivesRescued ?? 0,
    tutorialDone: a.tutorialDone ?? false,
    nextEntry: a.nextEntry ?? 'ground',
  };
}
export const saveAccount = (a) => write(ACCOUNT, a);
export const loadMission = () => read(MISSION);
export const saveMission = (m) => write(MISSION, m);
export function clearMission() { try { localStorage.removeItem(MISSION); } catch { /* ignore */ } }
export const saveFailed = () => failed;
