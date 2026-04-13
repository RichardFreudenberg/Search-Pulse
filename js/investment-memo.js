/* ============================================
   Nexus CRM — Investment Memo Generator
   ============================================ */

const MEMO_SYSTEM_PROMPT =
  'You are an experienced Search Fund investment analyst. Write a professional 1-2 page investment memo ' +
  'for a potential acquisition target. Use these sections: ## Executive Summary, ## Business Overview, ' +
  '## Financial Snapshot, ## Investment Thesis, ## Key Risks & Mitigants, ## Open Questions & Next Steps. ' +
  'Be analytical and crisp. Flag any missing data explicitly.';

/* ─── Helper: copy text to clipboard ───────────────────────────────────────── */
function _memoClipboard(text) {
  navigator.clipboard.writeText(text).then(
    () => showToast('Copied to clipboard', 'success'),
    () => showToast('Could not copy — please select and copy manually', 'error')
  );
}

/* ─── Helper: render the result modal contents ─────────────────────────────── */
function _memoResultHtml(title, badgeLabel, rawOutput, showSaveButton, dealId) {
  const saveBtn = showSaveButton
    ? `<button
         class="btn-secondary"
         onclick="window._memoSaveNote(${JSON.stringify(dealId)}, ${JSON.stringify(rawOutput)})">
         Save as Deal Note
       </button>`
    : '';

  return `
    <div class="p-6">
      <div class="flex items-start justify-between gap-4 mb-5">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <h2 class="text-lg font-semibold truncate">${escapeHtml(title)}</h2>
          <span class="badge bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 shrink-0">
            ${escapeHtml(badgeLabel)}
          </span>
        </div>
        <button onclick="closeModal()" class="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="prose prose-sm dark:prose-invert max-w-none bg-surface-50 dark:bg-surface-800/50 rounded-xl p-4 mb-5 overflow-y-auto" style="max-height:55vh;">
        ${_renderMarkdown(rawOutput)}
      </div>

      <div class="flex justify-end gap-3 pt-2">
        ${saveBtn}
        <button
          class="btn-secondary"
          onclick="window._memoClipboardProxy()">
          Copy
        </button>
        <button onclick="closeModal()" class="btn-primary">Close</button>
      </div>
    </div>
  `;
}

/* Proxy so we can easily swap the text without closing the modal */
window._memoCurrentRaw = '';
window._memoClipboardProxy = () => _memoClipboard(window._memoCurrentRaw);

/* ─── Helper: save note to DB ──────────────────────────────────────────────── */
window._memoSaveNote = async function (dealId, content) {
  try {
    await DB.add(STORES.dealNotes, {
      id: generateId(),
      userId: currentUser.id,
      dealId,
      content,
      type: 'ai-memo',
      createdAt: new Date().toISOString(),
    });
    showToast('Memo saved as deal note', 'success');
  } catch (err) {
    showToast('Failed to save note: ' + err.message, 'error');
  }
};

