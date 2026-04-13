/* ============================================
   Pulse — Authentication
   ============================================ */

let currentUser = null;
let pendingVerification = null; // { user, code, email }

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function register(name, email, password) {
  const existing = await DB.getAll(STORES.users);
  if (existing.find(u => u.email === email)) {
    throw new Error('An account with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const user = {
    id: generateId(),
    name,
    email,
    passwordHash,
    emailVerified: false,
    createdAt: new Date().toISOString(),
  };

  await DB.add(STORES.users, user);

  // Create default tags
  const defaultTags = [
    { name: 'Search Fund', color: 'blue' },
    { name: 'PE/VC', color: 'purple' },
    { name: 'Operator', color: 'green' },
    { name: 'Advisor', color: 'yellow' },
    { name: 'Banker', color: 'teal' },
    { name: 'Broker', color: 'gray' },
    { name: 'LP', color: 'red' },
    { name: 'CEO', color: 'blue' },
    { name: 'Board Member', color: 'purple' },
    { name: 'Industry Expert', color: 'green' },
  ];
  for (const tag of defaultTags) {
    await DB.add(STORES.tags, { ...tag, userId: user.id });
  }

  // Create default settings
  await DB.add(STORES.settings, {
    id: `settings_${user.id}`,
    userId: user.id,
    theme: 'light',
    emailReminders: false,
    reminderEmail: '',
    defaultFollowUpDays: 14,
    stageCadence: {
      'New intro': 7,
      'Met once': 14,
      'Active relationship': 30,
      'Warm relationship': 60,
      'Needs follow-up': 3,
    },
    openaiApiKey: '',
    claudeApiKey: '',
    rapidApiKey: '',
    linkedInConnected: false,
    linkedInProfileUrl: '',
    newsRegions: ['USA', 'Europe'],
  });

  return user;
}

async function login(email, password) {
  const users = await DB.getAll(STORES.users);
  const user = users.find(u => u.email === email);
  if (!user) throw new Error('No account found with this email');

  const passwordHash = await hashPassword(password);
  if (user.passwordHash !== passwordHash) throw new Error('Incorrect password');

  return user;
}

function setCurrentUser(user) {
  currentUser = user;
  localStorage.setItem('pulse_user_id', user.id);
  document.getElementById('sidebar-user-name').textContent = user.name;
  document.getElementById('user-avatar-initial').textContent = user.name.charAt(0).toUpperCase();
}

async function restoreSession() {
  const userId = localStorage.getItem('pulse_user_id');
  if (!userId) return null;

  const user = await DB.get(STORES.users, userId);
  if (user) {
    setCurrentUser(user);
    const settings = await DB.get(STORES.settings, `settings_${user.id}`);
    if (settings && settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }
  return user;
}

function logout() {
  currentUser = null;
  localStorage.removeItem('pulse_user_id');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function _showAuthPanel(name) {
  ['login', 'register', 'verify', 'reset', 'recover'].forEach(s =>
    document.getElementById(`auth-${s}`).classList.toggle('hidden', s !== name)
  );
}
function showAuthLogin()    { _showAuthPanel('login'); }
function showAuthRegister() { _showAuthPanel('register'); }
function showAuthVerify()   { _showAuthPanel('verify'); }
function showAuthReset()    { _showAuthPanel('reset'); }

async function startAccountRecovery() {
  _showAuthPanel('recover');
  const statusEl  = document.getElementById('recover-status');
  const resultsEl = document.getElementById('recover-results');
  resultsEl.innerHTML = '';
  statusEl.textContent = 'Scanning all local databases for your account…';

  let found;
  try {
    found = await scanAllDBsForAccounts();
  } catch (err) {
    statusEl.textContent = 'Scan failed: ' + err.message;
    return;
  }

  if (found.length === 0) {
    statusEl.textContent = 'No accounts found in any other local database. Your data may have been cleared by the browser, or was stored under a different browser profile.';
    return;
  }

  statusEl.textContent = `Found ${found.reduce((n, f) => n + f.users.length, 0)} account(s) in ${found.length} database(s). Click "Restore" to import into Pulse.`;

  found.forEach(({ dbName, data, users }) => {
    users.forEach(user => {
      const card = document.createElement('div');
      card.className = 'flex items-center justify-between bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded p-3';
      card.innerHTML = `
        <div>
          <p class="text-sm font-medium">${user.name || '(no name)'}</p>
          <p class="text-xs text-surface-500">${user.email} &mdash; <span class="font-mono text-xs">${dbName}</span></p>
        </div>
        <button class="btn-primary text-xs px-3 py-1.5">Restore</button>
      `;
      card.querySelector('button').addEventListener('click', async () => {
        card.querySelector('button').textContent = 'Importing…';
        card.querySelector('button').disabled = true;
        try {
          await importLegacyData(data);
          indexedDB.deleteDatabase(dbName);
          showToast('Account restored — sign in now', 'success');
          // Pre-fill email on login screen
          showAuthLogin();
          const emailField = document.getElementById('login-email');
          if (emailField) emailField.value = user.email;
          document.getElementById('login-password').focus();
        } catch (err) {
          showToast('Restore failed: ' + err.message, 'error');
          card.querySelector('button').textContent = 'Retry';
          card.querySelector('button').disabled = false;
        }
      });
      resultsEl.appendChild(card);
    });
  });
}

// Password visibility toggle (press-and-hold)
function showPassword(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.type = 'text';
  const prefix = inputId.replace('-password', '');
  const eyeOff = document.getElementById(`${prefix}-eye-off`);
  const eyeOn = document.getElementById(`${prefix}-eye-on`);
  if (eyeOff) eyeOff.classList.add('hidden');
  if (eyeOn) eyeOn.classList.remove('hidden');
}

function hidePassword(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.type = 'password';
  const prefix = inputId.replace('-password', '');
  const eyeOff = document.getElementById(`${prefix}-eye-off`);
  const eyeOn = document.getElementById(`${prefix}-eye-on`);
  if (eyeOff) eyeOff.classList.remove('hidden');
  if (eyeOn) eyeOn.classList.add('hidden');
}

// OTP input behavior
function setupOtpInputs() {
  const inputs = document.querySelectorAll('.otp-input');
  inputs.forEach((input, i) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = val;
      if (val && i < inputs.length - 1) {
        inputs[i + 1].focus();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && i > 0) {
        inputs[i - 1].focus();
      }
    });
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedData = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      for (let j = 0; j < Math.min(pastedData.length, 6); j++) {
        const idx = j < 3 ? j : j; // skip the dash separator
        if (inputs[idx]) inputs[idx].value = pastedData[j];
      }
      if (pastedData.length >= 6) {
        inputs[inputs.length - 1].focus();
      }
    });
  });
}

