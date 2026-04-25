/* ============================================
   Nexus CRM — Shared Dashboard
   ============================================ */

const SHARE_SECTIONS = [
  { id: 'crm_stats',           label: 'CRM Overview',              description: 'Contacts, calls, and follow-up counts' },
  { id: 'relationship_health', label: 'Relationship Health',        description: 'Active / At Risk / Stale breakdown' },
  { id: 'stage_distribution',  label: 'Contact Stage Distribution', description: 'How contacts are spread across pipeline stages' },
  { id: 'deal_pipeline',       label: 'Deal Pipeline Summary',      description: 'Total deals, active count, pipeline value' },
  { id: 'deal_sourcing',       label: 'Deal Sourcing Breakdown',    description: 'Where deals are coming from' },
  { id: 'deal_details',        label: 'Deal Cards',                 description: 'Full details for each selected deal (financials, timeline, notes)' },
  { id: 'deal_documents',      label: 'Deal Documents',             description: 'Document list for each selected deal' },
  { id: 'lp_report',           label: 'LP Investor Report',         description: 'AI-generated quarterly update with pipeline metrics and deal highlights' },
];

const _SHARE_LS_PREFIX = 'nexus_share_';
let _pendingSnapshot = null;

// ── Config Helpers ─────────────────────────────────────────────────

async function _loadDashConfig() {
  const saved = await DB.get(STORES.shareDashboards, `dash_${currentUser.id}`);
  return saved || {
    id: `dash_${currentUser.id}`,
    userId: currentUser.id,
    sections: SHARE_SECTIONS.map(s => s.id),
    includedDealIds: [],
    passcode: '',
    invites: [],
    token: null,
    lastGeneratedAt: null,
  };
}

async function _saveDashConfig(config) {
  config.id = `dash_${currentUser.id}`;
  config.userId = currentUser.id;
  await DB.put(STORES.shareDashboards, config);
}

// ── Management Page ───────────────────────────────────────────────