/* ─── Function A: openDealMemo(dealId) ─────────────────────────────────────── */
async function openDealMemo(dealId) {
  // 1. Immediate loading modal
  openModal(`
    <div class="p-8 flex flex-col items-center gap-4">
      <div class="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full"></div>
      <div class="text-center">
        <h3 class="font-semibold text-base mb-1">Generating Investment Memo</h3>
        <p id="deal-memo-modal-subtitle" class="text-sm text-surface-500">Analyzing deal data…</p>
      </div>
    </div>
  `);

  try {
    // 2. Load deal + notes
    const deal = await DB.get(STORES.deals, dealId);
    if (!deal) throw new Error('Deal not found');

    const allNotes = await DB.getAllByIndex(STORES.dealNotes, 'dealId', dealId);
    // Filter to current user's notes and take last 5
    const userNotes = (allNotes || [])
      .filter(n => n.userId === currentUser.id)
      .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
      .slice(-5);

    // 3. Build context string
    let context = `## Deal: ${deal.name || 'Unknown'}\n\n`;

    // Company info
    if (deal.sector)        context += `**Sector:** ${deal.sector}\n`;
    if (deal.location)      context += `**Location:** ${deal.location}\n`;
    if (deal.website)       context += `**Website:** ${deal.website}\n`;
    if (deal.description)   context += `**Description:** ${deal.description}\n`;
    if (deal.businessType)  context += `**Business Type:** ${deal.businessType}\n`;

    // Financials
    if (deal.revenue)       context += `**Revenue:** $${Number(deal.revenue).toLocaleString()}\n`;
    if (deal.ebitda)        context += `**EBITDA:** $${Number(deal.ebitda).toLocaleString()}\n`;
    if (deal.askingPrice || deal.askPrice)
                            context += `**Asking Price:** $${Number(deal.askingPrice || deal.askPrice).toLocaleString()}\n`;
    if (deal.askingMultiple || deal.multiple)
                            context += `**Multiple:** ${deal.askingMultiple || deal.multiple}x EBITDA\n`;
    if (deal.yearsFounded)  context += `**Founded:** ${deal.yearsFounded}\n`;
    if (deal.employeeCount || deal.employees)
                            context += `**Employees:** ${deal.employeeCount || deal.employees}\n`;

    // Deal info
    if (deal.stage)         context += `**Stage:** ${deal.stage}\n`;
    if (deal.priority)      context += `**Priority:** ${deal.priority}\n`;
    if (deal.score != null) context += `**Score:** ${deal.score}/10\n`;
    if (deal.ownerProfile)  context += `\n**Owner Profile:** ${deal.ownerProfile}\n`;

    // Notes
    if (userNotes.length > 0) {
      context += `\n## Recent Notes\n`;
      for (const note of userNotes) {
        const snippet = (note.content || '').slice(0, 400);
        context += `- ${snippet}${note.content && note.content.length > 400 ? '…' : ''}\n`;
      }
    }

    // 4. Fetch real-world web context
    const memoSubtitle = document.querySelector('#deal-memo-modal-subtitle');
    if (memoSubtitle) memoSubtitle.textContent = 'Researching company…';

    const companyContext = await researchCompany(
      deal.name || deal.companyName || '',
      deal.website || '',
      deal.sector || ''
    );

    context += `\n=== REAL-WORLD WEB RESEARCH ===\n${companyContext}`;

    if (memoSubtitle) memoSubtitle.textContent = 'Writing memo…';

    // 5. Call AI
    const rawOutput = await callAI(MEMO_SYSTEM_PROMPT, context, 2500, 0.2);

    // 5. Re-render modal with result
    window._memoCurrentRaw = rawOutput;
    const modalContent = document.getElementById('modal-content');
    if (modalContent) {
      modalContent.innerHTML = _memoResultHtml(
        deal.name || 'Deal',
        'Investment Memo',
        rawOutput,
        true,   // showSaveButton
        dealId
      );
    }
  } catch (err) {
    const modalContent = document.getElementById('modal-content');
    if (modalContent) {
      modalContent.innerHTML = `
        <div class="p-6">
          <h3 class="font-semibold text-base mb-2">Error Generating Memo</h3>
          <p class="text-sm text-red-600 dark:text-red-400 mb-4">${escapeHtml(err.message)}</p>
          <div class="flex justify-end">
            <button onclick="closeModal()" class="btn-primary">Close</button>
          </div>
        </div>
      `;
    }
  }
}

