// Account access: sign-up, email verification, sign-in and password reset.
//
// Device-only provider (owner's choice until an online service is set up):
// accounts live in this browser's storage and no real email is sent. Each
// "email" (verification or reset link) goes to a local outbox that the
// screens can open, so the flows behave as they will online: verification is
// checked, never granted by a button, and reset links are single-use tokens
// that expire. The calls mirror an online service, so a real provider
// (e.g. Firebase Auth) can replace this module without changing the screens.
const KEY = '9ja.auth.v1';
const OUTBOX = '9ja.outbox.v1';
const VERIFY_LIFE = 24 * 3600e3;   // verification links last a day
const RESET_LIFE = 30 * 60e3;      // reset links last 30 minutes
const RESEND_GAP = 20e3;           // at most one email every 20 s
const LOCK_AFTER = 5, LOCK_FOR = 30e3; // failed sign-ins before a short wait

export class AuthError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { users: {}, session: null }; } catch { return { users: {}, session: null }; }
}
function store(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { throw new AuthError('storage', 'This device would not save your account (storage is full or blocked).'); }
}
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(18)));
const norm = (email) => String(email || '').trim().toLowerCase();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function hashPassword(password, salt) {
  if (!crypto.subtle) throw new AuthError('insecure', 'This browser can only store passwords safely over a secure (https) connection.');
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}

export function emailProblem(email) {
  const e = String(email || '').trim();
  if (!e) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return 'Enter a valid email address, like name@example.com.';
  return null;
}
export function passwordProblem(pw) {
  if (!pw) return 'Enter a password.';
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use both letters and numbers.';
  return null;
}

function sendMail(to, kind, token) {
  let box = [];
  try { box = JSON.parse(localStorage.getItem(OUTBOX)) || []; } catch { /* empty */ }
  const link = `#${kind}=${token}`;
  const subject = kind === 'verify' ? 'Verify your 9ja Rescue email' : 'Reset your 9ja Rescue password';
  box.unshift({ to, kind, subject, link, at: Date.now() });
  localStorage.setItem(OUTBOX, JSON.stringify(box.slice(0, 20)));
}