async function renderSharedDashboardPage() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-5xl mx-auto">${renderLoadingSkeleton(4)}</div>`;

  const [config, allDeals] = await Promise.all([
    _loadDashConfig(),
    DB.getAll(STORES.deals).then(all => all.filter(d => d.userId === currentUser.id)).catch(() => []),
  ]);

  const deals = allDeals.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      ${renderPageHeader('Shared Dashboard', 'Build a read-only snapshot to share with investors, advisors, or co-searchers')}

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Left column: Settings -->
        <div class="space-y-5">

          <!-- Sections -->
          <div class="card space-y-4">
            <div>
              <h3 class="font-semibold text-sm">Sections to include</h3>
              <p class="text-xs text-surface-500 mt-0.5">Choose what your viewers can see</p>
            </div>
            <div class="space-y-3">
              ${SHARE_SECTIONS.map(s => `
                <label class="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" class="share-section-cb mt-0.5 w-4 h-4 text-brand-600"
                    value="${s.id}" ${config.sections.includes(s.id) ? 'checked' : ''} />
                  <div>
                    <p class="text-sm font-medium group-hover:text-brand-600 transition-colors">${s.label}</p>
                    <p class="text-xs text-surface-400">${s.description}</p>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Deals -->
          ${deals.length > 0 ? `
            <div class="card space-y-3">
              <div>
                <h3 class="font-semibold text-sm">Deals to include</h3>
                <p class="text-xs text-surface-500 mt-0.5">Uncheck any deal to exclude it from the share</p>
              </div>
              <div class="space-y-2 max-h-48 overflow-y-auto">
                ${deals.map(d => `
                  <label class="flex items-center gap-2.5 cursor-pointer group">
                    <input type="checkbox" class="share-deal-cb w-4 h-4 text-brand-600" value="${d.id}"
                      ${(!config.includedDealIds?.length || config.includedDealIds.includes(d.id)) ? 'checked' : ''} />
                    <div class="min-w-0">
                      <p class="text-sm font-medium truncate group-hover:text-brand-600 transition-colors">${escapeHtml(d.name)}</p>
                      <p class="text-xs text-surface-400">${escapeHtml(d.stage || '')}</p>
                    </div>
                  </label>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Passcode -->
          <div class="card space-y-3">
            <div>
              <h3 class="font-semibold text-sm">Passcode protection</h3>
              <p class="text-xs text-surface-500 mt-0.5">Optional — leave blank for open access</p>
            </div>
            <input type="text" id="share-passcode" class="input-field text-sm font-mono"
              placeholder="e.g. SearchFund2025"
              value="${escapeHtml(config.passcode || '')}" maxlength="40" />
          </div>

          <!-- Action buttons -->
          <div class="flex flex-col gap-2">
            <button onclick="saveDashboardSettings()" class="btn-primary w-full">
              Save Settings
            </button>
            <button onclick="openShareEmailModal()" class="btn-secondary w-full flex items-center justify-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
              </svg>
              Share via Email
            </button>
            <button onclick="generateAndCopyLink()" class="btn-ghost w-full flex items-center justify-center gap-2 text-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
              </svg>
              Copy Link Only
            </button>
            <button onclick="previewSharedDashboard()" class="btn-ghost w-full text-sm" style="color:var(--text-muted);">
              Preview as viewer →
            </button>
          </div>
        </div>

        <!-- Right column: Status + Invites -->
        <div class="lg:col-span-2 space-y-5">

          <!-- Link status -->
          ${config.token && config.lastGeneratedAt ? `
            <div class="card bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
              <div class="flex items-start gap-3">
                <svg class="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-green-800 dark:text-green-300">Dashboard link is active</p>
                  <p class="text-xs text-green-700 dark:text-green-400 mt-0.5">Last generated ${formatDate(config.lastGeneratedAt)}. Click "Generate &amp; Copy Link" anytime to send a fresh snapshot.</p>
                </div>
                <button onclick="generateAndCopyLink()" class="btn-secondary btn-sm shrink-0">Refresh</button>
              </div>
            </div>
          ` : `
            <div class="card text-center py-5">
              <svg class="w-10 h-10 mx-auto mb-3 text-surface-200 dark:text-surface-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
              </svg>
              <p class="text-sm font-medium text-surface-500">No link generated yet</p>
              <p class="text-xs text-surface-400 mt-1">Configure your settings on the left, then click "Generate &amp; Copy Link"</p>
            </div>
          `}

          <!-- LP Report Generator -->
          <div class="card">
            <div class="flex items-start justify-between mb-3">
              <div>
                <h3 class="font-semibold text-sm">LP Investor Report</h3>
                <p class="text-xs text-surface-500 mt-0.5">AI-generated quarterly update for your limited partners</p>
              </div>
              <button onclick="generateLPReport()" class="btn-primary btn-sm flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
                Generate
              </button>
            </div>
            <div id="lp-report-preview" class="hidden"></div>
            <p class="text-xs text-surface-400">Covers: pipeline status, key deals, sourcing activity, upcoming milestones, and investor-facing narrative. Include the <strong>LP Investor Report</strong> section above to embed this in your shared link.</p>
          </div>

          <!-- Invite tracker -->
          <div class="card">
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="font-semibold text-sm">Shared with</h3>
                <p class="text-xs text-surface-500 mt-0.5">${config.invites?.length || 0} ${(config.invites?.length || 0) === 1 ? 'recipient' : 'recipients'}</p>
              </div>
              <div class="flex items-center gap-2">
                <button onclick="openShareEmailModal()" class="btn-primary btn-sm flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  Send
                </button>
                <button onclick="openAddInviteModal()" class="btn-ghost btn-sm" title="Track without emailing">
                  + Track
                </button>
              </div>
            </div>

            ${!config.invites?.length ? `
              <div class="text-center py-8">
                <svg class="w-8 h-8 mx-auto mb-2" style="color:var(--text-muted);opacity:0.4;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
                </svg>
                <p class="text-xs" style="color:var(--text-muted);">Click <strong style="color:var(--text-secondary);">Send</strong> to email the dashboard link to someone</p>
              </div>
            ` : `
              <div class="space-y-0">
                ${config.invites.map((inv, idx) => `
                  <div class="py-3 flex items-center gap-3 border-b last:border-0" style="border-color:var(--border-subtle);">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0"
                      style="background:rgba(200,169,110,0.12);color:var(--gold);border:0.5px solid var(--gold-border);">
                      ${escapeHtml((inv.name || inv.email || '?').charAt(0).toUpperCase())}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <p class="text-sm font-medium truncate">${escapeHtml(inv.name || inv.email || '—')}</p>
                        ${inv.method === 'email'
                          ? `<span class="text-xs px-1.5 py-0.5 rounded" style="background:rgba(125,186,138,0.12);color:var(--green);">Emailed</span>`
                          : `<span class="text-xs px-1.5 py-0.5 rounded" style="background:rgba(255,255,255,0.06);color:var(--text-muted);">Tracked</span>`}
                      </div>
                      ${inv.email && inv.name ? `<p class="text-xs truncate" style="color:var(--text-muted);">${escapeHtml(inv.email)}</p>` : ''}
                      <p class="text-xs" style="color:var(--text-muted);">${formatDate(inv.addedAt)}</p>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                      ${inv.email ? `
                        <button data-idx="${idx}" onclick="emailInviteAgain(parseInt(this.dataset.idx))"
                          class="p-1.5 transition-colors" style="color:var(--text-muted);" title="Send again"
                          onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text-muted)'">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                          </svg>
                        </button>
                      ` : ''}
                      <button data-idx="${idx}" onclick="removeInvite(parseInt(this.dataset.idx))"
                        class="p-1.5 transition-colors" style="color:var(--text-muted);" title="Remove"
                        onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--text-muted)'">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- How it works -->
          <div class="card border-brand-100 dark:border-brand-900/30 bg-brand-50/40 dark:bg-brand-900/10">
            <div class="flex items-start gap-3">
              <svg class="w-5 h-5 text-brand-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <div>
                <p class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-2">How it works</p>
                <ul class="space-y-1.5 text-xs text-surface-500 dark:text-surface-400">
                  <li>• <strong>Generate &amp; Copy Link</strong> saves your settings and copies a shareable URL to your clipboard</li>
                  <li>• Recipients open the link with <strong>no login required</strong> — they see only what you chose to include</li>
                  <li>• Each link is a <strong>snapshot in time</strong> — generate a fresh link anytime to send updated data</li>
                  <li>• Add a <strong>passcode</strong> to protect sensitive information (e.g., deal financials)</li>
                  <li>• Use <strong>"Add"</strong> to track who you've shared with — links work without doing this</li>
                </ul>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;
}

// ── LP Report Generator ───────────────────────────────────────────

async function generateLPReport() {
  const previewEl = document.getElementById('lp-report-preview');
  if (previewEl) {
    previewEl.classList.remove('hidden');
    previewEl.innerHTML = `<div class="flex items-center gap-2 text-sm text-surface-500 py-3 mb-3 border-b border-surface-200 dark:border-surface-700"><div class="w-4 h-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"></div> Generating LP report…</div>`;
  }

  try {
    // Gather data
    const [allDeals, allContacts, allCalls, settings] = await Promise.all([
      DB.getAll(STORES.deals).then(d => d.filter(x => x.userId === currentUser.id)),
      DB.getAll(STORES.contacts).then(c => c.filter(x => x.userId === currentUser.id)),
      DB.getAll(STORES.calls).then(c => c.filter(x => x.userId === currentUser.id)),
      DB.get(STORES.settings, `settings_${currentUser.id}`),
    ]);

    const now = new Date();
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const quarterLabel = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;

    const activeDeals = allDeals.filter(d => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage));
    const closedWon   = allDeals.filter(d => d.stage === 'Closed - Won');
    const totalValue  = activeDeals.reduce((s, d) => s + (d.askingPrice || 0), 0);
    const callsThisQ  = allCalls.filter(c => c.date && new Date(c.date) >= quarterStart).length;
    const newContacts = allContacts.filter(c => c.createdAt && new Date(c.createdAt) >= quarterStart).length;

    // Stage breakdown
    const stageBreakdown = {};
    activeDeals.forEach(d => { stageBreakdown[d.stage] = (stageBreakdown[d.stage] || 0) + 1; });
    const stageLines = Object.entries(stageBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([stage, count]) => `  - ${stage}: ${count} deal${count !== 1 ? 's' : ''}`)
      .join('\n');

    // Top deals to highlight
    const topDeals = activeDeals
      .filter(d => d.score >= 6 || ['Due Diligence', 'Exclusivity', 'Legal / Closing', 'LOI Submitted'].includes(d.stage))
      .slice(0, 5)
      .map(d => `  - ${d.name} (${d.stage})${d.ebitda ? ` — EBITDA: $${(d.ebitda/1000).toFixed(0)}k` : ''}${d.askingPrice ? `, Ask: $${(d.askingPrice/1000000).toFixed(1)}M` : ''}`)
      .join('\n');

    // Source breakdown
    const sourceCounts = {};
    allDeals.forEach(d => { if (d.source) sourceCounts[d.source] = (sourceCounts[d.source] || 0) + 1; });
    const sourceLines = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])
      .map(([s, c]) => `  - ${s}: ${c}`).join('\n');

    const dataContext = `
Period: ${quarterLabel}
Active deals: ${activeDeals.length} (total pipeline value: $${(totalValue/1000000).toFixed(1)}M asking)
Closed-won: ${closedWon.length}
Contacts in network: ${allContacts.length} (${newContacts} added this quarter)
Calls logged this quarter: ${callsThisQ}

Stage breakdown:
${stageLines || '  No active deals'}

Advanced-stage / high-priority deals:
${topDeals || '  None yet'}

Sourcing channels:
${sourceLines || '  No sourcing data'}
`;

    const hasAI = settings?.openaiApiKey || settings?.claudeApiKey;

    let reportText;
    if (hasAI) {
      reportText = await callAI(
        'You are a search fund investor writing a concise, professional quarterly LP update. Write in first person ("I" or "We"). Be specific, use the data provided, and maintain a confident but honest tone. Keep it to ~400 words.',
        `Write a quarterly LP update for ${quarterLabel} using this data:\n\n${dataContext}\n\nStructure: (1) Executive Summary, (2) Deal Pipeline Update, (3) Sourcing Activity, (4) Key Deals to Watch, (5) Looking Ahead. Include actual numbers. Do not fabricate any data not provided.`,
        700, 0.4
      );
    } else {
      // Fallback: structured template without AI
      reportText = `${quarterLabel} Investor Update

Dear Investors,

I am writing to share a brief update on my search fund progress for ${quarterLabel}.

PIPELINE OVERVIEW
I am currently tracking ${activeDeals.length} active deal${activeDeals.length !== 1 ? 's' : ''} with a combined asking price of approximately $${(totalValue/1000000).toFixed(1)}M. The pipeline breaks down as follows:
${stageLines || '  No active deals at this time.'}

SOURCING ACTIVITY
This quarter I held ${callsThisQ} calls and added ${newContacts} new contacts to my network.
${sourceLines ? `Deal sourcing by channel:\n${sourceLines}` : ''}

KEY DEALS
${topDeals || 'No advanced-stage deals to highlight this quarter.'}

LOOKING AHEAD
I will continue to deepen relationships across my network and advance the most promising opportunities to the next stage.

Best regards,
${currentUser.name}`;
    }

    // Store the report in localStorage for the shared dashboard view
    localStorage.setItem(`pulse_lp_report_${currentUser.id}`, JSON.stringify({
      text: reportText, quarter: quarterLabel, generatedAt: new Date().toISOString()
    }));

    if (previewEl) {
      previewEl.innerHTML = `
        <div class="border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden mb-3">
          <div class="bg-surface-50 dark:bg-surface-800 px-4 py-2 flex items-center justify-between border-b border-surface-200 dark:border-surface-700">
            <span class="text-xs font-semibold text-surface-500 uppercase tracking-wide">${quarterLabel} LP Update</span>
            <div class="flex gap-2">
              <button onclick="_copyLPReport()" class="text-xs text-brand-600 hover:underline">Copy text</button>
              <button onclick="this.closest('#lp-report-preview').innerHTML='';document.getElementById('lp-report-preview').classList.add('hidden')" class="text-xs text-surface-400 hover:text-surface-600">×</button>
            </div>
          </div>
          <div class="p-4 text-sm leading-relaxed whitespace-pre-wrap text-surface-700 dark:text-surface-300 max-h-72 overflow-y-auto" id="lp-report-text">${escapeHtml(reportText)}</div>
        </div>`;
    }

    showToast('LP report generated — include the "LP Investor Report" section in your shared link', 'success');
  } catch (err) {
    if (previewEl) previewEl.innerHTML = `<p class="text-sm text-red-500 mb-3">Generation failed: ${escapeHtml(err.message)}</p>`;
    showToast('LP report generation failed: ' + err.message, 'error');
  }
}

function _copyLPReport() {
  const el = document.getElementById('lp-report-text');
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => showToast('Copied to clipboard', 'success'));
}

// ── Save Settings ─────────────────────────────────────────────────

async function saveDashboardSettings() {
  const config = await _loadDashConfig();
  config.sections = Array.from(document.querySelectorAll('.share-section-cb:checked')).map(cb => cb.value);
  const checkedDeals = Array.from(document.querySelectorAll('.share-deal-cb:checked')).map(cb => cb.value);
  const allDealCbs  = Array.from(document.querySelectorAll('.share-deal-cb')).map(cb => cb.value);
  // Empty array = share all deals; otherwise store the specific subset
  config.includedDealIds = (checkedDeals.length === allDealCbs.length) ? [] : checkedDeals;
  config.passcode = (document.getElementById('share-passcode')?.value || '').trim();
  await _saveDashConfig(config);
  showToast('Settings saved', 'success');
}

// ── Invite / Email Sharing ────────────────────────────────────────

async function openShareEmailModal() {
  // Save settings first so the link reflects the latest choices
  await saveDashboardSettings();
  const config = await _loadDashConfig();
  if (!config.token) config.token = generateId();
  config.lastGeneratedAt = new Date().toISOString();
  const snapshot = await _buildSnapshot(config);
  try { localStorage.setItem(_SHARE_LS_PREFIX + config.token, JSON.stringify(snapshot)); } catch (e) {}
  const url = _snapshotToUrl(config.token, snapshot);
  await _saveDashConfig(config);

  openModal(`
    <div class="p-6 space-y-5">
      <div>
        <h2 class="text-lg font-semibold mb-1">Share Dashboard via Email</h2>
        <p class="text-sm text-surface-500">Fill in the recipient's details and click <strong>Open Email</strong> — your email client will open with a pre-composed message.</p>
      </div>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium mb-1.5" style="color:var(--text-secondary);letter-spacing:0.06em;text-transform:uppercase;">Recipient Name</label>
            <input type="text" id="share-to-name" class="input-field" placeholder="e.g. Sarah Chen" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1.5" style="color:var(--text-secondary);letter-spacing:0.06em;text-transform:uppercase;">Recipient Email <span style="color:var(--text-muted);">*</span></label>
            <input type="email" id="share-to-email" class="input-field" placeholder="sarah@example.com" />
          </div>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1.5" style="color:var(--text-secondary);letter-spacing:0.06em;text-transform:uppercase;">Personal Note <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>
          <textarea id="share-note" class="input-field" rows="3"
            placeholder="e.g. Wanted to loop you in on our current pipeline before our call next week."></textarea>
        </div>

        <div class="rounded-lg p-3" style="background:rgba(255,255,255,0.03);border:0.5px solid var(--border-subtle);">
          <p class="text-xs font-medium mb-1" style="color:var(--text-muted);">Link that will be shared</p>
          <p class="text-xs font-mono break-all" style="color:var(--gold);opacity:0.8;">${escapeHtml(url.length > 80 ? url.slice(0, 80) + '…' : url)}</p>
          ${config.passcode ? `<p class="text-xs mt-1.5" style="color:var(--text-muted);">Passcode: <strong style="color:var(--text-secondary);">${escapeHtml(config.passcode)}</strong> (will be included in email)</p>` : ''}
        </div>
      </div>

      <div class="flex justify-between items-center pt-3" style="border-top:0.5px solid var(--border-subtle);">
        <button onclick="closeModal()" class="btn-ghost btn-sm" style="color:var(--text-muted);">Cancel</button>
        <button onclick="_sendShareEmail('${escapeHtml(url)}')" class="btn-primary flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/>
          </svg>
          Open Email
        </button>
      </div>
    </div>
  `);

  setTimeout(() => document.getElementById('share-to-name')?.focus(), 100);
}

async function _sendShareEmail(url) {
  const toName  = (document.getElementById('share-to-name')?.value  || '').trim();
  const toEmail = (document.getElementById('share-to-email')?.value || '').trim();
  const note    = (document.getElementById('share-note')?.value     || '').trim();

  if (!toEmail) { showToast('Enter a recipient email address', 'error'); return; }

  const config  = await _loadDashConfig();
  const fromName = currentUser?.name || 'A SearchPulse user';
  const greeting = toName ? `Hi ${toName},` : 'Hi,';
  const passcodeSection = config.passcode ? `\nPasscode: ${config.passcode}\n` : '';
  const noteSection = note ? `\n${note}\n` : '';

  const body =
`${greeting}

I'd like to share my current search fund pipeline and CRM overview with you via SearchPulse.

Click the link below to view the dashboard — no sign-in required:
${url}
${passcodeSection}${noteSection}
Best,
${fromName}`;

  const subject = `SearchPulse Dashboard — ${fromName}`;
  window.location.href = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // Record the invite
  if (!Array.isArray(config.invites)) config.invites = [];
  config.invites.push({ name: toName, email: toEmail, addedAt: new Date().toISOString(), method: 'email' });
  await _saveDashConfig(config);

  closeModal();
  showToast('Email client opened — your message is ready to send', 'success');
  renderSharedDashboardPage();
}

async function emailInviteAgain(idx) {
  const config = await _loadDashConfig();
  const inv = config.invites?.[idx];
  if (!inv?.email) return;

  if (!config.token) { showToast('Generate a link first', 'error'); return; }
  const snapshot = await _buildSnapshot(config);
  try { localStorage.setItem(_SHARE_LS_PREFIX + config.token, JSON.stringify(snapshot)); } catch (e) {}
  const url = _snapshotToUrl(config.token, snapshot);

  const fromName = currentUser?.name || 'A SearchPulse user';
  const greeting = inv.name ? `Hi ${inv.name},` : 'Hi,';
  const passcodeSection = config.passcode ? `\nPasscode: ${config.passcode}\n` : '';

  const body =
`${greeting}

Here's a refreshed link to my SearchPulse dashboard with the latest data:
${url}
${passcodeSection}
Best,
${fromName}`;

  const subject = `SearchPulse Dashboard — Updated — ${fromName}`;
  window.location.href = `mailto:${encodeURIComponent(inv.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  showToast('Email client opened', 'success');
}

function openAddInviteModal() {
  openModal(`
    <div class="p-6">
      <h2 class="text-lg font-semibold mb-1">Track a recipient</h2>
      <p class="text-sm text-surface-500 mb-5">Log someone you've shared the dashboard link with another way (call, Slack, etc.).</p>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium mb-1.5" style="color:var(--text-secondary);letter-spacing:0.06em;text-transform:uppercase;">Name</label>
          <input type="text" id="inv-name" class="input-field" placeholder="e.g. Sarah Chen" />
        </div>
        <div>
          <label class="block text-xs font-medium mb-1.5" style="color:var(--text-secondary);letter-spacing:0.06em;text-transform:uppercase;">Email <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>
          <input type="email" id="inv-email" class="input-field" placeholder="sarah@example.com" />
        </div>
        <div class="flex justify-end gap-3 pt-3" style="border-top:0.5px solid var(--border-subtle);">
          <button onclick="closeModal()" class="btn-ghost">Cancel</button>
          <button onclick="addInvite()" class="btn-primary">Save</button>
        </div>
      </div>
    </div>
  `, { small: true });
}

async function addInvite() {
  const name  = document.getElementById('inv-name')?.value.trim()  || '';
  const email = document.getElementById('inv-email')?.value.trim() || '';
  if (!name && !email) { showToast('Enter a name or email', 'error'); return; }
  const config = await _loadDashConfig();
  if (!Array.isArray(config.invites)) config.invites = [];
  config.invites.push({ name, email, addedAt: new Date().toISOString(), method: 'tracked' });
  await _saveDashConfig(config);
  closeModal();
  showToast('Recipient tracked', 'success');
  renderSharedDashboardPage();
}

async function removeInvite(idx) {
  const config = await _loadDashConfig();
  if (!Array.isArray(config.invites) || idx < 0 || idx >= config.invites.length) return;
  config.invites.splice(idx, 1);
  await _saveDashConfig(config);
  showToast('Removed', 'success');
  renderSharedDashboardPage();
}

// ── Snapshot Builder ──────────────────────────────────────────────

async function _buildSnapshot(config) {
  const [contacts, companies, calls, allDeals] = await Promise.all([
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.companies, currentUser.id),
    DB.getForUser(STORES.calls, currentUser.id),
    DB.getAll(STORES.deals).then(all => all.filter(d => d.userId === currentUser.id)).catch(() => []),
  ]);

  const active = getActiveContacts(contacts);
  const now    = new Date();
  const overdue = active.filter(c => c.nextFollowUpDate && new Date(c.nextFollowUpDate) < now);
  const healthy = active.filter(c => c.lastContactDate && (now - new Date(c.lastContactDate)) < 30 * 86400000).length;
  const stale   = active.filter(c => !c.lastContactDate || (now - new Date(c.lastContactDate)) > 90 * 86400000).length;
  const atRisk  = active.length - healthy - stale;

  const stageCount = {};
  active.forEach(c => { stageCount[c.stage || 'Unknown'] = (stageCount[c.stage || 'Unknown'] || 0) + 1; });

  const companyMap = buildMap(companies);

  // Which deals to include
  const selectedDeals = config.includedDealIds?.length
    ? allDeals.filter(d => config.includedDealIds.includes(d.id))
    : allDeals;

  const sourceCount = {};
  selectedDeals.forEach(d => { if (d.source) sourceCount[d.source] = (sourceCount[d.source] || 0) + 1; });

  // Build full deal payloads
  const dealList = [];
  for (const d of selectedDeals) {
    const [docs, dealNotes, history, tasks] = await Promise.all([
      DB.getAllByIndex(STORES.dealDocuments, 'dealId', d.id).catch(() => []),
      DB.getAllByIndex(STORES.dealNotes,    'dealId', d.id).catch(() => []),
      DB.getAllByIndex(STORES.dealHistory,  'dealId', d.id).catch(() => []),
      DB.getAllByIndex(STORES.dealTasks,    'dealId', d.id).catch(() => []),
    ]);

    dealList.push({
      id:          d.id,
      name:        d.name,
      stage:       d.stage,
      status:      d.status,
      priority:    d.priority,
      source:      d.source,
      sector:      d.sector,
      location:    d.location,
      revenue:     d.revenue,
      ebitda:      d.ebitda,
      askingPrice: d.askingPrice,
      multiple:    (d.askingPrice && d.ebitda) ? (d.askingPrice / d.ebitda).toFixed(1) : null,
      employees:   d.employees,
      description: d.description,
      highlights:  d.highlights,
      concerns:    d.concerns,
      createdAt:   d.createdAt,
      documents: docs.map(doc => ({
        name:       doc.name,
        category:   doc.category,
        type:       doc.type,
        size:       doc.size,
        uploadedAt: doc.uploadedAt || doc.createdAt,
      })),
      notes: dealNotes
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5)
        .map(n => ({ content: n.content, createdAt: n.createdAt })),
      history: history
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .map(h => ({ action: h.action, description: h.description, timestamp: h.timestamp })),
      tasks: tasks
        .filter(t => t.status !== 'done')
        .slice(0, 8)
        .map(t => ({ title: t.title, status: t.status, dueDate: t.dueDate, priority: t.priority })),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    generatedBy: currentUser.name,
    sections:    config.sections,
    passcode:    config.passcode || '',
    data: {
      crm: {
        totalContacts:    active.length,
        totalCompanies:   companies.length,
        totalCalls:       calls.length,
        overdueFollowUps: overdue.length,
        stageDistribution: stageCount,
        relationshipHealth: { healthy, atRisk, stale },
        recentContacts: active
          .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
          .slice(0, 10)
          .map(c => ({
            name:    c.fullName,
            title:   c.title   || '',
            company: companyMap[c.companyId]?.name || '',
            stage:   c.stage   || '',
          })),
      },
      deals: {
        total:         selectedDeals.length,
        active:        selectedDeals.filter(d => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage)).length,
        pipelineValue: selectedDeals.filter(d => !['Closed - Lost', 'Rejected'].includes(d.stage)).reduce((s, d) => s + (d.askingPrice || 0), 0),
        byStage:  selectedDeals.reduce((acc, d) => { acc[d.stage || 'Unknown'] = (acc[d.stage || 'Unknown'] || 0) + 1; return acc; }, {}),
        bySource: sourceCount,
        list:     dealList,
      },
    },
  };
}

function _snapshotToUrl(token, snapshot) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))));
  return `${location.origin}${location.pathname}#shared/${token}/${encoded}`;
}

