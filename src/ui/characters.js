// Saved characters (plan section 3): up to three per account, each with a
// stable ID, name, gender, role and appearance. Hunter and Soldier are
// appearance choices with equal abilities. Each gender and role pair uses one
// of the four approved player models.
import { loadCharacters, saveCharacters } from '../save.js';

export const SLOTS = 3;
export const ASSET_VERSION = 1;

// Model index (player.js CHARACTERS) and 2D portrait for each pair.
const LOOKS = {
  'male-hunter': { model: 0, portrait: 'ui/portraits/male-hunter.webp' },
  'female-hunter': { model: 1, portrait: 'ui/portraits/female-hunter.webp' },
  'female-soldier': { model: 2, portrait: 'ui/portraits/female-soldier.webp' },
  'male-soldier': { model: 3, portrait: 'ui/portraits/male-soldier.webp' },
};
export const look = (gender, role) => LOOKS[`${gender}-${role}`];
export const label = (c) => `${cap(c.gender)} • ${cap(c.role)}`;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

// Skin tones: six swatches along a continuous scale (0 light … 1 deep).
export const SKIN_SWATCHES = ['#c58c62', '#a96f47', '#8d5634', '#6b3d22', '#4f2b18', '#33190d'];
export const DEFAULT_SKIN = 0.25; // close to the models' own skin colour

const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'nigger', 'nigga', 'whore', 'slut', 'bastard', 'asshole', 'rape', 'nazi', 'hitler', 'boko', 'isis'];

export function nameProblem(name, exceptId = null) {
  const n = String(name || '').trim();
  if (n.length < 2) return 'Give your character a name (at least 2 letters).';
  if (n.length > 14) return 'Keep the name to 14 characters or fewer.';
  if (!/^[A-Za-z][A-Za-z '-]*$/.test(n)) return 'Use letters, spaces, hyphens or apostrophes only.';
  const flat = n.toLowerCase().replace(/[^a-z]/g, '');
  if (BLOCKED.some((w) => flat.includes(w))) return 'Please choose a different name.';
  if (list().some((c) => c.id !== exceptId && c.name.toLowerCase() === n.toLowerCase())) return 'You already have a character with this name.';
  return null;
}

export const list = () => loadCharacters();
export const get = (id) => list().find((c) => c.id === id) ?? null;

// Creates or updates a character. Never overwrites another slot.
export function save(draft) {
  const all = list();
  const problem = nameProblem(draft.name, draft.id);
  if (problem) throw new Error(problem);
  if (!look(draft.gender, draft.role)) throw new Error('Choose a gender and a role first.');
  const now = Date.now();
  let c;
  if (draft.id && all.some((x) => x.id === draft.id)) {
    c = all.find((x) => x.id === draft.id);
    Object.assign(c, { name: draft.name.trim(), gender: draft.gender, role: draft.role, skin: draft.skin, updated: now, assetVersion: ASSET_VERSION });
  } else {
    if (all.length >= SLOTS) throw new Error('All three slots are in use. Delete a character first.');
    c = {
      id: `c-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: draft.name.trim(), gender: draft.gender, role: draft.role, skin: draft.skin ?? DEFAULT_SKIN,
      assetVersion: ASSET_VERSION, created: now, updated: now,
    };
    all.push(c);
  }
  if (!saveCharacters(all)) throw new Error('This device would not save the character (storage full or blocked).');
  return c;
}

export function remove(id, lockedId) {
  if (id === lockedId) throw new Error('This character is on your active mission. Finish or abandon that mission first.');
  const all = list().filter((c) => c.id !== id);
  if (!saveCharacters(all)) throw new Error('This device would not save the change.');
}

export const slotOf = (id) => list().findIndex((c) => c.id === id) + 1;
