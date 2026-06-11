/* ============================================================
   Pulse — Outlook / Microsoft 365 Email Connector
   ============================================================
   Client-side OAuth (MSAL.js, PKCE) + Microsoft Graph.

   What it does:
   - Connect your Outlook/Microsoft 365 mailbox (read-only).
   - On sync, pulls recent Inbox + Sent messages, matches them to your
     contacts by email address, and records per-contact email activity.
   - Computes who you NEED TO REPLY to (they emailed last) and who you're
     AWAITING A REPLY from (you emailed last).
   - Feeds email recency into each contact's relationship strength/health
     (by updating lastContactDate) — no extra wiring needed.

   Privacy: tokens live only in this browser (MSAL localStorage cache).
   Nothing is sent anywhere except Microsoft Graph. Read-only (Mail.Read).

   Setup (one-time, in YOUR Microsoft tenant):
     1. portal.azure.com → Microsoft Entra ID → App registrations → New.
     2. Platform: Single-page application (SPA). Redirect URI:
        https://search-pulse.de
     3. API permissions → Microsoft Graph → Delegated: Mail.Read, User.Read
        (offline_access is added automatically).
     4. Copy the Application (client) ID and paste it on the Inbox page.
   ============================================================ */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const OUTLOOK_SCOPES = ['User.Read', 'Mail.Read'];
const _EMAIL_PAGE_SIZE = 200; // messages pulled per folder per sync

let _msalApp = null;
let _msalClientId = null;
let _emailSyncing = false;

// ── Config persistence (in the user's settings doc) ──────────
async function _outlookCfg() {
  try {
    const s = await DB.get(STORES.settings, `settings_${currentUser.id}`);
    return (s && s.outlook) || {};
  } catch { return {}; }
}
async function _saveOutlookCfg(patch) {
  const id = `settings_${currentUser.id}`;
  let s = await DB.get(STORES.settings, id);
  if (!s) s = { id, userId: currentUser.id };
  s.outlook = { ...(s.outlook || {}), ...patch };
  await DB.put(STORES.settings, s);
  return s.outlook;
}

// ── MSAL instance ────────────────────────────────────────────
async function _getMsal(clientId, tenantId) {
  if (typeof msal === 'undefined' || !msal.PublicClientApplication) {
    throw new Error('Microsoft sign-in library failed to load. Check your connection and refresh.');
  }
  // Single-tenant apps must use a tenant-specific authority; /common only works
  // for multi-tenant apps (otherwise AADSTS50194). If a Tenant ID (or domain) is
  // provided, target it directly; otherwise fall back to /organizations.
  const tid = (tenantId || '').trim();
  const authority = tid
    ? 'https://login.microsoftonline.com/' + tid
    : 'https://login.microsoftonline.com/organizations'; // any work/school tenant
  const cacheKey = clientId + '|' + tid;
  if (_msalApp && _msalClientId === cacheKey) return _msalApp;
  _msalApp = new msal.PublicClientApplication({
    auth: {
      clientId,
      authority,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false },
  });
  if (typeof _msalApp.initialize === 'function') await _msalApp.initialize(); // MSAL v3
  _msalClientId = cacheKey;
  return _msalApp;
}

function _activeOutlookAccount() {
  if (!_msalApp) return null;
  const acc = _msalApp.getActiveAccount();
  if (acc) return acc;
  const all = _msalApp.getAllAccounts();
  return all && all.length ? all[0] : null;
}

// ── Connect / Disconnect ─────────────────────────────────────
async function connectOutlook() {
  const input = document.getElementById('outlook-client-id');
  const tenantInput = document.getElementById('outlook-tenant-id');
  const cfg = await _outlookCfg();
  const clientId = ((input && input.value.trim()) || cfg.clientId || '').trim();
  const tenantId = ((tenantInput && tenantInput.value.trim()) || cfg.tenantId || '').trim();
  if (!clientId) { showToast('Paste your Microsoft App (client) ID first', 'warning'); input?.focus(); return; }

  try {
    showToast('Opening Microsoft sign-in…', 'info');
    const app = await _getMsal(clientId, tenantId);
    const resp = await app.loginPopup({ scopes: OUTLOOK_SCOPES, prompt: 'select_account' });
    app.setActiveAccount(resp.account);
    await _saveOutlookCfg({ clientId, tenantId, account: resp.account?.username || '', connectedAt: new Date().toISOString() });
    showToast(`Connected as ${resp.account?.username || 'Microsoft account'}`, 'success');
    await syncOutlook();
  } catch (err) {
    console.error('[Outlook] connect failed:', err);
    showToast('Could not connect: ' + (err.errorMessage || err.message || 'unknown error'), 'error');
  }
}

