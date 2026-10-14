// The 2D screens from the owner's HiFi designs, numbered as handed over:
//   01 Splash / Loading · 02 Welcome · 03 Create Account · 03A Sign In ·
//   03B Verify Email · 03C Password Recovery · 03D Set New Password ·
//   04 Home · 05 Saved Characters · 06 Gender · 07 Role · 08 Customisation ·
//   09 Save and Confirm · 10 Assets and Equipment · 12 Mission Briefing ·
//   13 Mission Loading   (11 and 14 are intentionally not part of this flow)
// New player:  01 → 02 → 03 → 03B → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 12 → 13 → play
// Returning:   01 → (03A) → 04 → 05 → 10 → 12 → 13 → play
// Continue:    04 → 13 → the saved mission, restored as it was.
// Backgrounds are the owner's painted scenes (from the boards and the
// reference set); every control is a real component.
import './menu.css';
import { auth, emailProblem, passwordProblem } from './auth.js';
import { setUser, saveAccount, saveFailed } from '../save.js';
import * as Chars from './characters.js';
import { showPreview, hidePreview, setPreviewSkin } from './preview.js';
import { logo } from './logo.js';
import { RULES, ARRIVALS } from '../config.js';
import { PERSONAS } from '../hostages.js';
import { sound } from '../sound.js';
import { cloud } from '../cloud.js';
import { settings as gameSettings } from '../settings.js';
const openSettings = (cb) => gameSettings.open(cb);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('en-GB');
const BG = (k) => `ui/bg/${k}.webp`;

// Line icons (24 px grid, stroke = currentColor).
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
// Google's "G" mark, for the Continue with Google button.
const GOOGLE_G = '<svg class="g-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const googleBtn = () => (auth.canGoogle ? `<div class="m-or"><span>or</span></div>${btn('Continue with Google', 'google', { kind: 'google', cls: 'block', icon: GOOGLE_G })}` : '');

