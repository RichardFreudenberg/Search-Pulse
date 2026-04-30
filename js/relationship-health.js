/* ============================================================
   Pulse — AI Relationship Health Monitor  (Feature 2)
   Scores every contact by recency & relationship type,
   surfaces who needs a re-engagement nudge, and drafts a
   personalised check-in message with AI.
   ============================================================ */

// Re-engagement windows (days) per relationship type
const RH_WINDOWS = {
  'Broker / Intermediary':   21,
  'Seller / Business Owner': 14,
  'LP / Investor':           45,
  'Advisor / Mentor':        30,
  'Operator / Executive':    30,
  'Investment Banker':       21,
  'Fellow Searcher':         45,
  'Attorney / Accountant':   60,
  'Other':                   45,
};

function _rhScore(contact) {
  const windowDays = RH_WINDOWS[contact.relationshipType] || 45;
  const last = contact.lastContactDate ? new Date(contact.lastContactDate) : null;
  const daysSince = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : 999;
  const ratio = daysSince / windowDays;   // >1 = overdue

  let status, label, color;
  if (ratio <= 0.6)       { status = 'healthy'; label = 'Healthy';  color = 'green'; }
  else if (ratio <= 1.0)  { status = 'warm';    label = 'Warm';     color = 'yellow'; }
  else if (ratio <= 2.0)  { status = 'cold';    label = 'Cold';     color = 'orange'; }
  else                    { status = 'dormant'; label = 'Dormant';  color = 'red'; }

  return { daysSince, windowDays, ratio, status, label, color };
}

async function openRelationshipHealthModal() {
  openModal('💬 Relationship Health Monitor', `
    <div class="p-6">
      <div id="rh-loading" class="flex items-center gap-3 py-8 justify-center">
        <svg class="animate-spin w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <span class="text-sm text-surface-500">Analysing relationship health…</span>
      </div>
      <div id="rh-content" class="hidden"></div>
    </div>
  `, [{ label: 'Close', onclick: 'closeModal()', class: 'btn-secondary' }]);

  try {
    await _runRelationshipHealth();
  } catch (err) {
    const el = document.getElementById('rh-loading');
    if (el) el.innerHTML = `<p class="text-sm text-red-500 text-center">${escapeHtml(err.message)}</p>`;
  }
}

