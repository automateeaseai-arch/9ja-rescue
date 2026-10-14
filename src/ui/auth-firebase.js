// Online accounts with Firebase Authentication (owner's project "9ja rescue").
// Same calls as the device-only provider in auth.js, so the screens don't
// change. Firebase sends the real emails: the verification link and the
// password-reset link open Firebase's own page (verify, or choose a new
// password), then the player comes back to the game and signs in.
// The web config below is public by design (it names the project; it is not
// a password). Security comes from the Authentication settings in the console.
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, deleteUser, reload,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
} from 'firebase/auth';
import { AuthError, emailProblem, passwordProblem } from './auth.js';

const CONFIG = {
  apiKey: 'AIzaSyCIznaxc92v2b0s_luJkyjq8EMVgH-FWHk',
  authDomain: 'ja-rescue.firebaseapp.com',
  projectId: 'ja-rescue',
  storageBucket: 'ja-rescue.firebasestorage.app',
  messagingSenderId: '787109971207',
  appId: '1:787109971207:web:2d68223460c10c468271a2',
};
// Google's sign-in window names the sign-in address. On the game's own site
// it opens from auth.9jarescue.app (Firebase Hosting custom domain), so the
// window says "continue to auth.9jarescue.app"; elsewhere, or if that address
// doesn't answer yet (new certificate), it falls back to the default.
const OWN_AUTH = 'auth.9jarescue.app';
async function pickAuthDomain() {
  if (!/(^|\.)9jarescue\.app$/.test(location.hostname)) return CONFIG.authDomain;
  try {
    const ok = await Promise.race([
      fetch(`https://${OWN_AUTH}/__/auth/handler.js`, { mode: 'no-cors', cache: 'no-store' }).then(() => true),
      new Promise((r) => setTimeout(() => r(false), 2500)),
    ]);
    return ok ? OWN_AUTH : CONFIG.authDomain;
  } catch { return CONFIG.authDomain; }
}
const SEEN = '9ja.online.seen';   // this device has signed in before (start on Sign in, not Welcome)

// Firebase error codes in plain words.
function plain(e) {
  const c = e?.code || '';
  const m = {
    'auth/email-already-in-use': ['email-in-use', 'An account already uses this email. Sign in instead.'],
    'auth/invalid-credential': ['wrong', 'Email or password is incorrect.'],
    'auth/wrong-password': ['wrong', 'Email or password is incorrect.'],
    'auth/user-not-found': ['wrong', 'Email or password is incorrect.'],
    'auth/invalid-email': ['invalid', 'Enter a valid email address, like name@example.com.'],
    'auth/weak-password': ['invalid', 'Choose a stronger password.'],
    'auth/too-many-requests': ['locked', 'Too many attempts. Wait a few minutes, then try again.'],
    'auth/network-request-failed': ['network', 'No connection to the account service. Check your internet and try again.'],
    'auth/user-disabled': ['disabled', 'This account has been turned off.'],
    'auth/operation-not-allowed': ['setup', 'This way of signing in is not turned on for this game yet.'],
    'auth/popup-closed-by-user': ['cancelled', ''],
    'auth/cancelled-popup-request': ['cancelled', ''],
    'auth/user-cancelled': ['cancelled', ''],
    'auth/unauthorized-domain': ['setup', 'Google sign-in is not allowed on this web address yet (Firebase authorized domains).'],
    'auth/account-exists-with-different-credential': ['other', 'This email already has an account. Sign in with your email and password.'],
  }[c];
  return m ? new AuthError(m[0], m[1]) : new AuthError('other', `Something went wrong (${c || e?.message || 'unknown'}). Try again.`);
}
const seen = () => { try { localStorage.setItem(SEEN, '1'); } catch { /* ignore */ } };

