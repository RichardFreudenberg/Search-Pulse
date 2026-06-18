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

async function _outlookToken(silent) {
  const app = _msalApp;
  const account = _activeOutlookAccount();
  if (!app || !account) throw new Error('Not connected');
  try {
    const r = await app.acquireTokenSilent({ scopes: OUTLOOK_SCOPES, account });
    return r.accessToken;
  } catch (e) {
    if (silent) throw e; // never pop up during automatic background sync
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
async function syncOutlook(opts = {}) {
  const silent = !!opts.silent;
  if (_emailSyncing) return;
  const cfg = await _outlookCfg();
  if (!cfg.clientId) { if (!silent) showToast('Connect Outlook first', 'warning'); return; }
  _emailSyncing = true;
  const btn = document.getElementById('outlook-sync-btn');
  if (btn) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = 'Syncing…'; }

  try {
    await _getMsal(cfg.clientId, cfg.tenantId);
    const token = await _outlookToken(silent);
    const selfEmail = (cfg.account || _activeOutlookAccount()?.username || '').toLowerCase();

    const inboxUrl = `${GRAPH_BASE}/me/mailFolders/inbox/messages?$select=from,toRecipients,ccRecipients,receivedDateTime,subject,isRead,conversationId&$top=${_EMAIL_PAGE_SIZE}&$orderby=receivedDateTime desc`;
    const sentUrl  = `${GRAPH_BASE}/me/mailFolders/sentitems/messages?$select=toRecipients,ccRecipients,bccRecipients,sentDateTime,subject,conversationId&$top=${_EMAIL_PAGE_SIZE}&$orderby=sentDateTime desc`;

    const [inbox, sent] = await Promise.all([
      _graphGet(token, inboxUrl),
      _graphGet(token, sentUrl),
    ]);

    const contacts = getActiveContacts(await DB.getForUser(STORES.contacts, currentUser.id));
    const result = await _processEmailData(inbox.value || [], sent.value || [], contacts, selfEmail);

    // Transparent recent-activity feed (newest messages, matched to a contact or not)
    const byEmailLc = {};
    contacts.forEach(c => { if (c.email) byEmailLc[c.email.trim().toLowerCase()] = c; });
    const recentRaw = [];
    (inbox.value || []).forEach(m => {
      const addr = m.from?.emailAddress?.address?.toLowerCase();
      if (!addr || addr === selfEmail) return;
      recentRaw.push({ dir: 'in', email: addr, name: m.from?.emailAddress?.name || addr, subject: m.subject || '', at: m.receivedDateTime || m.sentDateTime || null });
    });
    (sent.value || []).forEach(m => {
      const r0 = (m.toRecipients || [])[0]?.emailAddress;
      const addr = r0?.address?.toLowerCase();
      if (!addr || addr === selfEmail) return;
      recentRaw.push({ dir: 'out', email: addr, name: r0?.name || addr, subject: m.subject || '', at: m.sentDateTime || null });
    });
    recentRaw.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    const recentActivity = recentRaw.slice(0, 30).map(r => ({ ...r, isContact: !!byEmailLc[r.email] }));
    const newSenders = recentActivity.filter(r => !r.isContact).length;

    await _saveOutlookCfg({ lastSyncAt: new Date().toISOString(), lastSyncMatched: result.matched, recentActivity });
    if (silent) {
      if (result.needsReply) showToast(`Auto-synced inbox — ${result.needsReply} awaiting your reply`, 'info');
    } else {
      showToast(`Synced ${recentActivity.length} recent emails — ${result.matched} contacts updated, ${newSenders} new sender${newSenders !== 1 ? 's' : ''}`, 'success');
    }
    // Only repaint the hub if the user is actually looking at it
    if (currentPage === 'email') renderEmailHub();

    // Generate/refresh AI briefings for changed contacts in the background,
    // then repaint so cards show the latest "what we last discussed".
    _refreshBriefs(result.touched, token, selfEmail)
      .then(n => { if (n && (currentPage === 'email' || currentPage === 'contacts')) {
        (currentPage === 'email' ? renderEmailHub : renderContacts)();
      }})
      .catch(() => {});
  } catch (err) {
    console.error('[Outlook] sync failed:', err);
    const msg = String(err && (err.errorCode || err.errorMessage || err.message || ''));
    const authIssue = /interaction_required|login_required|consent|invalid_grant|token|AADSTS|popup|user_cancelled|no_account|Not connected/i.test(msg);
    if (!silent) {
      showToast(authIssue ? 'Microsoft sign-in expired — click Reconnect to resume syncing' : ('Sync failed: ' + (err.errorMessage || err.message || 'unknown error')), authIssue ? 'warning' : 'error');
      if (authIssue && currentPage === 'email') renderEmailHub();
    }
  } finally {
    _emailSyncing = false;
    if (btn) { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
}

// ── Auto-sync scheduler (twice daily, no server) ─────────────
// Runs while Pulse is open, and catches up the moment you open Pulse after a
// slot has passed. Cannot wake a closed tab — that needs the server build.
const OUTLOOK_SYNC_HOURS_DEFAULT = [8, 17]; // 8am + 5pm local time
let _outlookAutoTimer = null;

function _outlookSyncHours(cfg) {
  const h = cfg && Array.isArray(cfg.syncHours) && cfg.syncHours.length ? cfg.syncHours : OUTLOOK_SYNC_HOURS_DEFAULT;
  return [...h].sort((a, b) => a - b);
}

/** Most recent scheduled slot boundary at/just before `now` (today or yesterday). */
function _outlookLastSlot(cfg, now) {
  const hours = _outlookSyncHours(cfg);
  const today = hours.map(h => { const d = new Date(now); d.setHours(h, 0, 0, 0); return d; }).filter(d => d <= now);
  if (today.length) return today[today.length - 1];
  // none today yet → yesterday's last slot
  const y = new Date(now); y.setDate(y.getDate() - 1); y.setHours(hours[hours.length - 1], 0, 0, 0);
  return y;
}

function _outlookAutoDue(cfg, now) {
  if (!cfg || cfg.autoSync === false) return false;       // opt-out
  if (!cfg.clientId || !cfg.account) return false;
  const slot = _outlookLastSlot(cfg, now);
  return !cfg.lastSyncAt || new Date(cfg.lastSyncAt) < slot;
}

/** Next scheduled slot after `now` (for display). */
function _outlookNextSlot(cfg, now) {
  const hours = _outlookSyncHours(cfg);
  for (const h of hours) { const d = new Date(now); d.setHours(h, 0, 0, 0); if (d > now) return d; }
  const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(hours[0], 0, 0, 0); return d;
}

async function maybeAutoSyncOutlook() {
  if (typeof currentUser === 'undefined' || !currentUser) return;   // not logged in
  if (_emailSyncing) return;
  let cfg;
  try { cfg = await _outlookCfg(); } catch { return; }
  if (!_outlookAutoDue(cfg, new Date())) return;
  try {
    await _getMsal(cfg.clientId, cfg.tenantId);
    await syncOutlook({ silent: true });
  } catch (err) {
    console.warn('[Outlook] auto-sync skipped:', err && (err.errorMessage || err.message));
  }
}

function outlookAutoSyncInit() {
  if (_outlookAutoTimer) return;
  // Check every 15 min while open; also when the tab regains focus.
  _outlookAutoTimer = setInterval(maybeAutoSyncOutlook, 15 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeAutoSyncOutlook(); });
  // First check shortly after load (give auth + currentUser time to settle).
  setTimeout(maybeAutoSyncOutlook, 8000);
}

async function toggleOutlookAutoSync() {
  const cfg = await _outlookCfg();
  const enabled = cfg.autoSync !== false;        // default on
  await _saveOutlookCfg({ autoSync: !enabled });
  showToast(!enabled ? 'Auto-sync on (8am & 5pm)' : 'Auto-sync off', 'success');
  renderEmailHub();
}

// Kick off the scheduler once the script is loaded.
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', outlookAutoSyncInit);
  else outlookAutoSyncInit();
}

// Match messages to contacts; persist per-contact email stats + lastContactDate.
async function _processEmailData(inboxMsgs, sentMsgs, contacts, selfEmail) {
  const byEmail = {};
  contacts.forEach(c => { if (c.email) byEmail[c.email.trim().toLowerCase()] = c; });

  const MAX_RECIPIENTS = 25; // above this, treat as a blast/newsletter and skip CC matching
  const addrsOf = list => (list || []).map(r => r.emailAddress?.address?.toLowerCase()).filter(Boolean);

  const agg = {}; // contactId -> { inbound, outbound, lastAt, lastSubject, lastDir }
  const touch = cid => (agg[cid] || (agg[cid] = { inbound: 0, outbound: 0, lastAt: 0, lastSubject: '', lastDir: null }));

  (inboxMsgs || []).forEach(m => {
    const t = new Date(m.receivedDateTime || m.sentDateTime || 0).getTime();
    if (!t) return;
    const subject = m.subject || '(no subject)';
    const fromAddr = m.from?.emailAddress?.address?.toLowerCase();
    const recips = [...addrsOf(m.toRecipients), ...addrsOf(m.ccRecipients)];

    // 1) The sender wrote to you → inbound (you may owe a reply)
    if (fromAddr && fromAddr !== selfEmail && byEmail[fromAddr]) {
      const a = touch(byEmail[fromAddr].id);
      if (t > a.inbound) a.inbound = t;
      if (t > a.lastAt) { a.lastAt = t; a.lastSubject = subject; a.lastDir = 'in'; }
    }
    // 2) Contacts also on the thread (To/CC) where someone else sent → neutral
    //    touchpoint: updates recency/strength but doesn't imply a pending reply.
    if (recips.length <= MAX_RECIPIENTS) recips.forEach(addr => {
      if (addr === selfEmail || addr === fromAddr) return;
      const c = byEmail[addr]; if (!c) return;
      const a = touch(c.id);
      if (t > a.lastAt) { a.lastAt = t; a.lastSubject = subject; a.lastDir = 'cc'; }
    });
  });

  (sentMsgs || []).forEach(m => {
    const t = new Date(m.sentDateTime || 0).getTime();
    if (!t) return;
    const subject = m.subject || '(no subject)';
    const to = addrsOf(m.toRecipients);
    const ccbcc = [...addrsOf(m.ccRecipients), ...addrsOf(m.bccRecipients)];
    // You always count To; include CC/BCC unless it's a blast.
    const recipients = (to.length + ccbcc.length) <= MAX_RECIPIENTS ? [...to, ...ccbcc] : to;
    recipients.forEach(addr => {
      if (!addr || addr === selfEmail) return;
      const c = byEmail[addr]; if (!c) return;
      const a = touch(c.id);
      if (t > a.outbound) a.outbound = t;
      if (t > a.lastAt) { a.lastAt = t; a.lastSubject = subject; a.lastDir = 'out'; }
    });
  });

  const byId = buildMap(contacts);
  const writes = [];
  const touched = [];
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
    touched.push({ c, newestAt: a.lastAt || 0 });
    writes.push(DB.put(STORES.contacts, c));
  });
  await Promise.all(writes);
  return { matched: writes.length, needsReply, touched };
}