// ── Generate / Preview ────────────────────────────────────────────

async function generateAndCopyLink() {
  await saveDashboardSettings();
  const config = await _loadDashConfig();
  if (!config.token) config.token = generateId();
  config.lastGeneratedAt = new Date().toISOString();

  const snapshot = await _buildSnapshot(config);

  // Persist in localStorage so same-device viewers get full data fast
  try {
    localStorage.setItem(_SHARE_LS_PREFIX + config.token, JSON.stringify(snapshot));
  } catch (e) { /* quota exceeded — URL fallback still works */ }

  const url = _snapshotToUrl(config.token, snapshot);
  await _saveDashConfig(config);

  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard!', 'success');
  } catch (e) {
    // Clipboard blocked — show fallback modal
    openModal(`
      <div class="p-6">
        <h2 class="text-lg font-semibold mb-2">Your Dashboard Link</h2>
        <p class="text-sm text-surface-500 mb-3">Copy and share this link:</p>
        <textarea class="input-field text-xs w-full h-24 font-mono resize-none" readonly
          onclick="this.select()">${escapeHtml(url)}</textarea>
        <div class="flex justify-end mt-4">
          <button onclick="closeModal()" class="btn-secondary">Close</button>
        </div>
      </div>
    `);
  }

  renderSharedDashboardPage();
}

