// Install as an app (owner, 15 Oct). Chrome's own "Add to Home screen" bar
// is held back (it can appear over the game) and offered at good moments
// instead: a small Install game button on Home, and once after the first
// completed mission. iPhones have no install prompt: they get a short tip.
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const OFFERED = '9ja.installOffered';
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
  get can() { return !installed && (!!deferred || ios || demo === 'android' || demo === 'ios'); },
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
  // The one-time offer on the results screen after the first completed mission.
  shouldOffer() {
    try { return this.can && !localStorage.getItem(OFFERED); } catch { return false; }
  },
  markOffered() { try { localStorage.setItem(OFFERED, '1'); } catch { /* ignore */ } },
  // Adds the offer card to the results panel.
  offerCard(into) {
    if (!this.shouldOffer()) return;
    this.markOffered();
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