async function _runRelationshipHealth() {
  const loadingEl = document.getElementById('rh-loading');
  const contentEl = document.getElementById('rh-content');

  const contacts = await DB.getAll(STORES.contacts);
  const mine = contacts.filter(c => c.userId === currentUser.id);

  if (mine.length === 0) {
    if (loadingEl) loadingEl.innerHTML = '<p class="text-sm text-surface-500 text-center">No contacts yet.</p>';
    return;
  }

  // Score every contact
  const scored = mine.map(c => ({ contact: c, score: _rhScore(c) }))
    .sort((a, b) => b.score.ratio - a.score.ratio);   // worst first

  const groups = {
    dormant: scored.filter(x => x.score.status === 'dormant'),
    cold:    scored.filter(x => x.score.status === 'cold'),
    warm:    scored.filter(x => x.score.status === 'warm'),
    healthy: scored.filter(x => x.score.status === 'healthy'),
  };

  const needsAttention = [...groups.dormant, ...groups.cold].slice(0, 10);

  // Summary bar
  const colorMap = { healthy: '#22c55e', warm: '#eab308', cold: '#f97316', dormant: '#ef4444' };
  const summaryBar = `
    <div class="flex gap-2 flex-wrap mb-5">
      ${Object.entries(groups).map(([k, arr]) => arr.length ? `
        <span class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
              style="background:${colorMap[k]}20;color:${colorMap[k]}">
          <span class="w-2 h-2 rounded-full inline-block" style="background:${colorMap[k]}"></span>
          ${arr.length} ${k.charAt(0).toUpperCase() + k.slice(1)}
        </span>` : '').join('')}
    </div>`;

  if (needsAttention.length === 0) {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) {
      contentEl.innerHTML = `${summaryBar}<p class="text-sm text-green-600 text-center py-4">🎉 All relationships are healthy — great work!</p>`;
      contentEl.classList.remove('hidden');
    }
    return;
  }

  // Render the list first, then stream in AI messages
  const rows = needsAttention.map(({ contact: c, score: s }) => {
    const lastStr = c.lastContactDate ? formatRelative(c.lastContactDate) : 'Never contacted';
    const badgeStyle = `background:${colorMap[s.status]}20;color:${colorMap[s.status]}`;
    return `
      <div class="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden mb-3" id="rh-card-${c.id}">
        <div class="flex items-center gap-3 p-3">
          <div class="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-brand-600 font-semibold text-sm flex-shrink-0">
            ${c.photoUrl ? `<img src="${escapeHtml(c.photoUrl)}" class="w-9 h-9 rounded-full object-cover" />` : escapeHtml((c.name || '?')[0].toUpperCase())}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-medium">${escapeHtml(c.name)}</span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="${badgeStyle}">${s.label}</span>
            </div>
            <div class="text-xs text-surface-400 mt-0.5">
              ${c.relationshipType ? escapeHtml(c.relationshipType) + ' · ' : ''}${lastStr}
              ${s.daysSince < 999 ? ` · ${s.daysSince}d ago (window: ${s.windowDays}d)` : ''}
            </div>
          </div>
          <button onclick="closeModal(); openContactDetail('${c.id}')" class="btn-secondary btn-sm flex-shrink-0">View</button>
        </div>
        <div class="px-3 pb-3" id="rh-msg-${c.id}">
          <div class="flex items-center gap-2 text-xs text-surface-400 py-1">
            <svg class="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            Drafting message…
          </div>
        </div>
      </div>`;
  }).join('');

  if (loadingEl) loadingEl.classList.add('hidden');
  if (contentEl) {
    contentEl.innerHTML = `
      ${summaryBar}
      <p class="text-xs text-surface-400 mb-4">Contacts most overdue for a check-in — AI is drafting personalised messages.</p>
      ${rows}`;
    contentEl.classList.remove('hidden');
  }

  // Fetch recent call notes per contact for AI context, then generate messages
  const calls = await DB.getAll(STORES.calls);
  const notes = await DB.getAll(STORES.notes);

  for (const { contact: c } of needsAttention) {
    const msgEl = document.getElementById(`rh-msg-${c.id}`);
    if (!msgEl) continue;

    try {
      const recentCalls = calls
        .filter(cl => cl.contactId === c.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 2);
      const recentNotes = notes
        .filter(n => n.contactId === c.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 1);

      const context = [
        ...recentCalls.map(cl => `Call (${formatDate(cl.date)}): ${(cl.summary || cl.notes || '').slice(0, 200)}`),
        ...recentNotes.map(n => `Note: ${(n.content || '').slice(0, 200)}`),
      ].join('\n') || 'No previous interaction notes available.';

      const msg = await callAI(
        `You are helping a search fund searcher write a warm, brief check-in message to a contact they haven't spoken to in a while.
The message should feel personal and natural — NOT a sales email.
It should reference something specific from their last interaction if available.
Maximum 3 sentences. No subject line. No formal greeting like "Dear". Start with their first name.`,
        `Contact: ${c.name}
Role: ${c.relationshipType || 'Contact'}
Company: ${c.company || 'Unknown'}
Last interaction context:\n${context}

Write a short, warm check-in message.`,
        200, 0.7
      );

      msgEl.innerHTML = `
        <div class="bg-surface-50 dark:bg-surface-800 rounded p-2.5 text-xs text-surface-600 dark:text-surface-300 leading-relaxed italic">
          "${escapeHtml(msg.trim())}"
        </div>
        <div class="flex gap-2 mt-2">
          <button onclick="navigator.clipboard.writeText(${JSON.stringify(msg.trim())}); showToast('Copied!','success')"
                  class="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            Copy message
          </button>
        </div>`;
    } catch {
      msgEl.innerHTML = `<p class="text-xs text-surface-400">Could not generate message — check your AI API key in Settings.</p>`;
    }
  }
}
