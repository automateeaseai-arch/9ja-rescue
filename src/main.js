// Start-up (owner, 15 Oct: faster loading). The 2D screens come first, in a
// small download, so a new player can create an account and their character
// straight away; the 3D game (engine, physics, world and its models) is
// fetched in the background and the screens wait for it only when they need
// it (Home onwards).
import { createScreens } from './ui/screens.js';

const screens = createScreens();

// Keep a copy of the game on the phone (public/sw.js) so later visits load
// from its storage. Only on the real web address (not the dev server or the
// claude.ai copy).
if (import.meta.env.PROD && !import.meta.env.VITE_MODELS_AS_TEXT && !import.meta.env.VITE_PORTAL && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('offline copy unavailable', e)));
}

// The game's code starts downloading once the sign-in service has answered
// (so the two don't compete on a slow line); a failed download is retried.
async function loadGame() {
  for (const wait of [2000, 5000, 10000, 0]) {
    try { return await import('./game.js'); } catch (e) {
      if (!wait) throw e;
      console.warn('game download failed, retrying', e);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
screens.started.then(loadGame).then((m) => m.run(screens)).catch((e) => {
  console.error(e);
  screens.fatal('The game could not be downloaded. Check your internet connection and try again.');
});
