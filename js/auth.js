/* ============================================
   Pulse — Authentication (Firebase Auth)
   ============================================ */

// Version marker — visible in browser console (F12) so you can confirm
// the live site is running the latest code after a hard refresh.
console.log('[Pulse] auth.js loaded — version 20260428t (REST-delete+verify)');

let currentUser = null;

// ─── Invite System ────────────────────────────────────────────────────────────
// Invite codes are self-validating: PULSE-{8 hex random}-{4 hex checksum}
// No server or DB lookup needed — valid codes verify offline.

const _INVITE_SALT      = 'PulsePilot2025#SearchFund';
const _INVITE_STORE_KEY = 'pulse_pilot_invites';

async function _inviteChecksum(random8) {
  const data = new TextEncoder().encode(_INVITE_SALT + random8);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('').slice(0, 4).toUpperCase();
}

async function generateInviteCode() {
  const bytes  = crypto.getRandomValues(new Uint8Array(4));
  const random = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const cs     = await _inviteChecksum(random);
  return `PULSE-${random}-${cs}`;
}

async function validateInviteCode(code) {
  if (!code || typeof code !== 'string') return false;
  const clean = code.trim().toUpperCase().replace(/\s+/g, '');
  const m = clean.match(/^PULSE-([A-F0-9]{8})-([A-F0-9]{4})$/);
  if (!m) return false;
  return (await _inviteChecksum(m[1])) === m[2];
}

// Full invite validation: checks cryptographic format AND looks up the code in
// Firestore to confirm it exists, hasn't been used, and isn't deactivated.
// Returns null when the code is valid, or a user-facing error string on failure.
// Falls back to crypto-only if Firestore is unreachable (user not yet signed in).
async function _fullCheckInviteCode(code) {
  const clean = (code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!(await validateInviteCode(clean))) {
    return 'Invalid invite code — please check and try again';
  }
  try {
    const doc = await firebase.firestore().collection('inviteCodes').doc(clean).get();
    if (!doc.exists) {
      return 'This invite code was not found — please check with the person who sent it';
    }
    const data = doc.data();
    if (data.deactivated) return 'This invite code has been deactivated';
    if (data.usedAt)      return 'This invite code has already been used';
  } catch {
    // Firestore rules block reads before auth (expected) — crypto check passed, proceed
  }
  return null; // valid
}

// ── Invite code storage (Firestore /inviteCodes collection) ──────────────────