function getOtpValue() {
  const inputs = document.querySelectorAll('.otp-input');
  return Array.from(inputs).map(i => i.value).join('');
}

async function sendVerificationEmail(email, code) {
  console.log(`[Pulse] Verification code for ${email}: ${code}`);

  const hint = document.getElementById('verify-code-hint');

  // Try EmailJS if configured
  try {
    const ejsRaw = localStorage.getItem('pulse_emailjs_config');
    const ejsCfg = ejsRaw ? JSON.parse(ejsRaw) : null;

    if (ejsCfg && ejsCfg.publicKey && ejsCfg.serviceId && ejsCfg.templateId && window.emailjs) {
      emailjs.init({ publicKey: ejsCfg.publicKey });
      await emailjs.send(ejsCfg.serviceId, ejsCfg.templateId, {
        to_email: email,
        to_name: pendingVerification?.name || '',
        code: code,
        app_name: 'Pulse CRM',
      });
      // Success — hide code, show confirmation
      if (hint) {
        hint.innerHTML = `<span class="inline-flex items-center gap-1.5 text-green-600 dark:text-green-400 text-sm font-medium"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Verification email sent to ${email}</span>`;
      }
      return;
    }
  } catch (err) {
    console.warn('[Pulse] EmailJS send failed:', err);
    // Fall through to show code hint below
  }

  // Fallback: show code in UI (local / no EmailJS configured)
  if (hint) {
    hint.innerHTML = `
      <span class="bg-surface-100 dark:bg-surface-800 px-3 py-1.5 rounded-lg font-mono text-base tracking-widest">${code}</span>
      <br><span class="text-surface-400 text-xs mt-1 inline-block">
        No email service configured — code shown here.
        <button onclick="navigate('settings')" class="text-brand-600 hover:underline ml-1">Configure EmailJS in Settings →</button>
      </span>`;
  }
}

function resendVerificationCode() {
  if (!pendingVerification) return;
  pendingVerification.code = generateVerificationCode();
  sendVerificationEmail(pendingVerification.email, pendingVerification.code);
  showToast('New verification code sent', 'info');
}

async function resetPassword(email, newPassword) {
  const users = await DB.getAll(STORES.users);
  const user = users.find(u => u.email === email);
  if (!user) throw new Error('No account found with this email');

  const passwordHash = await hashPassword(newPassword);
  user.passwordHash = passwordHash;
  await DB.put(STORES.users, user);
  return user;
}

