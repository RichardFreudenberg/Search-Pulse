/* ============================================
   Nexus CRM — Settings Page
   ============================================ */

async function renderSettings() {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  const pageContent = document.getElementById('page-content');

  const _isDark = document.documentElement.classList.contains('dark');
  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-3xl mx-auto animate-fade-in">

      <!-- Page header with inline Save button -->
      <div class="flex items-center justify-between mb-2">
        <div>
          <h1 class="page-header-title">Settings</h1>
          <p class="page-sub mt-0.5">Configure your CRM preferences</p>
        </div>
        <button onclick="saveSettings()" class="btn-primary flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Save Settings
        </button>
      </div>

      <!-- ── GENERAL ───────────────────────────────── -->
      <p class="settings-section-label">General</p>

      <div class="card mb-4">
        <!-- Appearance row -->
        <div class="flex items-center justify-between py-3 border-b border-surface-100 dark:border-surface-800">
          <div>
            <p class="text-sm font-semibold">Dark Mode</p>
            <p class="text-xs text-surface-400 mt-0.5">Switch between light and dark themes</p>
          </div>
          <button onclick="toggleThemeFromSettings()" id="theme-toggle-btn"
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${_isDark ? 'bg-brand-600' : 'bg-surface-300'}">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${_isDark ? 'translate-x-6' : 'translate-x-1'}"></span>
          </button>
        </div>

        <!-- Follow-up defaults -->
        <div class="pt-4">
          <p class="text-sm font-semibold mb-3">Follow-up Defaults</p>
          <div class="flex items-center justify-between mb-4">
            <div>
              <p class="text-sm">Default follow-up window</p>
              <p class="text-xs text-surface-400">Days after a call before follow-up reminder fires</p>
            </div>
            <div class="flex items-center gap-2">
              <input type="number" id="settings-default-followup" class="input-field w-20 text-center"
                value="${settings?.defaultFollowUpDays || 14}" min="1" max="365" />
              <span class="text-xs text-surface-500">days</span>
            </div>
          </div>

          <p class="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">Cadence by stage</p>
          <div class="space-y-2">
            ${STAGES.map(stage => `
              <div class="flex items-center justify-between">
                <span class="text-sm">${escapeHtml(stage)}</span>
                <div class="flex items-center gap-2">
                  <input type="number"
                    id="settings-cadence-${stage.replace(/\s+/g, '-').toLowerCase()}"
                    class="input-field w-20 text-center"
                    value="${settings?.stageCadence?.[stage] || 14}" min="1" max="365" />
                  <span class="text-xs text-surface-500">days</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- ── AI MODELS ─────────────────────────────── -->
      <p class="settings-section-label">AI Models</p>

      <div class="card mb-4">
        <div class="flex items-center justify-between mb-1">
          <div>
            <p class="text-sm font-semibold">AI API Keys</p>
            <p class="text-xs text-surface-400">Stored locally in your browser — never sent to our servers</p>
          </div>
          ${settings?.openaiApiKey
            ? `<span class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">OpenAI active</span>`
            : settings?.claudeApiKey
              ? `<span class="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-medium">Claude active</span>`
              : `<span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">No AI key set</span>`
          }
        </div>
        ${(settings?.openaiApiKey && settings?.claudeApiKey) ? `
          <div class="mt-2 mb-3 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800">
            <p class="text-xs text-blue-700 dark:text-blue-300">Both keys are set — OpenAI takes priority. Remove the OpenAI key to switch to Claude.</p>
          </div>
        ` : ''}

        <div class="space-y-0 divide-y divide-surface-100 dark:divide-surface-800 mt-4">
          <div class="py-4 first:pt-0">
            <div class="flex items-start justify-between mb-2">
              <div>
                <p class="text-sm font-semibold">OpenAI API Key</p>
                <p class="text-xs text-surface-400">GPT-4o-mini · <a href="https://platform.openai.com/api-keys" target="_blank" class="text-brand-600 hover:underline">platform.openai.com</a></p>
              </div>
              ${settings?.openaiApiKey ? `<span class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium flex-shrink-0">✓ Set</span>` : ''}
            </div>
            <input type="password" id="settings-openai-key" class="input-field" placeholder="sk-…"
              value="${settings?.openaiApiKey || ''}" />
          </div>

          <div class="py-4 last:pb-0">
            <div class="flex items-start justify-between mb-2">
              <div>
                <p class="text-sm font-semibold">Claude API Key <span class="text-xs font-normal text-surface-400 ml-1">alternative to OpenAI</span></p>
                <p class="text-xs text-surface-400">Claude 3.5 Haiku · <a href="https://console.anthropic.com/settings/keys" target="_blank" class="text-brand-600 hover:underline">console.anthropic.com</a></p>
              </div>
              ${settings?.claudeApiKey ? `<span class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium flex-shrink-0">✓ Set</span>` : ''}
            </div>
            <input type="password" id="settings-claude-key" class="input-field" placeholder="sk-ant-…"
              value="${settings?.claudeApiKey || ''}" />
          </div>
        </div>
      </div>

      <!-- ── INTEGRATIONS ───────────────────────────── -->
      <p class="settings-section-label">Integrations</p>

      <!-- LinkedIn card -->
      <div class="card mb-4">
        <div class="flex items-center gap-3 mb-3">
          <svg class="w-5 h-5 text-[#0A66C2] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          <div class="flex-1">
            <p class="text-sm font-semibold">LinkedIn</p>
            <p class="text-xs text-surface-400">Profile URL for networking suggestions &amp; enrichment</p>
          </div>
          ${settings?.linkedInProfileUrl
            ? `<span class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium flex-shrink-0">✓ Connected</span>`
            : ''
          }
        </div>
        <input type="url" id="settings-linkedin-url" class="input-field"
          placeholder="https://www.linkedin.com/in/your-profile"
          value="${escapeHtml(settings?.linkedInProfileUrl || '')}" />
        <p class="text-xs text-surface-400 mt-1.5">Used to generate personalized networking suggestions. Add a RapidAPI key below to also auto-enrich contact profiles.</p>
      </div>

      <!-- ── RESEARCH & DATA ENRICHMENT ─────────────── -->
      <p class="settings-section-label">Research &amp; Data Enrichment</p>

      <div class="card mb-4">
        <p class="text-xs text-surface-400 mb-4">All keys stored locally — never sent to our servers.</p>
        <div class="space-y-0 divide-y divide-surface-100 dark:divide-surface-800">

          <div class="py-4 first:pt-0">
            <div class="flex items-start justify-between mb-2">
              <div>
                <p class="text-sm font-semibold">Tavily API Key
                  <span class="ml-1.5 text-xs font-normal text-green-600 dark:text-green-400">Recommended</span>
                </p>
                <p class="text-xs text-surface-400">Web research, call prep, memo market data, sourcing intelligence · <a href="https://tavily.com" target="_blank" class="text-brand-600 hover:underline">tavily.com</a> (1,000 free searches/mo)</p>
              </div>
              ${settings?.tavilyApiKey ? `<span class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium flex-shrink-0 ml-3">✓ Set</span>` : ''}
            </div>
            <input type="password" id="settings-tavily-key" class="input-field" placeholder="tvly-…"
              value="${escapeHtml(settings?.tavilyApiKey || '')}" />
          </div>

          <div class="py-4">
            <div class="flex items-start justify-between mb-2">
              <div>
                <p class="text-sm font-semibold">Firecrawl API Key <span class="text-xs font-normal text-surface-400 ml-1">optional</span></p>
                <p class="text-xs text-surface-400">Better JS-rendered website reading for memos · <a href="https://firecrawl.dev" target="_blank" class="text-brand-600 hover:underline">firecrawl.dev</a> (500 free scrapes/mo) · falls back to Jina.ai</p>
              </div>
              ${settings?.firecrawlApiKey ? `<span class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium flex-shrink-0 ml-3">✓ Set</span>` : ''}
            </div>
            <input type="password" id="settings-firecrawl-key" class="input-field" placeholder="fc-…"
              value="${escapeHtml(settings?.firecrawlApiKey || '')}" />
          </div>

          <div class="py-4">
            <div class="flex items-start justify-between mb-2">
              <div>
                <p class="text-sm font-semibold">RapidAPI Key <span class="text-xs font-normal text-surface-400 ml-1">LinkedIn enrichment</span></p>
                <p class="text-xs text-surface-400">Auto-populates name, title, company, photo from LinkedIn · <a href="https://rapidapi.com/freshdata-freshdata-default/api/fresh-linkedin-profile-data" target="_blank" class="text-brand-600 hover:underline">Fresh LinkedIn Profile Data</a></p>
              </div>
              ${settings?.rapidApiKey ? `<span class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium flex-shrink-0 ml-3">✓ Set</span>` : ''}
            </div>
            <input type="password" id="settings-rapidapi-key" class="input-field" placeholder="Paste your RapidAPI key…"
              value="${settings?.rapidApiKey || ''}" />
          </div>

          <div class="py-4 last:pb-0">
            <div class="flex items-start justify-between mb-2">
              <div>
                <p class="text-sm font-semibold">Google Places API Key <span class="text-xs font-normal text-surface-400 ml-1">Company Scout</span></p>
                <p class="text-xs text-surface-400">Powers map search in Company Scout · enable <strong>Places API (New)</strong> · <a href="https://console.cloud.google.com/apis/credentials" target="_blank" class="text-brand-600 hover:underline">console.cloud.google.com</a> · leave blank to use free OpenStreetMap</p>
              </div>
              ${settings?.googlePlacesApiKey ? `<span class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium flex-shrink-0 ml-3">✓ Set</span>` : ''}
            </div>
            <input type="password" id="settings-google-places-key" class="input-field" placeholder="AIza…"
              value="${settings?.googlePlacesApiKey || ''}" />
          </div>

        </div>
      </div>

      <!-- ── DEAL PIPELINE ──────────────────────────── -->
      <p class="settings-section-label">Deal Pipeline</p>

      <!-- Base Currency card -->
      <div class="card mb-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold">Base Display Currency</p>
            <p class="text-xs text-surface-400 mt-0.5">Pipeline totals are automatically converted to this currency using live daily exchange rates. Each deal can have its own currency.</p>
          </div>
          <select id="settings-base-currency" class="input-field w-44 ml-4 flex-shrink-0">
            ${(typeof CURRENCIES !== 'undefined' ? CURRENCIES : [
              { code: 'USD', symbol: '$',   name: 'US Dollar' },
              { code: 'EUR', symbol: '€',   name: 'Euro' },
              { code: 'GBP', symbol: '£',   name: 'British Pound' },
              { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
              { code: 'CAD', symbol: 'C$',  name: 'Canadian Dollar' },
              { code: 'AUD', symbol: 'A$',  name: 'Australian Dollar' },
              { code: 'SEK', symbol: 'kr',  name: 'Swedish Krona' },
              { code: 'NOK', symbol: 'kr',  name: 'Norwegian Krone' },
              { code: 'DKK', symbol: 'kr',  name: 'Danish Krone' },
              { code: 'JPY', symbol: '¥',   name: 'Japanese Yen' },
            ]).map(c => `<option value="${c.code}" ${(settings?.baseCurrency || 'USD') === c.code ? 'selected' : ''}>${c.symbol.trim()} ${c.code} — ${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="mt-3 pt-3 border-t border-surface-100 dark:border-surface-800">
          <p class="text-xs text-surface-400">Exchange rates are fetched from <strong>Open Exchange Rates</strong> (free, no API key required) and cached for 1 hour. Fallback to static rates when offline.</p>
        </div>
      </div>

      <!-- Number Display Format card -->
      <div class="card mb-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold">Number Display Format</p>
            <p class="text-xs text-surface-400 mt-0.5">Controls how financial figures appear on deal pages, cards, and the pipeline board.</p>
          </div>
          <select id="settings-number-format" class="input-field w-52 ml-4 flex-shrink-0">
            <option value="auto"  ${(settings?.numberDisplayFormat || 'auto') === 'auto'  ? 'selected' : ''}>Auto (smart — e.g. $2.50M, $850K)</option>
            <option value="M"     ${(settings?.numberDisplayFormat || 'auto') === 'M'     ? 'selected' : ''}>Always Millions — $2.50M</option>
            <option value="K"     ${(settings?.numberDisplayFormat || 'auto') === 'K'     ? 'selected' : ''}>Always Thousands — $2,500K</option>
            <option value="raw"   ${(settings?.numberDisplayFormat || 'auto') === 'raw'   ? 'selected' : ''}>Full Number — $2,500,000</option>
          </select>
        </div>
      </div>

      <div class="card mb-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold">Search Criteria</p>
            <p class="text-xs text-surface-400 mt-0.5">Benchmarks every deal's Fit Score against your ideal acquisition parameters</p>
          </div>
          <button onclick="openSearchCriteriaModal()" class="btn-secondary btn-sm flex items-center gap-2 flex-shrink-0 ml-4">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
            Configure
          </button>
        </div>
        ${(() => {
          const sc = settings?.searchCriteria;
          if (!sc) return `<p class="text-sm text-surface-400 italic mt-3">No criteria configured yet.</p>`;
          const rows = [
            ['Revenue Range', sc.revenueMin || sc.revenueMax ? `$${((sc.revenueMin||0)/1e6).toFixed(1)}M – $${((sc.revenueMax||0)/1e6).toFixed(1)}M` : 'Any'],
            ['EBITDA Range', sc.ebitdaMin || sc.ebitdaMax ? `$${((sc.ebitdaMin||0)/1e6).toFixed(1)}M – $${((sc.ebitdaMax||0)/1e6).toFixed(1)}M` : 'Any'],
            ['Min EBITDA Margin', sc.marginMin ? sc.marginMin + '%' : 'Any'],
            ['Max Entry Multiple', sc.multipleMax ? sc.multipleMax + 'x EBITDA' : 'Any'],
            ['Min Revenue Growth', sc.growthRateMin ? sc.growthRateMin + '%' : 'Any'],
            ['Max Customer Conc.', sc.maxCustomerConc ? sc.maxCustomerConc + '%' : 'Any'],
            ['Recurring Revenue', sc.recurringRevenue ? sc.recurringRevenue.charAt(0).toUpperCase() + sc.recurringRevenue.slice(1) : 'Any'],
            ['Control Buyout', sc.controlBuyout ? 'Required' : 'Not required'],
            ['Target Industries', sc.targetIndustries?.length ? sc.targetIndustries.join(', ') : 'Any'],
            ['Target Geographies', sc.targetGeographies?.length ? sc.targetGeographies.join(', ') : 'Any'],
          ];
          return `<div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
            ${rows.map(([label, val]) => `
              <div class="flex items-center justify-between py-1.5 border-b border-surface-100 dark:border-surface-800">
                <span class="text-xs text-surface-500">${label}</span>
                <span class="text-xs font-medium">${escapeHtml(val)}</span>
              </div>
            `).join('')}
          </div>`;
        })()}
      </div>

      <!-- ── GMAIL ────────────────────────────────────── -->
      <p class="settings-section-label">Gmail</p>

      <!-- Gmail Sync (dynamic card) -->
      ${typeof renderGmailSyncCard === 'function' ? renderGmailSyncCard(settings) : ''}

      <!-- ── PILOT ACCESS ── only shown to the owner account ── -->
      ${currentUser.email === 'rfreudenberg@mba2027.hbs.edu' ? `
      <p class="settings-section-label">Pilot Access</p>

      <div class="card mb-4">
        <div class="flex items-start justify-between mb-4">
          <div class="flex-1 mr-4">
            <p class="text-sm font-semibold">Invite Codes</p>
            <p class="text-xs text-surface-400 mt-0.5">Generate single-use invite codes to give others access during the pilot. Each code is cryptographically signed — no server needed.</p>
          </div>
          <button onclick="settingsGenerateInvite()" id="generate-invite-btn" class="btn-primary btn-sm flex items-center gap-2 flex-shrink-0">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
            New Invite
          </button>
        </div>
        <div id="invite-list-container" class="space-y-2">
          <!-- Populated on load -->
        </div>
        <p class="text-xs text-surface-400 mt-3 pt-3 border-t border-surface-100 dark:border-surface-800">
          Share a code directly (<code class="bg-surface-100 dark:bg-surface-800 px-1 rounded font-mono">PULSE-XXXXXXXX-XXXX</code>) or use the share link button to send a URL that pre-fills the invite field on the sign-up page.
        </p>
      </div>
      ` : ''}

      <!-- ── DATA MANAGEMENT ────────────────────────── -->
      <p class="settings-section-label">Data Management</p>

      <div class="card mb-6">
        <div class="space-y-0 divide-y divide-surface-100 dark:divide-surface-800">
          <div class="flex items-center justify-between py-3 first:pt-0">
            <div>
              <p class="text-sm font-semibold">Export Data</p>
              <p class="text-xs text-surface-400">Download all your CRM data as JSON</p>
            </div>
            <button onclick="exportData()" class="btn-secondary btn-sm flex-shrink-0">Export</button>
          </div>
          <div class="flex items-center justify-between py-3">
            <div>
              <p class="text-sm font-semibold">Import Data</p>
              <p class="text-xs text-surface-400">Restore from a JSON export file</p>
            </div>
            <label class="btn-secondary btn-sm cursor-pointer flex-shrink-0">
              Import
              <input type="file" accept=".json" onchange="importData(event)" class="hidden" />
            </label>
          </div>
          <div class="flex items-center justify-between py-3">
            <div>
              <p class="text-sm font-semibold">Web Research Cache</p>
              <p class="text-xs text-surface-400" id="research-cache-stats">Loading…</p>
            </div>
            <button onclick="clearResearchCacheFromSettings()" class="btn-secondary btn-sm flex-shrink-0">Clear Cache</button>
          </div>
          <div class="flex items-center justify-between py-3">
            <div>
              <p class="text-sm font-semibold text-red-600">Reset All Data</p>
              <p class="text-xs text-surface-400">Permanently delete all contacts, calls, deals, and notes</p>
            </div>
            <button onclick="resetAllData()" class="btn-danger btn-sm flex-shrink-0">Reset</button>
          </div>
          <div class="flex items-center justify-between py-3 last:pb-0">
            <div>
              <p class="text-sm font-semibold text-red-600">Delete Account</p>
              <p class="text-xs text-surface-400">Permanently remove your account and all data</p>
            </div>
            <button onclick="deleteAccount()" class="btn-danger btn-sm flex-shrink-0">Delete Account</button>
          </div>
        </div>
      </div>

      <!-- Bottom save button -->
      <div class="flex justify-end pb-4">
        <button onclick="saveSettings()" class="btn-primary flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Save Settings
        </button>
      </div>

    </div>
  `;

  // Populate cache stats
  if (typeof getResearchCacheStats === 'function') {
    const stats = getResearchCacheStats();
    const el = document.getElementById('research-cache-stats');
    if (el) el.textContent = `${stats.count} cached entries · ${stats.totalKB} KB · ${stats.expiredCount} expired`;
  }

  // Populate invite list
  renderInviteList();
}

// ── Invite Management ────────────────────────────────────────
function renderInviteList() {
  // Only the owner account can view/manage invite codes
  if (!currentUser || currentUser.email !== 'rfreudenberg@mba2027.hbs.edu') return;
  const container = document.getElementById('invite-list-container');
  if (!container) return;

  const invites = (typeof loadSavedInvites === 'function') ? loadSavedInvites() : [];

  if (invites.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center gap-2 py-6 text-center">
        <svg class="w-8 h-8 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"/></svg>
        <p class="text-sm text-surface-400">No invite codes yet — click <strong>New Invite</strong> to generate one</p>
      </div>`;
    return;
  }

  container.innerHTML = invites.map((inv) => {
    const isUsed = !!inv.usedAt;
    const createdDate = new Date(inv.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const usedDate  = inv.usedAt ? new Date(inv.usedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    const safeCode  = escapeHtml(inv.code);
    const encodedCode = encodeURIComponent(inv.code);

    return `
      <div class="flex items-start gap-3 p-3 rounded-lg border ${isUsed
        ? 'border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/40'
        : 'border-brand-200 dark:border-brand-900/40 bg-brand-50 dark:bg-brand-950'}">

        <!-- Status dot -->
        <div class="mt-1 flex-shrink-0">
          <span class="inline-block w-2 h-2 rounded-full ${isUsed ? 'bg-surface-300' : 'bg-green-400'}"></span>
        </div>

        <!-- Code + meta -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center flex-wrap gap-2 mb-0.5">
            <code class="font-mono text-sm font-semibold tracking-wider ${isUsed ? 'text-surface-400' : 'text-brand-700 dark:text-brand-300'}">${safeCode}</code>
            ${isUsed
              ? `<span class="text-xs px-1.5 py-0.5 rounded-full bg-surface-200 dark:bg-surface-700 text-surface-500 font-medium">Used</span>`
              : `<span class="text-xs px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">Active</span>`}
          </div>
          <p class="text-xs text-surface-400">
            Created ${createdDate}${inv.note ? ` · <em>${escapeHtml(inv.note)}</em>` : ''}
            ${isUsed ? ` · Used by <span class="font-medium text-surface-600 dark:text-surface-300">${escapeHtml(inv.usedByEmail || 'unknown')}</span> on ${usedDate}` : ''}
          </p>
        </div>

        <!-- Action buttons (only for unused codes) -->
        ${!isUsed ? `
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <button onclick="settingsCopyInvite('${safeCode}')" title="Copy invite code"
              class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:bg-surface-50 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-300 transition-colors">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              Copy
            </button>
            <button onclick="settingsCopyShareLink('${encodedCode}')" title="Copy share link with pre-filled code"
              class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:bg-surface-50 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-300 transition-colors">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
              Share link
            </button>
          </div>
        ` : ''}
      </div>`;
  }).join('');
}

async function settingsGenerateInvite() {
  // Only the owner account may generate invite codes
  if (!currentUser || currentUser.email !== 'rfreudenberg@mba2027.hbs.edu') {
    showToast('You do not have permission to generate invite codes.', 'error');
    return;
  }

  const btn = document.getElementById('generate-invite-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  try {
    await createNewInvite(); // generates + saves to localStorage
    renderInviteList();
    showToast('Invite code generated!', 'success');
  } catch (err) {
    showToast('Failed to generate code: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg> New Invite`;
    }
  }
}

function settingsCopyInvite(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Copied: ${code}`, 'success');
  }).catch(() => {
    // Fallback for browsers that block clipboard without user gesture
    prompt('Copy this invite code:', code);
  });
}

function settingsCopyShareLink(encodedCode) {
  const shareUrl = `${location.origin}${location.pathname}?invite=${encodedCode}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    showToast('Share link copied — send it to your invitee and they\'ll have the code pre-filled', 'success');
  }).catch(() => {
    prompt('Copy this share link:', shareUrl);
  });
}