async function loadSavedInvites() {
  const uid = firebase.auth().currentUser?.uid;
  if (!uid) return [];
  try {
    const snap = await firebase.firestore().collection('inviteCodes')
      .where('createdByUid', '==', uid).get();
    return snap.docs.map(d => d.data())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch { return []; }
}

async function createNewInvite(note = '') {
  const code = await generateInviteCode();
  const uid  = firebase.auth().currentUser?.uid;
  const record = {
    code, note,
    createdByUid: uid,
    createdAt:    new Date().toISOString(),
    usedByEmail:  null,
    usedByName:   null,
    usedByUid:    null,
    usedAt:       null,
    deactivated:  false,
  };
  await firebase.firestore().collection('inviteCodes').doc(code).set(record);
  return record;
}

async function markInviteUsed(code, email, name, uid) {
  try {
    await firebase.firestore().collection('inviteCodes').doc(code).update({
      usedByEmail: email,
      usedByName:  name || null,
      usedByUid:   uid  || null,
      usedAt:      new Date().toISOString(),
    });
    // Create an access record so the owner can revoke this user later
    if (uid) {
      await firebase.firestore().collection('userAccess').doc(uid).set({
        active:     true,
        inviteCode: code,
        createdAt:  new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('[Pulse] markInviteUsed:', err.message);
  }
}

// ── Access revocation helpers (owner-only write, user-own read) ───────────────

// Returns false if the current user's access has been revoked by the owner.
// Fails open (returns true) so a Firestore rules error never locks out a user.
async function checkUserAccess() {
  const uid = firebase.auth().currentUser?.uid;
  if (!uid) return true;
  try {
    const doc = await firebase.firestore().collection('userAccess').doc(uid).get();
    if (!doc.exists) return true; // no record = legacy user or owner
    return doc.data().active !== false;
  } catch {
    return true; // fail open — rules not yet updated or offline
  }
}

async function revokeUserAccess(code, uid) {
  const db = firebase.firestore();
  const batch = db.batch();
  if (code) {
    batch.update(db.collection('inviteCodes').doc(code), {
      deactivated:   true,
      deactivatedAt: new Date().toISOString(),
    });
  }
  if (uid) {
    batch.set(db.collection('userAccess').doc(uid),
      { active: false, updatedAt: new Date().toISOString() },
      { merge: true });
  }
  await batch.commit();
}

async function restoreUserAccess(code, uid) {
  const db = firebase.firestore();
  const batch = db.batch();
  if (code) {
    batch.update(db.collection('inviteCodes').doc(code), {
      deactivated:   false,
      deactivatedAt: null,
    });
  }
  if (uid) {
    batch.set(db.collection('userAccess').doc(uid),
      { active: true, updatedAt: new Date().toISOString() },
      { merge: true });
  }
  await batch.commit();
}

// ── Ownership check ───────────────────────────────────────────────────────────

async function isOwner() {
  try {
    const uid = firebase.auth().currentUser?.uid;
    if (!uid) return false;
    const doc = await firebase.firestore().collection('config').doc('registration').get();
    if (!doc.exists) return false;
    const data = doc.data();
    // If ownerUid is already set, compare directly
    if (data.ownerUid) return data.ownerUid === uid;
    // First login after migration: no ownerUid yet — claim it now
    if (data.hasOwner) {
      await firebase.firestore().collection('config').doc('registration')
        .update({ ownerUid: uid });
      return true;
    }
    return false;
  } catch { return false; }
}

// Invite required for everyone except the very first account ever created.
// Logic: if /config/registration exists → owner is set up → require invite.
//        if doc missing → fresh install, first user is the owner (no invite).
//        if error reading → fail safe, require invite.
async function isInviteRequired() {
  try {
    const doc = await firebase.firestore()
      .collection('config').doc('registration').get();
    return doc.exists; // doc exists = owner already registered = invite required
  } catch {
    return true; // fail safe: require invite if Firestore is unreachable
  }
}

// ─── Firebase user → app user shape ──────────────────────────────────────────

function _fbUserToAppUser(fbUser) {
  if (!fbUser) return null;
  return {
    id:            fbUser.uid,
    name:          fbUser.displayName || fbUser.email.split('@')[0],
    email:         fbUser.email,
    emailVerified: fbUser.emailVerified,
  };
}

// ─── Session ──────────────────────────────────────────────────────────────────

function setCurrentUser(user) {
  currentUser = user;
  const nameEl   = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('user-avatar-initial');
  if (nameEl)   nameEl.textContent   = user.name;
  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
}

// restoreSession is no longer used directly — Firebase's onAuthStateChanged
// (wired up in initApp) handles session restoration automatically.
async function restoreSession() {
  return new Promise(resolve => {
    const unsub = firebase.auth().onAuthStateChanged(fbUser => {
      unsub();
      if (fbUser) {
        const appUser = _fbUserToAppUser(fbUser);
        setCurrentUser(appUser);
        _applyUserTheme(appUser.id);
        resolve(appUser);
      } else {
        resolve(null);
      }
    });
  });
}

async function _applyUserTheme(userId) {
  try {
    const settings = await DB.get(STORES.settings, `settings_${userId}`);
    if (settings?.theme) {
      document.documentElement.classList.remove('dark', 'light');
      document.documentElement.classList.add(settings.theme);
    }
  } catch (_) {}
}

function logout() {
  firebase.auth().signOut().catch(() => {});
  currentUser = null;
  window._pRegistering = false;

  // Clear both session markers so the next page load requires a fresh login
  localStorage.removeItem('pulse_remember_until');
  sessionStorage.removeItem('pulse_session_active');

  // Return URL to root — no stale page hash on the login screen
  history.replaceState(null, '', window.location.pathname);

  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  showAuthLogin(); // also resets the login button
}

// ─── Auth panels ─────────────────────────────────────────────────────────────

function _showAuthPanel(name) {
  ['login', 'register', 'verify', 'reset', 'new-password', 'recover'].forEach(s =>
    document.getElementById(`auth-${s}`)?.classList.toggle('hidden', s !== name)
  );
}
function showAuthLogin() {
  _showAuthPanel('login');
  // Always ensure the submit button is usable when the login panel is shown
  const btn = document.querySelector('#login-form button[type="submit"]');
  if (btn) { btn.disabled = false; btn.innerHTML = _SIGN_IN_BTN_HTML; }
}
function showAuthVerify()      { _showAuthPanel('verify'); }
function showAuthNewPassword() { _showAuthPanel('new-password'); }
function showAuthReset() {
  _showAuthPanel('reset');
  const resetStatus = document.getElementById('reset-status');
  if (resetStatus) { resetStatus.innerHTML = ''; resetStatus.classList.add('hidden'); }
  const btn = document.getElementById('reset-submit-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Send reset link'; }
}

async function showAuthRegister() {
  _showAuthPanel('register');
  const required = await isInviteRequired();
  const wrap = document.getElementById('invite-code-wrap');
  if (wrap) wrap.classList.toggle('hidden', !required);
  const urlInvite = new URLSearchParams(window.location.search).get('invite');
  if (urlInvite) {
    const field = document.getElementById('register-invite');
    if (field && !field.value) field.value = urlInvite.toUpperCase();
  }

  // Show a context banner if the user just deleted their account
  const justDeleted = sessionStorage.getItem('pulse_just_deleted');
  const bannerId    = 'register-deleted-banner';
  let banner        = document.getElementById(bannerId);
  if (justDeleted) {
    sessionStorage.removeItem('pulse_just_deleted');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = bannerId;
      banner.style.cssText =
        'background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;' +
        'padding:10px 12px;margin-bottom:12px;font-size:12px;color:#92400e;line-height:1.4;';
      banner.innerHTML =
        '<strong>Account deleted.</strong> To create a new account with the same email, ' +
        'ask the app owner for a new invite code and fill in the form below.';
      // Insert before the form
      const form = document.getElementById('register-form');
      if (form) form.parentNode.insertBefore(banner, form);
    }
    banner.style.display = 'block';
  } else if (banner) {
    banner.style.display = 'none';
  }
}

// ─── Password reset via Firebase email link ───────────────────────────────────
// When the user clicks a Firebase password-reset email, they land on the app URL
// with ?mode=resetPassword&oobCode=XXX in the query string (requires "Custom
// action URL" to be configured in Firebase Console → Auth → Templates).
// initApp() in app.js detects this and calls handlePasswordReset(oobCode).

let _pendingOobCode = null;

async function handlePasswordReset(oobCode) {
  window._pResettingPassword = true;
  _pendingOobCode = oobCode;

  // Make sure the auth screen is showing (not the app)
  document.getElementById('auth-screen')?.classList.remove('hidden');
  document.getElementById('app-shell')?.classList.add('hidden');

  try {
    // Verify the code with Firebase and get the email it belongs to
    const email = await firebase.auth().verifyPasswordResetCode(oobCode);
    const emailEl = document.getElementById('reset-target-email');
    if (emailEl) emailEl.textContent = 'Setting new password for ' + email;
    // Clear any stale error
    const errEl = document.getElementById('new-password-error');
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
    _showAuthPanel('new-password');
  } catch (err) {
    _pendingOobCode = null;
    window._pResettingPassword = false;
    showToast('This password reset link has expired or is invalid. Please request a new one.', 'error');
    history.replaceState(null, '', window.location.pathname);
    showAuthLogin();
  }
}

// ─── Account recovery (legacy — kept as stub) ─────────────────────────────────

async function startAccountRecovery() {
  _showAuthPanel('recover');
  const statusEl  = document.getElementById('recover-status');
  const resultsEl = document.getElementById('recover-results');
  if (resultsEl) resultsEl.innerHTML = '';
  if (statusEl) statusEl.textContent =
    'Account recovery is not available in the cloud version. ' +
    'Use "Forgot password?" on the sign-in page to reset your password via email.';
}

// ─── Password visibility toggle ───────────────────────────────────────────────

function showPassword(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.type = 'text';
  const prefix = inputId.replace('-password', '');
  document.getElementById(`${prefix}-eye-off`)?.classList.add('hidden');
  document.getElementById(`${prefix}-eye-on`)?.classList.remove('hidden');
}
function hidePassword(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.type = 'password';
  const prefix = inputId.replace('-password', '');
  document.getElementById(`${prefix}-eye-off`)?.classList.remove('hidden');
  document.getElementById(`${prefix}-eye-on`)?.classList.add('hidden');
}

// ─── OTP inputs (kept for verify panel) ──────────────────────────────────────

function setupOtpInputs() {
  const inputs = document.querySelectorAll('.otp-input');
  inputs.forEach((input, i) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = val;
      if (val && i < inputs.length - 1) inputs[i + 1].focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && i > 0) inputs[i - 1].focus();
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      for (let j = 0; j < Math.min(pasted.length, 6); j++) {
        if (inputs[j]) inputs[j].value = pasted[j];
      }
      if (pasted.length >= 6) inputs[inputs.length - 1].focus();
    });
  });
}
function getOtpValue() {
  return Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');
}

