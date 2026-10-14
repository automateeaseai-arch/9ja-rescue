// Online save (Firebase accounts only): a copy of the player's records in
// Firestore, one document per player at players/{uid}. Each record (account,
// characters, briefing draft, active mission) is stored as its JSON text with
// the time it was saved. On sign-in the newer copy of each record wins, so
// progress follows the player to another phone; after that every save on this
// device is sent up a couple of seconds later (straight away when the game is
// put in the background). Without a connection the game carries on with this
// device's copy and sends it the next time it can.
import { RECORDS, readRaw, writeRaw, stamps, setOnChange, currentUser } from './save.js';

const PUSH_DELAY = 2500;   // ms after the last save
let fs = null;             // { db, doc, getDoc, setDoc }
let dirty = new Set();
let timer = null;
let pushing = null;
let state = 'off';         // off | syncing | synced | offline | error

const docFor = (uid) => fs.doc(fs.db, 'players', uid);
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, bad) => setTimeout(() => bad(new Error('timeout')), ms))]);

async function push() {
  if (!fs || !dirty.size || pushing) return pushing;
  const uid = currentUser();
  if (!uid) return null;
  const names = [...dirty];
  dirty = new Set();
  const st = stamps();
  const data = { updated: Date.now() };
  for (const n of names) data[n] = { text: readRaw(n), at: st[n] ?? 0 };
  pushing = withTimeout(fs.setDoc(docFor(uid), data, { merge: true }), 15000)
    .then(() => { state = 'synced'; })
    .catch((e) => {
      console.warn('online save failed, will retry', e?.code || e?.message);
      names.forEach((n) => dirty.add(n));
      state = navigator.onLine === false ? 'offline' : 'error';
      clearTimeout(timer);
      timer = setTimeout(push, 20000);
    })
    .finally(() => { pushing = null; if (dirty.size && state === 'synced') schedule(); });
  return pushing;
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(push, PUSH_DELAY);
}

export const cloud = {
  get state() { return state; },
  get enabled() { return !!fs; },

  // Called once after sign-in is ready, with the Firebase app (null = device-only copy).
  async init(app) {
    if (!app || fs) return;
    const m = await import('firebase/firestore/lite');
    fs = { db: m.getFirestore(app), doc: m.doc, getDoc: m.getDoc, setDoc: m.setDoc };
    setOnChange((name) => { if (fs) { dirty.add(name); schedule(); } });
    const flush = () => { if (dirty.size) push(); };
    addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    addEventListener('online', flush);
  },

  // After the player signs in (and setUser): bring this device up to date.
  // Returns 'synced', 'offline' (kept this device's copy) or 'off'.
  async pull() {
    const uid = currentUser();
    if (!fs || !uid) return 'off';
    state = 'syncing';
    let remote = null;
    try {
      const snap = await withTimeout(fs.getDoc(docFor(uid)), 10000);
      remote = snap.exists() ? snap.data() : {};
    } catch (e) {
      console.warn('online save not reachable', e?.code || e?.message);
      state = 'offline';
      Object.keys(RECORDS).forEach((n) => dirty.add(n));   // send this device's copy later
      timer = setTimeout(push, 20000);
      return state;
    }
    const st = stamps();
    for (const n of Object.keys(RECORDS)) {
      const r = remote[n];
      const localAt = st[n] ?? 0;
      const localText = readRaw(n);
      if (r && (r.at ?? 0) > localAt) writeRaw(n, r.text ?? null, r.at);           // newer online
      else if (localText != null || localAt > (r?.at ?? 0)) dirty.add(n);          // newer here
    }
    state = 'synced';
    if (dirty.size) await push();
    return state;
  },

  // Send anything waiting now (before signing out).
  async flush() { clearTimeout(timer); await push(); if (pushing) await pushing; },
};