function clearResearchCacheFromSettings() {
  if (typeof clearResearchCache === 'function') {
    const n = clearResearchCache();
    showToast(`Cleared ${n} cached research entries`, 'success');
    const el = document.getElementById('research-cache-stats');
    if (el) el.textContent = '0 cached entries · 0 KB · 0 expired';
  }
}

async function saveSettings() {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  settings.defaultFollowUpDays = parseInt(document.getElementById('settings-default-followup').value) || 14;
  settings.baseCurrency        = document.getElementById('settings-base-currency')?.value    || 'USD';
  settings.numberDisplayFormat = document.getElementById('settings-number-format')?.value    || 'auto';
  settings.tavilyApiKey = document.getElementById('settings-tavily-key')?.value.trim() || '';
  settings.firecrawlApiKey = document.getElementById('settings-firecrawl-key')?.value.trim() || '';
  settings.openaiApiKey = document.getElementById('settings-openai-key').value.trim();
  settings.claudeApiKey = document.getElementById('settings-claude-key').value.trim();
  settings.googlePlacesApiKey = document.getElementById('settings-google-places-key').value.trim();
  settings.rapidApiKey        = document.getElementById('settings-rapidapi-key').value.trim();
  settings.linkedInProfileUrl = document.getElementById('settings-linkedin-url').value.trim();
  settings.linkedInConnected = !!settings.linkedInProfileUrl;

  settings.stageCadence = {};
  for (const stage of STAGES) {
    const id = `settings-cadence-${stage.replace(/\s+/g, '-').toLowerCase()}`;
    settings.stageCadence[stage] = parseInt(document.getElementById(id).value) || 14;
  }

  await DB.put(STORES.settings, settings);
  showToast('Settings saved', 'success');
}

