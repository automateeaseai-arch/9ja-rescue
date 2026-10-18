// Game website version (owner, 18 Oct): built with VITE_PORTAL=gd for
// GameDistribution. Guest play only (no accounts, no links out, no install,
// no sharing, no statistics), and their ad service:
// - a short ad before each mission starts (their service decides how often);
// - optional "watch an ad" rewards: +1,000 RP on Home (once every 3 minutes)
//   and double RP on the results panel.
// Sound is silenced and the game is paused while an ad plays. Our own site
// (9jarescue.app) is built without any of this.
import { sound } from './sound.js';

export const PORTAL = import.meta.env.VITE_PORTAL || null;
// Ads only where the site's ad service is built in. CrazyGames' Basic Launch
// (owner, 18 Oct) is a test with no ads and no CrazyGames code at all.
const ADS = PORTAL === 'gd';
// The game's ID from the GameDistribution dashboard (owner fills it in).
export const GD_GAME_ID = import.meta.env.VITE_GD_GAME_ID || 'GAME_ID_HERE';

let sdkReady = null, onPause = null, onResume = null, rewardDone = false;

function loadSdk() {
  if (sdkReady) return sdkReady;
  sdkReady = new Promise((resolve) => {
    window.GD_OPTIONS = {
      gameId: GD_GAME_ID,
      onEvent(event) {
        switch (event.name) {
          case 'SDK_READY': resolve(true); break;
          case 'SDK_GAME_PAUSE': pauseForAd(); break;
          case 'SDK_GAME_START': resumeAfterAd(); break;
          case 'SDK_REWARDED_WATCH_COMPLETE': rewardDone = true; break;
          default: break;
        }
      },
    };
    const s = document.createElement('script');
    s.id = 'gamedistribution-jssdk';
    s.src = 'https://html5.api.gamedistribution.com/main.min.js';
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
    setTimeout(() => resolve(false), 8000);   // never hold the game up for the ad service (a later call checks again)
  });
  return sdkReady;
}

let paused = false;
function pauseForAd() {
  if (paused) return;
  paused = true;
  sound.setAdMute(true);
  onPause?.();
}
function resumeAfterAd() {
  if (!paused) return;
  paused = false;
  sound.setAdMute(false);
  onResume?.();
}

const sdk = () => window.gdsdk;

export const portal = {
  on: !!PORTAL,
  ads: ADS,
  // The game tells us how to pause and resume itself.
  setHooks(pause, resume) { onPause = pause; onResume = resume; },
  start() { if (ADS) loadSdk(); },
  // A break between missions. Always resolves (an ad that fails just doesn't show).
  async interstitial() {
    if (!ADS) return;
    await loadSdk();
    if (!sdk()?.showAd) return;
    try { await sdk().showAd(); } catch { /* no ad available */ }
    resumeAfterAd();
  },
  // A rewarded ad the player chose to watch: true if they watched it to the end.
  async rewarded() {
    if (!ADS) return false;
    await loadSdk();
    if (!sdk()?.showAd) return false;
    rewardDone = false;
    try { await sdk().showAd('rewarded'); } catch { resumeAfterAd(); return false; }
    resumeAfterAd();
    return rewardDone;
  },
};