export const auth = {
  provider: 'device',

  current() {
    const d = load();
    const s = d.session;
    if (!s) return null;
    const u = Object.values(d.users).find((x) => x.uid === s.uid);
    return u && u.verified ? { uid: u.uid, email: u.email } : null;
  },

  async signUp(email, password) {
    const p = emailProblem(email) || passwordProblem(password);
    if (p) throw new AuthError('invalid', p);
    await wait(350);
    const d = load();
    const k = norm(email);
    const old = d.users[k];
    if (old?.verified) throw new AuthError('email-in-use', 'An account already uses this email. Sign in instead.');
    const salt = randomToken();
    d.users[k] = {
      uid: old?.uid ?? `u-${randomToken().slice(0, 12)}`, email: String(email).trim(), salt,
      hash: await hashPassword(password, salt), verified: false, created: Date.now(),
      verifyToken: randomToken(), verifyExp: Date.now() + VERIFY_LIFE, lastMail: Date.now(),
    };
    store(d);
    sendMail(d.users[k].email, 'verify', d.users[k].verifyToken);
    return { email: d.users[k].email };
  },

  async resendVerification(email) {
    const d = load();
    const u = d.users[norm(email)];
    if (!u) throw new AuthError('no-account', 'No account is waiting for this email. Create one first.');
    if (u.verified) return { already: true };
    const left = RESEND_GAP - (Date.now() - (u.lastMail || 0));
    if (left > 0) throw new AuthError('too-soon', `Please wait ${Math.ceil(left / 1000)} s before sending another email.`);
    await wait(300);
    u.verifyToken = randomToken();
    u.verifyExp = Date.now() + VERIFY_LIFE;
    u.lastMail = Date.now();
    store(d);
    sendMail(u.email, 'verify', u.verifyToken);
    return { sent: true };
  },

  // "I've verified my email": asks the provider; it never marks the email verified itself.
  async checkVerified(email) {
    await wait(300);
    const d = load();
    const u = d.users[norm(email)];
    if (!u) throw new AuthError('no-account', 'No account found for this email.');
    if (!u.verified) throw new AuthError('not-verified', 'Your email is not verified yet. Open the link in the email we sent, then try again.');
    d.session = { uid: u.uid, at: Date.now() };
    store(d);
    return { uid: u.uid, email: u.email };
  },

  // Opening the link from the verification email.
  verifyLink(token) {
    const d = load();
    const u = Object.values(d.users).find((x) => x.verifyToken && x.verifyToken === token);
    if (!u) throw new AuthError('link-invalid', 'This verification link is not valid (it may have been replaced by a newer email).');
    if (Date.now() > u.verifyExp) throw new AuthError('link-expired', 'This verification link has expired. Send a new email.');
    u.verified = true;
    u.verifyToken = null;
    store(d);
    return { email: u.email };
  },

  // Unverified accounts can be dropped to sign up with a different address.
  changeEmail(email) {
    const d = load();
    const k = norm(email);
    if (d.users[k] && !d.users[k].verified) { delete d.users[k]; store(d); }
  },

  async signIn(email, password) {
    const p = emailProblem(email);
    if (p) throw new AuthError('invalid', p);
    if (!password) throw new AuthError('invalid', 'Enter your password.');
    const d = load();
    const u = d.users[norm(email)];
    if (u?.lockUntil > Date.now()) throw new AuthError('locked', `Too many attempts. Try again in ${Math.ceil((u.lockUntil - Date.now()) / 1000)} s.`);
    await wait(300);
    const ok = u && (await hashPassword(password, u.salt)) === u.hash;
    if (!ok) {
      if (u) {
        u.fails = (u.fails || 0) + 1;
        if (u.fails >= LOCK_AFTER) { u.lockUntil = Date.now() + LOCK_FOR; u.fails = 0; }
        store(d);
      }
      throw new AuthError('wrong', 'Email or password is incorrect.');
    }
    u.fails = 0;
    if (!u.verified) { store(d); throw new AuthError('unverified', 'Verify your email to sign in.'); }
    d.session = { uid: u.uid, at: Date.now() };
    store(d);
    return { uid: u.uid, email: u.email };
  },

  signOut() {
    const d = load();
    d.session = null;
    store(d);
  },

  // Always answers the same way, so it does not reveal which emails have accounts.
  async requestReset(email) {
    const p = emailProblem(email);
    if (p) throw new AuthError('invalid', p);
    await wait(350);
    const d = load();
    const u = d.users[norm(email)];
    if (u) {
      const left = RESEND_GAP - (Date.now() - (u.lastReset || 0));
      if (left > 0) throw new AuthError('too-soon', `Please wait ${Math.ceil(left / 1000)} s before asking again.`);
      u.resetToken = randomToken();
      u.resetExp = Date.now() + RESET_LIFE;
      u.lastReset = Date.now();
      store(d);
      sendMail(u.email, 'reset', u.resetToken);
    }
    return { sent: true };
  },

  // Validates a reset link before the new-password form is shown.
  checkResetLink(token) {
    const d = load();
    const u = Object.values(d.users).find((x) => x.resetToken && x.resetToken === token);
    if (!u) throw new AuthError('link-invalid', 'This reset link is not valid or has already been used.');
    if (Date.now() > u.resetExp) throw new AuthError('link-expired', 'This reset link has expired.');
    return { email: u.email };
  },

  async resetPassword(token, password) {
    const p = passwordProblem(password);
    if (p) throw new AuthError('invalid', p);
    this.checkResetLink(token);
    await wait(300);
    const d = load();
    const u = Object.values(d.users).find((x) => x.resetToken === token);
    u.salt = randomToken();
    u.hash = await hashPassword(password, u.salt);
    u.resetToken = null;
    u.lockUntil = 0;
    // Resetting from the emailed link also proves the address.
    u.verified = true;
    store(d);
    return { email: u.email };
  },

  // The device-only stand-in for an inbox: the newest email for this address.
  latestMail(email, kind) {
    let box = [];
    try { box = JSON.parse(localStorage.getItem(OUTBOX)) || []; } catch { /* empty */ }
    return box.find((m) => norm(m.to) === norm(email) && m.kind === kind) ?? null;
  },
};
