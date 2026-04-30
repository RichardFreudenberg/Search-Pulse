/* ============================================
   Nexus CRM — German Handelsregister Search
   (Embedded Deal Search tab panel)
   ============================================
   Data: OpenCorporates public API (real register
   entries, CORS-enabled, no scraping).
   Financial research: Tavily + AI + external links.
   Area search: Leaflet map → Nominatim → Bundesland.
   ============================================ */

const _HR_OC_BASE = 'https://api.opencorporates.com/v0.4';

// German federal states — OC jurisdiction codes
const _HR_STATES = [
  { code: 'de',    label: 'All Germany' },
  { code: 'de_bw', label: 'Baden-Württemberg' },
  { code: 'de_by', label: 'Bavaria (Bayern)' },
  { code: 'de_be', label: 'Berlin' },
  { code: 'de_bb', label: 'Brandenburg' },
  { code: 'de_hb', label: 'Bremen' },
  { code: 'de_hh', label: 'Hamburg' },
  { code: 'de_he', label: 'Hessen' },
  { code: 'de_mv', label: 'Mecklenburg-Vorpommern' },
  { code: 'de_ni', label: 'Niedersachsen' },
  { code: 'de_nw', label: 'NRW' },
  { code: 'de_rp', label: 'Rhineland-Palatinate' },
  { code: 'de_sl', label: 'Saarland' },
  { code: 'de_sn', label: 'Sachsen' },
  { code: 'de_st', label: 'Sachsen-Anhalt' },
  { code: 'de_sh', label: 'Schleswig-Holstein' },
  { code: 'de_th', label: 'Thüringen' },
];

// Nominatim state name → OC jurisdiction code
const _HR_STATE_CODES = {
  'Baden-Württemberg': 'de_bw',
  'Bayern': 'de_by',
  'Berlin': 'de_be',
  'Brandenburg': 'de_bb',
  'Bremen': 'de_hb',
  'Hamburg': 'de_hh',
  'Hessen': 'de_he',
  'Mecklenburg-Vorpommern': 'de_mv',
  'Niedersachsen': 'de_ni',
  'Nordrhein-Westfalen': 'de_nw',
  'Rheinland-Pfalz': 'de_rp',
  'Saarland': 'de_sl',
  'Sachsen': 'de_sn',
  'Sachsen-Anhalt': 'de_st',
  'Schleswig-Holstein': 'de_sh',
  'Thüringen': 'de_th',
};

// Legal form → acquisition assessment
const _HR_LEGAL_FORMS = {
  'Gesellschaft mit beschränkter Haftung': {
    short: 'GmbH', acquirable: true, color: 'green',
    note: 'Most common owner-managed form in Germany. Clean acquisition structure — straightforward share purchase.',
  },
  'GmbH & Co. KG': {
    short: 'GmbH & Co. KG', acquirable: true, color: 'green',
    note: 'Classic Mittelstand family business structure. Excellent succession potential — often multi-generational.',
  },
  'Aktiengesellschaft': {
    short: 'AG', acquirable: false, color: 'amber',
    note: 'Share capital company. Can still be private — verify if listed. More complex deal structure.',
  },
  'Kommanditgesellschaft': {
    short: 'KG', acquirable: true, color: 'yellow',
    note: 'Limited partnership. Verify partnership agreement — all partners must agree on exit.',
  },
  'Offene Handelsgesellschaft': {
    short: 'OHG', acquirable: true, color: 'yellow',
    note: 'General partnership. All partners have unlimited liability and must consent to sale.',
  },
  'Eingetragener Kaufmann': {
    short: 'e.K.', acquirable: true, color: 'green',
    note: 'Sole registered merchant. Direct owner-operated — maximum succession potential.',
  },
  'Einzelkaufmann': {
    short: 'e.K.', acquirable: true, color: 'green',
    note: 'Sole trader. Completely owner-operated — very high succession opportunity.',
  },
  'Unternehmergesellschaft (haftungsbeschränkt)': {
    short: 'UG', acquirable: true, color: 'yellow',
    note: 'Mini-GmbH. Typically smaller, newer business — verify scale before pursuing.',
  },
};

// ─── Module state ──────────────────────────────────────────────────────────────

let _hrResults     = [];
let _hrExpandedIdx = null;
let _hrAiCache     = {};
let _hrFinCache    = {};   // financial research cache per index
let _hrLoading     = false;
let _hrSearchMode  = 'name'; // 'name' | 'area'
let _hrAreaMap     = null;   // Leaflet map instance
let _hrAreaMarker  = null;
let _hrAreaCity    = '';     // city from map click
let _hrAreaState   = 'de';   // OC jurisdiction from map click

// ─── Panel renderer ────────────────────────────────────────────────────────────
// Called by deal-search.js when the Handelsregister tab is first opened.
// Returns the HTML string for the full HR panel.

