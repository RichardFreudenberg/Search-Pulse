/* ============================================
   SearchPulse CRM — AI Diligence Gap Finder
   Generates a dynamic checklist based on deal
   stage, uploaded documents, and deal data.
   Flags missing items and suggests follow-up
   questions. Presented as decision support only.
   ============================================ */

// ── Base checklist template by item type ──────────────────────────────────
const GAP_CHECKLIST_TEMPLATE = [
  // Documents
  { id: 'cim',        category: 'Documents',    label: 'CIM / Teaser received',             required: true,  check: (docs) => docs.some(d => d.docType === 'cim' || d.docType === 'teaser') },
  { id: 'financials', category: 'Documents',    label: '3-year P&L statements',              required: true,  check: (docs) => docs.some(d => d.docType === 'financials') },
  { id: 'qoe',        category: 'Documents',    label: 'Quality of Earnings (QoE) report',   required: false, check: (docs) => docs.some(d => d.docType === 'qoe') },
  { id: 'tax',        category: 'Documents',    label: 'Tax returns (2–3 years)',            required: false, check: (docs) => docs.some(d => d.docType === 'tax') },
  { id: 'legal',      category: 'Documents',    label: 'Legal structure / cap table',        required: false, check: (docs) => docs.some(d => d.docType === 'legal') },
  { id: 'model',      category: 'Documents',    label: 'Financial model / projections',      required: false, check: (docs) => docs.some(d => d.docType === 'model') },
  { id: 'customer',   category: 'Documents',    label: 'Customer list with concentrations',  required: false, check: (docs) => docs.some(d => d.docType === 'customer') },
  // Financial data
  { id: 'revenue',    category: 'Financials',   label: 'Revenue entered on deal',            required: true,  check: (_, deal) => !!(deal.revenue) },
  { id: 'ebitda',     category: 'Financials',   label: 'EBITDA entered on deal',             required: true,  check: (_, deal) => !!(deal.ebitda) },
  { id: 'price',      category: 'Financials',   label: 'Asking price / valuation known',     required: false, check: (_, deal) => !!(deal.askingPrice || deal.askingMultiple) },
  { id: 'growth',     category: 'Financials',   label: 'Revenue growth rate noted',          required: false, check: (docs, deal) => !!(deal.description?.match(/\d+%.*growth|growth.*\d+%/i)) },
  // Deal info
  { id: 'sector',     category: 'Deal Info',    label: 'Sector / industry categorized',      required: true,  check: (_, deal) => !!(deal.sector) },
  { id: 'location',   category: 'Deal Info',    label: 'Business location confirmed',        required: false, check: (_, deal) => !!(deal.location) },
  { id: 'employees',  category: 'Deal Info',    label: 'Employee count noted',               required: false, check: (_, deal) => !!(deal.employees) },
  { id: 'owner',      category: 'Deal Info',    label: 'Ownership / seller situation described', required: false, check: (_, deal) => !!(deal.description?.length > 50) },
  { id: 'thesis',     category: 'Deal Info',    label: 'Investment thesis written',          required: false, check: (_, deal) => !!(deal.thesis?.length > 20) },
  { id: 'concern',    category: 'Deal Info',    label: 'Key concerns / red flags noted',     required: false, check: (_, deal) => !!(deal.concerns?.length) },
  // Contacts
  { id: 'contact',    category: 'Relationships',label: 'At least one deal contact linked',   required: false, check: (_, deal, contacts) => contacts.length > 0 },
  // Process
  { id: 'nda',        category: 'Process',      label: 'NDA signed / under review',          required: false, check: (docs) => docs.some(d => d.docType === 'legal' && (d.fileName||'').toLowerCase().includes('nda')) },
  { id: 'loi',        category: 'Process',      label: 'LOI / term sheet sent or received',  required: false, check: (_, deal) => ['LOI Signed', 'Exclusivity', 'Closing'].includes(deal.stage) },
];