async function previewSharedDashboard() {
  await saveDashboardSettings();
  const config = await _loadDashConfig();
  const snapshot = await _buildSnapshot(config);
  // Preview ignores passcode so you can see the full view
  const previewSnap = { ...snapshot, passcode: '' };
  const previewToken = 'preview_' + (config.token || generateId());
  try {
    localStorage.setItem(_SHARE_LS_PREFIX + previewToken, JSON.stringify(previewSnap));
  } catch (e) { /* quota — URL fallback */ }
  const url = _snapshotToUrl(previewToken, previewSnap);
  window.open(url, '_blank');
}

// ── Route Check (called on app load) ─────────────────────────────

function checkSharedDashboardRoute() {
  const hash = location.hash;
  if (!hash.startsWith('#shared/')) return false;

  const rest     = hash.slice('#shared/'.length);
  const slashIdx = rest.indexOf('/');
  const token    = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
  const encoded  = slashIdx === -1 ? ''   : rest.slice(slashIdx + 1);

  let snapshot = null;

  // Try localStorage first (same device, no URL-length limits)
  try {
    const stored = localStorage.getItem(_SHARE_LS_PREFIX + token);
    if (stored) snapshot = JSON.parse(stored);
  } catch (e) { /* ignore */ }

  // Fall back to URL-embedded base64
  if (!snapshot && encoded) {
    try {
      snapshot = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    } catch (e) { /* ignore */ }
  }

  if (!snapshot) {
    _renderNoData();
    return true;
  }

  renderSharedDashboardView(snapshot);
  return true;
}

