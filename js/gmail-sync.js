/* ============================================
   Pulse — Gmail Sync
   Fetches emails for known contacts and logs
   interactions (notes, activities, calls).
   ============================================ */

// ── State ────────────────────────────────────────────────────────────────────
let _gmailTokenClient = null;
let _gmailAccessToken = null;
let _gmailTokenExpiry = 0;  // epoch ms

// ── GIS setup ────────────────────────────────────────────────────────────────

function gmailIsConnected() {
  return !!(_gmailAccessToken && Date.now() < _gmailTokenExpiry);
}

/**
 * Load saved token from settings and re-hydrate in-memory state.
 * Called once on app init (after login).
 */
async function initGmailSync() {
  const settings = await _getSettings();
  if (settings?.gmailAccessToken && settings?.gmailTokenExpiry) {
    if (Date.now() < settings.gmailTokenExpiry) {
      _gmailAccessToken = settings.gmailAccessToken;
      _gmailTokenExpiry = settings.gmailTokenExpiry;
    } else {
      // Token expired — clear it so UI shows "Connect"
      await _saveGmailToken(null, 0);
    }
  }
}

/**
 * Trigger the Google OAuth consent screen using GIS.
 * The user must have entered their Google Client ID in Settings.
 */
async function connectGmail() {
  const settings = await _getSettings();
  const clientId = settings?.googleClientId?.trim();

  if (!clientId) {
    showToast('Enter your Google Client ID in Settings first', 'warning');
    return;
  }

  if (typeof google === 'undefined' || !google?.accounts?.oauth2) {
    showToast('Google Identity Services library not loaded — check your internet connection', 'error');
    return;
  }

  _gmailTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    callback: async (response) => {
      if (response.error) {
        showToast('Gmail connection failed: ' + response.error, 'error');
        return;
      }
      // expires_in is in seconds
      _gmailAccessToken = response.access_token;
      _gmailTokenExpiry = Date.now() + (response.expires_in - 60) * 1000;
      await _saveGmailToken(_gmailAccessToken, _gmailTokenExpiry);
      showToast('Gmail connected', 'success');
      _refreshGmailSettingsCard();
      // Auto-sync after connecting
      await syncGmailNow({ silent: false });
    },
  });

  _gmailTokenClient.requestAccessToken();
}

async function disconnectGmail() {
  if (_gmailAccessToken && typeof google !== 'undefined' && google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(_gmailAccessToken, () => {});
  }
  _gmailAccessToken = null;
  _gmailTokenExpiry = 0;
  await _saveGmailToken(null, 0);
  showToast('Gmail disconnected', 'success');
  _refreshGmailSettingsCard();
}

// ── Sync logic ────────────────────────────────────────────────────────────────

/**
 * Main sync entry point.
 * For each contact with an email address, search Gmail for recent threads.
 * Logs new interactions as notes/activities and detects call-related emails.
 */