function renderHandelsregisterPanel() {
  const stateOpts = _HR_STATES.map(s => `<option value="${s.code}">${s.label}</option>`).join('');
  const searchIcon = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>`;

  return `
    <div id="hr-panel-inner">

      <!-- ── Search Card ─────────────────────────────────────── -->
      <div class="card mb-4 p-4">

        <!-- Mode toggle -->
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold flex items-center gap-2">
            <span class="text-base">🇩🇪</span> German Business Registry
          </h3>
          <div class="flex gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-lg">
            <button id="hr-mode-btn-name" onclick="_hrSetMode('name')"
              class="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-surface-100">
              🔍 Name Search
            </button>
            <button id="hr-mode-btn-area" onclick="_hrSetMode('area')"
              class="px-3 py-1.5 rounded text-xs font-medium transition-colors text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100">
              📍 Area Search
            </button>
          </div>
        </div>

        <!-- NAME SEARCH MODE -->
        <div id="hr-search-name" class="flex gap-2">
          <input type="text" id="hr-query"
            class="input-field flex-1 text-sm"
            placeholder="Company name or keyword (e.g. Sanitär, Bäckerei, Software GmbH)…"
            onkeydown="if(event.key==='Enter'){event.preventDefault();_hrSearch();}" />
          <select id="hr-state" class="input-field text-sm w-44 flex-shrink-0">${stateOpts}</select>
          <button onclick="_hrSearch()" id="hr-search-btn-name"
            class="btn-primary text-sm flex-shrink-0 flex items-center gap-1.5">
            ${searchIcon} Search
          </button>
        </div>

        <!-- AREA SEARCH MODE -->
        <div id="hr-search-area" class="hidden">
          <div class="flex gap-2 mb-3">
            <input type="text" id="hr-keyword-area"
              class="input-field flex-1 text-sm"
              placeholder="Industry keyword — optional (e.g. Sanitär, Maschinenbau, IT-Dienstleister)…"
              onkeydown="if(event.key==='Enter'){event.preventDefault();_hrSearch();}" />
            <select id="hr-state-area" class="input-field text-sm w-44 flex-shrink-0">${stateOpts}</select>
            <button onclick="_hrSearch()" id="hr-search-btn-area"
              class="btn-primary text-sm flex-shrink-0 flex items-center gap-1.5">
              ${searchIcon} Search Area
            </button>
          </div>

          <!-- Area info banner (populated on map click) -->
          <div id="hr-area-banner" class="hidden mb-2 px-3 py-2 rounded-lg bg-brand-50 dark:bg-brand-900/15 border border-brand-200 dark:border-brand-700 text-xs text-brand-700 dark:text-brand-300 flex items-center gap-2">
            <span>📍</span>
            <span id="hr-area-label">Click the map to select a location</span>
          </div>

          <!-- Leaflet map of Germany -->
          <div class="rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700"
               style="height:320px;">
            <div id="hr-area-map" style="height:100%;width:100%;"></div>
          </div>
          <p class="text-xs text-surface-400 mt-1.5 text-center">
            Click anywhere in Germany — the Bundesland is detected automatically and the jurisdiction filter is set for you
          </p>
        </div>

        <!-- Info strip -->
        <div class="flex items-start gap-2 mt-3 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800">
          <svg class="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <p class="text-xs text-blue-700 dark:text-blue-300">
            Live data from the German Handelsregister via OpenCorporates — all 16 Bundesländer, real register entries.
            Expand any company to run AI acquisition analysis and research financials.
          </p>
        </div>
      </div>

      <!-- ── Results ──────────────────────────────────────────── -->
      <div id="hr-results-area">
        <div class="card p-12 text-center text-surface-400">
          <div class="text-4xl mb-4">🇩🇪</div>
          <p class="text-sm font-medium mb-1">Search the German business register</p>
          <p class="text-xs">Enter a company name or industry keyword, or click the map in Area Search mode</p>
        </div>
      </div>

    </div>`;
}

// ─── Panel init ────────────────────────────────────────────────────────────────

function initHandelsregisterPanel() {
  _hrResults     = [];
  _hrExpandedIdx = null;
  _hrAiCache     = {};
  _hrFinCache    = {};
  _hrLoading     = false;
  _hrSearchMode  = 'name';
  _hrAreaMap     = null;
  _hrAreaMarker  = null;
  _hrAreaCity    = '';
  _hrAreaState   = 'de';
}

// ─── Mode switch ──────────────────────────────────────────────────────────────

function _hrSetMode(mode) {
  _hrSearchMode = mode;
  const nameEl = document.getElementById('hr-search-name');
  const areaEl = document.getElementById('hr-search-area');
  if (nameEl) nameEl.classList.toggle('hidden', mode !== 'name');
  if (areaEl) areaEl.classList.toggle('hidden', mode !== 'area');

  const active   = 'px-3 py-1.5 rounded text-xs font-medium transition-colors bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-surface-100';
  const inactive = 'px-3 py-1.5 rounded text-xs font-medium transition-colors text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100';
  const btnName  = document.getElementById('hr-mode-btn-name');
  const btnArea  = document.getElementById('hr-mode-btn-area');
  if (btnName) btnName.className = mode === 'name' ? active : inactive;
  if (btnArea) btnArea.className = mode === 'area' ? active : inactive;

  if (mode === 'area') {
    setTimeout(_hrInitAreaMap, 120);
  }
}

// ─── Map init ─────────────────────────────────────────────────────────────────

function _hrInitAreaMap() {
  if (typeof L === 'undefined') return; // Leaflet not loaded yet

  const container = document.getElementById('hr-area-map');
  if (!container) return;

  if (_hrAreaMap) {
    _hrAreaMap.invalidateSize();
    return;
  }

  // Center of Germany
  _hrAreaMap = L.map('hr-area-map', { zoomControl: true }).setView([51.1657, 10.4515], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(_hrAreaMap);

  // Click handler — reverse geocode → populate state + city
  _hrAreaMap.on('click', async (e) => {
    const { lat, lng } = e.latlng;

    // Show spinner marker
    if (_hrAreaMarker) _hrAreaMap.removeLayer(_hrAreaMarker);
    _hrAreaMarker = L.circleMarker([lat, lng], {
      radius: 8, color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.6, weight: 2,
    }).addTo(_hrAreaMap);

    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'Accept-Language': 'de', 'User-Agent': 'PulseCRM/1.0' } }
      );
      const geo = await resp.json();

      const city  = geo.address?.city || geo.address?.town || geo.address?.village || geo.address?.municipality || '';
      const state = geo.address?.state || '';
      const code  = _HR_STATE_CODES[state] || 'de';

      _hrAreaCity  = city;
      _hrAreaState = code;

      // Update marker popup
      _hrAreaMap.removeLayer(_hrAreaMarker);
      _hrAreaMarker = L.marker([lat, lng]).addTo(_hrAreaMap)
        .bindPopup(`<strong>${city || 'Unknown'}</strong><br>${state}`)
        .openPopup();

      // Update state dropdown
      const stateSelect = document.getElementById('hr-state-area');
      if (stateSelect) stateSelect.value = code;

      // Update area banner
      const banner = document.getElementById('hr-area-banner');
      const label  = document.getElementById('hr-area-label');
      if (banner && label) {
        label.textContent = `${city ? city + ' · ' : ''}${state || 'Germany'} (${code.toUpperCase()}) — click Search Area to find companies here`;
        banner.classList.remove('hidden');
      }
    } catch (err) {
      // Geocoding failed — still useful, user can set state manually
      const banner = document.getElementById('hr-area-banner');
      const label  = document.getElementById('hr-area-label');
      if (banner && label) {
        label.textContent = 'Location selected — choose a Bundesland from the dropdown and click Search Area';
        banner.classList.remove('hidden');
      }
    }
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function _hrSearch() {
  if (_hrLoading) return;

  // Gather inputs based on mode
  let query, state;
  if (_hrSearchMode === 'name') {
    query = (document.getElementById('hr-query')?.value || '').trim();
    state = document.getElementById('hr-state')?.value || 'de';
    if (!query) { document.getElementById('hr-query')?.focus(); return; }
  } else {
    // Area mode: keyword optional, state from dropdown (set by map click or manually)
    const keyword = (document.getElementById('hr-keyword-area')?.value || '').trim();
    const city    = _hrAreaCity;
    state = document.getElementById('hr-state-area')?.value || _hrAreaState || 'de';
    // Build query: keyword, or city name, or generic
    if (keyword && city) {
      query = `${keyword} ${city}`;
    } else if (keyword) {
      query = keyword;
    } else if (city) {
      query = city;
    } else {
      // No keyword, no city — prompt for at least something
      const kw = document.getElementById('hr-keyword-area');
      if (kw) { kw.focus(); kw.placeholder = 'Enter a keyword or click the map first…'; }
      return;
    }
  }

  const area   = document.getElementById('hr-results-area');
  const btnId  = _hrSearchMode === 'name' ? 'hr-search-btn-name' : 'hr-search-btn-area';
  const btn    = document.getElementById(btnId);
  if (!area) return;

  _hrLoading     = true;
  _hrExpandedIdx = null;
  _hrAiCache     = {};
  _hrFinCache    = {};
  if (btn) { btn.disabled = true; btn.textContent = 'Searching…'; }

  area.innerHTML = `
    <div class="card p-12 flex items-center justify-center gap-3 text-surface-400">
      <svg class="animate-spin w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <span class="text-sm">Searching Handelsregister…</span>
    </div>`;

  // AbortController + manual timeout (AbortSignal.timeout not supported in all browsers)
  const ctrl1   = new AbortController();
  const timer1  = setTimeout(() => ctrl1.abort(), 20000);

  try {
    const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`).catch(() => ({})) || {};
    const token    = settings.openCorporatesApiToken || '';

    const params = new URLSearchParams({
      q:                 query,
      jurisdiction_code: state,
      per_page:          '30',
      order:             'score',
    });
    if (token) params.set('api_token', token);

    const directUrl = `${_HR_OC_BASE}/companies/search?${params}`;
    let json;

    // ── Attempt 1: direct fetch ──────────────────────────────────────────────
    try {
      const resp = await fetch(directUrl, { signal: ctrl1.signal });
      clearTimeout(timer1);
      if (resp.status === 429 || resp.status === 503) throw new Error('rate_limit');
      if (!resp.ok) throw new Error(`API error ${resp.status}`);
      json = await resp.json();

    } catch (directErr) {
      clearTimeout(timer1);
      if (directErr.message === 'rate_limit') throw directErr;
      if (directErr.name === 'AbortError') throw new Error('timeout');

      // ── Attempt 2: CORS proxy fallback (handles browsers blocking OC CORS) ─
      const ctrl2  = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), 20000);
      try {
        // allorigins returns the raw body of the proxied URL unchanged
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;
        const resp2 = await fetch(proxyUrl, { signal: ctrl2.signal });
        clearTimeout(timer2);
        if (resp2.status === 429 || resp2.status === 503) throw new Error('rate_limit');
        if (!resp2.ok) throw new Error(`Proxy error ${resp2.status}`);
        json = await resp2.json();
      } catch (proxyErr) {
        clearTimeout(timer2);
        if (proxyErr.message === 'rate_limit') throw proxyErr;
        if (proxyErr.name === 'AbortError')   throw new Error('timeout');
        throw new Error('Could not reach OpenCorporates. Check your internet connection and try again.');
      }
    }

    _hrResults = (json.results?.companies || []).map(c => c.company).filter(Boolean);
    _hrRenderList(query, state);

  } catch (err) {
    clearTimeout(timer1);
    const isRateLimit = err.message === 'rate_limit';
    const isTimeout   = err.message === 'timeout';
    area.innerHTML = `
      <div class="card p-5">
        <div class="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <svg class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"/>
          </svg>
          <div>
            <p class="text-sm font-semibold text-red-700 dark:text-red-400">
              ${isRateLimit ? 'Monthly quota reached' : isTimeout ? 'Request timed out' : 'Search failed'}
            </p>
            <p class="text-xs text-red-600 dark:text-red-500 mt-1">
              ${isRateLimit
                ? 'Add a free OpenCorporates API token in <strong>Settings → Research & Data Enrichment → OpenCorporates API Token</strong> to get 500 searches/month.'
                : isTimeout
                  ? 'OpenCorporates took too long to respond. Try again in a moment.'
                  : escapeHtml(err.message)}
            </p>
            ${isRateLimit ? `<a href="https://opencorporates.com/users/account_requests/new" target="_blank" class="inline-block mt-2 text-xs text-brand-600 hover:underline font-medium">Get free token at opencorporates.com →</a>` : ''}
          </div>
        </div>
      </div>`;
  } finally {
    _hrLoading = false;
    const b = document.getElementById(btnId);
    if (b) {
      b.disabled = false;
      b.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg> ${_hrSearchMode === 'area' ? 'Search Area' : 'Search'}`;
    }
  }
}

// ─── List render ──────────────────────────────────────────────────────────────

function _hrRenderList(query, state) {
  const area = document.getElementById('hr-results-area');
  if (!area) return;

  if (_hrResults.length === 0) {
    const stateName = _HR_STATES.find(s => s.code === state)?.label || state;
    area.innerHTML = `
      <div class="card p-10 text-center text-surface-400">
        <p class="text-sm font-medium mb-1">No companies found</p>
        <p class="text-xs">Try a different keyword, remove city from the search, or switch to "All Germany"</p>
        <p class="text-xs mt-1 text-surface-300">Searched: <em>${escapeHtml(query || '')}</em> in <em>${escapeHtml(stateName)}</em></p>
      </div>`;
    return;
  }

  const stateName = _HR_STATES.find(s => s.code === state)?.label || state;
  area.innerHTML = `
    <div class="flex items-center justify-between mb-3 px-1">
      <p class="text-xs text-surface-500">
        <strong>${_hrResults.length}</strong> result${_hrResults.length === 1 ? '' : 's'}
        from German commercial register
        ${state && state !== 'de' ? `· <span class="text-brand-600">${escapeHtml(stateName)}</span>` : ''}
      </p>
      <p class="text-xs text-surface-400">Click a company to expand details & research financials</p>
    </div>
    <div class="space-y-2">
      ${_hrResults.map((c, i) => _hrCardHtml(c, i)).join('')}
    </div>`;

  // Restore any cached expansions
  if (_hrExpandedIdx !== null) {
    if (_hrAiCache[_hrExpandedIdx]) {
      const el = document.getElementById(`hr-ai-${_hrExpandedIdx}`);
      if (el) el.innerHTML = _hrAiCache[_hrExpandedIdx];
    }
    if (_hrFinCache[_hrExpandedIdx]) {
      const el = document.getElementById(`hr-fin-${_hrExpandedIdx}`);
      if (el) el.innerHTML = _hrFinCache[_hrExpandedIdx];
    }
  }
}

// ─── Company card (collapsed) ─────────────────────────────────────────────────

function _hrCardHtml(company, idx) {
  const lf       = _hrGetLegalForm(company.company_type);
  const age      = _hrAge(company.incorporation_date);
  const active   = !company.dissolution_date && (company.current_status || '').toLowerCase() !== 'dissolved';
  const address  = _hrAddress(company.registered_address);
  const expanded = _hrExpandedIdx === idx;

  const potential = lf?.acquirable && active && age && age > 10 ? 'High'
                  : lf?.acquirable && active ? 'Medium' : 'Low';
  const potentialColor = potential === 'High' ? 'green' : potential === 'Medium' ? 'amber' : 'surface';

  return `
    <div class="border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden transition-all
                ${!active ? 'opacity-50' : ''}
                ${expanded ? 'ring-1 ring-brand-300 dark:ring-brand-600' : ''}">

      <!-- Header row -->
      <button class="w-full flex items-start gap-3 p-3 text-left hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors"
              onclick="_hrToggle(${idx})">
        <div class="w-9 h-9 rounded-lg bg-black flex items-center justify-center flex-shrink-0
                    text-white font-extrabold text-xs tracking-tight leading-none">DE</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-sm font-semibold">${escapeHtml(company.name)}</span>
            ${lf ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-500 font-medium">${lf.short}</span>` : ''}
            ${!active ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600">Dissolved</span>` : ''}
          </div>
          <p class="text-xs text-surface-400 mt-0.5 truncate">
            ${address ? escapeHtml(address) : 'Address not listed'}${age !== null ? ` · ${age} yrs` : ''}${company.company_number ? ` · ${escapeHtml(company.company_number)}` : ''}
          </p>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0 ml-1">
          ${active && lf?.acquirable ? `
            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-${potentialColor}-50 dark:bg-${potentialColor}-900/20 text-${potentialColor}-600 dark:text-${potentialColor}-400 font-semibold whitespace-nowrap">
              ${potential} potential
            </span>` : ''}
          <svg class="w-3.5 h-3.5 text-surface-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}"
               fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </button>

      <!-- Expanded detail -->
      ${expanded ? _hrDetailHtml(company, idx, lf, age, address, active) : ''}
    </div>`;
}

// ─── Company card (expanded detail) ──────────────────────────────────────────

function _hrDetailHtml(company, idx, lf, age, address, active) {
  const jurisdiction = company.jurisdiction_code || '';
  const stateLabel   = _HR_STATES.find(s => s.code === jurisdiction)?.label
                    || jurisdiction.replace('de_', '').toUpperCase();
  const companyNameEnc = encodeURIComponent(company.name);
  const cityEnc        = encodeURIComponent(company.registered_address?.locality || '');
  const hrNum          = (company.company_number || '').replace(/\s+/g, '+');

  return `
    <div class="border-t border-surface-200 dark:border-surface-700">

      <!-- Data grid -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 px-4 py-3 text-xs bg-surface-50 dark:bg-surface-800/30">
        ${company.company_number    ? `<div><p class="text-surface-400 font-medium mb-0.5">Register No.</p><p class="font-semibold">${escapeHtml(company.company_number)}</p></div>` : ''}
        ${company.incorporation_date ? `<div><p class="text-surface-400 font-medium mb-0.5">Founded</p><p class="font-semibold">${escapeHtml(company.incorporation_date)}${age !== null ? ` (${age} yrs)` : ''}</p></div>` : ''}
        ${company.company_type       ? `<div><p class="text-surface-400 font-medium mb-0.5">Legal Form</p><p class="font-semibold">${escapeHtml(company.company_type)}</p></div>` : ''}
        ${stateLabel                 ? `<div><p class="text-surface-400 font-medium mb-0.5">State</p><p class="font-semibold">${escapeHtml(stateLabel)}</p></div>` : ''}
        ${company.current_status     ? `<div><p class="text-surface-400 font-medium mb-0.5">Status</p><p class="font-semibold">${escapeHtml(company.current_status)}</p></div>` : ''}
        ${address ? `<div class="col-span-2"><p class="text-surface-400 font-medium mb-0.5">Registered Address</p><p class="font-semibold">${escapeHtml(address)}</p></div>` : ''}
      </div>

      <!-- Legal form note -->
      ${lf ? `
        <div class="mx-3 my-2 px-3 py-2 rounded-lg bg-${lf.color}-50 dark:bg-${lf.color}-900/15 border border-${lf.color}-200 dark:border-${lf.color}-800">
          <p class="text-xs text-${lf.color}-700 dark:text-${lf.color}-300 leading-snug">${lf.note}</p>
        </div>` : ''}

      <!-- Action buttons -->
      <div class="flex flex-wrap gap-2 px-3 py-2.5 border-t border-surface-100 dark:border-surface-800">
        <button onclick="_hrRunAI(${idx})"
          class="btn-primary btn-sm flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
          </svg>
          AI Analysis + German Email
        </button>
        <button onclick="_hrResearchFinancials(${idx})"
          class="btn-secondary btn-sm flex items-center gap-1.5">
          <span class="text-sm leading-none">💶</span>
          Research Financials
        </button>
        <button onclick="_hrAddToCRM(${idx})" id="hr-add-btn-${idx}"
          class="btn-secondary btn-sm flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          Add to CRM
        </button>
        ${company.opencorporates_url ? `
          <a href="${escapeHtml(company.opencorporates_url)}" target="_blank"
             class="btn-secondary btn-sm flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
            </svg>
            OpenCorporates
          </a>` : ''}
      </div>

      <!-- External financial source quick-links -->
      <div class="px-3 pb-2">
        <p class="text-[10px] font-semibold text-surface-400 uppercase tracking-wide mb-1.5">Quick financial links</p>
        <div class="flex flex-wrap gap-1.5">
          <a href="https://www.northdata.de/${companyNameEnc}${cityEnc ? ',+' + cityEnc : ''}${hrNum ? '/' + hrNum : ''}"
             target="_blank"
             class="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 text-[11px] font-medium text-surface-700 dark:text-surface-300 transition-colors">
            📊 North Data
          </a>
          <a href="https://www.bundesanzeiger.de/pub/de/suche?q=${companyNameEnc}&fts=true"
             target="_blank"
             class="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 text-[11px] font-medium text-surface-700 dark:text-surface-300 transition-colors">
            🏛 Bundesanzeiger
          </a>
          <a href="https://www.unternehmensregister.de/ureg/result.html?request.prevent_mimetype_sniffing=1&fulltext=${companyNameEnc}"
             target="_blank"
             class="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 text-[11px] font-medium text-surface-700 dark:text-surface-300 transition-colors">
            📂 Unternehmensregister
          </a>
          <a href="https://www.handelsregister.de/rp_web/mask.do?Typ=n"
             target="_blank"
             class="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 text-[11px] font-medium text-surface-700 dark:text-surface-300 transition-colors">
            📋 Handelsregister.de
          </a>
        </div>
      </div>

      <!-- AI output zone -->
      <div id="hr-ai-${idx}" class="px-3 pb-3"></div>

      <!-- Financials output zone -->
      <div id="hr-fin-${idx}" class="px-3 pb-3"></div>

    </div>`;
}

// ─── Toggle expand ────────────────────────────────────────────────────────────

function _hrToggle(idx) {
  _hrExpandedIdx = _hrExpandedIdx === idx ? null : idx;
  const lastQuery = document.getElementById('hr-query')?.value
                 || document.getElementById('hr-keyword-area')?.value || '';
  const lastState = document.getElementById('hr-state')?.value
                 || document.getElementById('hr-state-area')?.value || 'de';
  _hrRenderList(lastQuery, lastState);
}

// ─── AI Analysis ──────────────────────────────────────────────────────────────

async function _hrRunAI(idx) {
  const company = _hrResults[idx];
  if (!company) return;

  const aiEl = document.getElementById(`hr-ai-${idx}`);
  if (!aiEl) return;

  // Already cached
  if (_hrAiCache[idx]) { aiEl.innerHTML = _hrAiCache[idx]; return; }

  aiEl.innerHTML = `
    <div class="flex items-center gap-2.5 py-4 text-sm text-surface-400">
      <svg class="animate-spin w-4 h-4 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Generating acquisition analysis and outreach email…
    </div>`;

  try {
    const age     = _hrAge(company.incorporation_date);
    const address = _hrAddress(company.registered_address);

    const systemPrompt = `You are a search fund acquisition expert specialising in German Mittelstand companies.
You analyse Handelsregister data and give concise, actionable acquisition assessments.
Always respond in English (except where the German email is requested).
Be practical, direct, and honest about what can and cannot be inferred from registration data alone.`;

    const userPrompt = `Analyse this German company from the Handelsregister for acquisition potential:

Name: ${company.name}
Legal form: ${company.company_type || 'Unknown'}
Founded: ${company.incorporation_date || 'Unknown'}${age !== null ? ` (${age} years ago)` : ''}
Address: ${address || 'Unknown'}
Register number: ${company.company_number || 'Unknown'}
Status: ${company.current_status || (company.dissolution_date ? 'Dissolved' : 'Active')}

Please provide the following sections:

**ACQUISITION SCORE: X/5** — one-line rationale

**LEGAL FORM & OWNERSHIP** — 2-3 sentences on what ${company.company_type || 'this legal form'} means for deal structure, likely ownership, and acquisition process

**SUCCESSION OPPORTUNITY** — based on ${age !== null ? `${age} years of operation` : 'company age'}, what does this suggest about the owner's situation and succession readiness?

**SECTOR HYPOTHESIS** — based on the company name, what industry are they likely in? What Mittelstand characteristics might apply?

**FIRST CALL QUESTIONS** — 4 specific questions to ask the owner/Geschäftsführer

**GERMAN OUTREACH EMAIL**
Betreff (subject): [write subject line]

[Write a ~150-word professional but warm acquisition inquiry in German. Use Sie-form. Position the searcher as a qualified buyer genuinely interested in continuing the company's legacy. Do not use overly salesy language. Sign off as "Ihr Nachfolger-Interessent".]`;

    const raw      = await callAI(systemPrompt, userPrompt, 1100, 0.3);
    const rendered = _hrFormatAiResponse(raw);

    const html = `
      <div class="rounded-xl border border-brand-200 dark:border-brand-700 bg-white dark:bg-surface-900 overflow-hidden">
        <div class="flex items-center gap-2 px-4 py-2.5 bg-brand-50 dark:bg-brand-900/20 border-b border-brand-200 dark:border-brand-700">
          <svg class="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
          </svg>
          <span class="text-xs font-semibold text-brand-700 dark:text-brand-300">AI Acquisition Analysis — ${escapeHtml(company.name)}</span>
        </div>
        <div class="p-4 text-xs text-surface-700 dark:text-surface-300 space-y-3 leading-relaxed">
          ${rendered}
        </div>
      </div>`;

    _hrAiCache[idx] = html;
    aiEl.innerHTML  = html;

  } catch (err) {
    const isNoKey = err.message?.toLowerCase().includes('api key') || err.message?.toLowerCase().includes('no ai');
    aiEl.innerHTML = `
      <div class="px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
        ${isNoKey
          ? 'Add an OpenAI or Claude API key in <strong>Settings → AI Models</strong> to enable AI analysis.'
          : escapeHtml(err.message)}
      </div>`;
  }
}

// ─── Financial Research ───────────────────────────────────────────────────────

async function _hrResearchFinancials(idx) {
  const company = _hrResults[idx];
  if (!company) return;

  const finEl = document.getElementById(`hr-fin-${idx}`);
  if (!finEl) return;

  // Cached result
  if (_hrFinCache[idx]) { finEl.innerHTML = _hrFinCache[idx]; return; }

  finEl.innerHTML = `
    <div class="flex items-center gap-2.5 py-3 text-sm text-surface-400">
      <svg class="animate-spin w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Researching financial data…
    </div>`;

  let tavilyHtml  = '';
  let aiEstHtml   = '';

  try {
    const settings  = await DB.get(STORES.settings, `settings_${currentUser.id}`).catch(() => ({})) || {};
    const tavilyKey = settings?.tavilyApiKey || '';
    const age       = _hrAge(company.incorporation_date);
    const address   = _hrAddress(company.registered_address);
    const lf        = _hrGetLegalForm(company.company_type);

    // ── Tavily search ──────────────────────────────────────────────────────
    if (tavilyKey) {
      try {
        const query = `"${company.name}" Umsatz Jahresumsatz EBITDA Mitarbeiter Gewinn revenue employees 2022 2023 2024`;
        const resp  = await fetch('https://api.tavily.com/search', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key:      tavilyKey,
            query,
            search_depth: 'advanced',
            max_results:  6,
            include_answer: true,
          }),
        });
        const data = await resp.json();

        if (data.answer || (data.results && data.results.length > 0)) {
          const sources = (data.results || []).slice(0, 4).map(r => `
            <a href="${escapeHtml(r.url)}" target="_blank"
               class="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors">
              <svg class="w-3.5 h-3.5 text-surface-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/>
              </svg>
              <div class="min-w-0">
                <p class="text-[11px] font-medium text-surface-800 dark:text-surface-200 leading-snug">${escapeHtml(r.title || '')}</p>
                <p class="text-[10px] text-surface-400 mt-0.5 truncate">${escapeHtml(r.url)}</p>
              </div>
            </a>`).join('');

          tavilyHtml = `
            ${data.answer ? `
              <div class="px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed mb-3">
                ${escapeHtml(data.answer)}
              </div>` : ''}
            ${sources ? `<div class="space-y-1.5">${sources}</div>` : ''}`;
        }
      } catch (_) { /* Tavily failed — fall through to AI estimate */ }
    }

    // ── AI financial estimate (always shown as fallback / supplement) ──────
    if (!tavilyKey || !tavilyHtml) {
      try {
        const sysP = `You are a German Mittelstand valuation expert. Based only on the company name, legal form, age, address, and comparable companies, provide a concise financial profile estimate. Always note this is an estimate.`;
        const usrP = `Estimate the financial profile of this German company:
Name: ${company.name}
Legal form: ${lf?.short || company.company_type || 'Unknown'}
Founded: ${company.incorporation_date || 'Unknown'}${age !== null ? ` (${age} years old)` : ''}
Address: ${address || 'Unknown'}

Provide:
**ESTIMATED REVENUE RANGE** — e.g. "€0.5M–€3M based on typical ${lf?.short || 'GmbH'} of this age in this region"
**ESTIMATED EMPLOYEES** — typical headcount for this type/age/sector
**KEY FINANCIAL CHARACTERISTICS** — 2-3 bullet points on what financials typically look like for this type of Mittelstand business
**DATA CAVEAT** — one line noting this is a hypothesis only; verify via Bundesanzeiger or North Data`;

        const raw = await callAI(sysP, usrP, 500, 0.4);
        aiEstHtml = `
          <div class="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 overflow-hidden">
            <div class="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
              <span class="text-sm">🤖</span>
              <span class="text-[11px] font-semibold text-amber-700 dark:text-amber-300">AI Financial Estimate (hypothesis — not verified data)</span>
            </div>
            <div class="p-3 text-xs text-surface-700 dark:text-surface-300 space-y-2 leading-relaxed">
              ${_hrFormatAiResponse(raw)}
            </div>
          </div>`;
      } catch (_) { /* AI also failed */ }
    }

  } catch (_) { /* outer catch */ }

  const companyNameEnc = encodeURIComponent(company.name);
  const cityEnc        = encodeURIComponent(company.registered_address?.locality || '');
  const hrNum          = (company.company_number || '').replace(/\s+/g, '+');

  const html = `
    <div class="rounded-xl border border-emerald-200 dark:border-emerald-700 bg-white dark:bg-surface-900 overflow-hidden mb-1">
      <div class="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-700">
        <span class="text-base leading-none">💶</span>
        <span class="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Financial Research — ${escapeHtml(company.name)}</span>
      </div>
      <div class="p-4 space-y-3">
        ${tavilyHtml || (!aiEstHtml ? `
          <p class="text-xs text-surface-400 italic">
            No Tavily API key configured. Add one in <strong>Settings → Research &amp; Data Enrichment</strong> to auto-research revenue &amp; EBITDA from public filings.
          </p>` : '')}
        ${aiEstHtml}

        <!-- Official German financial sources -->
        <div class="pt-3 border-t border-surface-100 dark:border-surface-800">
          <p class="text-[11px] font-semibold text-surface-400 uppercase tracking-wide mb-2">Official &amp; Professional Sources</p>
          <div class="grid grid-cols-2 gap-1.5">
            <a href="https://www.northdata.de/${companyNameEnc}${cityEnc ? ',+' + cityEnc : ''}${hrNum ? '/' + hrNum : ''}"
               target="_blank"
               class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors text-xs font-medium">
              📊 <span>North Data <span class="text-surface-400 font-normal">· revenue, employees, profit history</span></span>
            </a>
            <a href="https://www.bundesanzeiger.de/pub/de/suche?q=${companyNameEnc}&fts=true"
               target="_blank"
               class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors text-xs font-medium">
              🏛 <span>Bundesanzeiger <span class="text-surface-400 font-normal">· official annual accounts</span></span>
            </a>
            <a href="https://www.unternehmensregister.de/ureg/result.html?request.prevent_mimetype_sniffing=1&fulltext=${companyNameEnc}"
               target="_blank"
               class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors text-xs font-medium">
              📂 <span>Unternehmensregister <span class="text-surface-400 font-normal">· filings &amp; disclosures</span></span>
            </a>
            <a href="https://www.handelsregister.de/rp_web/mask.do?Typ=n"
               target="_blank"
               class="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors text-xs font-medium">
              📋 <span>Handelsregister.de <span class="text-surface-400 font-normal">· official register</span></span>
            </a>
          </div>
          <p class="text-[10px] text-surface-400 mt-2">
            North Data and Bundesanzeiger are the best free sources for German P&amp;L data.
            GmbH and AG with revenue &gt;€3M must publish annual accounts.
          </p>
        </div>
      </div>
    </div>`;

  _hrFinCache[idx] = html;
  finEl.innerHTML  = html;
}

