// Keeps a copy of the game on the phone (owner, 14 Oct: the game sometimes
// struggled to load on a slow connection). After the first visit the code,
// models, pictures and sounds come from the phone's storage, so later loads
// don't depend on the connection. The page itself is always asked for fresh
// first (4 s), so updates arrive; without a connection the saved copy is used.
// CODE and FILES are filled in by tools/deploy-pages.sh: a new build replaces
// the code copy; the files copy is only replaced when a model, picture or
// sound changes.
const CODE = 'code-1792337169';
const FILES = 'files-4dee2ed09b';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CODE && k !== FILES) await caches.delete(k);
  await self.clients.claim();
})()));

async function fromCache(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}
async function pageFirst(req, e) {
  const c = await caches.open(CODE);
  // Past the browser's own short-term copy, so a new version shows at once.
  // On a slow line the saved page is shown, but the new one is still fetched
  // and saved for the next opening.
  const fresh = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
    .then(async (res) => { if (res.ok) await c.put(req, res.clone()); return res; });
  e.waitUntil(fresh.catch(() => {}));
  try {
    return await Promise.race([fresh, new Promise((_, bad) => setTimeout(() => bad(new Error('slow')), 4000))]);
  } catch (err) {
    const hit = await c.match(req);
    if (hit) return hit;
    return fetch(req);
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // Firebase, Google: never cached here
  const p = url.pathname;
  if (req.mode === 'navigate' || p.endsWith('/') || p.endsWith('.html')) e.respondWith(pageFirst(req, e));
  else if (p.includes('/assets/')) e.respondWith(fromCache(req, CODE));
  else if (/\/(models|ui|sounds)\//.test(p)) e.respondWith(fromCache(req, FILES));
});
