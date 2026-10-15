// Numbers for the owner's private dashboard (admin.html, 15 Oct): each
// visitor's game writes small anonymous records to Firestore. Nothing
// personal is stored: a random device number, the date and where they are.
//   live/{tab}          who is playing now: refreshed every 30 s (menu or mission)
//   visitors/{device}   first visit of each device (all-time visitors)
//   visits/{day_device} one per device per day (visitors today)
//   missionStarts, missionWins   one per mission started / completed
//   accounts/{uid}      the day each account was created
// Only the owner's Google account can read them (Firestore rules,
// docs/dashboard.md). Runs on 9jarescue.app only (or with ?stats on a test copy).
import { setTracker } from './analytics.js';

const BEAT = 30000;
// Days follow Nigerian time (UTC+1).
export const dayOf = (ms = Date.now()) => new Date(ms + 3600e3).toISOString().slice(0, 10);
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
function keep(store, key) {
  try { let v = store.getItem(key); if (!v) { v = rid(); store.setItem(key, v); } return v; } catch { return rid(); }
}

export async function startStats(app) {
  if (!app) return;
  if (!/(^|\.)9jarescue\.app$/.test(location.hostname) && !/[?&]stats\b/.test(location.search)) return;
  const fs = await import('firebase/firestore/lite');
  const db = fs.getFirestore(app);
  const now = () => fs.serverTimestamp();
  const quiet = (p) => p.catch(() => {});   // an existing record or no connection: nothing to do
  const device = keep(localStorage, '9ja.device');
  const tab = keep(sessionStorage, '9ja.tab');
  const day = dayOf();

  // Visitors (all time and today): written once per device / per day.
  let last = null;
  try { last = localStorage.getItem('9ja.statsDay'); } catch { /* private mode */ }
  if (last !== day) {
    if (!last) quiet(fs.setDoc(fs.doc(db, 'visitors', device), { day, t: now() }));
    quiet(fs.setDoc(fs.doc(db, 'visits', `${day}_${device}`), { day, t: now() })
      .then(() => { try { localStorage.setItem('9ja.statsDay', day); } catch { /* ignore */ } }));
  }

  // Playing now.
  const liveDoc = fs.doc(db, 'live', tab);
  const beat = () => quiet(fs.setDoc(liveDoc, { t: now(), where: document.body.classList.contains('in-menu') ? 'menu' : 'mission' }));
  let timer = null;
  const on = () => { if (!timer) { beat(); timer = setInterval(beat, BEAT); } };
  const off = () => { clearInterval(timer); timer = null; quiet(fs.deleteDoc(liveDoc)); };
  document.addEventListener('visibilitychange', () => (document.hidden ? off() : on()));
  addEventListener('pagehide', off);
  // Menu ↔ mission shows up straight away.
  new MutationObserver(() => { if (timer) beat(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  if (!document.hidden) on();

  // Missions.
  setTracker((name, p) => {
    const col = { mission_start: 'missionStarts', mission_complete: 'missionWins' }[name];
    if (col) quiet(fs.addDoc(fs.collection(db, col), { day: dayOf(), t: now(), site: String(p.site || '').slice(0, 12) }));
  });

  // Accounts: the day each was created (from Firebase's own record).
  const { getAuth, onAuthStateChanged } = await import('firebase/auth');
  const seen = new Set();
  onAuthStateChanged(getAuth(app), (u) => {
    if (!u || seen.has(u.uid)) return;
    seen.add(u.uid);
    const made = Date.parse(u.metadata?.creationTime) || Date.now();
    quiet(fs.setDoc(fs.doc(db, 'accounts', u.uid), { day: dayOf(made), t: now() }));
  });
}