// ── AI relationship briefing (cached on the contact) ─────────
async function _generateContactBrief(contact, token, selfEmail) {
  const msgs = await _outlookFetchThread(contact.email, token, 12);
  if (!msgs.length) return null;
  const transcript = _outlookThreadToText(msgs, selfEmail);
  const summary = (await callAI(
    `You brief a busy search-fund investor on a relationship using their email history with ${contact.fullName}${contact.title ? ' (' + contact.title + ')' : ''}. Only use what is actually in the emails.`,
    `In 2-4 short sentences, brief me: what we last discussed, the current status, and any open item or who owes the next reply. Write it as a tight card snippet — plain prose, no headings, no bullet characters.\n\nEMAIL CONVERSATION (oldest first):\n\n${transcript}`,
    400, 0.3
  )).trim();
  const newest = msgs.reduce((mx, m) => Math.max(mx, new Date(m.receivedDateTime || m.sentDateTime || 0).getTime()), 0);
  return { summary, msgCount: msgs.length, updatedAt: new Date().toISOString(), basedOnAt: newest ? new Date(newest).toISOString() : null };
}

// Refresh briefings for contacts with NEW email activity (capped per run).
async function _refreshBriefs(touched, token, selfEmail) {
  const BRIEF_CAP = 12;
  const due = (touched || [])
    .filter(t => t.c && t.c.email && t.newestAt && (!t.c.emailBrief || !t.c.emailBrief.basedOnAt || new Date(t.c.emailBrief.basedOnAt).getTime() < t.newestAt))
    .sort((a, b) => b.newestAt - a.newestAt)
    .slice(0, BRIEF_CAP);
  for (const t of due) {
    try {
      const brief = await _generateContactBrief(t.c, token, selfEmail);
      if (brief) { t.c.emailBrief = brief; await DB.put(STORES.contacts, t.c); }
    } catch (e) { console.warn('[Outlook] brief failed for', t.c.email, e && (e.errorMessage || e.message)); }
  }
  return due.length;
}