// ── AI management questions generator ─────────────────────────────────────
async function generateManagementQuestions(deal, missingItems) {
  const missingLabels = missingItems.map(i => i.label).join(', ');
  const prompt = `You are a search fund analyst helping prepare for a management meeting.

Deal: ${deal.name}
Sector: ${deal.sector || 'Unknown'}
Revenue: ${deal.revenue ? '$' + (deal.revenue/1e6).toFixed(1) + 'M' : 'Unknown'}
EBITDA: ${deal.ebitda ? '$' + (deal.ebitda/1e6).toFixed(1) + 'M' : 'Unknown'}
Stage: ${deal.stage}
Description: ${(deal.description || '').substring(0, 400)}

Missing diligence items: ${missingLabels || 'None identified'}

Generate exactly 10 sharp, specific management questions that:
1. Address the missing diligence items above
2. Probe customer concentration, recurring revenue, and key-man risk
3. Uncover owner motivation and deal timeline
4. Explore growth drivers and competitive moat
5. Identify off-balance-sheet liabilities or legal risks

Format as a numbered JSON array of strings. Return ONLY valid JSON like:
["Question 1", "Question 2", ...]`;

  try {
    const raw = await callAI(
      'You are a search fund analyst. Return ONLY a JSON array of strings. No markdown, no explanation.',
      prompt, 800, 0.4
    );
    const cleaned = raw.replace(/```json?/g, '').replace(/```/g, '').trim();
    const questions = JSON.parse(cleaned);
    if (Array.isArray(questions)) return questions.slice(0, 12);
    return [];
  } catch (e) {
    return [
      'What percentage of revenue comes from your top 3 customers?',
      'How long have your top customers been with the business?',
      'What is your customer churn / retention rate?',
      'Why are you selling the business at this time?',
      'What is the revenue breakdown by product/service line?',
      'Who are the key employees and how are they retained?',
      'What is the growth rate over the last 3 years?',
      'Are there any pending legal disputes or regulatory issues?',
      'What capital expenditures are required to maintain/grow the business?',
      'How much of revenue is recurring vs. project-based?',
    ];
  }
}

