// The owner's private dashboard (9jarescue.app/admin.html, 15 Oct): players
// online now, visitors and missions today, the last 7 days and all time,
// from the records the game writes (stats.js). Only the owner's Google
// account may read them (Firestore rules, docs/dashboard.md); anyone else
// signing in sees "not allowed".
import './admin.css';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, getCount, Timestamp } from 'firebase/firestore/lite';
import { CONFIG, pickAuthDomain } from './ui/auth-firebase.js';
import { logo } from './ui/logo.js';
import { dayOf } from './stats.js';

const LIVE_EVERY = 10000, REST_EVERY = 60000, LIVE_WINDOW = 75000;
const app$ = document.getElementById('app');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (v) => (v == null ? '–' : Number(v).toLocaleString('en-NG'));
const DEMO = import.meta.env.DEV && /[?&]demo\b/.test(location.search);   // layout check on the dev server only

function gate(msg = '', err = false) {
  app$.innerHTML = `<div class="panel gate">${logo()}<h1 style="font:800 1.8rem var(--head);text-transform:uppercase;margin:0">Dashboard</h1>
    <p class="${err ? 'err' : ''}">${msg || 'Private statistics for the game owner. Sign in with your Google account.'}</p>
    <button class="btn" id="go">Sign in with Google</button></div>`;
}

function layout(email) {
  app$.innerHTML = `
  <header>${logo()}<div class="grow"><h1>Dashboard</h1><div class="who">${esc(email)}</div></div>
    <button class="btn ghost" id="out">Sign out</button></header>
  <section class="panel live" aria-live="polite">
    <div class="num" id="now">–</div>
    <div><div class="label"><span class="dot" aria-hidden="true"></span>Playing now</div>
      <div class="split" id="split">&nbsp;</div></div>
    <div class="stamp" id="stamp"></div>
  </section>
  <h2>Today</h2>
  <div class="tiles">
    ${tile('t-vis', 'Visitors')}${tile('t-start', 'Missions started')}${tile('t-win', 'Missions completed')}${tile('t-acc', 'New accounts')}
  </div>
  <h2>Visitors, last 7 days</h2>
  <div class="panel"><div class="bars" id="bars" role="img" aria-label="Visitors per day"></div><div class="days" id="days"></div></div>
  <h2>All time</h2>
  <div class="tiles">
    ${tile('a-vis', 'Visitors')}${tile('a-acc', 'Accounts')}${tile('a-start', 'Missions started')}${tile('a-win', 'Missions completed')}
  </div>
  <p class="note">Playing now updates every 10 seconds, the rest every minute. Days are Nigerian time. Visitors are counted once per device per day; the game's own site only.</p>`;
}
const tile = (id, k) => `<div class="tile"><div class="v" id="${id}">–</div><div class="k">${k}</div></div>`;
const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = n(v); };

function drawWeek(days) {
  const max = Math.max(1, ...days.map((d) => d.v ?? 0));
  const today = dayOf();
  const name = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  document.getElementById('bars').innerHTML = days.map((d) => `<div class="bar${d.day === today ? ' today' : ''}" title="${d.day}: ${n(d.v)} visitors">
    <b>${n(d.v)}</b><i style="height:${((d.v ?? 0) / max) * 100}%"></i></div>`).join('');
  document.getElementById('days').innerHTML = days.map((d) => `<span class="${d.day === today ? 'today' : ''}">${d.day === today ? 'Today' : name(d.day)}</span>`).join('');
}

function week() {
  return Array.from({ length: 7 }, (_, i) => dayOf(Date.now() - (6 - i) * 864e5));
}

