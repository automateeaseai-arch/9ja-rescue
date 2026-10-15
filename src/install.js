// Install as an app (owner, 15 Oct). Chrome's own "Add to Home screen" bar
// is held back (it can appear over the game) and offered at good moments
// instead: a small Install game button on Home, and on the results panel after
// the 1st, 4th and 10th completed missions (at most 3 times, never once
// installed). iPhones have no install prompt: they get a short tip. Off in the
// claude.ai copy (it can't be installed).
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const OFFERED = '9ja.installOffers';
const OFFER_AT = [1, 4, 10];   // completed missions
const OFF = import.meta.env.VITE_AUTH === 'device';
let deferred = null;
let installed = standalone();
const listeners = new Set();
const changed = () => listeners.forEach((f) => f());
// Layout check on the dev server only: ?install=android or ?install=ios.
const demo = import.meta.env.DEV ? new URLSearchParams(location.search).get('install') : null;

addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; changed(); });
addEventListener('appinstalled', () => { installed = true; deferred = null; changed(); });

export const IOS_TIP = 'On iPhone: tap <b>Share</b> <span aria-hidden="true">⬆︎</span> at the bottom of Safari, then <b>Add to Home Screen</b>.';

export const install = {
  get can() { return !OFF && !installed && (!!deferred || ios || demo === 'android' || demo === 'ios'); },
  get ios() { return demo ? demo === 'ios' : ios; },
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },
  // Shows the phone's own install box. Returns 'accepted', 'dismissed' or 'ios' (show the tip).
  async prompt() {
    if (this.ios) return 'ios';
    if (!deferred) return 'dismissed';
    const e = deferred; deferred = null;
    e.prompt();
    const r = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
    changed();
    return r.outcome;
  },
  // The offer on the results panel: the latest of OFFER_AT reached and not yet shown.
  offerFor(completed) {
    if (!this.can) return null;
    let shown = [];
    try { shown = JSON.parse(localStorage.getItem(OFFERED)) || []; } catch { /* none yet */ }
    const due = OFFER_AT.filter((n) => n <= completed && !shown.includes(n));
    if (!due.length) return null;
    return () => { try { localStorage.setItem(OFFERED, JSON.stringify([...shown, ...due])); } catch { /* ignore */ } };
  },
  // Adds the offer card to the results panel (after a completed mission).
  offerCard(into, completed) {
    const mark = this.offerFor(completed);
    if (!mark) return;
    mark();
    const d = document.createElement('div');
    d.className = 'install-offer';
    d.innerHTML = `<img src="ui/icon-192.png" alt="" width="52" height="52"><div class="t"><b>Add 9ja Rescue to your home screen</b>
      <span>${this.ios ? IOS_TIP : 'Opens full screen in one tap, even with a weak connection.'}</span></div>
      <div class="b">${this.ios ? '' : '<button type="button" class="gold" data-i="yes">Install</button>'}<button type="button" data-i="no">${this.ios ? 'OK' : 'Not now'}</button></div>`;
    d.addEventListener('click', async (e) => {
      const k = e.target.closest('button')?.dataset.i;
      if (k === 'yes') await this.prompt();
      if (k) d.remove();
    });
    into.appendChild(d);
  },
};