const I = {
  soundOn: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  soundOff: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  arrow: svg('<path d="M4 12h15M13 6l6 6-6 6"/>'),
  arrowL: svg('<path d="M20 12H5M11 6l-6 6 6 6"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  save: svg('<path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 1-2z"/><path d="M8 3v5h7V3M8 21v-6h8v6"/>', 'stroke-width="2.4"'),
  map: svg('<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>'),
  users: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M16 14.2c3 .2 5 2.6 5 5.8"/>'),
  cart: svg('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="3"'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  star: svg('<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>', 'fill="currentColor"'),
  chevrons: svg('<path d="M6 14l6-6 6 6M6 20l6-6 6 6"/>', 'stroke-width="2.6"'),
  captives: svg('<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 14.3A6 6 0 0 1 22 20"/>'),
  hostile: svg('<path d="M12 3c-4.4 0-8 3.1-8 7 0 2.4 1.3 4.4 3.3 5.7V19a2 2 0 0 0 2 2h5.4a2 2 0 0 0 2-2v-3.3c2-1.3 3.3-3.3 3.3-5.7 0-3.9-3.6-7-8-7z"/><circle cx="9" cy="11" r="1.5" fill="currentColor"/><circle cx="15" cy="11" r="1.5" fill="currentColor"/>'),
  shield: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  bulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>'),
  rifle: svg('<path d="M2 13h13l2-2h5v2l-4 2h-3l-1 3h-3l1-3H2z"/>'),
  bike: svg('<circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16l4-7h5l4 7M9 9h-2M14 9l-2 7"/>'),
  plane: svg('<path d="M2 13l8-1 5-8h2l-2 8 6 1v2l-6 1 2 6h-2l-5-6-8-1z"/>'),
  coins: '<i class="m-coin"></i>',
};

const STEPS = ['Gender', 'Role', 'Appearance', 'Confirm'];
const steps = (at) => `<div class="m-steps">${STEPS.map((s, i) => `<div class="st ${i < at ? 'done' : ''} ${i === at ? 'on' : ''}"><i></i>${s}</div>`).join('')}</div>`;
const btn = (label, act, { kind = 'gold', icon = '', right = '', cls = '', disabled = false, type = 'button', data = '', id = '' } = {}) =>
  `<button type="${type}" class="m-btn ${kind} ${cls}" ${act ? `data-act="${act}"` : ''} ${data} ${id ? `id="${id}"` : ''} ${disabled ? 'disabled' : ''}>${icon}<span>${label}</span>${right}</button>`;
const field = ({ name, label, type = 'text', placeholder = '', icon = '', eye = false, value = '', auto = '' }) => `
  <label class="m-field" data-f="${name}"><span>${label}</span>
    <div class="m-input ${icon ? 'icon' : ''} ${eye ? 'has-eye' : ''}">${icon ? `<i class="lead">${icon}</i>` : ''}
      <input name="${name}" type="${type}" placeholder="${esc(placeholder)}" value="${esc(value)}" ${auto ? `autocomplete="${auto}"` : ''} ${type === 'email' ? 'inputmode="email" autocapitalize="off" spellcheck="false"' : ''} />
      ${eye ? `<button type="button" class="eye" data-act="eye" aria-label="Show password">${I.eye}</button>` : ''}
    </div><div class="m-err" role="alert"></div></label>`;
const chips = (a) => `<div class="m-chips"><div class="m-chip" title="Rescue Points">${I.coins}RP ${fmt(a.rp)}</div><div class="m-chip" title="Mission Points"><span class="m-star">${I.star}</span>MP ${fmt(a.missionPoints)}</div></div>`;

const ITEMS = [
  { k: 'grenade', name: 'Grenade', kind: 'consumable' },
  { k: 'bike', name: 'Motorcycle', kind: 'vehicle' },
  { k: 'truck', name: 'Pickup', kind: 'vehicle' },
  { k: 'parachute', name: 'Parachute', kind: 'air' },
  { k: 'glider', name: 'Glider', kind: 'air' },
];
const itemName = (k) => ITEMS.find((i) => i.k === k)?.name ?? k;
const TIPS = [
  'Your objective arrow guides you to the next goal.',
  'Collect health supplies before you reach the captive site.',
  'Captives follow your path: use the bridges and doorways.',
  'Crouch to get closer: guards only see what is in front of them.',
  'An equipped vehicle waits beside your arrival point.',
];

export function createScreens() {
  const root = document.getElementById('menu');
  const S = {
    id: null, params: {}, user: null, game: null, email: '',
    splash: { p: 0, text: 'Loading resources…', ready: false, error: null },
    wiz: null, selected: null, brief: 0, setup: null, mode: 'mission', notice: null, reset: null, busy: false,
  };
  const account = () => S.game.mission.account;
  const charOf = () => Chars.get(S.selected) ?? Chars.get(account().activeCharacter);
  const lockedId = () => S.game?.mission.savedSummary()?.character?.id ?? null;

  // ------------------------------------------------------------- helpers
  const $ = (sel) => root.querySelector(sel);
  function toast(text, bad = false) {
    root.querySelector('.m-toast')?.remove();
    const t = document.createElement('div');
    t.className = `m-toast ${bad ? 'bad' : ''}`;
    if (bad) sound.ui('error', 0.5);
    t.textContent = text;
    root.appendChild(t);
    setTimeout(() => t.remove(), 2700);
  }
  function sheet(html) {
    closeSheet();
    const d = document.createElement('div');
    d.className = 'm-sheet-back';
    d.innerHTML = `<div class="m-panel m-sheet scroll" role="dialog" aria-modal="true">${html}</div>`;
    d.addEventListener('click', (e) => { if (e.target === d) closeSheet(); });
    root.appendChild(d);
    d.querySelector('button')?.focus({ preventScroll: true });
  }
  const closeSheet = () => root.querySelector('.m-sheet-back')?.remove();
  function setErr(form, name, msg) {
    const f = form.querySelector(`[data-f="${name}"]`);
    if (!f) return;
    f.classList.toggle('bad', !!msg);
    f.querySelector('.m-err').textContent = msg || '';
  }
  function alertBox(sel, msg, kind = '') {
    const el = $(sel);
    if (!el) return;
    el.hidden = !msg;
    el.className = `m-alert ${kind}`;
    el.innerHTML = msg || '';
    if (msg && kind !== 'ok') sound.ui('error', 0.5);
  }
  async function busy(button, label, fn) {
    if (S.busy) return;
    S.busy = true;
    const keep = button?.innerHTML;
    if (button) { button.classList.add('busy'); button.disabled = true; button.querySelector('span').textContent = label; }
    try { return await fn(); } finally {
      S.busy = false;
      if (button?.isConnected) { button.classList.remove('busy'); button.disabled = false; button.innerHTML = keep; }
    }
  }
  const preload = (...keys) => keys.forEach((k) => { const i = new Image(); i.src = k.includes('/') ? k : BG(k); });

  // ------------------------------------------------------------- screens
  const SCREENS = {
    // 01 Splash / Loading: the real start-up progress of the game.
    '01': {
      bg: '01', cls: 's01',
      html: () => `<div class="center">${logo()}<div class="tagline">Every rescue counts.</div></div>
        <div class="load"><div class="m-bar"><i id="sp-fill"></i></div><div class="ltext" id="sp-text"></div>
        <div class="m-alert" id="sp-err" hidden></div></div>`,
      mount: () => paintSplash(),
    },

    // 02 Welcome
    '02': {
      bg: '02', pos: 'left center', cls: 's02',
      html: () => `<div class="m-panel m-side">${logo()}<h1>Your mission starts here</h1><div class="tag">Explore. Rescue. Bring them home.</div>
        ${btn('Create account', 'go', { data: 'data-to="03"', cls: 'block' })}${btn('Sign in', 'go', { kind: 'outline', data: 'data-to="03A"', cls: 'block' })}${googleBtn()}
        <div class="foot">Single player &nbsp;•&nbsp; Landscape experience</div></div>`,
    },

    // 03 Account Access / Create Account
    '03': {
      bg: '03', pos: 'left center', cls: 's03',
      html: () => `${btn('Back', 'go', { kind: 'dark', cls: 'small m-back', icon: I.back, data: 'data-to="02" style="top:var(--m-safe-t);left:var(--m-safe-l)"' })}
        <div class="big-logo">${logo()}</div>
        <div class="m-panel m-side scroll"><h1 class="m-title">Create account</h1><p class="m-sub">Join 9JA RESCUE and be part of the mission.</p>
        <form data-submit="signup" novalidate>
          ${field({ name: 'email', label: 'Email address', type: 'email', placeholder: 'Enter your email address', value: S.email, auto: 'email' })}
          ${field({ name: 'pw', label: 'Password', type: 'password', placeholder: 'Create a password', eye: true, auto: 'new-password' })}
          ${field({ name: 'pw2', label: 'Confirm password', type: 'password', placeholder: 'Confirm your password', eye: true, auto: 'new-password' })}
          <div class="m-alert" id="f-alert" hidden></div>
          <div class="actions">${btn('Create account', null, { type: 'submit', cls: 'block' })}</div>
        </form>${googleBtn()}
        <div class="foot2"><span>Already registered? <button class="m-link" data-act="go" data-to="03A">Sign in</button></span><i class="sep"></i><button class="m-link muted" data-act="go" data-to="03C">Forgot password?</button></div></div>`,
    },

    // 03A Sign In
    '03A': {
      bg: '03A', pos: 'left center', cls: 'sAuth',
      html: () => `<div class="m-panel m-side scroll">${logo()}<hr class="m-rule"><h1 class="m-title">Sign in</h1>
        ${S.notice ? `<div class="m-alert ok">${esc(S.notice)}</div>` : ''}
        <form data-submit="signin" novalidate>
          ${field({ name: 'email', label: 'Email address', type: 'email', placeholder: 'Enter your email address', icon: I.mail, value: S.email, auto: 'email' })}
          ${field({ name: 'pw', label: 'Password', type: 'password', placeholder: 'Enter your password', icon: I.lock, eye: true, auto: 'current-password' })}
          <div class="m-alert" id="f-alert" hidden></div>
          <div class="actions">${btn('Sign in', null, { type: 'submit', cls: 'block' })}</div>
        </form>${googleBtn()}
        <div class="foot2"><button class="m-link muted" data-act="go" data-to="03C">Forgot password?</button></div><hr class="m-rule">
        <div class="foot2"><span>Don't have an account? <button class="m-link" data-act="go" data-to="03">Create account</button></span></div>
        <div class="foot2">${btn('Back', 'go', { kind: 'outline', cls: 'small', icon: I.arrowL, data: 'data-to="02"' })}</div></div>`,
    },

    // 03B Verify Email
    '03B': {
      bg: '03B', pos: 'left center', cls: 'sAuth',
      html: () => `<div class="m-panel m-side scroll">${logo()}<hr class="m-rule"><h1 class="m-title">Check your email</h1>
        <p class="m-sub">We sent a verification link to <b>${esc(S.email)}</b>.</p>
        <div class="envelope">${I.mail}</div>
        ${S.notice ? `<div class="m-alert ok">${esc(S.notice)}</div>` : ''}
        <div class="m-alert" id="f-alert" hidden></div>
        <div class="actions">${btn("I've verified my email", 'checkVerified', { cls: 'block' })}</div>
        <div class="actions" style="margin-top:.6rem">${btn('Resend email', 'resend', { kind: 'outline', cls: 'block' })}</div>
        <div class="foot2"><button class="m-link muted" data-act="changeEmail">Change email</button></div>
        ${auth.provider === 'device' ? '<div class="m-devmail">No email service is connected in this copy, so emails stay on this device. <button class="m-link" data-act="openMail" data-kind="verify">Open the test email</button></div>' : '<div class="m-devmail">Can\'t find it? Check your spam or junk folder.</div>'}</div>`,
    },

    // 03C Password Recovery
    '03C': {
      bg: '03C', pos: 'left center', cls: 'sAuth',
      html: () => `<div class="m-panel m-side scroll">${logo()}<hr class="m-rule"><h1 class="m-title">Reset password</h1>
        ${S.params.sent ? (auth.provider === 'device' ? `<div class="m-alert ok">If an account exists for <b>${esc(S.email)}</b>, a reset link is on its way. It works once and lasts 30 minutes.</div>
          <div class="m-devmail">No email service is connected in this copy. <button class="m-link" data-act="openMail" data-kind="reset">Open the test email</button></div>`
          : `<div class="m-alert ok">If an account exists for <b>${esc(S.email)}</b>, a reset link is on its way. Open it to choose a new password, then come back and sign in.</div>
          <div class="m-devmail">Can't find it? Check your spam or junk folder.</div>`)
          : `<p class="m-sub">Enter your account email.</p>
        <form data-submit="reset" novalidate>
          ${field({ name: 'email', label: 'Email address', type: 'email', placeholder: 'Enter your email address', icon: I.mail, value: S.email, auto: 'email' })}
          <div class="m-alert" id="f-alert" hidden></div>
          <div class="actions">${btn('Send reset link', null, { type: 'submit', cls: 'block' })}</div>
        </form>`}
        <hr class="m-rule"><div class="foot2">${btn('Back to sign in', 'go', { kind: 'outline', cls: 'small', icon: I.arrowL, data: 'data-to="03A"' })}</div></div>`,
    },

    // 03D Set New Password (opened from the reset link, which is checked first)
    '03D': {
      bg: '03D', pos: 'left center', cls: 'sAuth',
      html: () => `<div class="m-panel m-side scroll">${logo()}<hr class="m-rule"><h1 class="m-title">New password</h1>
        ${S.reset?.error ? `<div class="m-alert">${esc(S.reset.error)}</div>
          <div class="actions">${btn('Request a new link', 'go', { cls: 'block', data: 'data-to="03C"' })}</div>`
          : `<p class="m-sub">For ${esc(S.reset?.email)}</p>
        <form data-submit="newpw" novalidate>
          ${field({ name: 'pw', label: 'New password', type: 'password', placeholder: 'Enter new password', icon: I.lock, eye: true, auto: 'new-password' })}
          ${field({ name: 'pw2', label: 'Confirm password', type: 'password', placeholder: 'Confirm new password', icon: I.lock, eye: true, auto: 'new-password' })}
          <div class="m-alert" id="f-alert" hidden></div>
          <div class="actions">${btn('Save password', null, { type: 'submit', cls: 'block' })}</div>
        </form><p class="m-sub" style="text-align:center">Choose a strong, unique password.</p>`}
        <div class="foot2">${btn('Back to sign in', 'go', { kind: 'outline', cls: 'small', icon: I.arrowL, data: 'data-to="03A"' })}</div></div>`,
    },

    // 04 Home / Returning Player
    '04': {
      bg: '04', pos: 'right center', cls: 's04',
      html: () => {
        const a = account(), c = Chars.get(a.activeCharacter) ?? Chars.list()[0];
        const saved = S.game.mission.savedSummary();
        const name = c?.name ?? S.user.email.split('@')[0];
        const pic = c ? Chars.look(c.gender, c.role).portrait : null;
        return `<div class="head">${logo()}<div class="welcome">Welcome${c ? ' back' : ''},<b>${esc(name)}</b></div></div>
        <div class="top-r">${chips(a)}<button class="m-avatar m-mute" data-act="mute" aria-label="${sound.muted ? 'Sound off: turn on' : 'Sound on: turn off'}" aria-pressed="${sound.muted}">${sound.muted ? I.soundOff : I.soundOn}</button><button class="m-avatar" data-act="profile" aria-label="Profile" ${pic ? `style="background-image:url('${pic}')"` : ''}>${pic ? '' : I.user}</button></div>
        <div class="missions">
          ${saved ? btn(`Continue mission<small>${esc(saved.place)} • ${esc(saved.text)}${saved.character ? ` • ${esc(saved.character.name)}` : ''}</small>`, 'continue', { cls: 'm-big txt-btn', icon: I.save, right: I.next }) : ''}
          ${btn(`New mission${saved ? '' : '<small>Choose your character and loadout</small>'}`, 'newMission', { kind: saved ? 'green' : 'gold', cls: 'm-big', icon: I.map, right: I.next })}
          ${btn('Test: glider jump', 'testGlider', { kind: 'outline', cls: 'small', icon: I.plane })}
          ${saveFailed() ? '<div class="m-alert">Saving failed on this device: progress may not be kept.</div>' : ''}
        </div>
        <div class="nav">
          ${btn('Characters', 'go', { kind: 'dark', icon: I.users, data: 'data-to="05" data-mode="manage"' })}
          ${btn('Shop', 'go', { kind: 'dark', icon: I.cart, data: 'data-to="10" data-mode="shop"' })}
          ${btn('Rankings', 'rankings', { kind: 'dark', icon: I.trophy })}
          ${btn('Profile', 'profile', { kind: 'dark', icon: I.user })}
          ${btn('Settings', 'settings', { kind: 'dark', icon: I.gear })}
        </div>`;
      },
      mount: () => preload('05', '10'),
    },

    // 05 Saved Characters
    '05': {
      bg: '05', cls: 's05',
      html: () => {
        const list = Chars.list();
        if (!list.some((c) => c.id === S.selected)) S.selected = list.find((c) => c.id === account().activeCharacter)?.id ?? list[0]?.id ?? null;
        const lock = lockedId();
        const cards = [];
        for (let i = 0; i < Chars.SLOTS; i++) {
          const c = list[i];
          if (!c) {
            cards.push(`<button class="m-card create ${list.length === 0 && i === 0 ? 'primary' : ''}" data-act="create"><div><div class="plus">${I.plus}</div><div class="lbl">Create character</div></div></button>`);
            continue;
          }
          const sel = c.id === S.selected;
          cards.push(`<div class="m-card ${sel ? 'sel' : ''}" role="button" tabindex="0" data-act="pick" data-id="${c.id}" aria-pressed="${sel}">
            <div class="pic" style="background-image:url('${Chars.look(c.gender, c.role).portrait}')"></div><div class="shade"></div>
            ${sel ? `<div class="tick">${I.check}</div>` : ''}
            ${c.id === lock ? '<div class="badge">On mission</div>' : sel ? btn('', 'delete', { kind: 'dark', cls: 'del', icon: I.trash, data: `data-id="${c.id}" aria-label="Delete ${esc(c.name)}"` }) : ''}
            <div class="cap"><div class="name">${esc(c.name)}</div><div class="meta">${Chars.label(c)}</div></div>
            ${btn('Edit', 'edit', { kind: 'dark', cls: 'small edit', icon: I.pencil, data: `data-id="${c.id}"` })}</div>`);
        }
        return `<div class="m-logo-tl">${logo()}</div>${btn('Back', 'go', { kind: 'dark', cls: 'small m-top-back', icon: I.back, data: 'data-to="04"' })}
          <div class="m-banner"><h1 class="m-title">Choose your character</h1></div>
          <div class="slots">${list.length} of ${Chars.SLOTS} slots used</div>
          <div class="m-cards">${cards.join('')}</div>
          ${list.length ? '' : '<div class="hint">No saved characters yet. Create your first character to start.</div>'}
          <div class="m-foot-r">${btn(S.mode === 'manage' ? 'Done' : 'Use character', 'useChar', { right: I.next, disabled: !S.selected })}</div>`;
      },
      mount: () => preload('06', '07', '10'),
    },

    // 06 Gender Selection
    '06': {
      bg: '06', cls: 's06',
      html: () => {
        const g = S.wiz.gender;
        const card = (k) => `<button class="m-card ${g === k ? 'sel' : ''}" data-act="gender" data-v="${k}" aria-pressed="${g === k}"><div class="pic" style="background-image:url('ui/portraits/${k}.webp')"></div><div class="shade"></div>${g === k ? `<div class="tick">${I.check}</div>` : ''}<div class="cap"><div class="name">${k}</div></div></button>`;
        return `<div class="m-logo-tl">${logo()}</div>
          <div class="m-panel rolehead"><h1 class="m-title">Create your character</h1>${steps(0)}</div>
          <div class="m-cards">${card('male')}${card('female')}</div>
          <div class="m-foot-l">${btn('Back', 'go', { kind: 'dark', icon: I.back, data: 'data-to="05"' })}</div>
          <div class="m-foot-r">${btn('Next', 'go', { right: I.next, disabled: !g, data: 'data-to="07"' })}</div>`;
      },
    },

    // 07 Role Selection (male or female instance)
    '07': {
      bg: '07', cls: 's07',
      html: () => {
        const { gender, role } = S.wiz;
        const card = (k) => `<button class="m-card ${role === k ? 'sel' : ''}" data-act="role" data-v="${k}" aria-pressed="${role === k}"><div class="pic" style="background-image:url('${Chars.look(gender, k).portrait}')"></div><div class="shade"></div>${role === k ? `<div class="tick">${I.check}</div>` : ''}<div class="cap"><div class="name">${k}</div></div></button>`;
        return `<div class="m-logo-tl">${logo()}</div>
          <div class="m-panel rolehead"><h1 class="m-title">Choose your role</h1>${steps(1)}</div>
          <div class="m-cards">${card('hunter')}${card('soldier')}</div>
          <div class="caption">Same abilities. Your preferred appearance.</div>
          <div class="m-foot-l">${btn('Back', 'go', { kind: 'dark', icon: I.back, data: 'data-to="06"' })}</div>
          <div class="m-foot-r">${btn('Next', 'go', { right: I.next, disabled: !role, data: 'data-to="08"' })}</div>`;
      },
    },

    // 08 Character Customisation
    '08': {
      bg: '08', cls: 's08',
      html: () => {
        const w = S.wiz;
        const near = Math.round(w.skin * (Chars.SKIN_SWATCHES.length - 1));
        return `<div class="m-logo-tl">${logo()}</div>
          <div class="m-preview" id="pv"><div class="hint">⟲ Drag to rotate</div></div>
          <div class="m-panel m-side scroll"><h1 class="m-title">Make it yours</h1>${steps(2)}<hr class="m-rule" style="margin:.5rem 0">
          <form data-submit="review" novalidate>
            <label class="m-field" data-f="name"><span class="m-label">Character name</span>
              <div class="m-input"><input name="name" maxlength="14" value="${esc(w.name)}" placeholder="Name your character" autocomplete="off" autocapitalize="words" /></div><div class="m-err" role="alert"></div></label>
            <div class="m-label">Skin tone</div>
            <input class="m-range" type="range" min="0" max="1" step="0.01" value="${w.skin}" data-input="skin" aria-label="Skin tone" />
            <div class="m-swatches">${Chars.SKIN_SWATCHES.map((c, i) => `<button type="button" class="m-swatch ${i === near ? 'on' : ''}" style="background:${c}" data-act="swatch" data-v="${i / (Chars.SKIN_SWATCHES.length - 1)}" aria-label="Skin tone ${i + 1}"></button>`).join('')}</div>
            <div class="who">${Chars.label(w)}</div>
            <div class="btns">${btn('Back', 'go', { kind: 'dark', icon: I.back, data: 'data-to="07"' })}${btn('Review character', null, { type: 'submit', right: I.next })}</div>
          </form></div>`;
      },
      mount: () => showPreview($('#pv'), { model: Chars.look(S.wiz.gender, S.wiz.role).model, skin: S.wiz.skin }).catch((e) => toast(`Preview: ${e.message}`, true)),
      leave: () => hidePreview(),
    },

    // 09 Save and Confirm
    '09': {
      bg: '09', cls: 's09',
      html: () => {
        const w = S.wiz;
        const slot = w.id ? Chars.slotOf(w.id) : Chars.list().length + 1;
        return `<div class="m-preview" id="pv"></div>
          <div class="bigtitle">Ready for the mission</div>
          <div class="m-panel card9"><div class="pt" style="background-image:url('${Chars.look(w.gender, w.role).portrait}')"></div>
            <div class="nm">${esc(w.name)}</div><div class="rl">${Chars.label(w)}</div><div>Character slot ${slot} of ${Chars.SLOTS}</div>
            <hr class="m-rule"><div>Your character will be saved for future missions.</div>
            <div class="m-alert" id="f-alert" hidden></div>
            <div class="btns">${btn('Edit character', 'go', { kind: 'outline', data: 'data-to="08"' })}${btn('Save & continue', 'saveChar')}</div></div>`;
      },
      mount: () => showPreview($('#pv'), { model: Chars.look(S.wiz.gender, S.wiz.role).model, skin: S.wiz.skin }).catch(() => {}),
      leave: () => hidePreview(),
    },

    // 10 Assets and Equipment
    '10': {
      bg: '10', cls: 's10',
      html: () => {
        const a = account(), inv = a.inventory, lo = a.loadout;
        const cards = ITEMS.map((it) => {
          const price = RULES.prices[it.k], short = price - a.rp;
          const owned = it.kind === 'vehicle' ? !!inv[it.k] : inv[it.k];
          const canBuy = short <= 0;
          const buyBtn = btn(canBuy ? 'Buy' : `Need ${fmt(short)} more RP`, 'buy', { kind: canBuy ? 'gold' : 'dark', cls: canBuy ? '' : 'short', disabled: !canBuy, data: `data-k="${it.k}"` });
          let status, acts, note = '';
          let eq = false;
          if (it.kind === 'vehicle') {
            eq = lo.vehicle === it.k;
            status = owned ? '<div class="price">Owned</div>' : `<div class="price">${I.coins}${fmt(price)} RP</div>`;
            acts = owned ? btn(eq ? 'Equipped' : 'Equip', 'equip', { kind: eq ? 'gold' : 'outline', icon: eq ? I.check : '', data: `data-k="${it.k}"` }) : buyBtn;
            note = 'Permanent';
          } else if (it.kind === 'air') {
            eq = lo.air === it.k;
            status = `<div class="price">${I.coins}${fmt(price)} RP</div>`;
            acts = buyBtn + (owned > 0 ? btn(eq ? 'Equipped' : 'Equip', 'equip', { kind: eq ? 'gold' : 'outline', icon: eq ? I.check : '', data: `data-k="${it.k}"` }) : '');
            note = 'Single use';
          } else {
            eq = lo.grenades > 0;
            const max = Math.min(RULES.maxGrenades, inv.grenade);
            status = `<div class="price">${I.coins}${fmt(price)} RP</div>`;
            acts = buyBtn + `<div class="m-stepper" aria-label="Grenades to take"><button type="button" data-act="gren" data-v="-1" ${lo.grenades <= 0 ? 'disabled' : ''} aria-label="Fewer">−</button><span>Take ${lo.grenades}/${RULES.maxGrenades}</span><button type="button" data-act="gren" data-v="1" ${lo.grenades >= max ? 'disabled' : ''} aria-label="More">+</button></div>`;
            note = 'Used up when thrown';
          }
          const ownTxt = it.kind === 'vehicle' ? '' : `Owned: ${owned}`;
          return `<div class="m-panel m-item ${eq ? 'eq' : ''}"><h3>${it.name}</h3><div class="img" style="background-image:url('ui/items/${it.k}.webp')"></div>${status}<div class="own">${ownTxt}</div><div class="acts">${acts}</div><div class="note">${note}</div></div>`;
        }).join('');
        const entry = lo.air ? `${itemName(lo.air)} entry` : 'Ground entry';
        const sum = `${lo.vehicle ? itemName(lo.vehicle) : 'No vehicle'} • Grenades ${lo.grenades}/${RULES.maxGrenades} • ${entry}`;
        return `<div class="bigtitle">${S.mode === 'shop' ? 'Shop' : 'Prepare your loadout'}</div>${chips(a)}
          <div class="items">${cards}</div>
          <div class="m-foot-l">${btn('Back', 'go', { kind: 'dark', icon: I.arrowL, data: `data-to="${S.mode === 'shop' ? '04' : '05'}"` })}</div>
          <div class="m-panel bar10">${lo.vehicle === 'truck' ? I.cart : I.bike}<span class="sum">${sum}</span><span class="earn">Earn RP by rescuing captives.</span></div>
          <div class="m-foot-r">${S.mode === 'shop' ? btn('Done', 'go', { right: I.arrow, data: 'data-to="04"' }) : btn('Mission briefing', 'go', { right: I.arrow, data: 'data-to="12"' })}</div>`;
      },
      mount: () => preload('12', 'drone', 'cargo-ramp'),
    },

    // 12 Mission Briefing: five short panels (plan section 2); only the last has Begin Mission.
    '12': {
      cls: 's12',
      bgFn: () => briefBg(),
      html: () => briefHtml(),
    },

    // 13 Mission Loading: loads the actual mission, then hands over to play.
    '13': {
      bg: '13', pos: 'left center', cls: 's13',
      html: () => `<div class="m-logo-tl small">${logo()}</div>
        <div class="m-panel loadp"><h1 class="m-title">Preparing your mission</h1>
          <div class="barrow"><div class="m-bar"><i id="ml-fill"></i></div><b id="ml-pct">0%</b></div>
          <div class="now" id="ml-now">Starting…</div>
          <div class="tip">${I.bulb}<span id="ml-tip">${TIPS[0]}</span></div>
          <div class="err" id="ml-err" hidden></div>
          <div class="where" id="ml-where"></div></div>`,
      mount: () => runLoading(),
    },
  };

  // ------------------------------------------------------------- briefing
  function briefData() {
    const s = S.setup, a = account();
    const arr = ARRIVALS[s.arrival.index] ?? ARRIVALS[0];
    const caps = s.captives.map((c) => ({ name: PERSONAS[c.persona].name, pic: `ui/captives/${String(c.persona + 1).padStart(2, '0')}.webp` }));
    const air = a.loadout.air && a.inventory[a.loadout.air] > 0 ? a.loadout.air : null;
    const vehicle = a.loadout.vehicle && a.inventory[a.loadout.vehicle] ? a.loadout.vehicle : null;
    const site = S.game.mission.siteInfo(s.site ?? 'compound');
    return { arr, caps, air, vehicle, site, n: caps.length, c: charOf() };
  }
  function briefBg() {
    const { arr, air } = briefData();
    return [BG(arr.image), BG('12'), BG('12'), BG(air ? 'cargo-ramp' : arr.image), BG('12')][S.brief];
  }
  function briefHtml() {
    const d = briefData(), p = S.brief, last = p === 4;
    const plural = d.n === 1 ? 'captive' : 'captives';
    const faces = `<div class="faces">${d.caps.map((c) => `<div class="face" style="background-image:url('${c.pic}')"><span>${esc(c.name)}</span></div>`).join('')}</div>`;
    const body = [
      `<h3>Location</h3><p>A fictional river valley in Nigeria: granite kopjes and savanna to the north, rainforest, terraced villages and wetlands to the south, all one connected region.</p>
       <p>Your arrival point: <b>${esc(d.arr.name)}</b>, on ${esc(d.arr.area)}.</p>`,
      `<h3>The kidnapping</h3><p>Armed men stopped travellers on the valley road and took ${d.n === 1 ? 'one person' : `${d.n} people`} to a hidden site.</p>${faces}
       <p>${d.caps.map((c) => esc(c.name)).join(' and ')} ${d.n === 1 ? 'is' : 'are'} waiting for you.</p>`,
      `<h3>Drone report</h3><p>${d.site.brief} Six armed men guard it.</p>
       <p>${d.site.held} Four more hostiles patrol the land around it.</p>`,
      `<h3>Your arrival</h3><p>${d.air ? `You jump from a cargo plane over ${esc(d.arr.area)} and steer your ${itemName(d.air).toLowerCase()} for about 30 seconds to the marked landing area.` : `You arrive on foot at ${esc(d.arr.area)}.`}${d.vehicle ? ` Your ${itemName(d.vehicle).toLowerCase()} is parked beside the arrival point.` : ''}</p>
       <p><b>Collect health supplies to improve your chances before reaching the captive site.</b> Eight first-aid kits lie along the way in; the arrow guides you.</p>`,
      `<div class="top5">${faces}<div class="facts"><div>${I.captives}${d.n} ${plural}</div><div>${I.hostile}10 hostiles</div><div>${I.shield}DSS extraction</div></div></div>
       <p>Collect health supplies. Clear the captive site. Rescue all captives and deliver them to DSS.</p>
       <div class="rewards"><div class="reward">${I.coins}+${fmt(RULES.rpPerCaptive * d.n)} RP</div><div class="reward">${I.chevrons}+${RULES.missionPoints} MP</div></div>
       <div class="lo"><span>${I.user}${esc(d.c?.name ?? '-')}</span>•<span>${I.rifle}${esc(d.c ? d.c.role[0].toUpperCase() + d.c.role.slice(1) : '')}</span>•<span>${d.air ? I.plane : I.bike}${d.air ? itemName(d.air) : d.vehicle ? itemName(d.vehicle) : 'On foot'}</span></div>`,
    ][p];
    const drone = p === 2 ? `<div class="drone" style="background-image:url('${BG('drone')}')"><div class="tag">DRONE IMAGE • LIVE</div><div class="ring"><b>SUSPECTED CAPTIVE SITE</b></div></div>` : '';
    return `<div class="m-logo-tl small">${logo()}</div>${drone}
      <div class="m-panel brief"><div class="kicker">Briefing ${p + 1} of 5</div><h1 class="m-title">Operation River Valley</h1>
        <div class="body">${body}</div>
        <div class="navrow"><div class="m-dots">${[0, 1, 2, 3, 4].map((i) => `<button data-act="briefTo" data-v="${i}" class="${i === p ? 'on' : ''}" aria-label="Briefing panel ${i + 1}"></button>`).join('')}</div>
          ${last ? btn('Begin mission', 'begin', { right: I.next }) : btn('Next', 'briefNext', { right: I.next })}</div></div>
      <div class="m-foot-l">${btn('Back', 'briefBack', { kind: 'dark', icon: I.back })}</div>`;
  }

  // ------------------------------------------------------------- rendering
  let current = null;
  function show(id, params = {}) {
    if (current?.leave) current.leave();
    closeSheet();
    if (params.mode) S.mode = params.mode;
    S.id = id;
    S.params = params;
    if (id !== '03A' && id !== '03B') S.notice = params.notice ?? null;
    else if (params.notice !== undefined) S.notice = params.notice;
    if (id === '12' && !S.setup) S.setup = S.game.mission.prepare();
    current = SCREENS[id];
    document.body.classList.add('in-menu');
    const bg = current.bgFn ? current.bgFn() : BG(current.bg);
    root.innerHTML = `<div class="m-bg" style="background-image:url('${bg}');${current.pos ? `background-position:${current.pos}` : ''}"></div><div class="m-screen ${current.cls}" data-screen="${id}">${current.html()}</div>`;
    root.dataset.screen = id;
    current.mount?.();
    const first = root.querySelector('[data-screen] .m-btn.gold:not(:disabled), [data-screen] input');
    if (first && !matchMedia('(pointer: coarse)').matches && first.tagName !== 'INPUT') first.focus({ preventScroll: true });
  }
  const rerender = () => show(S.id, S.params);

  // ------------------------------------------------------------- splash
  function paintSplash() {
    if (S.id !== '01') return;
    const pct = Math.round(S.splash.p * 100);
    $('#sp-fill').style.width = `${pct}%`;
    $('#sp-text').textContent = `${S.splash.text} ${pct}%`;
    if (S.splash.error) {
      alertBox('#sp-err', `${esc(S.splash.error)}<div style="margin-top:.5rem">${btn('Try again', 'reload', { cls: 'small' })}</div>`);
    }
  }

  async function afterSplash() {
    try { await auth.init(); await cloud.init(auth.app); } catch (e) {
      console.error(e);
      S.splash.error = 'Could not reach the account service. Check your internet connection.';
      paintSplash();
      return;
    }
    if (handleLink()) return;
    const u = auth.current();
    if (u) return signedIn(u);
    show(auth.knownDevice() ? '03A' : '02');
  }

  async function signedIn(u) {
    S.user = u;
    S.email = u.email;
    setUser(u.uid);
    // Bring this device up to date with the online save (newer copy wins).
    if (cloud.enabled) {
      if (S.id === '01') { S.splash.text = 'Loading your progress…'; paintSplash(); }
      if ((await cloud.pull()) === 'offline') toast('No connection: playing with the progress saved on this phone. It will be saved online later.');
    }
    S.game.mission.reloadAccount();
    S.setup = null;
    show('04');
  }

  // Verification and reset links (#verify=… / #reset=…).
  function handleLink() {
    const m = /^#(verify|reset)=([a-f0-9]+)$/.exec(location.hash);
    if (!m) return false;
    history.replaceState(null, '', location.pathname + location.search);
    if (!S.game) return false;
    if (m[1] === 'verify') {
      try {
        const r = auth.verifyLink(m[2]);
        S.email = r.email;
        show('03B', { notice: 'Email verified. Tap "I\'ve verified my email" to continue.' });
      } catch (e) { S.notice = null; show('03B'); alertBox('#f-alert', esc(e.message)); }
    } else {
      try { S.reset = { token: m[2], ...auth.checkResetLink(m[2]) }; } catch (e) { S.reset = { error: e.message }; }
      show('03D');
    }
    return true;
  }
  addEventListener('hashchange', () => handleLink());

  // ------------------------------------------------------------- forms
  const forms = {
    async signup(form, button) {
      const v = Object.fromEntries(new FormData(form));
      const e1 = emailProblem(v.email), e2 = passwordProblem(v.pw), e3 = v.pw2 !== v.pw ? 'The passwords do not match.' : (!v.pw2 ? 'Confirm your password.' : null);
      setErr(form, 'email', e1); setErr(form, 'pw', e2); setErr(form, 'pw2', e3);
      alertBox('#f-alert', null);
      if (e1 || e2 || e3) return;
      await busy(button, 'Creating account…', async () => {
        try {
          const r = await auth.signUp(v.email, v.pw);
          S.email = r.email;
          show('03B', { notice: null });
        } catch (e) {
          if (e.code === 'email-in-use') alertBox('#f-alert', `${esc(e.message)} <button class="m-link" data-act="go" data-to="03A">Sign in</button>`);
          else alertBox('#f-alert', esc(e.message));
        }
      });
    },
    async signin(form, button) {
      const v = Object.fromEntries(new FormData(form));
      const e1 = emailProblem(v.email), e2 = v.pw ? null : 'Enter your password.';
      setErr(form, 'email', e1); setErr(form, 'pw', e2);
      alertBox('#f-alert', null);
      if (e1 || e2) return;
      S.email = v.email.trim();
      await busy(button, 'Signing in…', async () => {
        try {
          signedIn(await auth.signIn(v.email, v.pw));
        } catch (e) {
          if (e.code === 'unverified') show('03B', { notice: null }), alertBox('#f-alert', 'Verify your email to sign in. Open the link we sent, or resend it.', 'info');
          else alertBox('#f-alert', esc(e.message));
        }
      });
    },
    async reset(form, button) {
      const v = Object.fromEntries(new FormData(form));
      const e1 = emailProblem(v.email);
      setErr(form, 'email', e1);
      if (e1) return;
      await busy(button, 'Sending…', async () => {
        try {
          await auth.requestReset(v.email);
          S.email = v.email.trim();
          show('03C', { sent: true });
        } catch (e) { alertBox('#f-alert', esc(e.message)); }
      });
    },
    async newpw(form, button) {
      const v = Object.fromEntries(new FormData(form));
      const e1 = passwordProblem(v.pw), e2 = v.pw2 !== v.pw ? 'The passwords do not match.' : null;
      setErr(form, 'pw', e1); setErr(form, 'pw2', e2);
      if (e1 || e2) return;
      await busy(button, 'Saving…', async () => {
        try {
          const r = await auth.resetPassword(S.reset.token, v.pw);
          S.email = r.email;
          S.reset = null;
          show('03A', { notice: 'Password saved. Sign in with your new password.' });
        } catch (e) {
          if (e.code === 'link-invalid' || e.code === 'link-expired') { S.reset = { error: e.message }; rerender(); } else alertBox('#f-alert', esc(e.message));
        }
      });
    },
    review(form) {
      const name = new FormData(form).get('name');
      const p = Chars.nameProblem(name, S.wiz.id);
      setErr(form, 'name', p);
      if (p) return;
      S.wiz.name = String(name).trim();
      show('09');
    },
  };

  // ------------------------------------------------------------- actions
  const actions = {
    go(b) { show(b.dataset.to, b.dataset.mode ? { mode: b.dataset.mode } : {}); },
    reload() { location.reload(); },
    eye(b) {
      const inp = b.parentElement.querySelector('input');
      const showIt = inp.type === 'password';
      inp.type = showIt ? 'text' : 'password';
      b.innerHTML = showIt ? I.eyeOff : I.eye;
      b.setAttribute('aria-label', showIt ? 'Hide password' : 'Show password');
    },
    async checkVerified(b) {
      await busy(b, 'Checking…', async () => {
        try { signedIn(await auth.checkVerified(S.email)); } catch (e) { S.notice = null; $('.m-alert.ok')?.remove(); alertBox('#f-alert', esc(e.message)); }
      });
    },
    async resend(b) {
      await busy(b, 'Sending…', async () => {
        try {
          const r = await auth.resendVerification(S.email);
          alertBox('#f-alert', r.already ? 'This email is already verified. Tap "I\'ve verified my email".' : 'A new verification email is on its way.', 'ok');
        } catch (e) { alertBox('#f-alert', esc(e.message)); }
      });
    },
    changeEmail() { auth.changeEmail(S.email); show('03'); },
    async google(b) {
      await busy(b, 'Opening Google…', async () => {
        try { signedIn(await auth.signInWithGoogle()); } catch (e) {
          if (e.code === 'cancelled') return;
          if ($('#f-alert')) alertBox('#f-alert', esc(e.message)); else toast(e.message, true);
        }
      });
    },
    openMail(b) {
      const mail = auth.latestMail(S.email, b.dataset.kind);
      if (!mail) { sheet(`<h2 class="m-title">Test inbox</h2><p>No email was sent to ${esc(S.email)}${b.dataset.kind === 'reset' ? ' (there may be no account with this address)' : ''}.</p><div class="row">${btn('Close', 'closeSheet', { kind: 'outline' })}</div>`); return; }
      sheet(`<h2 class="m-title">Test inbox</h2><p class="m-sub">Stands in for your email until an email service is connected.</p>
        <div class="m-stats"><span>From</span><b>9ja Rescue</b><span>To</span><b>${esc(mail.to)}</b><span>Subject</span><b>${esc(mail.subject)}</b></div>
        <p>${mail.kind === 'verify' ? 'Tap the button to verify your email address.' : 'Tap the button to choose a new password. The link works once and lasts 30 minutes.'}</p>
        <div class="row">${btn('Close', 'closeSheet', { kind: 'outline' })}${btn(mail.kind === 'verify' ? 'Verify my email' : 'Reset my password', 'followLink', { data: `data-link="${esc(mail.link)}"` })}</div>`);
    },
    followLink(b) { closeSheet(); location.hash = b.dataset.link; },
    closeSheet() { closeSheet(); },

    // Home
    continue() { show('13', { kind: 'continue' }); },
    newMission(b) {
      if (S.game.mission.savedSummary()) {
        sheet(`<h2 class="m-title">Abandon current mission?</h2><p>Only one mission can be active. Starting a new one abandons the current mission and its progress. Your characters, RP and purchases stay. A parachute or glider already used for this mission is not returned.</p>
          <div class="row">${btn('Keep it', 'closeSheet', { kind: 'outline' })}${btn('Abandon and start new', 'abandonNew')}</div>`);
        return;
      }
      S.setup = null;
      show('05', { mode: 'mission' });
    },
    // Test tool (owner request): straight to the cargo plane with a glider.
    // Grants one test glider, equips it and starts a fresh mission.
    testGlider() {
      if (S.game.mission.savedSummary()) {
        sheet(`<h2 class="m-title">Glider test</h2><p>This abandons your current mission and starts a new one from the cargo plane with a glider.</p>
          <div class="row">${btn('Cancel', 'closeSheet', { kind: 'outline' })}${btn('Start glider test', 'testGliderGo')}</div>`);
        return;
      }
      actions.testGliderGo();
    },
    testGliderGo() {
      closeSheet();
      const m = S.game.mission, a = account();
      m.abandon();
      if (!charOf()) {
        try { const c = Chars.save({ name: 'Tester', gender: 'male', role: 'hunter', skin: Chars.DEFAULT_SKIN }); a.activeCharacter = c.id; } catch (e) { toast(e.message, true); return; }
      }
      a.inventory.glider = (a.inventory.glider || 0) + 1;
      a.loadout.air = 'glider';
      saveAccount(a);
      S.setup = m.prepare();
      show('13', { kind: 'start' });
    },
    abandonNew() { S.game.mission.abandon(); S.setup = null; closeSheet(); show('05', { mode: 'mission' }); },
    async rankings() {
      if (!cloud.enabled) {
        sheet(`<h2 class="m-title">Rankings</h2><p>Rankings compare Mission Points between players online. This copy of the game plays offline, so open the online version to see them.</p>
          <div class="m-stats"><span>Your Mission Points</span><b>${fmt(account().missionPoints)}</b></div><div class="row">${btn('Close', 'closeSheet', { kind: 'outline' })}</div>`);
        return;
      }
      sheet('<h2 class="m-title">Rankings</h2><p class="m-sub">Loading…</p>');
      cloud.publishRank();
      let r;
      try { r = await cloud.rankings(50); } catch (e) {
        console.warn(e);
        sheet(`<h2 class="m-title">Rankings</h2><p>Rankings could not be loaded. Check your connection and try again.</p><div class="row">${btn('Close', 'closeSheet', { kind: 'outline' })}</div>`);
        return;
      }
      if (!$('.m-sheet')) return;   // closed while loading
      const uid = S.user?.uid;
      const rows = r.list.map((p, i) => `<tr class="${p.uid === uid ? 'me' : ''}"><td>${i + 1}</td><td>${esc(p.name)}</td><td>${fmt(p.mp)}</td><td>${fmt(p.captives)}</td><td>${fmt(p.missions)}</td></tr>`).join('');
      const mine = r.me && !r.list.some((p) => p.uid === uid)
        ? `<tr class="me"><td>${r.me.rank ?? '–'}</td><td>${esc(r.me.name)}</td><td>${fmt(r.me.mp)}</td><td>${fmt(r.me.captives)}</td><td>${fmt(r.me.missions)}</td></tr>` : '';
      sheet(`<h2 class="m-title">Rankings</h2><p class="m-sub">Players by Mission Points. Complete a mission to join.</p>
        ${rows || mine ? `<div class="m-rank-wrap"><table class="m-rank"><thead><tr><th>#</th><th>Player</th><th>MP</th><th>Rescued</th><th>Missions</th></tr></thead><tbody>${rows}${mine}</tbody></table></div>`
          : '<p>No one has completed a mission yet. Be the first!</p>'}
        ${r.me ? '' : `<p class="m-sub">You'll appear here after your first completed mission.</p>`}
        <div class="row">${btn('Close', 'closeSheet', { kind: 'outline' })}</div>`);
    },
    profile() {
      const a = account();
      sheet(`<h2 class="m-title">Profile</h2><p class="m-sub">${esc(S.user.email)} • ${auth.provider === 'device' ? 'account on this device' : (cloud.state === 'synced' ? 'progress saved online' : cloud.state === 'syncing' ? 'saving online…' : 'progress on this phone; will save online when connected')}</p>
        <div class="m-stats"><span>Rescue Points (RP)</span><b>${fmt(a.rp)}</b><span>Mission Points (MP)</span><b>${fmt(a.missionPoints)}</b>
        <span>Missions completed</span><b>${fmt(a.missionsCompleted)}</b><span>Captives rescued</span><b>${fmt(a.captivesRescued)}</b>
        <span>Characters</span><b>${Chars.list().length} of ${Chars.SLOTS}</b></div>
        <div class="row">${btn('Sign out', 'signOut', { kind: 'outline' })}${btn('Close', 'closeSheet')}</div>`);
    },
    settings() { openSettings(() => { if (S.id === '04') rerender(); }); },
    mute() {
      sound.setMuted(!sound.muted);
      if (!sound.muted) sound.ui('select');
      rerender();
    },
    async signOut() { await cloud.flush().catch(() => {}); auth.signOut(); setUser(null); S.user = null; S.setup = null; closeSheet(); show('03A', { notice: 'Signed out.' }); },

    // Characters
    pick(b) { S.selected = b.dataset.id; rerender(); },
    create() {
      if (Chars.list().length >= Chars.SLOTS) { toast('All three slots are in use. Delete a character first.', true); return; }
      S.wiz = { id: null, gender: null, role: null, name: '', skin: Chars.DEFAULT_SKIN };
      show('06');
    },
    edit(b, e) {
      e.stopPropagation();
      const c = Chars.get(b.dataset.id);
      S.wiz = { ...c };
      show('08');
    },
    delete(b, e) {
      e.stopPropagation();
      const c = Chars.get(b.dataset.id);
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        b.querySelector('span').textContent = 'Tap again to delete';
        setTimeout(() => { if (b.isConnected) { b.classList.remove('armed'); b.querySelector('span').textContent = ''; } }, 3500);
        return;
      }
      try {
        Chars.remove(c.id, lockedId());
        if (account().activeCharacter === c.id) { account().activeCharacter = null; saveAccount(account()); }
        S.selected = null;
        toast(`${c.name} deleted.`);
        rerender();
      } catch (err) { toast(err.message, true); }
    },
    useChar() {
      const c = Chars.get(S.selected);
      if (!c) return;
      account().activeCharacter = c.id;
      saveAccount(account());
      show(S.mode === 'manage' ? '04' : '10');
    },
    gender(b) { if (S.wiz.gender !== b.dataset.v) S.wiz.role = null; S.wiz.gender = b.dataset.v; rerender(); },
    role(b) { S.wiz.role = b.dataset.v; rerender(); },
    swatch(b) { setSkin(+b.dataset.v); },
    saveChar(b) {
      try {
        const c = Chars.save(S.wiz);
        S.wiz.id = c.id;
        S.selected = c.id;
        account().activeCharacter = c.id;
        saveAccount(account());
        toast(`${c.name} saved.`);
        show(S.mode === 'manage' ? '05' : '10');
      } catch (err) { alertBox('#f-alert', esc(err.message)); b.disabled = false; }
    },

    // Assets and equipment
    buy(b) {
      if (S.busy) return;   // repeated taps never charge twice
      S.busy = true;
      const k = b.dataset.k, a = account(), price = RULES.prices[k];
      try {
        if (a.rp < price) { toast(`You need ${fmt(price - a.rp)} more RP.`, true); return; }
        sound.ui('purchase', 0.7);
        const before = JSON.stringify(a);
        a.rp -= price;
        if (k === 'bike' || k === 'truck') a.inventory[k] = true; else a.inventory[k] = (a.inventory[k] || 0) + 1;
        a.purchases.push(`p-${Date.now().toString(36)}-${k}`);
        if (a.purchases.length > 200) a.purchases.splice(0, a.purchases.length - 200);
        if (!saveAccount(a)) { Object.assign(a, JSON.parse(before)); toast('The purchase could not be saved on this device. No RP was taken.', true); return; }
        toast(`Bought: ${itemName(k)} (−${fmt(price)} RP)`);
      } finally {
        setTimeout(() => { S.busy = false; }, 350);
      }
      rerender();
    },
    equip(b) {
      const k = b.dataset.k, a = account(), lo = a.loadout;
      if (k === 'bike' || k === 'truck') lo.vehicle = lo.vehicle === k ? null : k;
      else lo.air = lo.air === k ? null : k;   // one aerial device per loadout
      saveAccount(a);
      rerender();
    },
    gren(b) {
      const a = account(), lo = a.loadout;
      lo.grenades = Math.max(0, Math.min(RULES.maxGrenades, a.inventory.grenade, lo.grenades + +b.dataset.v));
      saveAccount(a);
      rerender();
    },

    // Briefing
    briefNext() { S.brief = Math.min(4, S.brief + 1); rerender(); },
    briefBack() { if (S.brief > 0) { S.brief--; rerender(); } else show('10'); },
    briefTo(b) { S.brief = +b.dataset.v; rerender(); },
    begin() { show('13', { kind: 'start' }); },
  };

  function setSkin(v) {
    S.wiz.skin = Math.round(v * 100) / 100;
    setPreviewSkin(S.wiz.skin);
    const r = $('.m-range');
    if (r) r.value = S.wiz.skin;
    const near = Math.round(S.wiz.skin * (Chars.SKIN_SWATCHES.length - 1));
    root.querySelectorAll('.m-swatch').forEach((s, i) => s.classList.toggle('on', i === near));
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || !root.contains(b)) return;
    const f = actions[b.dataset.act];
    if (f) { e.preventDefault(); tapSound(b); f(b, e); }
  });
  // Menu taps: a soft press, a lighter tick for choices, a different one for going back.
  const SELECTS = new Set(['pick', 'gender', 'role', 'swatch', 'briefTo', 'gren', 'equip', 'eye']);
  const BACKS = new Set(['closeSheet', 'briefBack']);
  function tapSound(b) {
    const a = b.dataset.act;
    if (a === 'buy' || a === 'mute') return;   // these play their own
    if (SELECTS.has(a)) sound.ui('select', 0.5);
    else if (BACKS.has(a) || /^back$/i.test(b.textContent.trim())) sound.ui('back', 0.5);
    else sound.ui('press', 0.6);
  }
  root.addEventListener('keydown', (e) => {
    const b = e.target.closest?.('.m-card[role="button"]');
    if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); actions[b.dataset.act]?.(b, e); }
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    sound.ui('press', 0.6);
    forms[form.dataset.submit]?.(form, form.querySelector('[type=submit]'));
  });
  root.addEventListener('input', (e) => {
    if (e.target.dataset.input === 'skin') setSkin(+e.target.value);
    const f = e.target.closest('.m-field.bad');
    if (f) { f.classList.remove('bad'); f.querySelector('.m-err').textContent = ''; }
  });
  // Keyboard-safe forms: keep the focused field visible above the on-screen keyboard.
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', () => {
      root.style.setProperty('--vvh', `${vv.height}px`);
      root.classList.toggle('kb', vv.height < innerHeight * 0.8);
      const a = document.activeElement;
      if (a?.tagName === 'INPUT' && root.contains(a)) setTimeout(() => a.scrollIntoView({ block: 'center' }), 50);
    });
  }
  root.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT') setTimeout(() => e.target.scrollIntoView({ block: 'nearest' }), 300);
  });

  // ------------------------------------------------------------- 13 loading
  async function runLoading() {
    const g = S.game;
    let kind = S.params.kind;
    const fill = $('#ml-fill'), pct = $('#ml-pct'), now = $('#ml-now'), tip = $('#ml-tip');
    const summary = kind === 'continue' ? g.mission.savedSummary() : null;
    const n = kind === 'continue' ? summary?.captives : S.setup?.captives.length;
    const place = kind === 'continue' ? summary?.place : ARRIVALS[S.setup?.arrival.index]?.name;
    $('#ml-where').textContent = `${place ?? 'River Valley'} • ${n ?? 1} captive${n === 1 ? '' : 's'}`;
    let ti = 0;
    const tipTimer = setInterval(() => { if (tip.isConnected) tip.textContent = TIPS[++ti % TIPS.length]; }, 4000);
    const onProgress = (f, text) => {
      if (!fill.isConnected) return;
      const p = Math.round(f * 100);
      fill.style.width = `${p}%`;
      pct.textContent = `${p}%`;
      now.textContent = text;
    };
    try {
      if (kind === 'start') {
        const c = charOf();
        if (!c) throw new Error('No character chosen. Go back and choose one.');
        await g.start(c, onProgress);
        S.setup = null;
        S.brief = 0;
      } else {
        await g.continueSaved(onProgress);
      }
      clearInterval(tipTimer);
      root.innerHTML = '';
      current = null;
    } catch (e) {
      console.error(e);
      clearInterval(tipTimer);
      // A started mission is saved before loading, so a retry continues it (no reroll, no second charge).
      if (kind === 'start' && g.mission.savedSummary()) S.params.kind = 'continue';
      const box = $('#ml-err');
      if (box) {
        box.hidden = false;
        box.innerHTML = `<div class="m-alert">Loading failed: ${esc(e.message)}. Check your connection and try again.</div>
          <div class="row">${btn('Home', 'go', { kind: 'outline', data: 'data-to="04"' })}${btn('Retry', 'retryLoad')}</div>`;
      }
    }
  }
  actions.retryLoad = () => show('13', { kind: S.params.kind });

  // First screen.
  show('01');
  preload('02', '03A', '04');

  return {
    get playing() { return !!S.game?.playing; },
    splashProgress(p, text) {
      if (S.splash.ready) return;
      S.splash.p = Math.max(S.splash.p, p);
      S.splash.text = text;
      paintSplash();
    },
    fatal(msg) {
      if (S.id === '01') { S.splash.error = msg; paintSplash(); return; }
      toast(msg, true);
    },
    gameReady(game) {
      S.game = game;
      S.splash.ready = true;
      S.splash.p = 1;
      S.splash.text = 'Ready';
      paintSplash();
      setTimeout(afterSplash, 350);
    },
    show,
    ownsError: () => false,
  };
}