async function run(db) {
  const count = async (col, ...w) => (await getCount(w.length ? query(collection(db, col), ...w) : collection(db, col))).data().count;
  let liveAt = 0, failed = false;
  const live = async () => {
    const snap = await getDocs(query(collection(db, 'live'), where('t', '>', Timestamp.fromMillis(Date.now() - LIVE_WINDOW))));
    const where_ = snap.docs.map((d) => d.data().where);
    const inMission = where_.filter((w) => w === 'mission').length;
    set('now', snap.size);
    document.getElementById('split').textContent = snap.size ? `${inMission} in a mission · ${snap.size - inMission} in the menus` : 'Nobody right now';
    liveAt = Date.now();
  };
  const rest = async () => {
    const today = dayOf();
    const days = week();
    const [tv, ts, tw, ta, av, aa, as, aw, ...wk] = await Promise.all([
      count('visits', where('day', '==', today)), count('missionStarts', where('day', '==', today)),
      count('missionWins', where('day', '==', today)), count('accounts', where('day', '==', today)),
      count('visitors'), count('accounts'), count('missionStarts'), count('missionWins'),
      ...days.map((d) => count('visits', where('day', '==', d))),
    ]);
    set('t-vis', tv); set('t-start', ts); set('t-win', tw); set('t-acc', ta);
    set('a-vis', av); set('a-acc', aa); set('a-start', as); set('a-win', aw);
    drawWeek(days.map((day, i) => ({ day, v: wk[i] })));
  };
  const guard = (f) => () => f().catch((e) => {
    console.warn(e);
    if (e?.code === 'permission-denied' && !failed) { failed = true; denied(); }
    else document.getElementById('stamp').textContent = 'No connection, retrying…';
  });
  const L = guard(live), R = guard(rest);
  await Promise.all([L(), R()]);
  if (failed) return;
  let lt = setInterval(L, LIVE_EVERY), rt = setInterval(R, REST_EVERY);
  setInterval(() => { const s = document.getElementById('stamp'); if (s && liveAt) s.textContent = `Updated ${Math.round((Date.now() - liveAt) / 1000)} s ago`; }, 1000);
  document.addEventListener('visibilitychange', () => {
    clearInterval(lt); clearInterval(rt);
    if (!document.hidden) { L(); R(); lt = setInterval(L, LIVE_EVERY); rt = setInterval(R, REST_EVERY); }
  });
}

let fa = null;
function denied() {
  const email = fa?.currentUser?.email ?? '';
  gate(`${esc(email)} is not allowed to see these statistics. Sign in with the owner's Google account.`, true);
  document.getElementById('go').textContent = 'Use another account';
  wire();
}
function wire() {
  document.getElementById('go')?.addEventListener('click', async () => {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    try { await signInWithPopup(fa, p); } catch (e) {
      if (e?.code === 'auth/popup-blocked') return signInWithRedirect(fa, p);
      if (!/cancelled|closed/.test(e?.code || '')) gate(`Sign-in failed (${esc(e?.code || e?.message)}). Try again.`, true), wire();
    }
  });
}

async function demo() {
  layout('owner@example.com');
  set('now', 3); document.getElementById('split').textContent = '2 in a mission · 1 in the menus';
  document.getElementById('stamp').textContent = 'Updated 4 s ago';
  [['t-vis', 41], ['t-start', 27], ['t-win', 9], ['t-acc', 6], ['a-vis', 1288], ['a-acc', 214], ['a-start', 903], ['a-win', 311]].forEach(([i, v]) => set(i, v));
  drawWeek(week().map((day, i) => ({ day, v: [12, 30, 22, 55, 48, 19, 41][i] })));
}

async function main() {
  if (DEMO) return demo();
  gate('Loading…');
  const app = initializeApp({ ...CONFIG, authDomain: await pickAuthDomain() });
  fa = getAuth(app);
  await getRedirectResult(fa).catch(() => {});
  const db = getFirestore(app);
  let running = false;
  onAuthStateChanged(fa, (u) => {
    if (!u) { gate(); wire(); return; }
    if (running) return;
    running = true;
    layout(u.email);
    document.getElementById('out').onclick = () => signOut(fa).then(() => location.reload());
    run(db);
  });
}
main();
