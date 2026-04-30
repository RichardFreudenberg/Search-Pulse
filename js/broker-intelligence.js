/* ============================================================
   Pulse — AI Broker Intelligence  (Feature 5)
   Portfolio-level view: which brokers deliver the best deal
   flow, who to prioritise, and AI-drafted re-engagement notes
   calibrated to each broker's history.
   ============================================================ */

async function openBrokerIntelligenceModal() {
  openModal('🔍 Broker Intelligence', `
    <div class="p-6">
      <div id="bri-loading" class="flex items-center gap-3 py-8 justify-center">
        <svg class="animate-spin w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <span class="text-sm text-surface-500">Analysing broker deal flow…</span>
      </div>
      <div id="bri-content" class="hidden space-y-5"></div>
    </div>
  `, [{ label: 'Close', onclick: 'closeModal()', class: 'btn-secondary' }]);

  try {
    await _runBrokerIntelligence();
  } catch (err) {
    const el = document.getElementById('bri-loading');
    if (el) el.innerHTML = `<p class="text-sm text-red-500 text-center">${escapeHtml(err.message)}</p>`;
  }
}

async function _runBrokerIntelligence() {
  const loadEl   = document.getElementById('bri-loading');
  const contentEl = document.getElementById('bri-content');

  const [brokers, deals] = await Promise.all([
    DB.getAll(STORES.brokers),
    DB.getAll(STORES.deals),
  ]);

  const myBrokers = brokers.filter(b => b.userId === currentUser.id);
  if (myBrokers.length === 0) {
    if (loadEl) loadEl.innerHTML = '<p class="text-sm text-surface-500 text-center">No brokers yet — add some from the Brokers page.</p>';
    return;
  }

  const today = Date.now();

  // Score each broker
  const scored = myBrokers.map(b => {
    const daysSince = b.lastContactDate
      ? Math.floor((today - new Date(b.lastContactDate)) / 86400000)
      : 999;

    // Find deals linked to this broker
    const linkedDeals = deals.filter(d =>
      d.userId === currentUser.id &&
      (d.brokerId === b.id || (d.brokerName || '').toLowerCase() === (b.name || '').toLowerCase())
    );
    const advancedDeals = linkedDeals.filter(d =>
      ['LOI Drafted','LOI Submitted','Due Diligence','Exclusivity','Legal / Closing','Closed - Won'].includes(d.stage)
    ).length;

    const score = (b.dealsIntroduced || linkedDeals.length) * 2 + advancedDeals * 3 - Math.floor(daysSince / 30);
    return { broker: b, linkedDeals, advancedDeals, daysSince, score };
  }).sort((a, b) => b.score - a.score);

  // Build summary for AI
  const brokerLines = scored.map(({ broker: b, linkedDeals, advancedDeals, daysSince }) =>
    `Broker: ${b.name}${b.firm ? ` (${b.firm})` : ''}` +
    ` | Sectors: ${b.specialties || 'not specified'}` +
    ` | Deals introduced: ${b.dealsIntroduced || linkedDeals.length}` +
    ` | Advanced to LOI+: ${advancedDeals}` +
    ` | Last contacted: ${daysSince < 999 ? daysSince + ' days ago' : 'never'}` +
    ` | Notes: ${b.notes ? b.notes.slice(0, 100) : 'none'}`
  ).join('\n');

  if (loadEl) {
    const s = loadEl.querySelector('span');
    if (s) s.textContent = 'Running AI analysis…';
  }

  const aiSummary = await callAI(
    `You are a search fund advisor reviewing a searcher's broker network.
Analyse the broker data and provide:
1. **Top 3 Brokers to Prioritise** — who should they call this week and why
2. **Underutilised Brokers** — who has potential but hasn't been engaged recently
3. **Network Gaps** — what sectors or deal sizes are missing from this network
4. **One Tactical Tip** — a specific action to improve broker relationships

Be direct, practical, and specific. Use bullet points.`,
    `My broker network:\n${brokerLines}\n\nAnalyse my broker relationships and advise me.`,
    700, 0.3
  );

  if (loadEl) loadEl.classList.add('hidden');
  if (!contentEl) return;

  const htmlSummary = aiSummary
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<p class="font-semibold text-surface-800 dark:text-surface-200 mt-3 mb-1">$1</p>')
    .replace(/^[-*•]\s+(.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/\n\n/g, '<br/>');

  contentEl.innerHTML = `
    <!-- AI Summary -->
    <div class="card p-4">
      <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
        <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
        AI Network Analysis
      </h3>
      <div class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">${htmlSummary}</div>
    </div>

    <!-- Broker Scorecard -->
    <div>
      <h3 class="text-sm font-semibold mb-3">Broker Scorecard</h3>
      <div class="space-y-2">
        ${scored.map(({ broker: b, linkedDeals, advancedDeals, daysSince }, i) => {
          const healthColor = daysSince < 21 ? '#22c55e' : daysSince < 60 ? '#eab308' : '#ef4444';
          const healthLabel = daysSince < 21 ? 'Active' : daysSince < 60 ? 'Warm' : 'Cold';
          return `
            <div class="flex items-center gap-3 p-3 rounded-lg border border-surface-200 dark:border-surface-700">
              <div class="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 font-bold text-xs flex-shrink-0">${i + 1}</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-medium">${escapeHtml(b.name)}</span>
                  ${b.firm ? `<span class="text-xs text-surface-400">${escapeHtml(b.firm)}</span>` : ''}
                  <span class="text-xs px-1.5 py-0.5 rounded-full font-medium" style="background:${healthColor}20;color:${healthColor}">${healthLabel}</span>
                </div>
                <div class="text-xs text-surface-400 mt-0.5 flex gap-3 flex-wrap">
                  ${b.specialties ? `<span>${escapeHtml(b.specialties.slice(0, 40))}</span>` : ''}
                  <span>${b.dealsIntroduced || linkedDeals.length} deal${(b.dealsIntroduced || linkedDeals.length) !== 1 ? 's' : ''}</span>
                  ${advancedDeals > 0 ? `<span class="text-green-600">${advancedDeals} advanced to LOI+</span>` : ''}
                  <span>${daysSince < 999 ? daysSince + 'd ago' : 'never contacted'}</span>
                </div>
              </div>
              <button onclick="closeModal(); setTimeout(() => openBrokerAIOutreachModal('${b.id}'), 300)"
                      class="btn-secondary btn-sm flex-shrink-0 text-xs">Draft Outreach</button>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;
  contentEl.classList.remove('hidden');
}
