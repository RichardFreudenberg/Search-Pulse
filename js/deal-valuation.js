/* ============================================================
   Pulse — AI Valuation Assistant  (Feature 4)
   Provides search-fund-calibrated EV/EBITDA ranges and a
   fair-value estimate for a deal based on sector, size,
   growth, and quality factors.
   ============================================================ */

async function openDealValuationModal(dealId) {
  const deal = await DB.get(STORES.deals, dealId);
  if (!deal) return;

  const hasFinancials = deal.revenue || deal.ebitda;

  openModal('📊 Valuation Assistant', `
    <div class="p-6 space-y-4">
      <!-- Deal snapshot -->
      <div class="bg-surface-50 dark:bg-surface-800 rounded-lg p-4 text-sm">
        <p class="font-semibold mb-2">${escapeHtml(deal.name)}</p>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-surface-600 dark:text-surface-400">
          <span>Sector: <strong>${escapeHtml(deal.sector || 'Not set')}</strong></span>
          <span>Stage: <strong>${escapeHtml(deal.stage)}</strong></span>
          <span>Revenue: <strong>${deal.revenue ? '$' + deal.revenue.toLocaleString() : '—'}</strong></span>
          <span>EBITDA: <strong>${deal.ebitda ? '$' + deal.ebitda.toLocaleString() : '—'}</strong></span>
          <span>Asking Price: <strong>${deal.askingPrice ? '$' + deal.askingPrice.toLocaleString() : '—'}</strong></span>
          <span>Asking Multiple: <strong>${deal.askingMultiple ? deal.askingMultiple + 'x' : deal.askingPrice && deal.ebitda ? (deal.askingPrice / deal.ebitda).toFixed(1) + 'x (calc)' : '—'}</strong></span>
        </div>
        ${!hasFinancials ? `<p class="text-xs text-amber-600 mt-2">⚠ Add revenue and EBITDA in the deal record for a more accurate valuation.</p>` : ''}
      </div>

      <!-- Qualitative modifiers -->
      <div>
        <p class="text-sm font-medium mb-2">Adjust for deal quality:</p>
        <div class="grid grid-cols-2 gap-3">
          ${[
            { id: 'val-recurring', label: 'High recurring revenue (>70%)', tip: '+0.5x' },
            { id: 'val-growth',    label: 'Growing revenue (>10%/yr)',      tip: '+0.5x' },
            { id: 'val-margins',   label: 'Strong margins (>25% EBITDA)',   tip: '+0.5x' },
            { id: 'val-sticky',    label: 'Sticky/defensible niche',        tip: '+0.5x' },
            { id: 'val-concentration', label: 'High customer concentration (>30%)', tip: '−0.5x' },
            { id: 'val-mgmt',      label: 'Key-person dependency',          tip: '−0.5x' },
            { id: 'val-declining', label: 'Declining or flat revenue',      tip: '−0.5x' },
            { id: 'val-capex',     label: 'Capital-intensive business',     tip: '−0.5x' },
          ].map(f => `
            <label class="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" id="${f.id}" class="rounded" />
              <span>${f.label}</span>
              <span class="text-surface-400 ml-auto">${f.tip}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- Description for AI context -->
      <div>
        <label class="text-sm font-medium block mb-1">Additional context (optional)</label>
        <textarea id="val-context" rows="2" class="input-field text-sm w-full"
          placeholder="e.g. SaaS-like subscription model, owner retiring, B2B services in healthcare…">${escapeHtml(deal.description || '')}</textarea>
      </div>

      <div id="val-result" class="hidden"></div>
    </div>
  `, [
    { label: 'Cancel', onclick: 'closeModal()', class: 'btn-secondary' },
    { label: '📊 Run Valuation', onclick: `runDealValuation('${dealId}')`, class: 'btn-primary', id: 'val-run-btn' },
  ]);
}

async function runDealValuation(dealId) {
  const btn      = document.getElementById('val-run-btn');
  const resultEl = document.getElementById('val-result');
  if (!resultEl) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Analysing…'; }

  resultEl.innerHTML = `<div class="flex items-center gap-2 py-2">
    <svg class="animate-spin w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
    <span class="text-sm text-surface-500">Researching comparable transactions…</span>
  </div>`;
  resultEl.classList.remove('hidden');

  try {
    const deal     = await DB.get(STORES.deals, dealId);
    const checks   = {
      recurring:     document.getElementById('val-recurring')?.checked,
      growth:        document.getElementById('val-growth')?.checked,
      margins:       document.getElementById('val-margins')?.checked,
      sticky:        document.getElementById('val-sticky')?.checked,
      concentration: document.getElementById('val-concentration')?.checked,
      mgmt:          document.getElementById('val-mgmt')?.checked,
      declining:     document.getElementById('val-declining')?.checked,
      capex:         document.getElementById('val-capex')?.checked,
    };
    const context  = document.getElementById('val-context')?.value?.trim() || '';
    const margin   = deal.revenue && deal.ebitda ? ((deal.ebitda / deal.revenue) * 100).toFixed(1) : null;
    const askedMult = deal.askingMultiple || (deal.askingPrice && deal.ebitda ? (deal.askingPrice / deal.ebitda).toFixed(1) : null);

    const positives = [
      checks.recurring     && 'High recurring revenue (>70%)',
      checks.growth        && 'Revenue growing >10% per year',
      checks.margins       && 'Strong EBITDA margins (>25%)',
      checks.sticky        && 'Sticky niche with defensible positioning',
    ].filter(Boolean);

    const negatives = [
      checks.concentration && 'High customer concentration (>30% to one customer)',
      checks.mgmt          && 'Key-person dependency on the current owner',
      checks.declining     && 'Revenue is flat or declining',
      checks.capex         && 'Capital-intensive model',
    ].filter(Boolean);

    const systemPrompt = `You are a senior search fund advisor with deep expertise in lower-middle-market acquisitions.
IMPORTANT: This is a SEARCH FUND acquisition, NOT a PE or strategic deal. Multiples are LOWER:
- Typical search fund EV/EBITDA range: 3.0x–7.0x
- Median: ~4.5x–5.5x for a clean deal
- Premiums rarely exceed 7x unless exceptional
- Seller's discretionary earnings (SDE) adjustments often reduce stated EBITDA further
- Most deals are sub-$5M EBITDA
Provide REALISTIC, conservative guidance a searcher would actually use to negotiate.`;

    const userPrompt = `Valuation request for:
- Company: "${deal.name}"
- Sector: ${deal.sector || 'not specified'}
- Revenue: ${deal.revenue ? '$' + deal.revenue.toLocaleString() : 'unknown'}
- EBITDA: ${deal.ebitda ? '$' + deal.ebitda.toLocaleString() : 'unknown'}
- EBITDA Margin: ${margin ? margin + '%' : 'unknown'}
- Seller asking: ${askedMult ? askedMult + 'x EBITDA' : deal.askingPrice ? '$' + deal.askingPrice.toLocaleString() : 'not disclosed'}
- Positive factors: ${positives.length ? positives.join(', ') : 'none checked'}
- Negative factors: ${negatives.length ? negatives.join(', ') : 'none checked'}
- Additional context: ${context || 'none'}

Provide:
1. **Typical Multiple Range** for this sector at search fund scale (e.g. "4.0x–5.5x")
2. **Adjusted Range for This Deal** accounting for the factors above
3. **Fair Value Estimate** (if EBITDA is known, show the dollar range)
4. **Verdict on Asking Price** — if they provided one, is it reasonable, high, or a stretch?
5. **Key Value Drivers** — 2–3 things that would justify paying at the top of the range
6. **Watch-outs** — 2–3 things that should push price down or kill the deal

Format clearly with headers. Be direct and specific — no generic disclaimers.`;

    const result = await callAI(systemPrompt, userPrompt, 900, 0.2);

    // Parse into HTML
    const html = result
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^#{1,3}\s+(.+)$/gm, '<h4 class="font-semibold text-surface-800 dark:text-surface-200 mt-4 mb-1">$1</h4>')
      .replace(/^[-*]\s+(.+)$/gm, '<li class="ml-4 list-disc text-sm text-surface-600 dark:text-surface-400">$1</li>')
      .replace(/\n\n/g, '<br/>')
      .trim();

    resultEl.innerHTML = `
      <div class="border-t border-surface-200 dark:border-surface-700 pt-4">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-semibold text-brand-600">Valuation Analysis</h4>
          <button onclick="runDealValuation('${dealId}')" class="text-xs text-surface-400 hover:text-brand-500">↺ Re-run</button>
        </div>
        <div class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">${html}</div>
        <button onclick="saveDealValuationNote('${dealId}', ${JSON.stringify(result).replace(/'/g, "\\'")})"
                class="btn-secondary btn-sm mt-4 w-full">
          💾 Save as Deal Note
        </button>
      </div>`;

  } catch (err) {
    resultEl.innerHTML = `<p class="text-sm text-red-500 mt-2">${escapeHtml(err.message)}</p>`;
  }

  if (btn) { btn.disabled = false; btn.textContent = '📊 Run Valuation'; }
}

async function saveDealValuationNote(dealId, content) {
  await DB.add(STORES.dealNotes, {
    id:        generateId(),
    dealId,
    userId:    currentUser.id,
    type:      'valuation',
    content:   `# Valuation Analysis\n\n${content}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  showToast('Valuation saved as deal note', 'success');
  closeModal();
  switchDealTab('notes');
}
