// Visitor and game statistics (owner's Google Analytics through Firebase,
// 14 Oct, and the owner's own live dashboard, stats.js, 15 Oct). The online
// build plugs its senders in; elsewhere (the claude.ai copy, the dev server)
// `track` does nothing.
const sends = [];
export const setTracker = (f) => { sends.push(f); };
export function track(name, params = {}) {
  for (const f of sends) { try { f(name, params); } catch { /* statistics never break the game */ } }
}