// ─── Default user data ────────────────────────────────────────────────────────

async function _createDefaultUserData(userId) {
  const defaultTags = [
    { name: 'Search Fund', color: 'blue'   },
    { name: 'PE/VC',       color: 'purple' },
    { name: 'Operator',    color: 'green'  },
    { name: 'Advisor',     color: 'yellow' },
    { name: 'Banker',      color: 'teal'   },
    { name: 'Broker',      color: 'gray'   },
    { name: 'LP',          color: 'red'    },
    { name: 'CEO',         color: 'blue'   },
    { name: 'Board Member',color: 'purple' },
    { name: 'Industry Expert', color: 'green' },
  ];
  for (const tag of defaultTags) {
    await DB.add(STORES.tags, { ...tag, userId, id: generateId() });
  }

  const _sharedCfg = window.PULSE_SHARED_CONFIG || {};
  await DB.add(STORES.settings, {
    id:                  `settings_${userId}`,
    userId,
    theme:               'light',
    emailReminders:      false,
    reminderEmail:       '',
    defaultFollowUpDays: 14,
    stageCadence: {
      'New intro': 7, 'Met once': 14, 'Active relationship': 30,
      'Warm relationship': 60, 'Needs follow-up': 3,
    },
    openaiApiKey:        _sharedCfg.openaiApiKey       || '',
    claudeApiKey:        _sharedCfg.claudeApiKey       || '',
    tavilyApiKey:        _sharedCfg.tavilyApiKey       || '',
    firecrawlApiKey:     _sharedCfg.firecrawlApiKey    || '',
    rapidApiKey:         _sharedCfg.rapidApiKey        || '',
    googlePlacesApiKey:  _sharedCfg.googlePlacesApiKey || '',
    linkedInConnected:   false,
    linkedInProfileUrl:  '',
    newsRegions:         ['USA', 'Europe'],
  });
}

