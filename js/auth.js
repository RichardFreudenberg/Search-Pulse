/* ============================================
   Pulse — Authentication (Firebase Auth)
   ============================================ */

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
    usedAt:       null,
  };
  await firebase.firestore().collection('inviteCodes').doc(code).set(record);
  return record;
}

async function markInviteUsed(code, email) {
  try {
    await firebase.firestore().collection('inviteCodes').doc(code).update({
      usedByEmail: email,
      usedAt:      new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[Pulse] markInviteUsed:', err.message);
  }
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
  firebase.auth().signOut();
  currentUser = null;
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  showAuthLogin();
}

// ─── Auth panels ─────────────────────────────────────────────────────────────

function _showAuthPanel(name) {
  ['login', 'register', 'verify', 'reset', 'new-password', 'recover'].forEach(s =>
    document.getElementById(`auth-${s}`)?.classList.toggle('hidden', s !== name)
  );
}
function showAuthLogin()       { _showAuthPanel('login'); }
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

function setupAuthForms() {

  // ── Login ──────────────────────────────────────────────────────────────────
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const result   = await firebase.auth().signInWithEmailAndPassword(email, password);
      const appUser  = _fbUserToAppUser(result.user);
      setCurrentUser(appUser);
      await _applyUserTheme(appUser.id);
      showApp();
      showToast('Welcome back, ' + appUser.name.split(' ')[0], 'success');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Sign in';
      const msg = err.code === 'auth/user-not-found' ? 'No account found with this email'
                : err.code === 'auth/wrong-password'  ? 'Incorrect password'
                : err.code === 'auth/invalid-credential' ? 'Incorrect email or password'
                : err.message;
      showToast(msg, 'error');
    }
  });

  // ── Register ───────────────────────────────────────────────────────────────
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Creating account…';
    try {
      const name            = document.getElementById('register-name').value.trim();
      const email           = document.getElementById('register-email').value.trim();
      const password        = document.getElementById('register-password').value;
      const passwordConfirm = document.getElementById('register-password-confirm').value;
      const inviteCode      = (document.getElementById('register-invite')?.value || '').trim().toUpperCase();

      if (!name) { showToast('Please enter your name', 'error'); btn.disabled = false; btn.textContent = 'Create account'; return; }
      if (password !== passwordConfirm) { showToast('Passwords do not match', 'error'); btn.disabled = false; btn.textContent = 'Create account'; return; }
      if (password.length < 8) { showToast('Password must be at least 8 characters', 'error'); btn.disabled = false; btn.textContent = 'Create account'; return; }

      // Validate invite code if required
      const inviteRequired = await isInviteRequired();
      if (inviteRequired) {
        if (!inviteCode) { showToast('An invite code is required', 'error'); document.getElementById('register-invite')?.focus(); btn.disabled = false; btn.textContent = 'Create account'; return; }
        const valid = await validateInviteCode(inviteCode);
        if (!valid) { showToast('Invalid invite code — please check and try again', 'error'); document.getElementById('register-invite')?.focus(); btn.disabled = false; btn.textContent = 'Create account'; return; }
      }

      // Create Firebase Auth account
      const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await result.user.updateProfile({ displayName: name });

      const appUser = _fbUserToAppUser({ ...result.user, displayName: name });
      setCurrentUser(appUser);

      // Create default data + seed demo
      await _createDefaultUserData(appUser.id);
      await seedDemoData(appUser.id);

      // Mark owner registration so future users need invite
      if (!inviteRequired) {
        await firebase.firestore().collection('config').doc('registration')
          .set({ hasOwner: true, ownerUid: appUser.id, registeredAt: new Date().toISOString() });
      }

      if (inviteRequired && inviteCode) markInviteUsed(inviteCode, email);

      localStorage.setItem('pulse_show_tutorial_' + appUser.id, '1');
      showApp();
      showToast('Welcome to Pulse, ' + name.split(' ')[0] + '!', 'success');
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Create account';
      const msg = err.code === 'auth/email-already-in-use' ? 'An account with this email already exists'
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
        url: window.location.origin + window.location.pathname,
      });
      if (statusEl) {
        statusEl.innerHTML = `
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;text-align:center;">
            <p style="font-size:14px;font-weight:600;color:#15803d;margin-bottom:4px;">Reset link sent!</p>
            <p style="font-size:12px;color:#4ade80;">Check your inbox for <strong>${email}</strong> and click the link to set a new password.</p>
          </div>`;
        statusEl.classList.remove('hidden');
      }
      btn.textContent = 'Sent ✓';
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Send reset link';
      const msg = err.code === 'auth/user-not-found' ? 'No account found with this email'
                : err.message;
      showToast(msg, 'error');
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
        <button onclick="confirmDeleteAccount()" class="btn-danger flex items-center gap-2">
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
  const input   = document.getElementById('delete-account-password');
  const errorEl = document.getElementById('delete-account-error');
  if (!input || !input.value) { input?.focus(); return; }

  try {
    const fbUser     = firebase.auth().currentUser;
    const credential = firebase.auth.EmailAuthProvider.credential(fbUser.email, input.value);
    await fbUser.reauthenticateWithCredential(credential);

    // Delete all Firestore subcollections for this user
    const uid           = fbUser.uid;
    const storesToPurge = Object.values(STORES).filter(s => s !== 'users');
    for (const store of storesToPurge) {
      try {
        const snap  = await firebase.firestore().collection('users').doc(uid).collection(store).get();
        if (snap.empty) continue;
        const batch = firebase.firestore().batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      } catch (_) {}
    }
    // Delete the user document itself
    await firebase.firestore().collection('users').doc(uid).delete().catch(() => {});

    // Delete Firebase Auth account
    await fbUser.delete();

    closeModal();
    currentUser = null;
    localStorage.removeItem('pulse_show_tutorial_' + uid);
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    showAuthLogin();
    showToast('Account deleted', 'info');
  } catch (err) {
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      errorEl?.classList.remove('hidden');
      input.value = ''; input.focus();
    } else {
      showToast('Error: ' + err.message, 'error');
    }
  }
}

// ─── showApp ─────────────────────────────────────────────────────────────────

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

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
