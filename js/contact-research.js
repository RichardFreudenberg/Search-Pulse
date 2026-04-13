/* ============================================
   Nexus CRM — AI Contact Research (Jina.ai)
   ============================================ */

/**
 * Searches public web data for personal information about a contact,
 * then synthesizes it with AI into a structured personal profile.
 * @param {string} contactId
 */
async function openContactResearch(contactId) {
  // ── 1. Load contact first so we can show their name immediately ──────────────
  let contact;
  try {
    contact = await DB.get(STORES.contacts, contactId);
    if (!contact) throw new Error('Contact not found.');
  } catch (err) {
    showToast('Contact not found', 'error');
    return;
  }

  const contactName = escapeHtml(contact.fullName || 'Contact');

  // ── 2. Show loading modal ─────────────────────────────────────────────────────
  openModal(`
    <div class="p-6 max-w-2xl w-full" style="min-width:520px">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-semibold">Researching ${contactName}…</h3>
          <p class="text-xs text-surface-500">Searching public web data</p>
        </div>
      </div>
      <div class="flex items-center justify-center py-12">
        <div class="flex flex-col items-center gap-3">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p class="text-sm text-surface-500">Searching the web and synthesizing results…</p>
        </div>
      </div>
    </div>
  `);

  // ── 3. Load company ───────────────────────────────────────────────────────────
  const company = contact.companyId
    ? await DB.get(STORES.companies, contact.companyId).catch(() => null)
    : null;

  // ── 4. Build search query ─────────────────────────────────────────────────────
  const nameQuoted = `"${contact.fullName}"`;
  const orgPart = company?.name
    ? `"${company.name}"`
    : contact.title
      ? `"${contact.title}"`
      : '';
  const query = [nameQuoted, orgPart, 'personal background hobbies interests'].filter(Boolean).join(' ');

  // ── 5. Fetch from Jina.ai ─────────────────────────────────────────────────────
  let searchResults = '';
  try {
    const jinaUrl = `https://s.jina.ai/${encodeURIComponent(query)}`;
    const resp = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain' },
    });
    if (resp.ok) {
      const text = await resp.text();
      searchResults = text ? text.slice(0, 3000) : '';
    }
  } catch (fetchErr) {
    // Silently fall through — we'll use the fallback context
    searchResults = '';
  }

  // ── 6. Fallback if no useful results ─────────────────────────────────────────
  const hasResults = searchResults && searchResults.trim().length > 80;
  if (!hasResults) {
    searchResults = [
      `Name: ${contact.fullName}`,
      company ? `Company: ${company.name}` : '',
      contact.title ? `Title: ${contact.title}` : '',
      contact.location ? `Location: ${contact.location}` : '',
    ].filter(Boolean).join('\n');
  }

  // ── 7. Call AI ────────────────────────────────────────────────────────────────
  let rawAiOutput = '';
  try {
    rawAiOutput = await callAI(
      'You are an assistant helping a Search Fund entrepreneur build a personal connection with a contact before a call. Based on search results, extract and summarize personal information. Respond with these exact sections: ## Personal Background, ## Family & Personal Life, ## Hobbies & Interests, ## Career Journey, ## Conversation Starters. If information is not found for a section, say \'Not found publicly\'. Always note which details are inferred vs confirmed. Keep it professional and respectful.',
      `Research results for ${contact.fullName}:\n\n${searchResults}`,
      1000,
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
            <p class="text-xs text-surface-500">Could not generate research profile</p>
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

  // ── 8. Render result modal ────────────────────────────────────────────────────
  const renderedContent = _renderMarkdown(rawAiOutput);
  const companyLabel = company ? escapeHtml(company.name) : (contact.title ? escapeHtml(contact.title) : 'Personal Research');

  // Escape raw for use in inline onclick (same approach as call-prep.js)
  const safeRaw = rawAiOutput.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  // Encode contactId for inline onclick
  const safeContactId = escapeHtml(contactId);

  closeModal();
  openModal(`
    <div class="p-6 max-w-2xl w-full" style="min-width:520px">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-semibold">Research: ${contactName}</h3>
          <p class="text-xs text-surface-500">${companyLabel}</p>
        </div>
      </div>

      <!-- Disclaimer banner -->
      <div class="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 mb-4 text-xs text-amber-800 dark:text-amber-300">
        <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
        </svg>
        <span>AI-generated from public web data. Verify before use. Treat with discretion.</span>
      </div>

      <!-- Scrollable content -->
      <div class="overflow-y-auto max-h-[55vh] pr-1 mb-5 text-surface-700 dark:text-surface-300">
        ${renderedContent}
      </div>

      <div class="flex justify-between items-center pt-4 border-t border-surface-200 dark:border-surface-700">
        <button
          onclick="(async function(){
            try {
              const noteContent = 'Personal Research:\\n\\n' + \`${safeRaw}\`;
              await DB.add(STORES.notes, {
                id: generateId(),
                userId: currentUser.id,
                contactId: '${safeContactId}',
                content: noteContent,
                cleanedContent: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              showToast('Research saved to notes', 'success');
            } catch(e) {
              showToast('Failed to save note: ' + e.message, 'error');
            }
          })()"
          class="btn-secondary flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Save to Notes
        </button>
        <button onclick="closeModal()" class="btn-primary">Close</button>
      </div>
    </div>
  `);
}
