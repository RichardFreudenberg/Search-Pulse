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
          <div id="linkedin-connection-status" class="flex items-center gap-2 p-3 rounded-xl ${settings?.linkedInProfileUrl ? 'bg-green-50 dark:bg-green-900/15' : 'bg-surface-50 dark:bg-surface-800/50'}">
            ${settings?.linkedInProfileUrl ? `
              <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span class="text-sm text-green-700 dark:text-green-400 font-medium">LinkedIn connected</span>
            ` : `
              <svg class="w-5 h-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.02a4.5 4.5 0 00-6.364-6.364L4.5 8.257" /></svg>
              <span class="text-sm text-surface-500">Not connected — paste your LinkedIn URL above</span>
            `}
          </div>
          <div class="bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
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
            <p class="text-xs text-surface-400 mt-1">Uses Claude 3.5 Haiku. If both keys are set, Claude takes priority. Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" class="text-brand-600 hover:underline">console.anthropic.com</a>.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Google Places API Key <span class="text-xs font-normal text-surface-400">(Company Scout)</span></label>
            <input type="password" id="settings-google-places-key" class="input-field" placeholder="AIza…" value="${settings?.googlePlacesApiKey || ''}" />
            <p class="text-xs text-surface-400 mt-1">Powers the Company Scout map search. Enable the <strong>Places API (New)</strong> in your Google Cloud project. Get a key at <a href="https://console.cloud.google.com/apis/credentials" target="_blank" class="text-brand-600 hover:underline">console.cloud.google.com</a>. Leave blank to use free OpenStreetMap data instead.</p>
          </div>
        </div>
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
        <div class="bg-surface-50 dark:bg-surface-800 rounded-xl p-3">
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
}

async function saveSettings() {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  settings.defaultFollowUpDays = parseInt(document.getElementById('settings-default-followup').value) || 14;
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

async function resetAllData() {
  confirmDialog('Reset All Data', 'This will permanently delete ALL your CRM data. This cannot be undone.', async () => {
    for (const store of Object.values(STORES)) {
      if (store === 'users' || store === 'settings') continue;
      const items = await DB.getAll(store);
      for (const item of items) {
        if (item.userId === currentUser.id) {
          await DB.delete(store, item.id);
        }
      }
    }
    showToast('All data has been reset', 'success');
    navigate('dashboard');
  });
}