// ─── Format AI markdown → HTML ────────────────────────────────────────────────

function _hrFormatAiResponse(text) {
  return text
    .split(/\n{2,}/)
    .map(block => {
      if (/^\*\*[A-Z]/.test(block)) {
        const headerMatch = block.match(/^\*\*(.+?)\*\*/);
        const header = headerMatch ? headerMatch[1] : '';
        const rest   = block.replace(/^\*\*(.+?)\*\*/, '').replace(/^[\s:—\-]+/, '');
        const isEmail = header.toLowerCase().includes('email') || header.toLowerCase().includes('betreff');
        return `
          <div class="${isEmail ? 'bg-surface-50 dark:bg-surface-800 rounded-lg p-3 border border-surface-200 dark:border-surface-700' : ''}">
            <p class="font-semibold text-surface-900 dark:text-surface-100 mb-1 text-[11px] uppercase tracking-wide">${escapeHtml(header)}</p>
            ${rest ? `<p class="${isEmail ? 'font-mono text-[11px] whitespace-pre-wrap text-surface-600 dark:text-surface-400' : ''}">${escapeHtml(rest.trim())}</p>` : ''}
          </div>`;
      }
      if (block.trim().startsWith('-') || block.trim().startsWith('•')) {
        const items = block.split('\n').filter(l => l.trim());
        return `<ul class="space-y-1 ml-2">${items.map(l =>
          `<li class="flex items-start gap-1.5"><span class="text-brand-400 flex-shrink-0 mt-0.5">·</span><span>${escapeHtml(l.replace(/^[-•*]\s*/, ''))}</span></li>`
        ).join('')}</ul>`;
      }
      if (block.trim()) {
        return `<p>${escapeHtml(block.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`;
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}

// ─── Add to CRM ───────────────────────────────────────────────────────────────

async function _hrAddToCRM(idx) {
  const company = _hrResults[idx];
  if (!company) return;

  const btn = document.getElementById(`hr-add-btn-${idx}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const address = _hrAddress(company.registered_address);
    await DB.add(STORES.companies, {
      userId:      currentUser.id,
      name:        company.name,
      industry:    '',
      companyType: company.company_type || '',
      location:    address || '',
      website:     '',
      description: [
        company.company_type,
        company.incorporation_date ? `Founded ${company.incorporation_date}` : '',
        company.company_number ? `Register: ${company.company_number}` : '',
        company.current_status ? `Status: ${company.current_status}` : '',
      ].filter(Boolean).join(' · '),
      logoUrl:   '',
      source:    'handelsregister',
      hrNumber:  company.company_number   || '',
      hrStatus:  company.current_status   || '',
      hrFounded: company.incorporation_date || '',
      hrAddress: address || '',
    });

    showToast(`${company.name} added to Companies ✓`, 'success');
    if (btn) {
      btn.textContent = '✓ Added';
      btn.classList.add('opacity-60');
    }
  } catch (err) {
    showToast('Failed to save: ' + err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15"/></svg> Add to CRM`;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _hrGetLegalForm(companyType) {
  if (!companyType) return null;
  const ct = companyType.trim();
  for (const [key, val] of Object.entries(_HR_LEGAL_FORMS)) {
    if (ct === key || ct.startsWith(key) || ct.includes(key)) return val;
  }
  if (ct.includes('GmbH')) return { short: 'GmbH', acquirable: true, color: 'green', note: 'GmbH — owner-managed structure, strong acquisition candidate.' };
  if (ct.includes('AG'))   return { short: 'AG',   acquirable: false, color: 'amber', note: 'AG — share capital company. Verify if private or listed.' };
  if (ct.includes('KG'))   return { short: 'KG',   acquirable: true,  color: 'yellow', note: 'KG — partnership. Verify ownership split and exit terms.' };
  if (ct.includes('UG'))   return { short: 'UG',   acquirable: true,  color: 'yellow', note: 'Mini-GmbH. Typically smaller — verify scale.' };
  return null;
}

function _hrAge(incorporationDate) {
  if (!incorporationDate) return null;
  return Math.floor((Date.now() - new Date(incorporationDate).getTime()) / (365.25 * 24 * 3600 * 1000));
}

function _hrAddress(addr) {
  if (!addr) return '';
  return [addr.street_address, addr.postal_code, addr.locality, addr.region]
    .filter(Boolean).join(', ');
}