async function syncGmailNow({ silent = false } = {}) {
  if (!gmailIsConnected()) {
    if (!silent) showToast('Gmail not connected', 'warning');
    return;
  }

  if (!silent) showToast('Syncing Gmail…', 'info');

  const contacts = await DB.getForUser(STORES.contacts, currentUser.id);
  const emailContacts = contacts.filter(c => c.email && !c.archived);

  if (emailContacts.length === 0) {
    if (!silent) showToast('No contacts with email addresses found', 'warning');
    return;
  }

  // Load already-synced message IDs to avoid double-logging
  const settings = await _getSettings();
  const syncedIds = new Set(settings?.gmailSyncedMessageIds || []);
  const newSyncedIds = [];

  let emailsLogged = 0;
  let callsLogged = 0;

  for (const contact of emailContacts) {
    try {
      const threads = await _fetchThreadsForContact(contact.email);
      for (const thread of threads) {
        if (syncedIds.has(thread.id)) continue;

        const detail = await _fetchThreadDetail(thread.id);
        if (!detail) continue;

        const { subject, body, date, from, to } = _parseThread(detail);

        // Determine direction: sent-to or received-from
        const contactEmail = contact.email.toLowerCase();
        const isFromContact = from.toLowerCase().includes(contactEmail);
        const isToContact = to.toLowerCase().includes(contactEmail);
        if (!isFromContact && !isToContact) {
          newSyncedIds.push(thread.id);
          continue;
        }

        const direction = isFromContact ? 'received' : 'sent';
        const emailDate = date || new Date().toISOString();

        if (_isCallRelated(subject, body)) {
          await _logCallFromEmail(contact, { subject, body, date: emailDate, direction });
          callsLogged++;
        } else {
          await _logEmailInteraction(contact, { subject, body, date: emailDate, direction });
          emailsLogged++;
        }

        // Update last contact date if this email is more recent
        if (!contact.lastContactDate || new Date(emailDate) > new Date(contact.lastContactDate)) {
          contact.lastContactDate = emailDate;
          await DB.put(STORES.contacts, contact);
        }

        newSyncedIds.push(thread.id);
      }
    } catch (err) {
      // Don't abort entire sync if one contact fails
      console.warn('[GmailSync] Error for contact', contact.email, err);
    }
  }

  // Persist synced IDs (keep last 2000 to avoid unbounded growth)
  const allSynced = [...syncedIds, ...newSyncedIds].slice(-2000);
  settings.gmailSyncedMessageIds = allSynced;
  settings.gmailLastSync = new Date().toISOString();
  await DB.put(STORES.settings, settings);

  if (!silent) {
    const parts = [];
    if (emailsLogged > 0) parts.push(`${emailsLogged} email${emailsLogged > 1 ? 's' : ''}`);
    if (callsLogged > 0) parts.push(`${callsLogged} call${callsLogged > 1 ? 's' : ''}`);
    if (parts.length > 0) {
      showToast(`Synced: logged ${parts.join(' and ')}`, 'success');
    } else {
      showToast('Gmail synced — no new interactions', 'success');
    }
  }

  _refreshGmailSettingsCard();
}

// ── Gmail API helpers ─────────────────────────────────────────────────────────

async function _fetchThreadsForContact(email) {
  // Search for threads involving this email in the last 90 days
  const after = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
  const query = encodeURIComponent(`(from:${email} OR to:${email}) after:${after}`);
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${query}&maxResults=20`;

  const resp = await _gmailFetch(url);
  return resp?.threads || [];
}

async function _fetchThreadDetail(threadId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`;
  return await _gmailFetch(url);
}