// ─── Auth form wiring ─────────────────────────────────────────────────────────

// Cached HTML for the sign-in button (including the SVG arrow).
// Using innerHTML to restore it prevents the icon being stripped by textContent resets.
const _SIGN_IN_BTN_HTML =
  'Sign in <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">' +
  '<path d="M5 12h14m-7-7 7 7-7 7"/></svg>';

// Guard: prevent binding auth form listeners more than once (e.g. if called twice)
let _authFormsWired = false;

// Flag: tells onAuthStateChanged to stand down while registration is in progress.
// The register handler seeds demo data and calls showApp() itself when ready.
window._pRegistering = false;

function setupAuthForms() {
  if (_authFormsWired) return;
  _authFormsWired = true;

  // ── Login ──────────────────────────────────────────────────────────────────
  // onAuthStateChanged (app.js) handles setCurrentUser + showApp so we don't
  // duplicate that work here. We just fire the Firebase call and handle errors.
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const email      = document.getElementById('login-email').value.trim();
      const password   = document.getElementById('login-password').value;
      const rememberMe = document.getElementById('login-remember')?.checked || false;

      // Set Firebase persistence BEFORE signing in:
      //   LOCAL   = survives browser restart (only when "Remember me" is checked)
      //   SESSION = cleared when the tab/browser closes (default)
      await firebase.auth().setPersistence(
        rememberMe
          ? firebase.auth.Auth.Persistence.LOCAL
          : firebase.auth.Auth.Persistence.SESSION
      );

      // ⚠️  CRITICAL: set session markers BEFORE signInWithEmailAndPassword.
      // Firebase fires onAuthStateChanged during (not after) the sign-in await,
      // so if we set markers after, the policy check sees nothing and immediately
      // signs the user back out — making the button appear to do nothing.
      if (rememberMe) {
        localStorage.setItem('pulse_remember_until',
          String(Date.now() + 7 * 24 * 60 * 60 * 1000));
        sessionStorage.removeItem('pulse_session_active');
      } else {
        localStorage.removeItem('pulse_remember_until');
        sessionStorage.setItem('pulse_session_active', '1');
      }

      window._freshLogin = true;
      await firebase.auth().signInWithEmailAndPassword(email, password);
      // onAuthStateChanged will call showApp() — nothing more needed here
    } catch (err) {
      window._freshLogin = false;
      // Sign-in failed — remove any markers we just set
      localStorage.removeItem('pulse_remember_until');
      sessionStorage.removeItem('pulse_session_active');
      // auth/user-not-found and auth/invalid-credential both fire when an
      // account doesn't exist (including deleted accounts).  Show a hint so
      // the user knows they need to register rather than keep retrying login.
      let msg;
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        msg = 'No account found with this email. If you deleted your account, use "Create account" with a new invite code.';
      } else if (err.code === 'auth/wrong-password') {
        msg = 'Incorrect password';
      } else {
        msg = err.message;
      }
      showToast(msg, 'error');
    } finally {
      // Always re-enable and restore the full button HTML (including SVG arrow)
      btn.disabled = false; btn.innerHTML = _SIGN_IN_BTN_HTML;
    }
  });

  // ── Register ───────────────────────────────────────────────────────────────
  // We use window._pRegistering = true so that onAuthStateChanged does NOT call
  // showApp() while we are still seeding data. We call showApp() ourselves once
  // everything is ready.
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = true; btn.textContent = 'Creating account…';
    window._pRegistering = true;
    try {
      const name            = document.getElementById('register-name').value.trim();
      const email           = document.getElementById('register-email').value.trim();
      const password        = document.getElementById('register-password').value;
      const passwordConfirm = document.getElementById('register-password-confirm').value;
      const inviteCode      = (document.getElementById('register-invite')?.value || '').trim().toUpperCase();

      if (!name) { showToast('Please enter your name', 'error'); btn.disabled = false; btn.textContent = 'Create account'; window._pRegistering = false; return; }
      if (password !== passwordConfirm) { showToast('Passwords do not match', 'error'); btn.disabled = false; btn.textContent = 'Create account'; window._pRegistering = false; return; }
      if (password.length < 8) { showToast('Password must be at least 8 characters', 'error'); btn.disabled = false; btn.textContent = 'Create account'; window._pRegistering = false; return; }

      // Validate invite code if required
      const inviteRequired = await isInviteRequired();
      if (inviteRequired) {
        if (!inviteCode) {
          showToast('An invite code is required', 'error');
          document.getElementById('register-invite')?.focus();
          btn.disabled = false; btn.textContent = 'Create account'; window._pRegistering = false; return;
        }
        const inviteErr = await _fullCheckInviteCode(inviteCode);
        if (inviteErr) {
          showToast(inviteErr, 'error');
          document.getElementById('register-invite')?.focus();
          btn.disabled = false; btn.textContent = 'Create account'; window._pRegistering = false; return;
        }
      }

      // New accounts use SESSION persistence by default — user must log in again
      // after closing the browser (same policy as "no remember me" on login)
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION);

      // Create Firebase Auth account — onAuthStateChanged will fire but will
      // see window._pRegistering === true and skip showApp()
      const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await result.user.updateProfile({ displayName: name });

      const appUser = _fbUserToAppUser({ ...result.user, displayName: name });
      setCurrentUser(appUser);

      // Seed data BEFORE showing the app so the tutorial has data to show
      await _createDefaultUserData(appUser.id);
      await seedDemoData(appUser.id);

      // Mark owner registration so future users need invite
      if (!inviteRequired) {
        await firebase.firestore().collection('config').doc('registration')
          .set({ hasOwner: true, ownerUid: appUser.id, registeredAt: new Date().toISOString() });
      }

      // Await markInviteUsed so the code is stamped as used BEFORE the app
      // opens. Without await, a race window allows the same code to be reused
      // from a second tab during the brief gap before Firestore is updated.
      if (inviteRequired && inviteCode) await markInviteUsed(inviteCode, email, name, appUser.id);

      localStorage.setItem('pulse_show_tutorial_' + appUser.id, '1');

      // All data is ready — now safe to show the app
      window._pRegistering = false;
      // Mark this as a valid active session (SESSION persistence)
      sessionStorage.setItem('pulse_session_active', '1');
      showApp();
      showToast('Welcome to Pulse, ' + name.split(' ')[0] + '!', 'success');
    } catch (err) {
      window._pRegistering = false;
      btn.disabled = false; btn.textContent = 'Create account';
      const msg = err.code === 'auth/email-already-in-use'
                  ? 'An account already exists with this email address.'
                  : err.message;
      showToast(msg, 'error');
    }
  });

  // ── Forgot password ────────────────────────────────────────────────────────
  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn       = document.getElementById('reset-submit-btn') || e.target.querySelector('button[type="submit"]');
    const statusEl  = document.getElementById('reset-status');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const email = document.getElementById('reset-email').value.trim();
      await firebase.auth().sendPasswordResetEmail(email, {
        // continueUrl brings the user back to the app after Firebase handles the reset.
        // NOTE: For the in-app reset flow, you must ALSO configure a Custom Action URL
        // in Firebase Console → Authentication → Templates → Password reset → Edit.
        // Set it to: https://your-app-domain.com/index.html
        // Firebase will then redirect to that URL with ?mode=resetPassword&oobCode=...
        // and this app will handle it with handlePasswordReset().
        url: window.location.origin + window.location.pathname,
      });
      if (statusEl) {
        statusEl.innerHTML = `
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;text-align:center;">
            <p style="font-size:14px;font-weight:600;color:#15803d;margin-bottom:4px;">Reset link sent!</p>
            <p style="font-size:12px;color:#166534;">Check your inbox for <strong>${email}</strong> and click the link to set a new password. It may take a minute to arrive.</p>
          </div>`;
        statusEl.classList.remove('hidden');
      }
      btn.textContent = 'Sent ✓';
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Send reset link';
      const msg = err.code === 'auth/user-not-found'  ? 'No account found with this email'
                : err.code === 'auth/invalid-email'   ? 'Please enter a valid email address'
                : err.message;
      showToast(msg, 'error');
    }
  });

  // ── New password (Firebase reset link flow) ────────────────────────────────
  // This form is shown when the user clicks a Firebase password-reset email
  // link that redirects to this app with ?mode=resetPassword&oobCode=...
  // handlePasswordReset() (called from initApp) verifies the code and shows
  // this panel. The oobCode is stored in _pendingOobCode.
  document.getElementById('new-password-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn    = document.getElementById('new-password-submit-btn') || e.target.querySelector('button[type="submit"]');
    const errEl  = document.getElementById('new-password-error');
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }

    if (!_pendingOobCode) {
      showToast('No reset session found. Please click the link in your email again.', 'error');
      showAuthReset();
      return;
    }

    const newPassword     = document.getElementById('new-password-password').value;
    const confirmPassword = document.getElementById('new-password-confirm').value;

    if (newPassword !== confirmPassword) {
      if (errEl) { errEl.textContent = 'Passwords do not match'; errEl.classList.remove('hidden'); }
      return;
    }
    if (newPassword.length < 8) {
      if (errEl) { errEl.textContent = 'Password must be at least 8 characters'; errEl.classList.remove('hidden'); }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Setting password…'; }
    try {
      await firebase.auth().confirmPasswordReset(_pendingOobCode, newPassword);
      _pendingOobCode = null;
      window._pResettingPassword = false;
      // Clean the URL so a refresh doesn't re-trigger the reset flow
      history.replaceState(null, '', window.location.pathname);
      showAuthLogin();
      showToast('Password updated! You can now sign in with your new password.', 'success');
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Set new password'; }
      const msg = err.code === 'auth/expired-action-code'  ? 'This reset link has expired. Please request a new one.'
                : err.code === 'auth/invalid-action-code'  ? 'This reset link is invalid or has already been used.'
                : err.code === 'auth/weak-password'        ? 'Password is too weak — please choose a stronger one.'
                : err.message;
      if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
    }
  });
}

