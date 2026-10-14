// Player settings (kept on this device): sound volume, graphics quality,
// camera sensitivity, touch button size and a left-handed layout. One panel,
// opened from Settings on Home and from the pause menu; changes apply at once.
import { sound } from './sound.js';

const KEY = '9ja.settings.v1';
const DEFAULTS = { volume: 0.8, graphics: 'medium', sensitivity: 1, buttons: 'normal', leftHanded: false };
let S = { ...DEFAULTS };
try { S = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch { /* defaults */ }
const listeners = [];

function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ignore */ } }
function apply() {
  sound.setVolume?.(S.volume);
  const b = document.body;
  b.classList.toggle('lefty', !!S.leftHanded);
  b.dataset.buttons = S.buttons;
  for (const f of listeners) f(S);
}

export const settings = {
  get value() { return S; },
  set(k, v) { S[k] = v; save(); apply(); },
  // f(settings) is called now and after every change.
  onChange(f) { listeners.push(f); f(S); },
  open,
};

// ------------------------------------------------------------------ panel
const GRAPHICS = [['low', 'Low (smoothest)'], ['medium', 'Medium'], ['high', 'High (sharpest)']];
const BUTTONS = [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']];
let el = null;

function render() {
  const pick = (k, opts) => `<div class="row" role="group">${opts.map(([v, label]) =>
    `<button type="button" data-k="${k}" data-v="${v}" class="${S[k] === v ? 'on' : ''}" aria-pressed="${S[k] === v}">${label}</button>`).join('')}</div>`;
  el.querySelector('.panel').innerHTML = `
    <div class="big">Settings</div>
    <label class="set-row"><span>Sound</span>
      <button type="button" data-k="mute" class="${sound.muted ? '' : 'on'}" aria-pressed="${!sound.muted}">${sound.muted ? 'Off' : 'On'}</button>
      <input id="set-volume" type="range" min="0" max="1" step="0.05" value="${S.volume}" aria-label="Volume" ${sound.muted ? 'disabled' : ''}></label>
    <div class="set-row col"><span>Graphics</span>${pick('graphics', GRAPHICS)}
      <div class="small">Lower graphics run smoother and use less battery.</div></div>
    <label class="set-row"><span>Camera speed</span>
      <input id="set-sens" type="range" min="0.4" max="2" step="0.1" value="${S.sensitivity}" aria-label="Camera speed"><b>${S.sensitivity.toFixed(1)}×</b></label>
    <div class="set-row col"><span>Button size</span>${pick('buttons', BUTTONS)}</div>
    <div class="set-row"><span>Left-handed</span>
      <button type="button" data-k="leftHanded" class="${S.leftHanded ? 'on' : ''}" aria-pressed="${S.leftHanded}">${S.leftHanded ? 'On' : 'Off'}</button>
      <div class="small">Buttons on the left, move with your right thumb.</div></div>
    <button type="button" data-k="close" class="gold">Done</button>`;
}

function open(onClose) {
  if (!el) {
    el = document.createElement('div');
    el.id = 'settings';
    el.className = 'panel-screen';
    el.innerHTML = '<div class="panel" role="dialog" aria-modal="true" aria-label="Settings"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b) { if (e.target === el) close(); return; }
      const k = b.dataset.k;
      sound.ui('select', 0.5);
      if (k === 'close') { close(); return; }
      if (k === 'mute') sound.setMuted(!sound.muted);
      else if (k === 'leftHanded') settings.set(k, !S.leftHanded);
      else settings.set(k, b.dataset.v);
      render();
    });
    el.addEventListener('input', (e) => {
      if (e.target.id === 'set-volume') settings.set('volume', +e.target.value);
      if (e.target.id === 'set-sens') { settings.set('sensitivity', +e.target.value); e.target.nextElementSibling.textContent = `${S.sensitivity.toFixed(1)}×`; }
    });
    el.addEventListener('change', (e) => { if (e.target.id === 'set-volume') sound.ui('press', 0.6); });
  }
  el._onClose = onClose;
  render();
  el.hidden = false;
  el.querySelector('button')?.focus({ preventScroll: true });
}
function close() {
  el.hidden = true;
  el._onClose?.();
}

apply();