function setupAuthForms() {
  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const origLabel = btn.textContent;
    btn.textContent = 'Signing in…';
    btn.disabled = true;
    try {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const user = await login(email, password);
      setCurrentUser(user);
      showApp();
      showToast('Welcome back, ' + user.name.split(' ')[0], 'success');
    } catch (err) {
      btn.textContent = origLabel;
      btn.disabled = false;
      showToast(err.message, 'error');

      // If the account wasn't found, automatically run the recovery scan
      // so the user doesn't have to hunt for the button.
      if (err.message && err.message.toLowerCase().includes('no account')) {
        const recoverBtn = document.getElementById('recover-btn');
        if (recoverBtn) {
          recoverBtn.style.animation = 'pulse 1s 2';
          recoverBtn.querySelector('#recover-btn-label').textContent =
            'Account not found — click here to scan & recover your data';
          recoverBtn.classList.add('text-amber-600', 'dark:text-amber-400', 'font-medium');
        }
        // Auto-run the scan
        setTimeout(() => startAccountRecovery(), 800);
      }
    }
  });

  // Register form — leads to verification
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const name = document.getElementById('register-name').value;
      const email = document.getElementById('register-email').value;
      const password = document.getElementById('register-password').value;
      const passwordConfirm = document.getElementById('register-password-confirm').value;

      if (password !== passwordConfirm) {
        showToast('Passwords do not match', 'error');
        document.getElementById('register-password-confirm').focus();
        return;
      }
      if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }

      // Check if user already exists before proceeding
      const existing = await DB.getAll(STORES.users);
      if (existing.find(u => u.email === email)) {
        showToast('An account with this email already exists', 'error');
        return;
      }

      // Generate code and show verification screen
      const code = generateVerificationCode();
      pendingVerification = { name, email, password, code };

      document.getElementById('verify-email-display').textContent = email;
      showAuthVerify();
      setupOtpInputs();

      // Focus first OTP input
      setTimeout(() => {
        const firstInput = document.querySelector('.otp-input[data-index="0"]');
        if (firstInput) firstInput.focus();
      }, 100);

      // "Send" the verification email
      await sendVerificationEmail(email, code);

      showToast('Verification code sent to ' + email, 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Reset password form
  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const email = document.getElementById('reset-email').value;
      const password = document.getElementById('reset-password').value;
      const passwordConfirm = document.getElementById('reset-password-confirm').value;

      if (password !== passwordConfirm) {
        showToast('Passwords do not match', 'error');
        return;
      }
      if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }

      await resetPassword(email, password);
      showToast('Password reset — please sign in', 'success');
      document.getElementById('login-email').value = email;
      showAuthLogin();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Verification form
  document.getElementById('verify-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pendingVerification) {
      showToast('No pending verification', 'error');
      return;
    }

    const enteredCode = getOtpValue();
    if (enteredCode.length !== 6) {
      showToast('Please enter all 6 digits', 'warning');
      return;
    }

    if (enteredCode !== pendingVerification.code) {
      showToast('Invalid verification code', 'error');
      // Shake the inputs
      document.getElementById('otp-container').style.animation = 'none';
      setTimeout(() => {
        document.getElementById('otp-container').style.animation = 'shake 0.5s ease';
      }, 10);
      return;
    }

    // Code is correct — create the account
    try {
      const user = await register(
        pendingVerification.name,
        pendingVerification.email,
        pendingVerification.password
      );
      user.emailVerified = true;
      await DB.put(STORES.users, user);

      setCurrentUser(user);
      await seedDemoData(user.id);
      pendingVerification = null;

      // Flag this user for the onboarding tutorial (persists across page refresh)
      localStorage.setItem('pulse_show_tutorial_' + user.id, '1');

      showApp();
      showToast('Welcome to Pulse, ' + user.name.split(' ')[0] + '!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  // Seed the demo deal for this user (fire-and-forget — won't block the UI)
  if (currentUser) {
    seedDemoDeal(currentUser.id).catch(() => {});
  }

  // Restore the page from URL hash (so refresh keeps you on the same tab)
  const hashPage = location.hash.slice(1);
  const startPage = (hashPage && typeof VALID_PAGES !== 'undefined' && VALID_PAGES.has(hashPage))
    ? hashPage
    : 'dashboard';
  navigate(startPage);
  checkReminders();

  // Show onboarding tutorial for new users (flag set at registration time)
  if (currentUser && localStorage.getItem('pulse_show_tutorial_' + currentUser.id)) {
    setTimeout(() => {
      if (typeof startTutorial === 'function') startTutorial();
    }, 600);
  }
}
