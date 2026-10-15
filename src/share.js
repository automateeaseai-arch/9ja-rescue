// "Share your rescue" on the results panel (owner, 15 Oct: get the game seen,
// as Lagos Life spread by players sharing). After each completed mission a
// picture is drawn here: the mission name, the rescued captives' portraits
// with their names, who brought them home, and the game's address. It is
// shared with the phone's own share sheet (WhatsApp, X, Instagram…) together
// with the message; where pictures can't be shared (most computers) the
// panel offers X, WhatsApp, Save picture and Copy.
export const GAME_URL = 'https://9jarescue.app/';
// Shared links carry ?s=1: a fresh address for X and WhatsApp's preview
// caches, and visits from shares are told apart in the statistics.
const SHARE_URL = `${GAME_URL}?s=1`;
const W = 1200, H = 675;   // 16:9, the shape X and WhatsApp show in full

export function rescueText({ captives = [], mission = '' } = {}) {
  const n = captives.length || 1;
  const who = n === 1 ? '1 captive' : `${n} captives`;
  return `I just rescued ${who}${mission ? ` in ${mission}` : ''} on 9ja Rescue 🇳🇬 Every rescue counts. Can you bring them home? Play free:`;
}

const img = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
const pad2 = (n) => String(n).padStart(2, '0');
function cover(g, im, x, y, w, h) {
  const s = Math.max(w / im.width, h / im.height), sw = w / s, sh = h / s;
  g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
}
function rounded(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// The picture for one rescue: a JPEG Blob.
export async function rescueCard({ captives = [], mission = '', hero = '' }) {
  try { await Promise.all(['800 64px "Barlow Condensed"', '600 30px "Barlow"'].map((f) => document.fonts.load(f))); } catch { /* system font */ }
  const [bg, logo, ...faces] = await Promise.all([
    img('ui/bg/01.webp'), img('ui/logo.webp'),
    ...captives.map((c) => img(`ui/captives/${pad2(c.persona + 1)}.webp`).catch(() => null)),
  ]);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  cover(g, bg, 0, 0, W, H);
  let gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, 'rgba(6,18,12,.55)'); gr.addColorStop(0.4, 'rgba(6,18,12,.78)'); gr.addColorStop(1, 'rgba(6,18,12,.92)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  gr = g.createLinearGradient(0, H * 0.6, 0, H);
  gr.addColorStop(0, 'rgba(6,18,12,0)'); gr.addColorStop(1, 'rgba(6,18,12,.95)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);

  // Logo, left.
  const lw = 330, lh = lw * logo.height / logo.width;
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 24; g.shadowOffsetY = 8;
  g.drawImage(logo, 50, 70, lw, lh);
  g.shadowColor = 'transparent';

  // Title, right of the logo.
  const tx = 430;
  g.fillStyle = '#f2c443'; g.font = '800 34px "Barlow Condensed", sans-serif';
  g.fillText('MISSION COMPLETE', tx, 92);
  g.fillStyle = '#f5f1e6'; g.font = '800 58px "Barlow Condensed", sans-serif';
  g.fillText(mission.toUpperCase(), tx, 150, W - tx - 40);

  // The rescued captives: portrait cards with names.
  const cw = 200, ch = 240, gap = 34, top = 190;
  captives.forEach((cap, i) => {
    const x = tx + i * (cw + gap);
    g.save(); rounded(g, x, top, cw, ch, 16); g.clip();
    g.fillStyle = '#1b3527'; g.fillRect(x, top, cw, ch);
    if (faces[i]) cover(g, faces[i], x, top, cw, ch);
    const sh = g.createLinearGradient(0, top + ch * 0.55, 0, top + ch);
    sh.addColorStop(0, 'rgba(8,20,14,0)'); sh.addColorStop(1, 'rgba(8,20,14,.92)');
    g.fillStyle = sh; g.fillRect(x, top, cw, ch);
    g.restore();
    rounded(g, x, top, cw, ch, 16); g.lineWidth = 4; g.strokeStyle = '#f2c443'; g.stroke();
    g.fillStyle = '#f5f1e6'; g.textAlign = 'center';
    const label = cap.name.replace(/\s*\(.*\)/, '').toUpperCase();   // "NYSC corps member (female)" → "NYSC CORPS MEMBER"
    let fs = 28;
    do { g.font = `800 ${fs}px "Barlow Condensed", sans-serif`; } while (g.measureText(label).width > cw - 16 && --fs > 18);
    g.fillText(label, x + cw / 2, top + ch - 18, cw - 16);
    // "Rescued" badge.
    g.fillStyle = '#2f9e4f'; rounded(g, x + cw / 2 - 58, top - 16, 116, 34, 17); g.fill();
    g.fillStyle = '#fff'; g.font = '800 21px "Barlow Condensed", sans-serif';
    g.fillText('✓ RESCUED', x + cw / 2, top + 8);
    g.textAlign = 'left';
  });

  // Who brought them home.
  g.fillStyle = '#e9e4d4'; g.font = '600 30px "Barlow", sans-serif';
  const by = captives.length === 1 ? 'Brought home safely' : 'All brought home safely';
  g.fillText(hero ? `${by} by ${hero}.` : `${by}.`, tx, top + ch + 62, W - tx - 40);

  // Footer: the call to play.
  g.fillStyle = '#c7c4b4'; g.font = '600 26px "Barlow", sans-serif';
  g.fillText('Every rescue counts.', 60, H - 52);
  const bx = W - 470, byy = H - 92, bw = 420, bh = 60;
  gr = g.createLinearGradient(0, byy, 0, byy + bh);
  gr.addColorStop(0, '#ffd765'); gr.addColorStop(0.45, '#f2c443'); gr.addColorStop(1, '#d99a1c');
  g.fillStyle = '#8a5e0d'; rounded(g, bx, byy + 4, bw, bh, 12); g.fill();
  g.fillStyle = gr; rounded(g, bx, byy, bw, bh, 12); g.fill();
  g.fillStyle = '#10140c'; g.font = '800 32px "Barlow Condensed", sans-serif'; g.textAlign = 'center';
  g.fillText('PLAY FREE · 9JARESCUE.APP', bx + bw / 2, byy + 41);
  g.textAlign = 'left';

  return new Promise((ok) => c.toBlob((b) => ok(b), 'image/jpeg', 0.9));
}

// Drawn as soon as the results panel opens, so the share sheet can open at
// once on a tap (phones only allow it straight after the tap).
let card = null;   // { info, blob, file, url }
export function prepareShare(info, thumbEl) {
  card = { info, blob: null, file: null, url: null };
  const mine = card;
  rescueCard(info).then((blob) => {
    if (card !== mine || !blob) return;
    mine.blob = blob;
    mine.file = new File([blob], '9ja-rescue.jpg', { type: 'image/jpeg' });
    mine.url = URL.createObjectURL(blob);
    if (thumbEl) { thumbEl.src = mine.url; thumbEl.hidden = false; }
  }).catch((e) => console.warn('rescue picture not drawn', e));
}

export async function shareRescue(button) {
  const info = card?.info ?? {};
  const text = rescueText(info);
  if (navigator.share) {
    const withPic = card?.file && navigator.canShare?.({ files: [card.file] });
    try {
      await navigator.share(withPic ? { files: [card.file], text: `${text} ${SHARE_URL}`, title: '9ja Rescue' } : { title: '9ja Rescue', text, url: SHARE_URL });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;   // the player closed the share sheet
    }
  }
  // No share sheet for pictures (most computers): choices in place of the button.
  const row = document.createElement('div');
  row.className = 'share-row';
  const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SHARE_URL)}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text} ${SHARE_URL}`)}`;
  row.innerHTML = '<button type="button" data-s="x">X</button><button type="button" data-s="wa">WhatsApp</button>'
    + `${card?.url ? '<button type="button" data-s="save">Save picture</button>' : ''}<button type="button" data-s="copy">Copy</button>`;
  row.dataset.x = x;
  row.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.s === 'x') window.open(x, '_blank', 'noopener');
    else if (b.dataset.s === 'wa') window.open(wa, '_blank', 'noopener');
    else if (b.dataset.s === 'save') {
      const a = document.createElement('a');
      a.href = card.url; a.download = '9ja-rescue.jpg'; document.body.appendChild(a); a.click(); a.remove();
    } else {
      try { await navigator.clipboard.writeText(`${text} ${SHARE_URL}`); b.textContent = 'Copied'; } catch { b.textContent = 'Copy failed'; }
    }
  });
  button.hidden = true;
  button.after(row);
}

// Back to the single button (each new results panel).
export function resetShare(button, thumbEl) {
  if (button) {
    button.hidden = false;
    button.parentElement?.parentElement?.querySelectorAll('.share-row').forEach((r) => r.remove());
  }
  if (thumbEl) thumbEl.hidden = true;
  if (card?.url) URL.revokeObjectURL(card.url);
  card = null;
}