async function _gmailFetch(url) {
  if (!gmailIsConnected()) return null;

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${_gmailAccessToken}` },
    });

    if (resp.status === 401) {
      // Token expired mid-sync
      _gmailAccessToken = null;
      _gmailTokenExpiry = 0;
      await _saveGmailToken(null, 0);
      return null;
    }

    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ── Thread parsing ────────────────────────────────────────────────────────────

function _parseThread(threadDetail) {
  // Use the first (oldest) message for metadata, last for recency
  const messages = threadDetail?.messages || [];
  if (messages.length === 0) return { subject: '', body: '', date: null, from: '', to: '' };

  const last = messages[messages.length - 1];
  const headers = last?.payload?.headers || [];

  const get = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const subject = get('Subject');
  const from = get('From');
  const to = get('To');
  const dateStr = get('Date');
  const date = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

  // Extract snippet as body proxy (full body requires separate call)
  const body = last?.snippet || '';

  return { subject, body, date, from, to };
}

// ── Call detection ────────────────────────────────────────────────────────────

const CALL_SUBJECTS = ['call', 'meeting', 'chat', 'catch up', 'connect', 'interview', 'zoom', 'meet', 'teams', 'webex', 'intro'];
const CALL_BODY_PATTERNS = [
  /zoom\.us\/j\//i,
  /meet\.google\.com\//i,
  /teams\.microsoft\.com\//i,
  /webex\.com\/meet\//i,
  /join the call/i,
  /dial.in number/i,
  /conference call/i,
  /scheduled a call/i,
  /phone call/i,
  /video call/i,
];

function _isCallRelated(subject, body) {
  const subjectLower = (subject || '').toLowerCase();
  if (CALL_SUBJECTS.some(kw => subjectLower.includes(kw))) return true;
  const text = (body || '').toLowerCase();
  return CALL_BODY_PATTERNS.some(re => re.test(text));
}

// ── Interaction logging ───────────────────────────────────────────────────────

async function _logEmailInteraction(contact, { subject, body, date, direction }) {
  const dirLabel = direction === 'received' ? 'Email from' : 'Email to';
  const summary = generateEmailSummary(subject, body);

  await DB.add(STORES.notes, {
    userId: currentUser.id,
    contactId: contact.id,
    callId: null,
    content: `[${dirLabel} ${contact.fullName}] ${subject}\n\nSummary:\n${summary}`,
    cleanedContent: null,
    createdAt: date,
  });

  await DB.add(STORES.activities, {
    userId: currentUser.id,
    contactId: contact.id,
    type: 'email',
    title: `${dirLabel} ${contact.fullName}`,
    description: subject ? `Re: ${subject}` : 'Email logged from Gmail sync',
    timestamp: date,
  });
}

async function _logCallFromEmail(contact, { subject, body, date, direction }) {
  const summary = generateEmailSummary(subject, body);

  // Detect duration hint in body (e.g. "30 min", "1 hour")
  const durationMatch = (body || '').match(/(\d+)\s*(?:min(?:ute)?s?|hour?s?)/i);
  let duration = 30; // default
  if (durationMatch) {
    const n = parseInt(durationMatch[1]);
    const unit = durationMatch[0].toLowerCase();
    duration = unit.includes('hour') ? n * 60 : n;
  }

  const call = await DB.add(STORES.calls, {
    userId: currentUser.id,
    contactId: contact.id,
    date: date,
    duration: duration,
    summary: `[Auto-logged from email] ${subject}\n\n${summary}`,
    outcome: 'completed',
    source: 'gmail',
  });

  // Update contact stage if currently at "New Lead"
  if (contact.stage === 'New Lead') {
    contact.stage = 'In Contact';
    await DB.put(STORES.contacts, contact);
  }

  await DB.add(STORES.activities, {
    userId: currentUser.id,
    contactId: contact.id,
    type: 'call',
    title: `Call with ${contact.fullName}`,
    description: `Auto-logged from Gmail: ${subject || 'Meeting email'}`,
    timestamp: date,
  });
}

// ── Settings card rendering ───────────────────────────────────────────────────

function renderGmailSyncCard(settings) {
  const connected = gmailIsConnected();
  const lastSync = settings?.gmailLastSync
    ? new Date(settings.gmailLastSync).toLocaleString()
    : 'Never';

  return `
    <div class="card mb-6" id="gmail-sync-card">
      <div class="flex items-center gap-3 mb-4">
        <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none">
          <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z" fill="#EA4335" stroke="none"/>
          <path d="M2 6L12 13L22 6" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <h2 class="text-base font-semibold">Gmail Sync</h2>
        ${connected ? `<span class="ml-auto text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">Connected</span>` : ''}
      </div>
      <p class="text-xs text-surface-500 mb-4">Connect Gmail to automatically log emails and calls with your contacts. Pulse reads only — it never sends emails on your behalf.</p>

      ${!connected ? `
        <!-- Setup instructions -->
        <details class="mb-4 text-xs">
          <summary class="cursor-pointer text-brand-600 hover:underline font-medium mb-2">Setup instructions (one-time)</summary>
          <div class="mt-2 space-y-2 text-surface-600 dark:text-surface-400 bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3">
            <p><strong>1.</strong> Go to <a href="https://console.cloud.google.com/" target="_blank" class="text-brand-600 hover:underline">console.cloud.google.com</a> and create a project.</p>
            <p><strong>2.</strong> Enable the <strong>Gmail API</strong> under APIs &amp; Services → Library.</p>
            <p><strong>3.</strong> Create an <strong>OAuth 2.0 Client ID</strong> (type: Web Application) under APIs &amp; Services → Credentials.</p>
            <p><strong>4.</strong> Add <code class="bg-surface-200 dark:bg-surface-700 px-1 rounded">http://localhost:3000</code> (and <code class="bg-surface-200 dark:bg-surface-700 px-1 rounded">http://localhost:8080</code>) as <strong>Authorized JavaScript origins</strong>.</p>
            <p><strong>5.</strong> Copy the Client ID and paste it below.</p>
            <p class="text-amber-700 dark:text-amber-400"><strong>Note:</strong> Open the app via the local server (not the file:// URL) for OAuth to work.</p>
          </div>
        </details>

        <div class="mb-4">
          <label class="block text-xs font-medium text-surface-500 mb-1">Google Client ID</label>
          <input type="text" id="settings-google-client-id"
            class="input-field text-sm"
            placeholder="1234567890-abc….apps.googleusercontent.com"
            value="${escapeHtml(settings?.googleClientId || '')}" />
          <p class="text-xs text-surface-400 mt-1">Stored locally — never transmitted to Pulse servers.</p>
        </div>

        <button onclick="saveGoogleClientIdAndConnect()" class="btn-primary btn-sm flex items-center gap-2">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.372 0 0 5.373 0 12s5.372 12 12 12 12-5.373 12-12S18.628 0 12 0zm6.804 16.562c-.261.396-.707.438-1.064.177l-3.098-2.302-1.496 1.437c-.166.16-.387.247-.615.247-.228 0-.449-.087-.615-.247l-1.496-1.437-3.098 2.302c-.357.261-.803.219-1.064-.177-.261-.396-.154-.933.24-1.174l3.259-2.186-3.098-2.094c-.39-.264-.491-.796-.226-1.185.266-.39.796-.491 1.185-.226l2.858 1.933 1.055-1.013V7.333c0-.46.373-.833.833-.833s.833.373.833.833v5.484l1.055 1.013 2.858-1.933c.39-.265.919-.164 1.185.226.265.389.164.921-.226 1.185l-3.098 2.094 3.259 2.186c.394.241.501.778.24 1.174z"/></svg>
          Connect Gmail
        </button>
      ` : `
        <!-- Connected state -->
        <div class="space-y-3">
          <div class="flex items-center justify-between bg-surface-50 dark:bg-surface-800/50 rounded-xl p-3">
            <div>
              <p class="text-sm font-medium">Last sync</p>
              <p class="text-xs text-surface-500">${escapeHtml(lastSync)}</p>
            </div>
            <button onclick="syncGmailNow()" class="btn-secondary btn-sm flex items-center gap-1.5">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Sync Now
            </button>
          </div>
          <div class="bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
            <p class="text-xs text-blue-700 dark:text-blue-300"><strong>What gets logged:</strong> Emails with contacts are saved as notes. Emails about meetings or calls (Zoom, Meet, Teams links or call-related subjects) are logged as calls. Pulse never writes to your Gmail.</p>
          </div>
          <div class="flex justify-end">
            <button onclick="disconnectGmail()" class="text-xs text-surface-400 hover:text-red-500 transition-colors">Disconnect Gmail</button>
          </div>
        </div>
      `}
    </div>
  `;
}

async function saveGoogleClientIdAndConnect() {
  const input = document.getElementById('settings-google-client-id');
  if (!input) return;
  const clientId = input.value.trim();
  if (!clientId) {
    showToast('Paste your Google Client ID first', 'warning');
    return;
  }
  // Save client ID to settings first
  const settings = await _getSettings();
  settings.googleClientId = clientId;
  await DB.put(STORES.settings, settings);
  // Now connect
  await connectGmail();
}

// Re-render just the Gmail card without full settings re-render
function _refreshGmailSettingsCard() {
  const card = document.getElementById('gmail-sync-card');
  if (!card) return;
  _getSettings().then(settings => {
    const tmp = document.createElement('div');
    tmp.innerHTML = renderGmailSyncCard(settings);
    card.replaceWith(tmp.firstElementChild);
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _getSettings() {
  return DB.get(STORES.settings, `settings_${currentUser.id}`);
}

async function _saveGmailToken(token, expiry) {
  const settings = await _getSettings();
  if (!settings) return;
  settings.gmailAccessToken = token;
  settings.gmailTokenExpiry = expiry;
  await DB.put(STORES.settings, settings);
}
