/* ============================================
   Nexus CRM — Settings Page
   ============================================ */

async function renderSettings() {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  const pageContent = document.getElementById('page-content');

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      ${renderPageHeader('Settings', 'Configure your CRM preferences')}

      <!-- LinkedIn Connection -->
      <div class="card mb-6">
        <div class="flex items-center gap-3 mb-4">
          <svg class="w-6 h-6 text-[#0A66C2]" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          <h2 class="text-base font-semibold">LinkedIn Connection</h2>
        </div>
        <p class="text-xs text-surface-500 mb-4">Connect your LinkedIn profile for personalized networking suggestions and contact enrichment.</p>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Your LinkedIn Profile URL</label>
            <input type="url" id="settings-linkedin-url" class="input-field" placeholder="https://www.linkedin.com/in/your-profile" value="${escapeHtml(settings?.linkedInProfileUrl || '')}" />
          </div>
          <div id="linkedin-connection-status" class="flex items-center gap-2 p-3 rounded ${settings?.linkedInProfileUrl ? 'bg-green-50 dark:bg-green-900/15' : 'bg-surface-50 dark:bg-surface-800/50'}">
            ${settings?.linkedInProfileUrl ? `
              <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span class="text-sm text-green-700 dark:text-green-400 font-medium">LinkedIn connected</span>
            ` : `
              <svg class="w-5 h-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.02a4.5 4.5 0 00-6.364-6.364L4.5 8.257" /></svg>
              <span class="text-sm text-surface-500">Not connected — paste your LinkedIn URL above</span>
            `}
          </div>
          <div class="bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800 rounded p-3">
            <p class="text-xs text-blue-700 dark:text-blue-300"><strong>How it works:</strong> Your LinkedIn URL is used to generate personalized networking suggestions in the Suggestions tab. With a RapidAPI key (below), the tool can also pull profile data to enrich contacts automatically.</p>
          </div>
        </div>
      </div>

      <!-- Appearance -->
      <div class="card mb-6">
        <h2 class="text-base font-semibold mb-4">Appearance</h2>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium">Dark Mode</p>
            <p class="text-xs text-surface-500">Switch between light and dark themes</p>
          </div>
          <button onclick="toggleThemeFromSettings()" id="theme-toggle-btn" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${document.documentElement.classList.contains('dark') ? 'bg-brand-600' : 'bg-surface-300'}">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${document.documentElement.classList.contains('dark') ? 'translate-x-6' : 'translate-x-1'}"></span>
          </button>
        </div>
      </div>

      <!-- Follow-up Defaults -->
      <div class="card mb-6">
        <h2 class="text-base font-semibold mb-4">Follow-up Defaults</h2>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Default follow-up (days after call)</label>
            <input type="number" id="settings-default-followup" class="input-field w-32" value="${settings?.defaultFollowUpDays || 14}" min="1" max="365" />
          </div>

          <h3 class="text-sm font-medium text-surface-600 dark:text-surface-400 mt-4">Follow-up cadence by stage</h3>
          ${STAGES.map(stage => `
            <div class="flex items-center justify-between">
              <span class="text-sm">${escapeHtml(stage)}</span>
              <div class="flex items-center gap-2">
                <input type="number" id="settings-cadence-${stage.replace(/\s+/g, '-').toLowerCase()}" class="input-field w-20 text-center" value="${settings?.stageCadence?.[stage] || 14}" min="1" max="365" />
                <span class="text-xs text-surface-500">days</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- API Configuration -->
      <div class="card mb-6">
        <h2 class="text-base font-semibold mb-4">API Configuration</h2>
        <p class="text-xs text-surface-500 mb-4">API keys are stored locally in your browser and never sent to our servers.</p>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">
              Tavily API Key <span class="text-xs font-normal text-green-600 dark:text-green-400">(Recommended — powers web research)</span>
            </label>
            <input type="password" id="settings-tavily-key" class="input-field" placeholder="tvly-…" value="${escapeHtml(settings?.tavilyApiKey || '')}" />
            <p class="text-xs text-surface-400 mt-1">
              Powers contact research, call prep news, investment memo market data, and sourcing intelligence.
              Free tier: 1,000 searches/month. Get a key at
              <a href="https://tavily.com" target="_blank" class="text-brand-600 hover:underline">tavily.com</a>.
            </p>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">
              Firecrawl API Key <span class="text-xs font-normal text-surface-400">(optional — better website reading)</span>
            </label>
            <input type="password" id="settings-firecrawl-key" class="input-field" placeholder="fc-…" value="${escapeHtml(settings?.firecrawlApiKey || '')}" />
            <p class="text-xs text-surface-400 mt-1">
              Reads JavaScript-rendered company websites for investment memos. Falls back to Jina.ai (free) without this key.
              Get a key at <a href="https://firecrawl.dev" target="_blank" class="text-brand-600 hover:underline">firecrawl.dev</a>
              — 500 free scrapes/month.
            </p>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">RapidAPI Key (LinkedIn enrichment)</label>
            <input type="password" id="settings-rapidapi-key" class="input-field" placeholder="Paste your RapidAPI key…" value="${settings?.rapidApiKey || ''}" />
            <p class="text-xs text-surface-400 mt-1">Get a key at <a href="https://rapidapi.com/freshdata-freshdata-default/api/fresh-linkedin-profile-data" target="_blank" class="text-brand-600 hover:underline">RapidAPI — Fresh LinkedIn Profile Data</a> — enables full LinkedIn profile auto-populate (name, title, company, photo, location, bio)</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">OpenAI API Key</label>
            <input type="password" id="settings-openai-key" class="input-field" placeholder="sk-…" value="${settings?.openaiApiKey || ''}" />
            <p class="text-xs text-surface-400 mt-1">Uses GPT-4o-mini for all AI features. Get a key at <a href="https://platform.openai.com/api-keys" target="_blank" class="text-brand-600 hover:underline">platform.openai.com</a>.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Claude API Key <span class="text-xs font-normal text-surface-400">(alternative to OpenAI)</span></label>
            <input type="password" id="settings-claude-key" class="input-field" placeholder="sk-ant-…" value="${settings?.claudeApiKey || ''}" />
            <p class="text-xs text-surface-400 mt-1">Uses Claude 3.5 Haiku as a fallback if no OpenAI key is set. Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" class="text-brand-600 hover:underline">console.anthropic.com</a>.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Google Places API Key <span class="text-xs font-normal text-surface-400">(Company Scout)</span></label>
            <input type="password" id="settings-google-places-key" class="input-field" placeholder="AIza…" value="${settings?.googlePlacesApiKey || ''}" />
            <p class="text-xs text-surface-400 mt-1">Powers the Company Scout map search. Enable the <strong>Places API (New)</strong> in your Google Cloud project. Get a key at <a href="https://console.cloud.google.com/apis/credentials" target="_blank" class="text-brand-600 hover:underline">console.cloud.google.com</a>. Leave blank to use free OpenStreetMap data instead.</p>
          </div>
        </div>
      </div>

      <!-- Gmail Sync -->
      ${typeof renderGmailSyncCard === 'function' ? renderGmailSyncCard(settings) : ''}

      <!-- Email Verification (EmailJS) -->
      <div class="card mb-6" id="emailjs-settings-card">
        <div class="flex items-center gap-3 mb-1">
          <svg class="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
          <h2 class="text-base font-semibold">Email Verification (EmailJS)</h2>
        </div>
        <p class="text-xs text-surface-500 mb-4">Send real verification emails to new users on signup. Free up to 200 emails/month via <a href="https://www.emailjs.com" target="_blank" class="text-brand-600 hover:underline">emailjs.com</a>.</p>
        ${(() => {
          const ejsCfg = JSON.parse(localStorage.getItem('pulse_emailjs_config') || '{}');
          const isConfigured = !!(ejsCfg.publicKey && ejsCfg.serviceId && ejsCfg.templateId);
          return `
            ${isConfigured ? `
              <div class="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800 mb-4">
                <svg class="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span class="text-sm text-green-700 dark:text-green-400 font-medium">EmailJS configured — verification emails are live</span>
              </div>
            ` : `
              <div class="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 mb-4">
                <svg class="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
                <div>
                  <p class="text-sm text-amber-700 dark:text-amber-400 font-medium">Not configured</p>
                  <p class="text-xs text-amber-600 dark:text-amber-500 mt-0.5">Verification codes are shown in the UI instead of being emailed.</p>
                </div>
              </div>
            `}
            <div class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">EmailJS Public Key</label>
                <input type="password" id="ejs-public-key" class="input-field" placeholder="your_public_key" value="${escapeHtml(ejsCfg.publicKey || '')}" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Service ID</label>
                  <input type="text" id="ejs-service-id" class="input-field" placeholder="service_xxxxxxx" value="${escapeHtml(ejsCfg.serviceId || '')}" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Template ID</label>
                  <input type="text" id="ejs-template-id" class="input-field" placeholder="template_xxxxxxx" value="${escapeHtml(ejsCfg.templateId || '')}" />
                </div>
              </div>
              <div class="bg-surface-50 dark:bg-surface-800 rounded p-3 text-xs text-surface-500 space-y-1">
                <p class="font-medium text-surface-600 dark:text-surface-400">Setup in 3 steps:</p>
                <p>1. Create a free account at <a href="https://www.emailjs.com" target="_blank" class="text-brand-600 hover:underline">emailjs.com</a></p>
                <p>2. Add an email service (Gmail, Outlook, etc.) and note your <strong>Service ID</strong></p>
                <p>3. Create a template with variables <code class="bg-surface-200 dark:bg-surface-700 px-1 rounded">{{to_email}}</code> <code class="bg-surface-200 dark:bg-surface-700 px-1 rounded">{{to_name}}</code> <code class="bg-surface-200 dark:bg-surface-700 px-1 rounded">{{code}}</code> and note your <strong>Template ID</strong> and <strong>Public Key</strong></p>
              </div>
              <div class="flex gap-2">
                <button onclick="saveEmailJsConfig()" class="btn-primary btn-sm">Save EmailJS Config</button>
                ${isConfigured ? `<button onclick="clearEmailJsConfig()" class="btn-secondary btn-sm text-red-500">Clear</button>` : ''}
              </div>
            </div>
          `;
        })()}
      </div>

      <!-- Email BCC Logging -->
      ${typeof renderEmailLogCard === 'function' ? renderEmailLogCard(settings) : ''}

      <!-- Email Reminders -->
      <div class="card mb-6">
        <h2 class="text-base font-semibold mb-4">Email Reminders</h2>
        <div class="flex items-center justify-between mb-4">
          <div>
            <p class="text-sm font-medium">Enable Email Reminders</p>
            <p class="text-xs text-surface-500">Requires a transactional email service (not configured in local mode)</p>
          </div>
          <button onclick="toggleEmailReminders()" id="email-toggle-btn" class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings?.emailReminders ? 'bg-brand-600' : 'bg-surface-300'}" disabled>
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings?.emailReminders ? 'translate-x-6' : 'translate-x-1'}"></span>
          </button>
        </div>
        <div class="bg-surface-50 dark:bg-surface-800 rounded p-3">
          <p class="text-xs text-surface-500">Email reminders will be available when the app is deployed with a backend service. In local mode, use in-app notifications.</p>
        </div>
      </div>

      <!-- Data Management -->
      <div class="card mb-6">
        <h2 class="text-base font-semibold mb-4">Data Management</h2>
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">Export Data</p>
              <p class="text-xs text-surface-500">Download all your CRM data as JSON</p>
            </div>
            <button onclick="exportData()" class="btn-secondary btn-sm">Export</button>
          </div>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">Import Data</p>
              <p class="text-xs text-surface-500">Import data from a JSON export</p>
            </div>
            <label class="btn-secondary btn-sm cursor-pointer">
              Import
              <input type="file" accept=".json" onchange="importData(event)" class="hidden" />
            </label>
          </div>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">Web Research Cache</p>
              <p class="text-xs text-surface-500" id="research-cache-stats">Loading…</p>
            </div>
            <button onclick="clearResearchCacheFromSettings()" class="btn-secondary btn-sm">Clear Cache</button>
          </div>
          <div class="border-t border-surface-200 dark:border-surface-800 pt-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-red-600">Reset All Data</p>
                <p class="text-xs text-surface-500">Permanently delete all contacts, calls, and notes</p>
              </div>
              <button onclick="resetAllData()" class="btn-danger btn-sm">Reset</button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-end">
        <button onclick="saveSettings()" class="btn-primary">Save Settings</button>
      </div>
    </div>
  `;

  // Populate cache stats
  if (typeof getResearchCacheStats === 'function') {
    const stats = getResearchCacheStats();
    const el = document.getElementById('research-cache-stats');
    if (el) el.textContent = `${stats.count} cached entries · ${stats.totalKB} KB · ${stats.expiredCount} expired`;
  }
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
  settings.tavilyApiKey = document.getElementById('settings-tavily-key')?.value.trim() || '';
  settings.firecrawlApiKey = document.getElementById('settings-firecrawl-key')?.value.trim() || '';
  settings.openaiApiKey = document.getElementById('settings-openai-key').value.trim();
  settings.claudeApiKey = document.getElementById('settings-claude-key').value.trim();
  settings.googlePlacesApiKey = document.getElementById('settings-google-places-key').value.trim();
  settings.rapidApiKey = document.getElementById('settings-rapidapi-key').value.trim();
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

function saveEmailJsConfig() {
  const publicKey = document.getElementById('ejs-public-key')?.value.trim();
  const serviceId = document.getElementById('ejs-service-id')?.value.trim();
  const templateId = document.getElementById('ejs-template-id')?.value.trim();
  if (!publicKey || !serviceId || !templateId) {
    showToast('Please fill in all three EmailJS fields', 'error');
    return;
  }
  localStorage.setItem('pulse_emailjs_config', JSON.stringify({ publicKey, serviceId, templateId }));
  showToast('EmailJS configuration saved — verification emails are now live', 'success');
  renderSettings();
}

function clearEmailJsConfig() {
  localStorage.removeItem('pulse_emailjs_config');
  showToast('EmailJS configuration cleared', 'info');
  renderSettings();
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