// ── Shared View Entry Point ───────────────────────────────────────

function renderSharedDashboardView(snapshot) {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.add('hidden');

  let view = document.getElementById('shared-view');
  if (!view) {
    view = document.createElement('div');
    view.id = 'shared-view';
    view.className = 'min-h-screen bg-surface-50 dark:bg-surface-950';
    document.body.appendChild(view);
  }
  view.classList.remove('hidden');

  if (snapshot.passcode) {
    _pendingSnapshot = snapshot;
    _renderPasscodeGate(view);
    return;
  }

  _renderDashboard(snapshot, view);
}

function _renderNoData() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  let view = document.getElementById('shared-view');
  if (!view) {
    view = document.createElement('div');
    view.id = 'shared-view';
    view.className = 'min-h-screen bg-surface-50 dark:bg-surface-950';
    document.body.appendChild(view);
  }
  view.classList.remove('hidden');
  view.innerHTML = `
    <div class="max-w-md mx-auto px-4 py-24 text-center">
      <svg class="w-14 h-14 mx-auto mb-4 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
      </svg>
      <h2 class="text-xl font-bold mb-2">Link unavailable</h2>
      <p class="text-sm text-surface-500">This shared dashboard link has expired or is invalid.<br>Ask the sender to generate and share a new link.</p>
    </div>
  `;
}

