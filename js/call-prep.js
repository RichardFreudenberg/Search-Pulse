/* ============================================
   Nexus CRM — AI Call Prep Briefing
   ============================================ */

/**
 * Converts simple markdown-like text (from callAI) into HTML.
 * Handles: ## headers, - / * bullet lists, empty lines, plain lines.
 */
function _renderMarkdown(text) {
  if (!text) return '';

  const lines = text.split('\n');
  const parts = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ## Heading
    if (line.startsWith('## ')) {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<h3 class="font-semibold text-base mt-4 mb-1 text-surface-800 dark:text-surface-200">${escapeHtml(line.slice(3).trim())}</h3>`);
      continue;
    }

    // # Heading (single hash — treat same as ##)
    if (line.startsWith('# ')) {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<h3 class="font-semibold text-base mt-4 mb-1 text-surface-800 dark:text-surface-200">${escapeHtml(line.slice(2).trim())}</h3>`);
      continue;
    }

    // Bullet point
    if (line.match(/^[-*]\s/)) {
      if (!inList) { parts.push('<ul class="list-disc list-inside space-y-1 text-sm mb-2 ml-2">'); inList = true; }
      parts.push(`<li>${escapeHtml(line.slice(2).trim())}</li>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      if (inList) { parts.push('</ul>'); inList = false; }
      continue;
    }

    // Regular line
    if (inList) { parts.push('</ul>'); inList = false; }
    parts.push(`<p class="text-sm mb-1">${escapeHtml(line)}</p>`);
  }

  if (inList) parts.push('</ul>');
  return parts.join('\n');
}

/**
 * Opens a modal with an AI-generated call prep briefing for the given contact.
 * @param {string} contactId
 */
async function openCallPrepBriefing(contactId) {
  // ── 1. Immediate loading modal ──────────────────────────────────────────────
  openModal(`
    <div class="p-6 max-w-2xl w-full" style="min-width:520px">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-semibold">Call Prep Briefing</h3>
          <p id="call-prep-modal-subtitle" class="text-xs text-surface-500">Gathering contact data and recent news…</p>
        </div>
      </div>
      <div class="flex items-center justify-center py-12">
        <div class="flex flex-col items-center gap-3">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
          <p class="text-sm text-surface-500">Analyzing contact history and preparing your briefing…</p>
        </div>
      </div>
    </div>
  `);

  // ── 2. Load data in parallel ─────────────────────────────────────────────────
  let contact, allCalls, allNotes, reminders, company;
  let contactNews = [], companyNews = [];
  try {
    // First load the contact so we have the name for news searches
    contact = await DB.get(STORES.contacts, contactId);
    if (!contact) throw new Error('Contact not found.');

    const contactFullName = contact.fullName || '';
    company = contact.companyId ? await DB.get(STORES.companies, contact.companyId).catch(() => null) : null;
    const companyName = company?.name || '';

    // Run all remaining DB loads and both news searches in parallel
    [allCalls, allNotes, reminders, contactNews, companyNews] = await Promise.all([
      DB.getAllByIndex(STORES.calls, 'contactId', contactId).catch(() => []),
      DB.getAllByIndex(STORES.notes, 'contactId', contactId).catch(() => []),
      DB.getAllByIndex(STORES.reminders, 'contactId', contactId).catch(() => []),
      newsSearch(`"${contactFullName}" "${companyName}"`, 3),
      newsSearch(`"${companyName}" news recent`, 3),
    ]);

    // Update loading subtitle now that data is ready
    const subtitle = document.querySelector('#call-prep-modal-subtitle');
    if (subtitle) subtitle.textContent = 'Synthesizing with AI…';
  } catch (err) {
    closeModal();
    openModal(`
      <div class="p-6 max-w-lg w-full">
        <h3 class="text-lg font-semibold mb-2 text-red-600">Error Loading Data</h3>
        <p class="text-sm text-surface-600 dark:text-surface-400 mb-4">${escapeHtml(err.message)}</p>
        <div class="flex justify-end">
          <button onclick="closeModal()" class="btn-secondary">Close</button>
        </div>
      </div>
    `);
    return;
  }

  // ── 3. Sort and trim ─────────────────────────────────────────────────────────
  const recentCalls = (allCalls || [])
    .filter(c => c.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  const recentNotes = (allNotes || [])
    .filter(n => n.createdAt || n.updatedAt)
    .sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt))
    .slice(0, 5);

  const pendingReminders = (reminders || []).filter(r => !r.completed && !r.dismissed);

  // ── 4. Build context string ───────────────────────────────────────────────────
  let context = `CONTACT INFORMATION\n`;
  context += `Name: ${contact.fullName || 'Unknown'}\n`;
  if (contact.title) context += `Title: ${contact.title}\n`;
  if (company) context += `Company: ${company.name}\n`;
  if (contact.stage) context += `Stage: ${contact.stage}\n`;
  if (contact.relationshipType) context += `Relationship Type: ${contact.relationshipType}\n`;
  if (contact.location) context += `Location: ${contact.location}\n`;

  context += `\nCALL HISTORY (recent ${recentCalls.length})\n`;
  if (recentCalls.length === 0) {
    context += `No calls yet.\n`;
  } else {
    for (const call of recentCalls) {
      const dateStr = call.date ? new Date(call.date).toLocaleDateString() : 'Unknown date';
      const durationStr = call.duration ? `${call.duration} min` : 'Duration unknown';
      context += `- ${dateStr} | ${durationStr}`;
      if (call.outcome) context += ` | Outcome: ${call.outcome}`;
      if (call.notes) context += `\n  Summary: ${call.notes.slice(0, 300)}`;
      if (call.nextSteps) context += `\n  Next steps: ${call.nextSteps.slice(0, 200)}`;
      context += `\n`;
    }
  }

  context += `\nRECENT NOTES\n`;
  if (recentNotes.length === 0) {
    context += `No notes yet.\n`;
  } else {
    for (const note of recentNotes) {
      const content = (note.content || note.cleanedContent || '').slice(0, 300);
      const dateStr = note.createdAt ? new Date(note.createdAt).toLocaleDateString() : '';
      context += `- ${dateStr ? '[' + dateStr + '] ' : ''}${content}\n`;
    }
  }

  context += `\nPENDING REMINDERS\n`;
  if (pendingReminders.length === 0) {
    context += `No pending reminders.\n`;
  } else {
    for (const r of pendingReminders) {
      const dueStr = r.dueDate ? new Date(r.dueDate).toLocaleDateString() : 'No due date';
      context += `- ${dueStr}: ${r.title || r.content || 'Reminder'}\n`;
    }
  }

  // ── 4b. Append news sections ──────────────────────────────────────────────────
  context += `\n=== RECENT NEWS ===\n`;
  if (contactNews && contactNews.length > 0) {
    context += contactNews.map(n => `- ${n.title} (${n.publishedDate})\n  ${n.snippet}`).join('\n');
    context += '\n';
  } else {
    context += `No recent news found.\n`;
  }

  context += `\n=== COMPANY NEWS ===\n`;
  if (companyNews && companyNews.length > 0) {
    context += companyNews.map(n => `- ${n.title} (${n.publishedDate})\n  ${n.snippet}`).join('\n');
    context += '\n';
  } else {
    context += `No recent news found.\n`;
  }

  // ── 5. Call AI ────────────────────────────────────────────────────────────────
  let rawAiOutput = '';
  try {
    rawAiOutput = await callAI(
      'You are an expert assistant helping a Search Fund entrepreneur prepare for a call. Generate a structured briefing with these exact sections: ## Relationship Context, ## Last Discussed, ## Suggested Talking Points, ## Questions to Ask, ## Things to Avoid. Be concise and specific. Use bullet points.',
      context,
      1200,
      0.3
    );
  } catch (err) {
    closeModal();
    openModal(`
      <div class="p-6 max-w-lg w-full">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold">AI Error</h3>
            <p class="text-xs text-surface-500">Could not generate briefing</p>
          </div>
        </div>
        <p class="text-sm text-surface-600 dark:text-surface-400 mb-4">${escapeHtml(err.message)}</p>
        <div class="flex justify-end">
          <button onclick="closeModal()" class="btn-secondary">Close</button>
        </div>
      </div>
    `);
    return;
  }

  // ── 6. Render result modal ────────────────────────────────────────────────────
  const contactName = escapeHtml(contact.fullName || 'Contact');
  const companyLabel = company ? escapeHtml(company.name) : (contact.title ? escapeHtml(contact.title) : 'Call Prep');
  const renderedContent = _renderMarkdown(rawAiOutput);

  // Store raw for clipboard
  const safeRaw = rawAiOutput.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  closeModal();
  openModal(`
    <div class="p-6 max-w-2xl w-full" style="min-width:520px">
      <div class="flex items-center gap-3 mb-5">
        <div class="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-semibold">Call Prep: ${contactName}</h3>
          <p class="text-xs text-surface-500">${companyLabel}</p>
        </div>
      </div>

      <div class="overflow-y-auto max-h-[60vh] pr-1 mb-5 text-surface-700 dark:text-surface-300">
        ${renderedContent}
      </div>

      <div class="flex justify-between items-center pt-4 border-t border-surface-200 dark:border-surface-700">
        <button
          onclick="(function(){
            const raw = \`${safeRaw}\`;
            navigator.clipboard.writeText(raw)
              .then(() => showToast('Briefing copied to clipboard', 'success'))
              .catch(() => showToast('Copy failed — please select and copy manually', 'error'));
          })()"
          class="btn-secondary flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          Copy to Clipboard
        </button>
        <button onclick="closeModal()" class="btn-primary">Close</button>
      </div>
    </div>
  `);
}