/* ─── Function B: openCompanyMemoTool() ────────────────────────────────────── */
function openCompanyMemoTool() {
  openModal(`
    <div class="p-6">
      <div class="mb-5">
        <h2 class="text-lg font-semibold">Company Investment Memo</h2>
        <p class="text-sm text-surface-500 mt-1">Generate a memo from any company website</p>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Company Website URL</label>
          <input
            id="memo-tool-url"
            type="url"
            class="input-field"
            placeholder="https://company.com"
          />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Company Name <span class="text-surface-400 font-normal">(optional)</span></label>
          <input
            id="memo-tool-name"
            type="text"
            class="input-field"
            placeholder="Acme Industries"
          />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Additional Context</label>
          <textarea
            id="memo-tool-context"
            class="input-field"
            rows="3"
            placeholder="e.g. revenue ~$5M, EBITDA ~$800K, asking $4M, owner retiring…"
          ></textarea>
        </div>
      </div>

      <div class="flex justify-end gap-3 mt-6">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button
          id="memo-tool-btn"
          onclick="_fetchAndGenerateMemo()"
          class="btn-primary">
          Generate Memo
        </button>
      </div>
    </div>
  `);
}

/* ─── Step 2: fetch site + generate ────────────────────────────────────────── */
async function _fetchAndGenerateMemo() {
  const urlInput     = document.getElementById('memo-tool-url');
  const nameInput    = document.getElementById('memo-tool-name');
  const ctxInput     = document.getElementById('memo-tool-context');
  const btn          = document.getElementById('memo-tool-btn');

  const url               = (urlInput?.value || '').trim();
  const companyName       = (nameInput?.value || '').trim();
  const additionalContext = (ctxInput?.value || '').trim();

  if (!url && !companyName) {
    showToast('Please enter a website URL or company name', 'warning');
    return;
  }

  // Loading state
  if (btn) {
    btn.disabled    = true;
    btn.innerHTML   = `
      <span class="inline-flex items-center gap-2">
        <span class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
        Researching…
      </span>
    `;
  }

  // Switch to a full-screen loading modal so the subtitle can be updated
  closeModal();
  openModal(`
    <div class="p-8 flex flex-col items-center gap-4">
      <div class="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full"></div>
      <div class="text-center">
        <h3 class="font-semibold text-base mb-1">Generating Investment Memo</h3>
        <p id="fetch-memo-modal-subtitle" class="text-sm text-surface-500">Researching company…</p>
      </div>
    </div>
  `);

  const companyNameInput = companyName;

  // Fetch website content and news in parallel
  const [websiteText, newsResults] = await Promise.all([
    url ? readUrl(url, { maxChars: 4000, cacheType: 'company' }) : Promise.resolve(''),
    newsSearch(`"${companyNameInput || url}" recent news`, 4),
  ]);

  // Update subtitle before AI call
  const fetchSubtitle = document.querySelector('#fetch-memo-modal-subtitle');
  if (fetchSubtitle) fetchSubtitle.textContent = 'Writing memo…';

  // Build user prompt
  let userPrompt = '';
  if (companyNameInput) userPrompt += `Company: ${companyNameInput}\n\n`;

  userPrompt += `Company website content:\n${websiteText || 'Could not read website.'}\n\n`;

  userPrompt += `Recent news:\n${
    newsResults && newsResults.length > 0
      ? newsResults.map(n => `- ${n.title}: ${n.snippet}`).join('\n')
      : 'No recent news found.'
  }\n\n`;

  if (additionalContext) {
    userPrompt += `Additional context provided by user:\n${additionalContext}`;
  }

  try {
    const rawOutput = await callAI(MEMO_SYSTEM_PROMPT, userPrompt, 2500, 0.2);

    window._memoCurrentRaw = rawOutput;

    // Re-open result modal (no save button for ad-hoc tool)
    const title = companyNameInput || (url ? new URL(url).hostname.replace(/^www\./, '') : 'Company');
    closeModal();
    openModal(_memoResultHtml(title, 'Investment Memo', rawOutput, false, null), { wide: true });
  } catch (err) {
    closeModal();
    openModal(`
      <div class="p-6 max-w-lg w-full">
        <h3 class="font-semibold text-base mb-2">Error Generating Memo</h3>
        <p class="text-sm text-red-600 dark:text-red-400 mb-4">${escapeHtml(err.message)}</p>
        <div class="flex justify-end">
          <button onclick="closeModal()" class="btn-primary">Close</button>
        </div>
      </div>
    `);
  }
}