// ─── Delete account ───────────────────────────────────────────────────────────

function deleteAccount() {
  openModal(`
    <div class="p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-semibold text-red-600">Delete Account</h3>
          <p class="text-xs text-surface-500">This permanently removes your account and all data</p>
        </div>
      </div>
      <div class="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800 rounded p-3 mb-5 text-sm text-red-700 dark:text-red-400">
        <strong>Warning:</strong> All contacts, companies, deals, calls, notes, and your account will be <strong>permanently deleted</strong>. This cannot be undone.
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium mb-1.5">Enter your password to confirm</label>
        <input type="password" id="delete-account-password" class="input-field" placeholder="Your account password"
          onkeydown="if(event.key==='Enter') confirmDeleteAccount()" autofocus />
        <p id="delete-account-error" class="text-xs text-red-600 mt-1.5 hidden">Incorrect password. Please try again.</p>
      </div>
      <div class="flex justify-end gap-3">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button id="delete-account-confirm-btn" onclick="confirmDeleteAccount()" class="btn-danger flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          Delete My Account
        </button>
      </div>
    </div>
  `, { small: true });
  setTimeout(() => document.getElementById('delete-account-password')?.focus(), 50);
}

async function confirmDeleteAccount() {
  const input     = document.getElementById('delete-account-password');
  const errorEl   = document.getElementById('delete-account-error');
  const deleteBtn = document.getElementById('delete-account-confirm-btn');
  if (!input || !input.value) { input?.focus(); return; }

  if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.textContent = 'Deleting…'; }
  if (errorEl)   { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
  window._pDeletingAccount = true;

  try {
    const fbUser = firebase.auth().currentUser;
    if (!fbUser) throw new Error('No signed-in user found — please refresh and try again.');

    const email  = fbUser.email;
    const uid    = fbUser.uid;
    const apiKey = firebase.app().options.apiKey;

    // ── Step 1: Sign in via REST to verify password + get a guaranteed-fresh token ──
    // We bypass reauthenticateWithCredential entirely because the Firebase SDK
    // v10 compat layer can return a resolved promise without actually sending
    // the token-refresh request to Firebase's servers (a known issue when
    // Firestore offline persistence is enabled).  Calling the REST API directly
    // gives us an idToken that we KNOW came from Firebase's servers right now.
    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password: input.value, returnSecureToken: true }),
      }
    );
    const signInBody = await signInRes.json().catch(() => ({}));

    if (!signInRes.ok) {
      // Wrong password — show inline error, re-enable button, bail out
      const msg = signInBody?.error?.message || '';
      const isWrongPassword = msg.includes('INVALID_PASSWORD') ||
                              msg.includes('INVALID_LOGIN_CREDENTIALS') ||
                              msg.includes('EMAIL_NOT_FOUND');
      if (isWrongPassword) {
        if (errorEl) { errorEl.textContent = 'Incorrect password. Please try again.'; errorEl.classList.remove('hidden'); }
        input.value = ''; input.focus();
        window._pDeletingAccount = false;
        if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.textContent = 'Delete My Account'; }
        return;
      }
      throw Object.assign(new Error(msg || 'Sign-in failed'), { code: 'auth/sign-in-api-error' });
    }

    const idToken = signInBody.idToken;
    if (!idToken) throw new Error('Firebase did not return an ID token — please try again.');

    // ── Step 2: Firestore cleanup (parallel, never blocks auth deletion) ──────
    const db = firebase.firestore();
    const storesToPurge = Object.values(STORES).filter(s => s !== 'users');
    await Promise.allSettled([
      ...storesToPurge.map(store =>
        db.collection('users').doc(uid).collection(store).get()
          .then(snap => {
            if (snap.empty) return;
            const b = db.batch();
            snap.docs.forEach(d => b.delete(d.ref));
            return b.commit();
          }).catch(() => {})
      ),
      db.collection('users').doc(uid).delete().catch(() => {}),
      db.collection('userAccess').doc(uid).delete().catch(() => {}),
    ]);

    // ── Step 3: Delete the Firebase Auth account via REST ─────────────────────
    // We use the idToken obtained in Step 1 — it came directly from Firebase's
    // servers so it is guaranteed valid regardless of any local SDK cache state.
    const delRes  = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ idToken }),
      }
    );
    if (!delRes.ok) {
      const body = await delRes.json().catch(() => ({}));
      const msg  = body?.error?.message || ('HTTP ' + delRes.status);
      throw Object.assign(new Error(msg), { code: 'auth/deletion-api-error' });
    }

    // ── Step 3b: Verify the account is truly gone ─────────────────────────────
    // Try signing in again — it MUST fail with a 400 if deletion worked.
    // If it succeeds (200), the account still exists and we surface a real error
    // instead of showing false "Account deleted" success.
    const verifyRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password: input.value, returnSecureToken: true }),
      }
    );
    if (verifyRes.ok) {
      // Account still exists — deletion silently failed; surface a real error
      throw Object.assign(
        new Error('Account could not be deleted. Please try again or contact support.'),
        { code: 'auth/deletion-verify-failed' }
      );
    }
    // verifyRes is 400 (user not found) — account is truly deleted ✓

    // ── Step 4: Clear the local Firebase SDK session ──────────────────────────
    await firebase.auth().signOut().catch(() => {});

    // ── Step 5: Success UI ────────────────────────────────────────────────────
    window._pDeletingAccount = false;
    closeModal();
    currentUser = null;
    localStorage.removeItem('pulse_remember_until');
    sessionStorage.removeItem('pulse_session_active');
    localStorage.removeItem('pulse_show_tutorial_' + uid);
    sessionStorage.setItem('pulse_just_deleted', '1');

    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    showAuthRegister();
    showToast('Account deleted — use a new invite code to create a fresh account', 'info');

  } catch (err) {
    window._pDeletingAccount = false;
    if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.textContent = 'Delete My Account'; }
    console.error('[Pulse] Account deletion failed:', err.code, err.message, err);
    const diagCode = err.code || 'unknown';
    if (errorEl) {
      errorEl.textContent = 'Deletion failed (' + diagCode + ') — please try again.';
      errorEl.classList.remove('hidden');
    }
    showToast('Deletion failed (' + diagCode + '): ' + (err.message || ''), 'error');
  }
}

// ─── showApp ─────────────────────────────────────────────────────────────────

function showApp() {
  const authScreen = document.getElementById('auth-screen');
  const appShell   = document.getElementById('app-shell');
  if (!authScreen || !appShell) return;

  // Guard: if the app is already visible this is a duplicate call (e.g. from
  // both the login handler and onAuthStateChanged firing at the same time).
  // Just ensure the panels are correct and bail — don't re-navigate or re-init.
  const alreadyVisible = !appShell.classList.contains('hidden');

  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');

  if (alreadyVisible) return;

  if (currentUser) seedDemoDeal(currentUser.id).catch(() => {});

  const hashPage  = location.hash.slice(1);
  const startPage = (hashPage && typeof VALID_PAGES !== 'undefined' && VALID_PAGES.has(hashPage))
    ? hashPage : 'dashboard';
  navigate(startPage);
  checkReminders();

  if (currentUser && localStorage.getItem('pulse_show_tutorial_' + currentUser.id)) {
    setTimeout(() => { if (typeof startTutorial === 'function') startTutorial(); }, 600);
  }

  if (typeof initGmailSync === 'function') initGmailSync();
}