// ── Main renderer ──────────────────────────────────────────────────────────
async function renderDealGapFinderTab() {
  const deal = await DB.get(STORES.deals, currentDealId);
  if (!deal) return '<div class="empty-state"><p>Deal not found.</p></div>';

  const [docs, contacts] = await Promise.all([
    DB.getAllByIndex(STORES.dealDocuments, 'dealId', currentDealId).then(r => r.filter(x => x.userId === currentUser.id)).catch(() => []),
    DB.getAllByIndex(STORES.dealNotes, 'dealId', currentDealId).then(r => r.filter(x => x.userId === currentUser.id)).catch(() => []),
  ]);

  // Evaluate checklist
  const items = GAP_CHECKLIST_TEMPLATE.map(item => ({
    ...item,
    done: item.check(docs, deal, contacts),
  }));

  const missing    = items.filter(i => !i.done);
  const completed  = items.filter(i => i.done);
  const criticalMissing = missing.filter(i => i.required);
  const pct = Math.round((completed.length / items.length) * 100);

  const categoryOrder = ['Documents', 'Financials', 'Deal Info', 'Relationships', 'Process'];
  const byCategory = categoryOrder.map(cat => ({
    cat,
    items: items.filter(i => i.category === cat),
  }));

  const checkIcon = (done, required) => done
    ? `<span class="inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0" style="background:var(--green)"><svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4.5 12.75l6 6 9-13.5"/></svg></span>`
    : required
    ? `<span class="inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 border-2 border-red-400"><span class="w-2 h-2 rounded-full bg-red-400"></span></span>`
    : `<span class="inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 border-2" style="border-color:var(--border-subtle)"></span>`;

  let questionsHtml = `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold">Suggested Management Questions</h3>
        <button onclick="loadManagementQuestions('${currentDealId}')" class="btn-secondary btn-sm flex items-center gap-2" id="load-questions-btn">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
          Generate with AI
        </button>
      </div>
      <div id="management-questions-output">
        <p class="text-sm text-surface-500">Click "Generate with AI" to get deal-specific management questions based on gaps above.</p>
      </div>
    </div>
  `;

  return `
    <div class="space-y-6 animate-fade-in">
      <!-- Header / progress -->
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="text-sm font-semibold">Diligence Readiness</h3>
            <p class="text-xs text-surface-500 mt-0.5">${completed.length} of ${items.length} items complete</p>
          </div>
          <span class="text-2xl font-bold tabular-nums" style="color:${pct>=75?'var(--green)':pct>=40?'#d97706':'var(--red)'}">${pct}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar-fill" style="width:${pct}%;background:${pct>=75?'var(--green)':pct>=40?'#d97706':'var(--red)'}"></div>
        </div>
        ${criticalMissing.length ? `
          <div class="mt-3 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <svg class="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
            <span><strong>${criticalMissing.length} required item${criticalMissing.length!==1?'s':''} missing:</strong> ${criticalMissing.map(i=>i.label).join(' · ')}</span>
          </div>
        ` : `<p class="mt-3 text-xs text-green-600 dark:text-green-400">✓ All required items complete. Continue with optional items and management questions.</p>`}
      </div>

      <p class="text-xs text-surface-400">
        ⓘ Checklist auto-updates as you add documents and deal data. Items are inferred from uploaded documents and deal fields — verify accuracy manually.
      </p>

      <!-- Checklist by category -->
      ${byCategory.map(({ cat, items: catItems }) => `
        <div class="card">
          <h3 class="text-sm font-semibold mb-4">${cat}
            <span class="ml-2 text-xs font-normal text-surface-500">${catItems.filter(i=>i.done).length}/${catItems.length}</span>
          </h3>
          <ul class="space-y-3">
            ${catItems.map(item => `
              <li class="flex items-center gap-3">
                ${checkIcon(item.done, item.required)}
                <span class="text-sm ${item.done ? 'text-surface-400 line-through' : item.required ? 'font-medium' : ''}">
                  ${escapeHtml(item.label)}
                  ${item.required && !item.done ? '<span class="ml-1.5 text-xs text-red-500 font-semibold">Required</span>' : ''}
                </span>
                ${!item.done && (item.id === 'cim' || item.id === 'financials') ? `
                  <button onclick="openUploadDocModal('${currentDealId}')" class="ml-auto btn-ghost btn-xs text-xs">Upload</button>
                ` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      `).join('')}

      <!-- Management questions -->
      ${questionsHtml}
    </div>
  `;
}

async function loadManagementQuestions(dealId) {
  const btn = document.getElementById('load-questions-btn');
  const out = document.getElementById('management-questions-output');
  if (!btn || !out) return;

  btn.disabled = true;
  btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Generating…`;
  out.innerHTML = `<div class="flex items-center gap-3 py-4 text-sm text-surface-500"><div class="ai-dot"></div><div class="ai-dot" style="animation-delay:0.2s"></div><div class="ai-dot" style="animation-delay:0.4s"></div><span class="ml-1">Analysing deal and generating questions…</span></div>`;

  const deal = await DB.get(STORES.deals, dealId);
  const docs = await DB.getAllByIndex(STORES.dealDocuments, 'dealId', dealId).then(r => r.filter(x => x.userId === currentUser.id)).catch(() => []);

  const missingItems = GAP_CHECKLIST_TEMPLATE.filter(item => !item.check(docs, deal, []));
  const questions = await generateManagementQuestions(deal, missingItems);

  if (!questions.length) {
    out.innerHTML = '<p class="text-sm text-surface-500">No questions generated — ensure an AI API key is configured in Settings.</p>';
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg> Retry`;
    return;
  }

  out.innerHTML = `
    <p class="text-xs text-surface-400 mb-3">Generated ${questions.length} questions based on deal profile and diligence gaps. Review and use in your management meeting.</p>
    <ol class="space-y-2">
      ${questions.map((q, i) => `
        <li class="flex items-start gap-3 text-sm">
          <span class="flex-shrink-0 w-6 h-6 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold">${i+1}</span>
          <span class="pt-0.5">${escapeHtml(q)}</span>
        </li>
      `).join('')}
    </ol>
    <div class="mt-4 pt-3 border-t border-surface-200 dark:border-surface-800">
      <p class="text-xs text-surface-400">These are AI-generated suggestions. Always adapt to your specific situation and the conversation context.</p>
    </div>
  `;

  btn.disabled = false;
  btn.textContent = 'Regenerate';
}