export async function createFirebaseAuth() {
  const app = initializeApp({ ...CONFIG, authDomain: await pickAuthDomain() });
  const fa = getAuth(app);
  fa.useDeviceLanguage();
  // Wait for the saved session (if any) before the screens decide where to start.
  await new Promise((ok) => { const off = onAuthStateChanged(fa, () => { off(); ok(); }); });
  // Coming back from a Google sign-in page (used when the pop-up was blocked).
  await getRedirectResult(fa).catch(() => {});
  const me = () => fa.currentUser;
  const out = (u) => ({ uid: u.uid, email: u.email });

  return {
    provider: 'firebase',
    app,   // shared with the online save (cloud.js)
    knownDevice() { try { return !!localStorage.getItem(SEEN); } catch { return false; } },

    current() { const u = me(); return u && u.emailVerified ? out(u) : null; },

    async signUp(email, password) {
      const p = emailProblem(email) || passwordProblem(password);
      if (p) throw new AuthError('invalid', p);
      try {
        const { user } = await createUserWithEmailAndPassword(fa, email.trim(), password);
        await sendEmailVerification(user);
        seen();
        return { email: user.email };
      } catch (e) {
        // Signed up before but never verified, with the same password: send a new link.
        if (e?.code === 'auth/email-already-in-use') {
          try {
            const { user } = await signInWithEmailAndPassword(fa, email.trim(), password);
            if (!user.emailVerified) { await sendEmailVerification(user); return { email: user.email }; }
            await signOut(fa);
          } catch { /* different password: report the address as taken */ }
        }
        throw plain(e);
      }
    },

    async resendVerification() {
      const u = me();
      if (!u) throw new AuthError('no-account', 'Sign in again to send a new email.');
      await reload(u).catch(() => {});
      if (u.emailVerified) return { already: true };
      try { await sendEmailVerification(u); } catch (e) { throw plain(e); }
      return { sent: true };
    },

    // "I've verified my email": asks Firebase whether the link was opened.
    async checkVerified() {
      const u = me();
      if (!u) throw new AuthError('no-account', 'Sign in to continue.');
      try { await reload(u); } catch (e) { throw plain(e); }
      if (!u.emailVerified) throw new AuthError('not-verified', 'Your email is not verified yet. Open the link in the email we sent (check spam too), then try again.');
      await u.getIdToken(true).catch(() => {});
      return out(u);
    },

    // Links open Firebase's own page, never this one.
    verifyLink() { throw new AuthError('link-invalid', 'Open the link from your email to verify.'); },

    // Drop an unverified sign-up to start again with a different address.
    async changeEmail() {
      const u = me();
      if (u && !u.emailVerified) { await deleteUser(u).catch(() => signOut(fa)); }
    },

    async signIn(email, password) {
      const p = emailProblem(email);
      if (p) throw new AuthError('invalid', p);
      if (!password) throw new AuthError('invalid', 'Enter your password.');
      let user;
      try { ({ user } = await signInWithEmailAndPassword(fa, email.trim(), password)); } catch (e) { throw plain(e); }
      seen();
      if (!user.emailVerified) throw new AuthError('unverified', 'Verify your email to sign in.');
      return out(user);
    },

    // Google: the player picks an account in Google's own window. Google
    // emails are already verified, so this goes straight in. An existing
    // email account with the same address opens as the same account.
    canGoogle: true,
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        const { user } = await signInWithPopup(fa, provider);
        seen();
        return out(user);
      } catch (e) {
        if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(fa, provider);   // the page leaves and comes back signed in
          return new Promise(() => {});
        }
        throw plain(e);
      }
    },

    signOut() { signOut(fa).catch(() => {}); },

    // Always answers the same way, so it does not reveal which emails have accounts.
    async requestReset(email) {
      const p = emailProblem(email);
      if (p) throw new AuthError('invalid', p);
      try { await sendPasswordResetEmail(fa, email.trim()); } catch (e) {
        if (e?.code !== 'auth/user-not-found') { const x = plain(e); if (x.code === 'network' || x.code === 'locked') throw x; }
      }
      return { sent: true };
    },
    checkResetLink() { throw new AuthError('link-invalid', 'Open the link from your email to choose a new password.'); },
    async resetPassword() { throw new AuthError('link-invalid', 'Open the link from your email to choose a new password.'); },
    latestMail() { return null; },

    // For tests: remove the signed-in account.
    _uid() { return me()?.uid ?? null; },
    async _deleteMe() { const u = me(); if (u) await deleteUser(u); },
  };
}
