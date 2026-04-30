/* ============================================================
   Pulse — AI First-Call Script Generator  (Feature 7)
   Customised agenda + question list for the first owner
   conversation — how to position yourself, what to probe,
   and what to avoid saying early in the relationship.
   ============================================================ */

async function openFirstCallScriptModal(dealId) {
  const deal = await DB.get(STORES.deals, dealId);
  if (!deal) return;

  openModal('📞 First-Call Script', `
    <div class="p-6 space-y-4">
      <p class="text-sm text-surface-500">
        AI will draft a customised script for your first conversation with the owner of
        <strong>${escapeHtml(deal.name)}</strong>. Fill in any extra context to sharpen it.
      </p>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Your Background / Angle</label>
          <input type="text" id="fcs-background" class="input-field text-sm"
            placeholder="e.g. Operator background in HVAC, HBS MBA, self-funded" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">How You Sourced This</label>
          <select id="fcs-source" class="input-field text-sm">
            <option value="Broker / Intermediary">Via broker / intermediary</option>
            <option value="Proprietary">Proprietary outreach</option>
            <option value="Referral">Referral from a contact</option>
            <option value="Online Listing">Online listing (BizBuySell etc.)</option>
            <option value="Conference">Conference / event</option>
            <option value="Cold Outreach">Cold outreach letter</option>
          </select>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Seller Context (if known)</label>
        <input type="text" id="fcs-seller" class="input-field text-sm"
          placeholder="e.g. Owner retiring, no successors, running it for 20 years, nervous about employees" />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Key Concerns / Red Flags to Probe</label>
        <input type="text" id="fcs-concerns" class="input-field text-sm"
          placeholder="e.g. Customer concentration, owner involvement in ops, recurring revenue %" />
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Call Goal</label>
        <select id="fcs-goal" class="input-field text-sm">
          <option value="Build rapport and qualify the opportunity">Build rapport + qualify the opportunity</option>
          <option value="Request financials and move to NDA">Request financials → NDA</option>
          <option value="Schedule a site visit or management meeting">Schedule a site visit / management meeting</option>
          <option value="Gauge seller motivation and timeline">Gauge seller motivation and timeline</option>
        </select>
      </div>

      <div id="fcs-result" class="hidden"></div>
    </div>
  `, [
    { label: 'Cancel', onclick: 'closeModal()', class: 'btn-secondary' },
    { label: '📞 Generate Script', onclick: `_generateFirstCallScript('${dealId}')`, class: 'btn-primary', id: 'fcs-btn' },
  ]);
}

async function _generateFirstCallScript(dealId) {
  const btn      = document.getElementById('fcs-btn');
  const resultEl = document.getElementById('fcs-result');
  if (!resultEl) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Writing…'; }

  resultEl.innerHTML = `<div class="flex items-center gap-2 py-3">
    <svg class="animate-spin w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
    <span class="text-sm text-surface-500">Generating your script…</span>
  </div>`;
  resultEl.classList.remove('hidden');

  try {
    const deal       = await DB.get(STORES.deals, dealId);
    const background = document.getElementById('fcs-background')?.value?.trim() || 'Search fund entrepreneur';
    const source     = document.getElementById('fcs-source')?.value || 'Broker / Intermediary';
    const seller     = document.getElementById('fcs-seller')?.value?.trim() || '';
    const concerns   = document.getElementById('fcs-concerns')?.value?.trim() || '';
    const goal       = document.getElementById('fcs-goal')?.value || 'Build rapport and qualify the opportunity';

    const margin = deal.revenue && deal.ebitda
      ? ((deal.ebitda / deal.revenue) * 100).toFixed(0) + '%'
      : 'unknown';

    const systemPrompt = `You are a seasoned search fund advisor helping a searcher prepare for their very first call with a business owner.
The script must feel natural and conversational — not like a rigid interview.
The searcher is NOT a PE firm. They are a hands-on, long-term operator-buyer who will run the business themselves.
This positioning is critical: it differentiates them from financial buyers and builds trust with owner-operators.

Structure the output as a practical script with:
1. Opening (how to start the call, how to position yourself)
2. Rapport-Building Questions (2–3 genuine questions about the owner's story)
3. Business Understanding Questions (5–7 specific questions to qualify the opportunity)
4. Transition to Next Steps (how to close the call and move it forward)
5. What NOT to Say (3 things to avoid in a first call)

Use conversational language, not bullet-point questions. Include suggested phrasing.`;

    const userPrompt = `Generate a first-call script for:

COMPANY: "${deal.name}"
Sector: ${deal.sector || 'unknown'}
Revenue: ${deal.revenue ? '$' + deal.revenue.toLocaleString() : 'unknown'}
EBITDA: ${deal.ebitda ? '$' + deal.ebitda.toLocaleString() : 'unknown'} (margin: ${margin})
Stage: ${deal.stage}
Location: ${deal.location || 'not specified'}
Description: ${deal.description ? deal.description.slice(0, 300) : 'none'}

SEARCHER PROFILE:
Background: ${background}
How they found this deal: ${source}

SELLER CONTEXT:
${seller || 'No specific seller context known — treat as a cold first call'}

KEY CONCERNS TO PROBE:
${concerns || 'Standard qualification: customer concentration, owner dependency, growth trajectory, reason for sale'}

CALL GOAL: ${goal}`;

    const script = await callAI(systemPrompt, userPrompt, 1200, 0.4);

    const html = script
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^#{1,3}\s+(.+)$/gm, '<h4 class="font-semibold text-surface-800 dark:text-surface-200 mt-5 mb-2 text-sm">$1</h4>')
      .replace(/^[-•*]\s+(.+)$/gm, '<li class="ml-4 list-disc text-sm text-surface-600 dark:text-surface-400 mb-1">$1</li>')
      .replace(/\n\n/g, '<br/>');

    resultEl.innerHTML = `
      <div class="border-t border-surface-200 dark:border-surface-700 pt-4">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-semibold text-brand-600">Your First-Call Script — ${escapeHtml(deal.name)}</h4>
          <div class="flex gap-2">
            <button onclick="navigator.clipboard.writeText(${JSON.stringify(script)}).then(() => showToast('Copied!','success'))"
                    class="text-xs text-surface-400 hover:text-brand-500">Copy</button>
            <button onclick="_generateFirstCallScript('${dealId}')" class="text-xs text-surface-400 hover:text-brand-500">↺ Regenerate</button>
          </div>
        </div>
        <div class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed max-h-96 overflow-y-auto pr-1">${html}</div>
        <button onclick="_saveFirstCallScriptAsNote('${dealId}', ${JSON.stringify(script)})"
                class="btn-secondary btn-sm mt-4 w-full">💾 Save to Deal Notes</button>
      </div>`;

  } catch (err) {
    resultEl.innerHTML = `<p class="text-sm text-red-500 mt-2">${escapeHtml(err.message)}</p>`;
  }

  if (btn) { btn.disabled = false; btn.textContent = '📞 Generate Script'; }
}

async function _saveFirstCallScriptAsNote(dealId, content) {
  await DB.add(STORES.dealNotes, {
    id:        generateId(),
    dealId,
    userId:    currentUser.id,
    type:      'first_call_script',
    content:   `# First-Call Script\n\n${content}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  showToast('Script saved to deal notes', 'success');
  closeModal();
  switchDealTab('notes');
}