async function disconnectOutlook() {
  confirmDialog('Disconnect Outlook', 'This removes the connection from this browser. Your recorded email activity stays on your contacts.', async () => {
    try {
      const acc = _activeOutlookAccount();
      if (_msalApp && acc && _msalApp.clearCache) await _msalApp.clearCache({ account: acc });
    } catch (_) {}
    await _saveOutlookCfg({ account: '', connectedAt: null });
    showToast('Outlook disconnected', 'success');
    renderEmailHub();
  });
}

async function _outlookToken() {
  const app = _msalApp;
  const account = _activeOutlookAccount();
  if (!app || !account) throw new Error('Not connected');
  try {
    const r = await app.acquireTokenSilent({ scopes: OUTLOOK_SCOPES, account });
    return r.accessToken;
  } catch (e) {
    const r = await app.acquireTokenPopup({ scopes: OUTLOOK_SCOPES });
    return r.accessToken;
  }
}

async function _graphGet(token, url) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error(`Graph ${res.status}: ${res.statusText}`);
  return res.json();
}

// ── Sync ─────────────────────────────────────────────────────
async function syncOutlook() {
  if (_emailSyncing) return;
  const cfg = await _outlookCfg();
  if (!cfg.clientId) { showToast('Connect Outlook first', 'warning'); return; }
  _emailSyncing = true;
  const btn = document.getElementById('outlook-sync-btn');
  if (btn) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = 'Syncing…'; }

  try {
    await _getMsal(cfg.clientId, cfg.tenantId);
    const token = await _outlookToken();
    const selfEmail = (cfg.account || _activeOutlookAccount()?.username || '').toLowerCase();

    const inboxUrl = `${GRAPH_BASE}/me/mailFolders/inbox/messages?$select=from,receivedDateTime,subject,isRead,conversationId&$top=${_EMAIL_PAGE_SIZE}&$orderby=receivedDateTime desc`;
    const sentUrl  = `${GRAPH_BASE}/me/mailFolders/sentitems/messages?$select=toRecipients,sentDateTime,subject,conversationId&$top=${_EMAIL_PAGE_SIZE}&$orderby=sentDateTime desc`;

    const [inbox, sent] = await Promise.all([
      _graphGet(token, inboxUrl),
      _graphGet(token, sentUrl),
    ]);

    const contacts = getActiveContacts(await DB.getForUser(STORES.contacts, currentUser.id));
    const result = await _processEmailData(inbox.value || [], sent.value || [], contacts, selfEmail);

    await _saveOutlookCfg({ lastSyncAt: new Date().toISOString(), lastSyncMatched: result.matched });
    showToast(`Synced — ${result.matched} contact${result.matched !== 1 ? 's' : ''} updated, ${result.needsReply} awaiting your reply`, 'success');
    renderEmailHub();
  } catch (err) {
    console.error('[Outlook] sync failed:', err);
    showToast('Sync failed: ' + (err.errorMessage || err.message || 'unknown error'), 'error');
  } finally {
    _emailSyncing = false;
    if (btn) { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
}

// Match messages to contacts; persist per-contact email stats + lastContactDate.
async function _processEmailData(inboxMsgs, sentMsgs, contacts, selfEmail) {
  const byEmail = {};
  contacts.forEach(c => { if (c.email) byEmail[c.email.trim().toLowerCase()] = c; });

  const agg = {}; // contactId -> { inbound, outbound, lastAt, lastSubject, lastDir }
  const touch = cid => (agg[cid] || (agg[cid] = { inbound: 0, outbound: 0, lastAt: 0, lastSubject: '', lastDir: null }));

  (inboxMsgs || []).forEach(m => {
    const addr = m.from?.emailAddress?.address?.toLowerCase();
    if (!addr || addr === selfEmail) return;
    const c = byEmail[addr]; if (!c) return;
    const t = new Date(m.receivedDateTime || m.sentDateTime || 0).getTime();
    if (!t) return;
    const a = touch(c.id);
    if (t > a.inbound) a.inbound = t;
    if (t > a.lastAt) { a.lastAt = t; a.lastSubject = m.subject || '(no subject)'; a.lastDir = 'in'; }
  });

  (sentMsgs || []).forEach(m => {
    const t = new Date(m.sentDateTime || 0).getTime();
    if (!t) return;
    (m.toRecipients || []).forEach(r => {
      const addr = r.emailAddress?.address?.toLowerCase();
      if (!addr || addr === selfEmail) return;
      const c = byEmail[addr]; if (!c) return;
      const a = touch(c.id);
      if (t > a.outbound) a.outbound = t;
      if (t > a.lastAt) { a.lastAt = t; a.lastSubject = m.subject || '(no subject)'; a.lastDir = 'out'; }
    });
  });

  const byId = buildMap(contacts);
  const writes = [];
  let needsReply = 0;
  Object.keys(agg).forEach(cid => {
    const a = agg[cid];
    const c = byId[cid];
    if (!c) return;
    const awaiting = (a.inbound && a.outbound) ? (a.inbound > a.outbound ? 'you' : 'them')
                   : a.inbound ? 'you' : a.outbound ? 'them' : null;
    if (awaiting === 'you') needsReply++;
    c.emailStats = {
      lastInboundAt:  a.inbound  ? new Date(a.inbound).toISOString()  : null,
      lastOutboundAt: a.outbound ? new Date(a.outbound).toISOString() : null,
      lastSubject:    a.lastSubject,
      lastDirection:  a.lastDir,
      awaiting,
      updatedAt:      new Date().toISOString(),
    };
    // Feed email recency into relationship health
    const newest = a.lastAt ? new Date(a.lastAt).toISOString() : null;
    if (newest && (!c.lastContactDate || new Date(newest) > new Date(c.lastContactDate))) {
      c.lastContactDate = newest;
    }
    writes.push(DB.put(STORES.contacts, c));
  });
  await Promise.all(writes);
  return { matched: writes.length, needsReply };
}

// ── Email status chip (used on contact cards / detail) ───────
function renderEmailStatusChip(contact) {
  const es = contact && contact.emailStats;
  if (!es || !es.awaiting) return '';
  if (es.awaiting === 'you') {
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" title="They emailed last — your reply is due">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
      Reply due</span>`;
  }
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-100 dark:bg-surface-800 text-surface-500" title="You emailed last — awaiting their reply">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
    Awaiting reply</span>`;
}

// ── Email hub page ───────────────────────────────────────────
async function renderEmailHub() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-5xl mx-auto">${renderLoadingSkeleton(4)}</div>`;

  const cfg = await _outlookCfg();
  const connected = !!cfg.clientId && !!cfg.account;

  // Re-hydrate MSAL silently so "connected" survives refreshes
  if (cfg.clientId) { try { await _getMsal(cfg.clientId, cfg.tenantId); } catch (_) {} }

  if (!connected) { pageContent.innerHTML = _emailSetupView(cfg); return; }

  const contacts = getActiveContacts(await DB.getForUser(STORES.contacts, currentUser.id));
  const companies = await DB.getForUser(STORES.companies, currentUser.id);
  const companyMap = buildMap(companies);

  const withStats = contacts.filter(c => c.emailStats && c.emailStats.awaiting);
  const needsReply = withStats.filter(c => c.emailStats.awaiting === 'you')
    .sort((a, b) => new Date(b.emailStats.lastInboundAt || 0) - new Date(a.emailStats.lastInboundAt || 0));
  const awaiting = withStats.filter(c => c.emailStats.awaiting === 'them')
    .sort((a, b) => new Date(a.emailStats.lastOutboundAt || 0) - new Date(b.emailStats.lastOutboundAt || 0)); // oldest waits first

  const lastSync = cfg.lastSyncAt ? (typeof formatRelative === 'function' ? formatRelative(cfg.lastSyncAt) : cfg.lastSyncAt) : 'never';

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      ${renderPageHeader('Inbox', `Connected as ${escapeHtml(cfg.account)} · last sync ${lastSync}`, `
        <button id="outlook-sync-btn" onclick="syncOutlook()" class="btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.023 9.348h4.992V4.356M3.985 19.644V14.65h4.992m-9.97-3.348a8.001 8.001 0 0115.357-2M3.985 14.65a8.001 8.001 0 0015.357 2"/></svg>
          Sync now
        </button>
        <button onclick="disconnectOutlook()" class="btn-ghost text-surface-500 text-sm">Disconnect</button>
      `)}

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Needs your reply -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            </span>
            <h2 class="text-sm font-bold">Needs your reply</h2>
            <span class="text-xs text-surface-400">${needsReply.length}</span>
          </div>
          ${needsReply.length ? `<div class="space-y-2">${needsReply.map(c => _emailRow(c, companyMap[c.companyId], 'in')).join('')}</div>`
            : `<div class="card text-center py-8 text-sm text-surface-400">You're all caught up 🎉</div>`}
        </div>

        <!-- Awaiting their reply -->
        <div>
          <div class="flex items-center gap-2 mb-3">
            <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-surface-200 dark:bg-surface-700 text-surface-500">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </span>
            <h2 class="text-sm font-bold">Awaiting their reply</h2>
            <span class="text-xs text-surface-400">${awaiting.length}</span>
          </div>
          ${awaiting.length ? `<div class="space-y-2">${awaiting.map(c => _emailRow(c, companyMap[c.companyId], 'out')).join('')}</div>`
            : `<div class="card text-center py-8 text-sm text-surface-400">Nothing pending</div>`}
        </div>
      </div>

      <p class="text-xs text-surface-400 mt-8 text-center">
        Read-only. Pulls your last ${_EMAIL_PAGE_SIZE} inbox + sent messages and matches them to contacts by email.
        Email activity also updates each contact's relationship strength.
      </p>
    </div>
  `;
}

function _emailRow(contact, company, dir) {
  const es = contact.emailStats || {};
  const when = dir === 'in' ? es.lastInboundAt : es.lastOutboundAt;
  const whenStr = when ? (typeof formatRelative === 'function' ? formatRelative(when) : '') : '';
  const waitDays = dir === 'out' && when ? Math.floor((Date.now() - new Date(when).getTime()) / 86400000) : 0;
  const subj = es.lastSubject || '';
  const replyHref = contact.email ? `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent('Re: ' + (subj.replace(/^re:\s*/i, '')))}` : '';
  return `
    <div class="card !py-3 flex items-center gap-3 cursor-pointer" onclick="viewContact('${contact.id}')">
      ${typeof renderAvatar === 'function' ? renderAvatar(contact.fullName, contact.photoUrl, 'md', contact.linkedInUrl) : ''}
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="font-medium text-sm truncate">${escapeHtml(contact.fullName)}</span>
          ${company ? `<span class="text-xs text-surface-400 truncate">${escapeHtml(company.name)}</span>` : ''}
        </div>
        <div class="text-xs text-surface-500 truncate">${subj ? escapeHtml(subj) : '<span class="italic text-surface-400">No subject</span>'}</div>
        <div class="text-[11px] ${dir === 'in' ? 'text-red-500' : 'text-surface-400'}">${dir === 'in' ? 'Received' : 'Sent'} ${whenStr}${waitDays > 0 ? ` · waiting ${waitDays}d` : ''}</div>
      </div>
      ${replyHref ? `<a href="${replyHref}" onclick="event.stopPropagation()" class="btn-secondary btn-sm flex-shrink-0">${dir === 'in' ? 'Reply' : 'Nudge'}</a>` : ''}
    </div>`;
}

function _emailSetupView(cfg) {
  const origin = window.location.origin;
  return `
    <div class="p-4 lg:p-8 max-w-2xl mx-auto animate-fade-in">
      ${renderPageHeader('Inbox', 'Connect Outlook / Microsoft 365', '')}
      <div class="card">
        <div class="flex items-start gap-4 mb-5">
          <div class="w-12 h-12 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
            <svg class="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
          </div>
          <div>
            <h2 class="text-base font-semibold mb-1">Track your email conversations</h2>
            <p class="text-sm text-surface-500">Connect your mailbox (read-only) to see who's waiting on your reply, who you're waiting on, and to feed email activity into relationship strength.</p>
          </div>
        </div>

        <div class="bg-surface-50 dark:bg-surface-800/50 rounded-lg p-4 mb-5 text-sm">
          <p class="font-semibold mb-2">One-time setup (in your Microsoft tenant):</p>
          <ol class="list-decimal list-inside space-y-1.5 text-surface-600 dark:text-surface-300">
            <li><a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" class="text-brand-600 hover:underline">Azure Portal → App registrations → New registration</a></li>
            <li>Under <b>Redirect URI</b>, choose <b>Single-page application (SPA)</b> and enter:
              <code class="block mt-1 px-2 py-1 rounded bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-xs select-all">${origin}</code></li>
            <li><b>API permissions → Add → Microsoft Graph → Delegated</b>: add <code class="text-xs">Mail.Read</code> and <code class="text-xs">User.Read</code>.</li>
            <li>From the app's <b>Overview</b> page, copy the <b>Application (client) ID</b> and the <b>Directory (tenant) ID</b> and paste them below.</li>
          </ol>
        </div>

        <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Application (client) ID</label>
        <input type="text" id="outlook-client-id" value="${escapeHtml(cfg.clientId || '')}"
          placeholder="00000000-0000-0000-0000-000000000000"
          class="input-field font-mono text-sm mb-4" />

        <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Directory (tenant) ID</label>
        <input type="text" id="outlook-tenant-id" value="${escapeHtml(cfg.tenantId || '')}"
          placeholder="your-tenant-id (or domain, e.g. rf-nachfolge.de)"
          class="input-field font-mono text-sm mb-1" />
        <p class="text-xs text-surface-400 mb-4">Required for single-tenant apps. Find it on the app's Overview page, next to the client ID. You can also paste your domain (e.g. <code>rf-nachfolge.de</code>).</p>

        <div class="flex items-center gap-3">
          <button onclick="connectOutlook()" class="btn-primary">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.4 3H3v8.4h8.4V3zM21 3h-8.4v8.4H21V3zM11.4 12.6H3V21h8.4v-8.4zM21 12.6h-8.4V21H21v-8.4z"/></svg>
            Connect Microsoft
          </button>
          <span class="text-xs text-surface-400">A Microsoft sign-in window will open.</span>
        </div>
      </div>
    </div>
  `;
}
