// Visitor and game statistics (owner's Google Analytics through Firebase,
// 14 Oct). The online build plugs Firebase Analytics in; elsewhere (the
// claude.ai copy, the dev server) `track` does nothing.
let send = null;
export const setTracker = (f) => { send = f; };
export function track(name, params = {}) {
  try { send?.(name, params); } catch { /* statistics never break the game */ }
}