// Manual single-contact briefing refresh (from a button on the contact page).
async function refreshContactBrief(contactId) {
  const contact = await DB.get(STORES.contacts, contactId);
  if (!contact?.email) { showToast('This contact has no email address', 'warning'); return; }
  const cfg = await _outlookCfg();
  if (!cfg.clientId || !cfg.account) { showToast('Connect Outlook on the Inbox page first', 'warning'); return; }
  showToast('Building briefing…', 'info');
  try {
    await _getMsal(cfg.clientId, cfg.tenantId);
    const token = await _outlookToken();
    const brief = await _generateContactBrief(contact, token, (cfg.account || '').toLowerCase());
    if (!brief) { showToast('No emails found for this contact', 'warning'); return; }
    contact.emailBrief = brief;
    await DB.put(STORES.contacts, contact);
    showToast('Briefing updated', 'success');
    if (typeof viewContact === 'function') viewContact(contactId);
  } catch (err) {
    showToast('Could not build briefing: ' + (err.errorMessage || err.message || 'error'), 'error');
  }
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

// Create a contact from a recent sender/recipient, then re-sync to attach
// their email history + reply status.
async function addContactFromEmail(email, name) {
  email = (email || '').trim().toLowerCase();
  if (!email) return;
  const all = await DB.getForUser(STORES.contacts, currentUser.id);
  const existing = all.find(c => (c.email || '').toLowerCase() === email);
  if (existing) { showToast('Already a contact', 'info'); if (typeof viewContact === 'function') viewContact(existing.id); return; }
  const fullName = (name && name.trim() && name.trim().toLowerCase() !== email)
    ? name.trim()
    : email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  await DB.add(STORES.contacts, {
    userId: currentUser.id, fullName, email,
    companyId: null, bucket: null, relationshipType: '',
    stage: (typeof STAGES !== 'undefined' && STAGES[0]) || '',
    tags: [], notes: 'Added from email', lastContactDate: null, nextFollowUpDate: null, archived: false,
  });
  showToast(`Added ${fullName} — syncing their emails…`, 'success');
  syncOutlook(); // re-sync so their history + status attach immediately
}

// ── Email briefing panel (contact detail page) ───────────────
function renderContactEmailPanel(contact) {
  if (!contact || !contact.email) return '';
  const es = contact.emailStats || {};
  const brief = contact.emailBrief;
  const fmt = d => d ? (typeof formatRelative === 'function' ? formatRelative(d) : d) : null;
  const lastIn = fmt(es.lastInboundAt);
  const lastOut = fmt(es.lastOutboundAt);
  const statusChip = (typeof renderEmailStatusChip === 'function') ? renderEmailStatusChip(contact) : '';
  const touch = [];
  if (lastIn)  touch.push(`<span><span class="text-surface-400">Last received</span> ${lastIn}</span>`);
  if (lastOut) touch.push(`<span><span class="text-surface-400">Last sent</span> ${lastOut}</span>`);
  if (es.lastSubject) touch.push(`<span class="truncate max-w-xs"><span class="text-surface-400">Subject</span> ${escapeHtml(es.lastSubject)}</span>`);

  return `
    <div class="card mb-6">
      <div class="flex items-center justify-between gap-3 mb-3">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-600">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>
          </span>
          <h3 class="text-sm font-bold">Email briefing</h3>
          ${statusChip}
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button onclick="openEmailAIMenu('${contact.id}')" class="btn-ghost btn-xs text-brand-600" title="Summarize, draft a reply, or talking points">AI actions</button>
          <button onclick="refreshContactBrief('${contact.id}')" class="btn-ghost btn-xs" title="Re-read the thread and refresh the briefing">↻ Refresh</button>
        </div>
      </div>

      ${brief && brief.summary ? `
        <p class="text-sm text-surface-700 dark:text-surface-200 leading-relaxed whitespace-pre-line">${escapeHtml(brief.summary)}</p>
        <p class="text-[11px] text-surface-400 mt-2">AI briefing${brief.msgCount ? ' · ' + brief.msgCount + ' emails' : ''}${brief.updatedAt ? ' · updated ' + fmt(brief.updatedAt) : ''}</p>
      ` : `
        <div class="text-sm text-surface-500 flex items-center justify-between gap-3 flex-wrap">
          <span>${(lastIn || lastOut) ? 'No AI briefing yet for this conversation.' : 'No synced email yet for this contact.'}</span>
          <button onclick="refreshContactBrief('${contact.id}')" class="btn-secondary btn-sm">Generate briefing</button>
        </div>
      `}

      ${touch.length ? `<div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-surface-100 dark:border-surface-800 text-xs text-surface-600 dark:text-surface-300">${touch.join('')}</div>` : ''}
    </div>`;
}

// ── Email hub page ───────────────────────────────────────────
async function renderEmailHub() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-5xl mx-auto">${renderLoadingSkeleton(4)}</div>`;

  const cfg = await _outlookCfg();
  const connected = !!cfg.clientId && !!cfg.account;

  // Re-hydrate MSAL and probe the token silently. If the session expired or this
  // browser has no cached token, we show a Reconnect prompt rather than letting
  // auto-sync fail silently (the usual "it stopped working" cause).
  let tokenOk = false;
  if (cfg.clientId) {
    try { await _getMsal(cfg.clientId, cfg.tenantId); await _outlookToken(true); tokenOk = true; }
    catch (_) { tokenOk = false; }
  }

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
  const autoOn   = cfg.autoSync !== false; // default on
  const nextStr  = _outlookNextSlot(cfg, new Date()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      ${renderPageHeader('Inbox', `Connected as ${escapeHtml(cfg.account)} · last sync ${lastSync}${autoOn ? ` · next ~${nextStr}` : ''}`, `
        <button onclick="toggleOutlookAutoSync()" class="btn-secondary" title="Automatic sync at 8am and 5pm whenever Pulse is open">
          <span class="inline-block w-2 h-2 rounded-full mr-1.5 ${autoOn ? 'bg-green-500' : 'bg-surface-400'}"></span>
          Auto-sync ${autoOn ? 'on' : 'off'}
        </button>
        <button id="outlook-sync-btn" onclick="syncOutlook()" class="btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.023 9.348h4.992V4.356M3.985 19.644V14.65h4.992m-9.97-3.348a8.001 8.001 0 0115.357-2M3.985 14.65a8.001 8.001 0 0015.357 2"/></svg>
          Sync now
        </button>
        <button onclick="disconnectOutlook()" class="btn-ghost text-surface-500 text-sm">Disconnect</button>
      `)}

      ${!tokenOk ? `
        <div class="card mb-5 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-2.5">
            <svg class="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>
            <div>
              <p class="text-sm font-semibold text-amber-800 dark:text-amber-300">Microsoft session expired — auto-sync is paused</p>
              <p class="text-xs text-amber-700 dark:text-amber-400">Your sign-in token is no longer valid on this browser. Reconnect to resume syncing emails.</p>
            </div>
          </div>
          <button onclick="connectOutlook()" class="btn-primary btn-sm flex-shrink-0">Reconnect Microsoft</button>
        </div>
      ` : ''}

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

      ${(cfg.recentActivity && cfg.recentActivity.length) ? `
        <div class="mt-8">
          <div class="flex items-center gap-2 mb-3">
            <h2 class="text-sm font-bold">Recent emails</h2>
            <span class="text-xs text-surface-400">last ${cfg.recentActivity.length} · newest first · everything the sync pulled</span>
          </div>
          <div class="card p-0 divide-y divide-surface-100 dark:divide-surface-800">
            ${cfg.recentActivity.map(r => `
              <div class="flex items-center gap-3 px-4 py-2.5">
                <span class="text-[11px] font-semibold w-8 flex-shrink-0 ${r.dir === 'in' ? 'text-emerald-600' : 'text-surface-400'}">${r.dir === 'in' ? 'IN' : 'OUT'}</span>
                <div class="min-w-0 flex-1">
                  <div class="text-sm truncate"><span class="font-medium">${escapeHtml(r.name || r.email)}</span> <span class="text-xs text-surface-400">${escapeHtml(r.email)}</span></div>
                  <div class="text-xs text-surface-500 truncate">${escapeHtml(r.subject || '(no subject)')}</div>
                </div>
                <span class="text-[11px] text-surface-400 flex-shrink-0 whitespace-nowrap">${r.at ? (typeof formatRelative === 'function' ? formatRelative(r.at) : '') : ''}</span>
                ${r.isContact
                  ? `<span class="text-[11px] text-surface-400 flex-shrink-0">contact</span>`
                  : `<button data-email="${escapeHtml(r.email)}" data-name="${escapeHtml(r.name || '')}" onclick="addContactFromEmail(this.dataset.email, this.dataset.name)" class="btn-secondary btn-xs flex-shrink-0">+ Add</button>`}
              </div>`).join('')}
          </div>
        </div>` : ''}

      <p class="text-xs text-surface-400 mt-8 text-center">
        Read-only. Pulls your last ${_EMAIL_PAGE_SIZE} inbox + sent messages and matches them to contacts by email.
        Email activity also updates each contact's relationship strength.<br>
        ${autoOn
          ? `Auto-sync runs around <b>8am</b> and <b>5pm</b> while Pulse is open, and catches up the next time you open Pulse after a slot. It can't sync a fully closed browser — ask to add server-side background sync for that.`
          : `Auto-sync is off — emails update only when you click <b>Sync now</b>.`}
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
      <button onclick="event.stopPropagation(); openEmailAIMenu('${contact.id}')" class="btn-ghost btn-sm flex-shrink-0 text-brand-600" title="AI: summarize, draft a reply, or talking points">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
      </button>
      ${replyHref ? `<a href="${replyHref}" onclick="event.stopPropagation()" class="btn-secondary btn-sm flex-shrink-0">${dir === 'in' ? 'Reply' : 'Nudge'}</a>` : ''}
    </div>`;
}

// ── Full-body → AI: summarize / draft reply / talking points ──
// Fetches the recent thread (with body) on demand only when you ask — bodies
// are sent to your configured AI provider for the action and are not stored.
async function _outlookFetchThread(email, token, top = 15) {
  const q = encodeURIComponent(`"${email}"`);
  const url = `${GRAPH_BASE}/me/messages?$search=${q}&$top=${top}&$select=subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,body`;
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token, 'Prefer': 'outlook.body-content-type="text"' },
  });
  if (!res.ok) throw new Error(`Graph ${res.status}: ${res.statusText}`);
  return (await res.json()).value || [];
}

function _outlookThreadToText(messages, selfEmail) {
  const msgs = [...messages].sort((a, b) =>
    new Date(a.receivedDateTime || a.sentDateTime || 0) - new Date(b.receivedDateTime || b.sentDateTime || 0));
  return msgs.map(m => {
    const fromAddr = (m.from?.emailAddress?.address || '').toLowerCase();
    const who = fromAddr === selfEmail ? 'You' : (m.from?.emailAddress?.name || fromAddr || 'Them');
    const when = new Date(m.receivedDateTime || m.sentDateTime || 0).toLocaleString();
    let body = (m.body?.content || m.bodyPreview || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (body.length > 3000) body = body.slice(0, 3000) + '…';
    return `=== ${who} · ${when}\nSubject: ${m.subject || '(none)'}\n${body}`;
  }).join('\n\n');
}

function _emailAIPrompt(action, contact, transcript) {
  const name = contact.fullName || 'this contact';
  const base = `You are an executive assistant for a search-fund investor. Below is the recent email conversation with ${name}${contact.title ? ' (' + contact.title + ')' : ''}. Be accurate and only use what is actually in the emails.`;
  if (action === 'draft') return {
    title: `Draft reply to ${name}`, tokens: 1200,
    system: base + ' Draft a reply to their most recent message. Match the existing tone, be concise and professional, and move things forward. Return ONLY the email body — no subject line, no commentary.',
    user: `EMAIL CONVERSATION (oldest first):\n\n${transcript}\n\nWrite my reply now.`,
  };
  if (action === 'talking') return {
    title: `Talking points · ${name}`, tokens: 1000,
    system: base + ' I have an upcoming catch-up. Give concise bullet talking points: where things stand, open threads or unanswered questions, commitments made by either side, and 2-3 good things to raise. Markdown bullets only.',
    user: `EMAIL CONVERSATION (oldest first):\n\n${transcript}\n\nGive me my talking points.`,
  };
  return {
    title: `Conversation summary · ${name}`, tokens: 1100,
    system: base + ' Summarize the conversation: what it is about, key decisions/agreements, current status, and any open items or who owes the next reply. Concise markdown with short sections and bullets.',
    user: `EMAIL CONVERSATION (oldest first):\n\n${transcript}\n\nSummarize it.`,
  };
}

function openEmailAIMenu(contactId) {
  openModal(`
    <div class="p-6" style="max-width: 24rem">
      <h2 class="text-lg font-semibold mb-1">Email AI</h2>
      <p class="text-sm text-surface-500 mb-4">Reads your recent email thread with this contact and runs AI on it.</p>
      <div class="space-y-2">
        <button onclick="outlookEmailAI('${contactId}','summary')" class="btn-secondary w-full">Summarize conversation</button>
        <button onclick="outlookEmailAI('${contactId}','draft')" class="btn-secondary w-full">Draft a reply</button>
        <button onclick="outlookEmailAI('${contactId}','talking')" class="btn-secondary w-full">Talking points for a catch-up</button>
      </div>
      <p class="text-[11px] text-surface-400 mt-4">Email content is sent to your configured AI provider for this action. Nothing is stored unless you save it.</p>
    </div>`);
}

async function outlookEmailAI(contactId, action) {
  const contact = await DB.get(STORES.contacts, contactId);
  if (!contact) { showToast('Contact not found', 'error'); return; }
  if (!contact.email) { showToast('This contact has no email address on file', 'warning'); return; }
  const cfg = await _outlookCfg();
  if (!cfg.clientId || !cfg.account) { showToast('Connect Outlook on the Inbox page first', 'warning'); return; }

  openModal(`<div class="p-8 text-center"><svg class="w-6 h-6 animate-spin mx-auto mb-3 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg><p class="text-sm text-surface-500">Reading your conversation with ${escapeHtml(contact.fullName)}…</p></div>`);

  try {
    await _getMsal(cfg.clientId, cfg.tenantId);
    const token = await _outlookToken();
    const selfEmail = (cfg.account || '').toLowerCase();
    const msgs = await _outlookFetchThread(contact.email, token);
    if (!msgs.length) {
      openModal(`<div class="p-6"><h2 class="text-lg font-semibold mb-2">No emails found</h2><p class="text-sm text-surface-500 mb-4">I couldn't find any emails with ${escapeHtml(contact.email)} in your mailbox.</p><div class="flex justify-end"><button onclick="closeModal()" class="btn-secondary">Close</button></div></div>`);
      return;
    }
    const transcript = _outlookThreadToText(msgs, selfEmail);
    const p = _emailAIPrompt(action, contact, transcript);
    const out = (await callAI(p.system, p.user, p.tokens, 0.4)).trim();

    const replyHref = (action === 'draft' && contact.email)
      ? `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent('Re: ' + ((msgs[0]?.subject || '').replace(/^re:\s*/i, '')))}&body=${encodeURIComponent(out)}`
      : '';

    openModal(`
      <div class="p-6">
        <div class="flex items-center justify-between mb-1 gap-3">
          <h2 class="text-lg font-semibold">${escapeHtml(p.title)}</h2>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/20 font-medium whitespace-nowrap">AI · ${msgs.length} emails</span>
        </div>
        <p class="text-xs text-surface-400 mb-3">Editable — review before you use it.</p>
        <textarea id="email-ai-out" class="input-field w-full font-sans text-sm leading-relaxed" rows="14">${escapeHtml(out)}</textarea>
        <div class="flex justify-end gap-2 mt-4">
          <button onclick="closeModal()" class="btn-ghost text-surface-500">Close</button>
          <button onclick="navigator.clipboard.writeText(document.getElementById('email-ai-out').value); showToast('Copied','success')" class="btn-secondary">Copy</button>
          ${replyHref ? `<a href="${replyHref}" class="btn-primary">Open in email</a>` : ''}
        </div>
      </div>`, { wide: true });
  } catch (err) {
    console.error('[Outlook] email AI failed:', err);
    openModal(`<div class="p-6"><h2 class="text-lg font-semibold mb-2">Couldn't complete</h2><p class="text-sm text-surface-500 mb-4">${escapeHtml(err.errorMessage || err.message || 'Unknown error')}</p><div class="flex justify-end"><button onclick="closeModal()" class="btn-secondary">Close</button></div></div>`);
  }
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
