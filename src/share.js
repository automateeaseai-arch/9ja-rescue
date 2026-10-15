// "Share your rescue" on the results panel (owner, 15 Oct: get the game seen,
// as Lagos Life spread by players sharing). Uses the phone's own share sheet
// (WhatsApp, X, Instagram…); where there is none, offers X, WhatsApp and copy.
// The link always points at the game's own site, whose preview card is
// public/ui/share-card.jpg (index.html og: tags).
export const GAME_URL = 'https://9jarescue.app';

export function rescueText({ captives = 1, mission = '' } = {}) {
  const who = captives === 1 ? '1 captive' : `${captives} captives`;
  return `I just rescued ${who}${mission ? ` in ${mission}` : ''} on 9ja Rescue 🇳🇬 Every rescue counts. Can you bring them home? Play free:`;
}

export async function shareRescue(info, button) {
  const text = rescueText(info);
  if (navigator.share) {
    try { await navigator.share({ title: '9ja Rescue', text, url: GAME_URL }); return; } catch (e) {
      if (e?.name === 'AbortError') return;   // the player closed the share sheet
    }
  }
  // No share sheet (most computers): three choices in place of the button.
  const row = document.createElement('div');
  row.className = 'share-row';
  const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(GAME_URL)}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text} ${GAME_URL}`)}`;
  row.innerHTML = '<button type="button" data-s="x">X</button><button type="button" data-s="wa">WhatsApp</button><button type="button" data-s="copy">Copy</button>';
  row.dataset.x = x;
  row.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.s === 'x') window.open(x, '_blank', 'noopener');
    else if (b.dataset.s === 'wa') window.open(wa, '_blank', 'noopener');
    else {
      try { await navigator.clipboard.writeText(`${text} ${GAME_URL}`); b.textContent = 'Copied'; } catch { b.textContent = 'Copy failed'; }
    }
  });
  button.hidden = true;
  button.after(row);
}

// Back to the single button (each new results panel).
export function resetShare(button) {
  if (!button) return;
  button.hidden = false;
  button.parentElement?.querySelectorAll('.share-row').forEach((r) => r.remove());
}