async function toggleThemeFromSettings() {
  toggleTheme();
  // Re-render toggle state
  setTimeout(() => {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      const isDark = document.documentElement.classList.contains('dark');
      btn.className = `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDark ? 'bg-brand-600' : 'bg-surface-300'}`;
      btn.querySelector('span').className = `inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDark ? 'translate-x-6' : 'translate-x-1'}`;
    }
  }, 50);
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  if (isDark) {
    html.classList.remove('dark');
    html.classList.add('light');
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
  }

  // Persist preference
  if (currentUser) {
    DB.get(STORES.settings, `settings_${currentUser.id}`).then(settings => {
      if (settings) {
        settings.theme = html.classList.contains('dark') ? 'dark' : 'light';
        DB.put(STORES.settings, settings);
      }
    });
  }
}

async function exportData() {
  const data = {};
  for (const store of Object.values(STORES)) {
    const items = await DB.getAll(store);
    data[store] = items.filter(i => i.userId === currentUser.id || store === 'settings');
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pulse-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data exported', 'success');
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    for (const [storeName, items] of Object.entries(data)) {
      if (STORES[storeName]) {
        for (const item of items) {
          item.userId = currentUser.id;
          await DB.put(storeName, item);
        }
      }
    }

    showToast('Data imported successfully', 'success');
    navigate('dashboard');
  } catch (err) {
    showToast('Import failed: ' + err.message, 'error');
  }
}