function _renderPasscodeGate(view) {
  view.innerHTML = `
    <div class="min-h-screen flex items-center justify-center px-4">
      <div class="bg-white dark:bg-surface-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center space-y-5">
        <div class="w-14 h-14 bg-brand-100 dark:bg-brand-900/30 rounded-full flex items-center justify-center mx-auto">
          <svg class="w-7 h-7 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-bold mb-1">Protected Dashboard</h2>
          <p class="text-sm text-surface-500">Enter the passcode to view this shared dashboard</p>
        </div>
        <div class="text-left">
          <input type="text" id="shared-passcode-input"
            class="input-field text-center text-lg tracking-widest w-full"
            placeholder="Enter passcode"
            onkeydown="if(event.key==='Enter') checkSharedPasscode()" />
          <p id="passcode-err" class="text-xs text-red-500 mt-2 text-center hidden">Incorrect passcode. Please try again.</p>
        </div>
        <button onclick="checkSharedPasscode()" class="btn-primary w-full">Unlock Dashboard</button>
      </div>
    </div>
  `;
  setTimeout(() => document.getElementById('shared-passcode-input')?.focus(), 100);
}

function checkSharedPasscode() {
  const input = document.getElementById('shared-passcode-input')?.value || '';
  const view  = document.getElementById('shared-view');
  if (input === _pendingSnapshot.passcode) {
    _renderDashboard(_pendingSnapshot, view);
  } else {
    const err = document.getElementById('passcode-err');
    if (err) err.classList.remove('hidden');
    document.getElementById('shared-passcode-input')?.select();
  }
}

// ── Dashboard Renderer ────────────────────────────────────────────

