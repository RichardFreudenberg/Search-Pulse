/* ============================================================
   Pulse — AI Sourcing Campaign Analyser  (Feature 8)
   Analyses outreach campaign performance across sectors,
   letter tone, company size, and referral source.
   Identifies what's working and gives specific improvement tips.
   ============================================================ */

async function openSourcingAnalyserModal() {
  openModal('📈 Campaign Performance Analysis', `
    <div class="p-6">
      <div id="sa-loading" class="flex items-center gap-3 py-8 justify-center">
        <svg class="animate-spin w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <span class="text-sm text-surface-500">Analysing campaigns…</span>
      </div>
      <div id="sa-content" class="hidden space-y-5"></div>
    </div>
  `, [{ label: 'Close', onclick: 'closeModal()', class: 'btn-secondary' }]);

  try {
    await _runSourcingAnalysis();
  } catch (err) {
    const el = document.getElementById('sa-loading');
    if (el) el.innerHTML = `<p class="text-sm text-red-500 text-center">${escapeHtml(err.message)}</p>`;
  }
}

async function _runSourcingAnalysis() {
  const loadEl    = document.getElementById('sa-loading');
  const contentEl = document.getElementById('sa-content');

  const all = await DB.getAll(STORES.sourcingCampaigns);
  const campaigns = (all || []).filter(c => c.userId === currentUser.id);

  if (campaigns.length < 3) {
    if (loadEl) loadEl.innerHTML = `<p class="text-sm text-surface-500 text-center">Add at least 3 campaigns to unlock AI analysis.</p>`;
    return;
  }

  // ── Compute stats ────────────────────────────────────────────────────────
  const sent      = campaigns.filter(c => c.status !== 'draft');
  const replied   = campaigns.filter(c => ['replied','meeting_scheduled','converted'].includes(c.status));
  const meetings  = campaigns.filter(c => ['meeting_scheduled','converted'].includes(c.status));
  const converted = campaigns.filter(c => c.status === 'converted');

  // Break down by sector
  const bySector = {};
  sent.forEach(c => {
    const s = c.sector || 'Unknown';
    if (!bySector[s]) bySector[s] = { sent: 0, replied: 0 };
    bySector[s].sent++;
    if (['replied','meeting_scheduled','converted'].includes(c.status)) bySector[s].replied++;
  });

  const sectorLines = Object.entries(bySector)
    .sort((a, b) => b[1].sent - a[1].sent)
    .map(([s, d]) => `${s}: ${d.sent} sent, ${d.replied} replied (${d.sent > 0 ? Math.round(d.replied/d.sent*100) : 0}% rate)`)
    .join('\n');

  // Sample letter snippets (first 150 chars) from replied vs not-replied
  const repliedLetters = replied.slice(0, 4).map(c =>
    c.letterText ? `[REPLIED] ${c.letterText.slice(0, 150)}…` : ''
  ).filter(Boolean).join('\n\n');

  const noReplyLetters = sent.filter(c => c.status === 'sent').slice(0, 4).map(c =>
    c.letterText ? `[NO REPLY] ${c.letterText.slice(0, 150)}…` : ''
  ).filter(Boolean).join('\n\n');

  const replyRate = sent.length > 0 ? Math.round(replied.length / sent.length * 100) : 0;
  const meetingRate = replied.length > 0 ? Math.round(meetings.length / replied.length * 100) : 0;

  const aiAnalysis = await callAI(
    `You are a search fund outreach expert analysing a searcher's acquisition letter campaign performance.
Provide concrete, actionable recommendations.
Focus on: what sectors/approaches generate replies, what the successful letters do differently,
and 3 specific changes the searcher can make right now to improve results.`,
    `Campaign performance summary:

OVERALL FUNNEL:
- Total campaigns: ${campaigns.length}
- Sent (not draft): ${sent.length}
- Replies received: ${replied.length} (${replyRate}% reply rate)
- Meetings booked: ${meetings.length} (${meetingRate}% of replies)
- Converted to deals: ${converted.length}

PERFORMANCE BY SECTOR:
${sectorLines || 'No sector data'}

LETTER SAMPLES — REPLIED vs NOT REPLIED:
${repliedLetters || 'No replied letter samples'}

${noReplyLetters ? `LETTERS THAT DID NOT GET A REPLY:\n${noReplyLetters}` : ''}

Provide:
## What's Working
## What's Not Working
## 3 Specific Changes to Make Now
## Sectors to Double Down On
## Sectors to Deprioritise`,
    800, 0.3
  );

  if (loadEl) loadEl.classList.add('hidden');
  if (!contentEl) return;

  const html = aiAnalysis
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<h4 class="font-semibold text-surface-800 dark:text-surface-200 text-sm mt-4 mb-2 pb-1 border-b border-surface-100 dark:border-surface-800">$1</h4>')
    .replace(/^[-•*]\s+(.+)$/gm, '<li class="ml-4 list-disc text-sm text-surface-600 dark:text-surface-400 mb-1">$1</li>')
    .replace(/\n\n/g, '<br/>');

  // Render funnel metrics
  const funnelItems = [
    { label: 'Sent',       val: sent.length,      pct: null,                                             color: 'brand' },
    { label: 'Replied',    val: replied.length,   pct: replyRate + '%',                                  color: 'green' },
    { label: 'Meetings',   val: meetings.length,  pct: meetings.length + '/' + replied.length,           color: 'purple' },
    { label: 'Converted',  val: converted.length, pct: sent.length ? Math.round(converted.length/sent.length*100) + '%' : '—', color: 'brand' },
  ];

  contentEl.innerHTML = `
    <!-- Funnel Stats -->
    <div class="grid grid-cols-4 gap-3">
      ${funnelItems.map(f => `
        <div class="card p-3 text-center">
          <p class="text-xl font-bold text-${f.color}-600 dark:text-${f.color}-400">${f.val}</p>
          <p class="text-xs font-medium text-surface-500 mt-0.5">${f.label}</p>
          ${f.pct ? `<p class="text-xs text-surface-400 mt-0.5">${f.pct}</p>` : ''}
        </div>`).join('')}
    </div>

    <!-- Sector Breakdown -->
    ${Object.keys(bySector).length > 0 ? `
    <div class="card p-4">
      <h3 class="text-sm font-semibold mb-3">Performance by Sector</h3>
      <div class="space-y-2">
        ${Object.entries(bySector).sort((a, b) => b[1].sent - a[1].sent).map(([s, d]) => {
          const pct = d.sent > 0 ? Math.round(d.replied / d.sent * 100) : 0;
          const color = pct >= 15 ? '#22c55e' : pct >= 8 ? '#eab308' : '#ef4444';
          return `
            <div class="flex items-center gap-3">
              <span class="text-sm w-32 truncate flex-shrink-0">${escapeHtml(s)}</span>
              <div class="flex-1 bg-surface-100 dark:bg-surface-800 rounded-full h-2">
                <div class="h-2 rounded-full" style="width:${Math.min(pct * 4, 100)}%;background:${color}"></div>
              </div>
              <span class="text-xs text-surface-500 w-20 text-right flex-shrink-0">${d.replied}/${d.sent} (${pct}%)</span>
            </div>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- AI Analysis -->
    <div class="card p-4">
      <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
        <svg class="w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
        AI Campaign Analysis
      </h3>
      <div class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">${html}</div>
    </div>
  `;
  contentEl.classList.remove('hidden');
}