function resetAllData() {
  openModal(`
    <div class="p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-semibold text-red-600">Reset All Data</h3>
          <p class="text-xs text-surface-500">This action is permanent and cannot be undone</p>
        </div>
      </div>

      <div class="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800 rounded p-3 mb-5 text-sm text-red-700 dark:text-red-400">
        All contacts, companies, calls, notes, reminders, deals, and pipeline data will be <strong>permanently deleted</strong>. Your account and settings will remain.
      </div>

      <div class="mb-5">
        <label class="block text-sm font-medium mb-1.5">Enter your password to confirm</label>
        <input type="password" id="reset-confirm-password" class="input-field" placeholder="Your account password"
          onkeydown="if(event.key==='Enter') confirmResetWithPassword()" autofocus />
        <p id="reset-password-error" class="text-xs text-red-600 mt-1.5 hidden">Incorrect password. Please try again.</p>
      </div>

      <div class="flex justify-end gap-3">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="confirmResetWithPassword()" class="btn-danger flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          Delete Everything
        </button>
      </div>
    </div>
  `, { small: true });

  // Focus the password field after modal renders
  setTimeout(() => document.getElementById('reset-confirm-password')?.focus(), 50);
}

async function confirmResetWithPassword() {
  const input = document.getElementById('reset-confirm-password');
  const errorEl = document.getElementById('reset-password-error');
  if (!input) return;

  const password = input.value;
  if (!password) {
    input.focus();
    return;
  }

  // Verify against the stored password hash
  const user = await DB.get(STORES.users, currentUser.id);
  const enteredHash = await hashPassword(password);

  if (enteredHash !== user.passwordHash) {
    errorEl.classList.remove('hidden');
    input.value = '';
    input.focus();
    return;
  }

  // Password correct — proceed with deletion
  closeModal();
  for (const store of Object.values(STORES)) {
    if (store === 'users' || store === 'settings') continue;
    const items = await DB.getAll(store);
    for (const item of items) {
      if (item.userId === currentUser.id) {
        await DB.delete(store, item.id);
      }
    }
  }
  // Refresh the badge immediately so it reflects the now-empty state
  await checkReminders();
  showToast('All data has been reset', 'success');
  navigate('dashboard');
}