function _renderDashboard(snapshot, view) {
  const d        = snapshot.data;
  const sections = snapshot.sections || [];

  const fmtMoney = n => {
    if (!n && n !== 0) return '—';
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n}`;
  };

  function statBox(label, value, color) {
    const cls = {
      brand:  'text-brand-600',
      green:  'text-green-600',
      yellow: 'text-yellow-500',
      red:    'text-red-500',
      purple: 'text-purple-600',
    }[color] || 'text-brand-600';
    return `
      <div class="p-4 bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700 rounded-lg text-center">
        <p class="text-2xl font-bold ${cls} tracking-tight">${value}</p>
        <p class="text-xs text-surface-500 mt-1 leading-tight">${label}</p>
      </div>`;
  }

  function barRow(label, value, max, color) {
    const pct = max ? Math.round(value / max * 100) : 0;
    return `
      <div class="flex items-center gap-3">
        <span class="text-xs text-surface-500 w-40 truncate shrink-0">${escapeHtml(label)}</span>
        <div class="flex-1 bg-surface-100 dark:bg-surface-700 h-2 rounded-full overflow-hidden">
          <div class="h-2 rounded-full" style="width:${pct}%;background:${color || '#5c7cfa'}"></div>
        </div>
        <span class="text-xs font-semibold w-5 text-right shrink-0">${value}</span>
      </div>`;
  }

  const STAGE_BADGE = {
    'Screening':         'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300',
    'NDA Signed':        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    'CIM Review':        'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    'Management Call':   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    'LOI Submitted':     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    'Due Diligence':     'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    'Closed - Won':      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    'Closed - Lost':     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    'Rejected':          'bg-surface-100 text-surface-400',
  };

  let html = `
    <div class="max-w-5xl mx-auto px-4 py-8 space-y-6 animate-fade-in">

      <!-- Header -->
      <div class="flex items-start justify-between flex-wrap gap-4 pb-5 border-b border-surface-200 dark:border-surface-800">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-brand-600 text-white rounded-lg flex items-center justify-center shrink-0">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5"/>
            </svg>
          </div>
          <div>
            <h1 class="text-lg font-bold leading-tight">Nexus CRM — Shared Dashboard</h1>
            <p class="text-sm text-surface-500 mt-0.5">
              Shared by <strong class="text-surface-700 dark:text-surface-300">${escapeHtml(snapshot.generatedBy)}</strong>
              &nbsp;·&nbsp;
              ${new Date(snapshot.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
        <span class="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 px-3 py-1.5 rounded-full font-medium">
          Read-only snapshot
        </span>
      </div>
  `;

  // ── CRM Overview ──────────────────────────────────────────────
  if (sections.includes('crm_stats') && d.crm) {
    html += `
      <div class="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 p-5">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">CRM Overview</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          ${statBox('Active Contacts',    d.crm.totalContacts,    'brand')}
          ${statBox('Companies',          d.crm.totalCompanies,   'brand')}
          ${statBox('Calls Logged',       d.crm.totalCalls,       'purple')}
          ${statBox('Overdue Follow-ups', d.crm.overdueFollowUps, d.crm.overdueFollowUps > 0 ? 'red' : 'green')}
        </div>
      </div>`;
  }

  // ── Relationship Health ───────────────────────────────────────
  if (sections.includes('relationship_health') && d.crm?.relationshipHealth) {
    const rh    = d.crm.relationshipHealth;
    const total = (rh.healthy + rh.atRisk + rh.stale) || 1;
    html += `
      <div class="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 p-5">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Relationship Health</h2>
        <div class="grid grid-cols-3 gap-3 mb-5">
          ${statBox('Active',  rh.healthy, 'green')}
          ${statBox('At Risk', rh.atRisk,  'yellow')}
          ${statBox('Stale',   rh.stale,   'red')}
        </div>
        <div class="flex h-3 rounded-full overflow-hidden">
          <div class="bg-green-500"  style="width:${Math.round(rh.healthy / total * 100)}%"></div>
          <div class="bg-yellow-400" style="width:${Math.round(rh.atRisk  / total * 100)}%"></div>
          <div class="bg-red-400"    style="width:${Math.round(rh.stale   / total * 100)}%"></div>
        </div>
        <div class="flex gap-5 mt-2.5 text-xs text-surface-400">
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>Active</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block"></span>At Risk</span>
          <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-red-400 inline-block"></span>Stale</span>
        </div>
      </div>`;
  }

  // ── Stage Distribution ────────────────────────────────────────
  if (sections.includes('stage_distribution') && d.crm?.stageDistribution) {
    const stages = Object.entries(d.crm.stageDistribution).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const maxS   = Math.max(...stages.map(([, v]) => v), 1);
    if (stages.length > 0) {
      html += `
        <div class="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 p-5">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Contact Stage Distribution</h2>
          <div class="space-y-3">${stages.map(([stage, count]) => barRow(stage, count, maxS, '#5c7cfa')).join('')}</div>
        </div>`;
    }
  }

  // ── Deal Pipeline ─────────────────────────────────────────────
  if (sections.includes('deal_pipeline') && d.deals) {
    const stageEntries = Object.entries(d.deals.byStage || {}).sort((a, b) => b[1] - a[1]);
    const maxStage     = Math.max(...stageEntries.map(([, v]) => v), 1);
    html += `
      <div class="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 p-5">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Deal Pipeline</h2>
        <div class="grid grid-cols-3 gap-3 mb-5">
          ${statBox('Total Deals',    d.deals.total,         'brand')}
          ${statBox('Active Deals',   d.deals.active,        'green')}
          ${statBox('Pipeline Value', fmtMoney(d.deals.pipelineValue), 'purple')}
        </div>
        ${stageEntries.length > 0 ? `
          <div class="space-y-2.5 pt-4 border-t border-surface-100 dark:border-surface-800">
            <p class="text-xs text-surface-400 mb-3">By Stage</p>
            ${stageEntries.map(([stage, count]) => barRow(stage, count, maxStage, '#7c3aed')).join('')}
          </div>
        ` : ''}
      </div>`;
  }

  // ── Deal Sourcing ─────────────────────────────────────────────
  if (sections.includes('deal_sourcing') && d.deals?.bySource) {
    const sources = Object.entries(d.deals.bySource).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const maxSrc  = Math.max(...sources.map(([, v]) => v), 1);
    if (sources.length > 0) {
      html += `
        <div class="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 p-5">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-4">Deal Sourcing</h2>
          <div class="space-y-3">${sources.map(([src, count]) => barRow(src, count, maxSrc, '#7c3aed')).join('')}</div>
        </div>`;
    }
  }

  // ── Deal Cards ────────────────────────────────────────────────
  const showDetails   = sections.includes('deal_details');
  const showDocuments = sections.includes('deal_documents');
  if ((showDetails || showDocuments) && d.deals?.list?.length) {
    html += `<div class="space-y-5">
      <h2 class="text-xs font-semibold uppercase tracking-wider text-surface-400">Deals</h2>`;

    for (const deal of d.deals.list) {
      const stageCls    = STAGE_BADGE[deal.stage] || 'bg-surface-100 text-surface-700';
      const priorityDot = { High: '🔴', Medium: '🟡', Low: '🟢' }[deal.priority] || '';

      html += `
        <div class="bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-800 overflow-hidden">

          <!-- Deal header -->
          <div class="px-5 py-4 border-b border-surface-100 dark:border-surface-800">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <h3 class="text-base font-bold">${escapeHtml(deal.name)}</h3>
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium ${stageCls}">${escapeHtml(deal.stage || '—')}</span>
                  ${deal.priority ? `<span class="text-xs text-surface-500">${priorityDot} ${escapeHtml(deal.priority)}</span>` : ''}
                </div>
                <p class="text-xs text-surface-400">
                  ${[deal.sector, deal.location, deal.source ? `Source: ${deal.source}` : ''].filter(Boolean).map(s => escapeHtml(s)).join(' · ')}
                </p>
              </div>
            </div>
          </div>

          ${showDetails ? `
            <!-- Financials -->
            <div class="grid grid-cols-2 sm:grid-cols-4 border-b border-surface-100 dark:border-surface-800 divide-x divide-surface-100 dark:divide-surface-800">
              ${[
                ['Revenue',      fmtMoney(deal.revenue)],
                ['EBITDA',       fmtMoney(deal.ebitda)],
                ['Asking Price', fmtMoney(deal.askingPrice)],
                ['Multiple',     deal.multiple ? `${deal.multiple}x` : '—'],
              ].map(([label, value]) => `
                <div class="px-4 py-3 text-center">
                  <p class="text-xs text-surface-400 mb-0.5">${label}</p>
                  <p class="text-sm font-bold">${value}</p>
                </div>
              `).join('')}
            </div>

            ${deal.employees ? `
              <div class="px-5 pt-3 text-xs text-surface-500">${deal.employees.toLocaleString()} employees</div>
            ` : ''}

            ${deal.description ? `
              <div class="px-5 py-3">
                <p class="text-xs font-medium text-surface-400 mb-1">About</p>
                <p class="text-sm text-surface-700 dark:text-surface-300 leading-relaxed">${escapeHtml(deal.description)}</p>
              </div>
            ` : ''}

            ${deal.highlights?.length ? `
              <div class="px-5 py-3 border-t border-surface-50 dark:border-surface-800/60">
                <p class="text-xs font-medium text-green-600 dark:text-green-400 mb-2">✓ Highlights</p>
                <ul class="space-y-1">
                  ${(Array.isArray(deal.highlights) ? deal.highlights : String(deal.highlights).split('\n').filter(Boolean))
                    .map(h => `<li class="text-xs text-surface-600 dark:text-surface-400 flex gap-2"><span class="text-green-500 shrink-0 mt-0.5">•</span>${escapeHtml(h)}</li>`)
                    .join('')}
                </ul>
              </div>
            ` : ''}

            ${deal.concerns?.length ? `
              <div class="px-5 py-3 border-t border-surface-50 dark:border-surface-800/60">
                <p class="text-xs font-medium text-red-500 mb-2">⚠ Concerns</p>
                <ul class="space-y-1">
                  ${(Array.isArray(deal.concerns) ? deal.concerns : String(deal.concerns).split('\n').filter(Boolean))
                    .map(c => `<li class="text-xs text-surface-600 dark:text-surface-400 flex gap-2"><span class="text-red-400 shrink-0 mt-0.5">•</span>${escapeHtml(c)}</li>`)
                    .join('')}
                </ul>
              </div>
            ` : ''}

            ${deal.history?.length ? `
              <div class="px-5 py-4 border-t border-surface-50 dark:border-surface-800/60">
                <p class="text-xs font-medium text-surface-400 mb-3">Deal Timeline</p>
                <div class="relative border-l-2 border-surface-200 dark:border-surface-700 pl-4 space-y-3 ml-1">
                  ${deal.history.map((h, i) => `
                    <div class="relative">
                      <div class="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-surface-900 ${i === deal.history.length - 1 ? 'bg-brand-500' : 'bg-surface-300 dark:bg-surface-600'}"></div>
                      <p class="text-xs font-semibold text-surface-700 dark:text-surface-300">${escapeHtml(h.action)}</p>
                      ${h.description ? `<p class="text-xs text-surface-500 mt-0.5 leading-relaxed">${escapeHtml(h.description)}</p>` : ''}
                      <p class="text-xs text-surface-300 dark:text-surface-600 mt-0.5">${formatDate(h.timestamp)}</p>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${deal.notes?.length ? `
              <div class="px-5 py-4 border-t border-surface-50 dark:border-surface-800/60">
                <p class="text-xs font-medium text-surface-400 mb-3">Key Notes</p>
                <div class="space-y-3">
                  ${deal.notes.map(n => `
                    <div class="text-xs border-l-2 border-brand-200 dark:border-brand-800 pl-3">
                      <p class="text-surface-300 dark:text-surface-600 mb-1">${formatDate(n.createdAt)}</p>
                      <p class="text-surface-600 dark:text-surface-400 whitespace-pre-line leading-relaxed">${escapeHtml(n.content || '')}</p>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${deal.tasks?.length ? `
              <div class="px-5 py-4 border-t border-surface-50 dark:border-surface-800/60">
                <p class="text-xs font-medium text-surface-400 mb-3">Open Tasks</p>
                <div class="space-y-2">
                  ${deal.tasks.map(t => `
                    <div class="flex items-center gap-2 text-xs">
                      <span class="w-1.5 h-1.5 rounded-full shrink-0 ${t.status === 'in-progress' ? 'bg-brand-500' : 'bg-surface-300'}"></span>
                      <span class="flex-1 text-surface-600 dark:text-surface-400">${escapeHtml(t.title)}</span>
                      ${t.dueDate ? `<span class="text-surface-300 shrink-0">${formatDate(t.dueDate)}</span>` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          ` : ''}

          ${showDocuments && deal.documents?.length ? `
            <div class="px-5 py-4 border-t border-surface-100 dark:border-surface-800">
              <p class="text-xs font-medium text-surface-400 mb-3">Documents (${deal.documents.length})</p>
              <div class="space-y-2">
                ${deal.documents.map(doc => `
                  <div class="flex items-center gap-2.5 text-xs">
                    <svg class="w-4 h-4 text-surface-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <span class="flex-1 truncate font-medium text-surface-700 dark:text-surface-300">${escapeHtml(doc.name || 'Untitled')}</span>
                    ${doc.category ? `<span class="text-surface-400 shrink-0">${escapeHtml(doc.category)}</span>` : ''}
                    ${doc.size ? `<span class="text-surface-300 dark:text-surface-600 shrink-0">${_fmtFileSize(doc.size)}</span>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

        </div>`;
    }
    html += '</div>';
  }

  // Footer
  html += `
    <div class="text-center py-6 border-t border-surface-200 dark:border-surface-800">
      <p class="text-xs text-surface-400">
        Generated by Nexus CRM ·
        ${new Date(snapshot.generatedAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  </div>`;

  view.innerHTML = html;
}

function _fmtFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
