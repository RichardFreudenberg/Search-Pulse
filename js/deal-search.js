/* ============================================
   Pulse — Deal Search: Public Listings & Excel Import
   ============================================ */

// ─── Source Definitions ──────────────────────────────────────────────────────

const DEAL_SEARCH_SOURCES = [
  {
    id: 'bizbuysell',
    name: 'BizBuySell',
    icon: '🏪',
    color: 'blue',
    description: "America's largest business marketplace",
    rssUrl: 'https://www.bizbuysell.com/rss/listings.rss',
    searchUrl: 'https://www.bizbuysell.com/businesses-for-sale/',
    hasRss: true,
  },
  {
    id: 'bizquest',
    name: 'BizQuest',
    icon: '🔍',
    color: 'green',
    description: 'Wide selection of businesses for sale',
    rssUrl: 'https://www.bizquest.com/rss.asp',
    searchUrl: 'https://www.bizquest.com/businesses-for-sale/',
    hasRss: true,
  },
  {
    id: 'businessbroker',
    name: 'BusinessBroker.net',
    icon: '🤝',
    color: 'purple',
    description: 'National network of business brokers',
    rssUrl: 'https://www.businessbroker.net/rss/listings.aspx',
    searchUrl: 'https://www.businessbroker.net/businesses-for-sale/',
    hasRss: true,
  },
  {
    id: 'acquire',
    name: 'Acquire.com',
    icon: '💻',
    color: 'orange',
    description: 'Online & SaaS businesses for acquisition',
    rssUrl: null,
    searchUrl: 'https://acquire.com/search',
    hasRss: false,
  },
  {
    id: 'flippa',
    name: 'Flippa',
    icon: '🔄',
    color: 'yellow',
    description: 'Digital businesses & domain acquisitions',
    rssUrl: 'https://flippa.com/listings.rss',
    searchUrl: 'https://flippa.com/search',
    hasRss: true,
  },
  {
    id: 'axial',
    name: 'Axial',
    icon: '📊',
    color: 'indigo',
    description: 'Lower middle market M&A network (login required)',
    rssUrl: null,
    searchUrl: 'https://www.axial.net/deals/',
    hasRss: false,
    requiresLogin: true,
  },
  {
    id: 'dubde',
    name: 'dub.de',
    icon: '🇩🇪',
    color: 'red',
    description: "Germany's leading M&A marketplace — Unternehmenskäufe & -verkäufe",
    rssUrl: null,
    searchUrl: 'https://www.dub.de/unternehmen-kaufen/',
    hasRss: false,
    hasScraper: true,
    currency: 'EUR',
  },
];

// ─── Page State ───────────────────────────────────────────────────────────────

let _dsListings = [];           // All fetched listings (raw)
let _dsFiltered = [];           // After filters applied
let _dsActiveTab = 'listings';  // 'listings' | 'import'
let _dsSourceStatus = {};       // { sourceId: 'loading'|'ok'|'error'|'skipped' }
let _dsEnabledSources = new Set(DEAL_SEARCH_SOURCES.filter(s => (s.hasRss || s.hasScraper) && !s.requiresLogin).map(s => s.id));
let _dsFilters = { industry: '', location: '', minRevenue: '', maxRevenue: '', minEbitda: '', maxEbitda: '', sortBy: 'date' };
let _dsExcelPreview = null;     // { headers, mappings, rows }

// ─── Main Render ─────────────────────────────────────────────────────────────

async function renderDealSearch() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      ${renderPageHeader('Deal Search', 'Live listings from public marketplaces + Excel import')}

      <!-- Tab Bar -->
      <div class="flex gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded mb-6 w-fit">
        <button id="ds-tab-listings" onclick="dsSwitchTab('listings')" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-surface-100">
          🌐 Live Listings
        </button>
        <button id="ds-tab-import" onclick="dsSwitchTab('import')" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100">
          📥 Import from Excel
        </button>
      </div>

      <!-- LISTINGS TAB -->
      <div id="ds-listings-panel">

        <!-- Source Toggle Chips -->
        <div class="card mb-4 p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold">Data Sources</h3>
            <button onclick="dsFetchAll()" id="ds-refresh-btn" class="btn-primary btn-sm flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Fetch Listings
            </button>
          </div>
          <div class="flex flex-wrap gap-2" id="ds-source-chips">
            ${DEAL_SEARCH_SOURCES.map(s => `
              <button id="ds-chip-${s.id}" onclick="dsToggleSource('${s.id}')" title="${s.description}"
                class="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium border transition-all ${_dsEnabledSources.has(s.id) ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-600 text-brand-700 dark:text-brand-300' : 'bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-400 line-through'}">
                <span>${s.icon}</span>
                <span>${s.name}</span>
                ${s.requiresLogin ? '<span class="text-surface-400">(link only)</span>' : ''}
                <span id="ds-status-${s.id}" class="hidden w-2 h-2 rounded-full bg-gray-300"></span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="card mb-4 p-4">
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label class="block text-xs font-medium text-surface-500 mb-1">Industry</label>
              <select id="ds-filter-industry" onchange="dsApplyFilters()" class="input-field text-sm py-1.5">
                <option value="">All Industries</option>
                ${DEAL_SECTORS.map(s => `<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-surface-500 mb-1">Location</label>
              <input type="text" id="ds-filter-location" oninput="dsApplyFilters()" placeholder="State or city…" class="input-field text-sm py-1.5" />
            </div>
            <div>
              <label class="block text-xs font-medium text-surface-500 mb-1">Min Revenue ($M)</label>
              <input type="number" id="ds-filter-min-rev" oninput="dsApplyFilters()" placeholder="0" class="input-field text-sm py-1.5" min="0" step="0.5" />
            </div>
            <div>
              <label class="block text-xs font-medium text-surface-500 mb-1">Max Revenue ($M)</label>
              <input type="number" id="ds-filter-max-rev" oninput="dsApplyFilters()" placeholder="∞" class="input-field text-sm py-1.5" min="0" step="0.5" />
            </div>
            <div>
              <label class="block text-xs font-medium text-surface-500 mb-1">Min EBITDA ($M)</label>
              <input type="number" id="ds-filter-min-ebitda" oninput="dsApplyFilters()" placeholder="0" class="input-field text-sm py-1.5" min="0" step="0.1" />
            </div>
            <div>
              <label class="block text-xs font-medium text-surface-500 mb-1">Sort By</label>
              <select id="ds-filter-sort" onchange="dsApplyFilters()" class="input-field text-sm py-1.5">
                <option value="date">Most Recent</option>
                <option value="fit-desc">AI Fit Score (High→Low)</option>
                <option value="revenue-desc">Revenue (High→Low)</option>
                <option value="revenue-asc">Revenue (Low→High)</option>
                <option value="ebitda-desc">EBITDA (High→Low)</option>
                <option value="ebitda-asc">EBITDA (Low→High)</option>
                <option value="price-desc">Asking Price (High→Low)</option>
                <option value="price-asc">Asking Price (Low→High)</option>
                <option value="multiple-asc">Multiple (Low→High)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Results -->
        <div id="ds-results">
          <div class="card p-12 text-center text-surface-400">
            <svg class="w-12 h-12 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <p class="text-sm font-medium mb-1">No listings loaded yet</p>
            <p class="text-xs">Click <strong>Fetch Listings</strong> to pull from live marketplaces</p>
          </div>
        </div>
      </div>

      <!-- IMPORT TAB -->
      <div id="ds-import-panel" class="hidden">
        ${renderExcelImportPanel()}
      </div>
    </div>
  `;
}

// ─── Tab Switching ────────────────────────────────────────────────────────────

function dsSwitchTab(tab) {
  _dsActiveTab = tab;
  document.getElementById('ds-listings-panel').classList.toggle('hidden', tab !== 'listings');
  document.getElementById('ds-import-panel').classList.toggle('hidden', tab !== 'import');
  document.getElementById('ds-tab-listings').className = `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'listings' ? 'bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-surface-100' : 'text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'}`;
  document.getElementById('ds-tab-import').className = `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'import' ? 'bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-surface-100' : 'text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'}`;
}

// ─── Source Toggling ──────────────────────────────────────────────────────────

function dsToggleSource(sourceId) {
  if (_dsEnabledSources.has(sourceId)) {
    _dsEnabledSources.delete(sourceId);
  } else {
    _dsEnabledSources.add(sourceId);
  }
  const chip = document.getElementById(`ds-chip-${sourceId}`);
  if (chip) {
    const on = _dsEnabledSources.has(sourceId);
    chip.className = `flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium border transition-all ${on ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-300 dark:border-brand-600 text-brand-700 dark:text-brand-300' : 'bg-surface-50 dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-400 line-through'}`;
  }
  dsApplyFilters();
}

// ─── Fetch All Listings ───────────────────────────────────────────────────────

async function dsFetchAll() {
  const btn = document.getElementById('ds-refresh-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Fetching…'; }

  _dsListings = [];
  const resultsEl = document.getElementById('ds-results');
  if (resultsEl) resultsEl.innerHTML = dsLoadingGrid();

  const rssableSources  = DEAL_SEARCH_SOURCES.filter(s => s.hasRss    && !s.requiresLogin && _dsEnabledSources.has(s.id));
  const scraperSources  = DEAL_SEARCH_SOURCES.filter(s => s.hasScraper && !s.requiresLogin && _dsEnabledSources.has(s.id));
  const linkOnlySources = DEAL_SEARCH_SOURCES.filter(s => !s.hasRss && !s.hasScraper && !s.requiresLogin && _dsEnabledSources.has(s.id));
  const loginSources    = DEAL_SEARCH_SOURCES.filter(s => s.requiresLogin && _dsEnabledSources.has(s.id));

  // Set loading status
  rssableSources.forEach(s => dsSetSourceStatus(s.id, 'loading'));
  scraperSources.forEach(s => dsSetSourceStatus(s.id, 'loading'));

  // RSS fetches (parallel)
  const rssFetches = rssableSources.map(s => dsFetchSource(s));

  // Scraper fetches (parallel) — dispatched to source-specific scrapers
  const scraperFetches = scraperSources.map(s => {
    if (s.id === 'dubde') return dsFetchDubDe(s);
    return Promise.resolve([]);
  });

  const [rssResults, scraperResults] = await Promise.all([
    Promise.allSettled(rssFetches),
    Promise.allSettled(scraperFetches),
  ]);

  rssResults.forEach((r, i) => {
    const src = rssableSources[i];
    if (r.status === 'fulfilled' && r.value.length > 0) {
      _dsListings.push(...r.value);
      dsSetSourceStatus(src.id, 'ok', r.value.length);
    } else {
      dsSetSourceStatus(src.id, 'error');
    }
  });

  scraperResults.forEach((r, i) => {
    const src = scraperSources[i];
    if (r.status === 'fulfilled' && r.value.length > 0) {
      _dsListings.push(...r.value);
      dsSetSourceStatus(src.id, 'ok', r.value.length);
    } else {
      dsSetSourceStatus(src.id, 'error');
    }
  });

  // Show skipped / login-only sources
  linkOnlySources.forEach(s => dsSetSourceStatus(s.id, 'skipped'));
  loginSources.forEach(s => dsSetSourceStatus(s.id, 'skipped'));

  dsApplyFilters();

  if (btn) { btn.disabled = false; btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Fetch Listings'; }
}

function dsLoadingGrid() {
  return `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${Array(6).fill(0).map(() => `
    <div class="card p-4 animate-pulse">
      <div class="h-4 bg-surface-200 dark:bg-surface-700 rounded w-3/4 mb-3"></div>
      <div class="h-3 bg-surface-200 dark:bg-surface-700 rounded w-1/2 mb-2"></div>
      <div class="grid grid-cols-3 gap-2 mt-3">
        <div class="h-8 bg-surface-200 dark:bg-surface-700 rounded"></div>
        <div class="h-8 bg-surface-200 dark:bg-surface-700 rounded"></div>
        <div class="h-8 bg-surface-200 dark:bg-surface-700 rounded"></div>
      </div>
    </div>
  `).join('')}</div>`;
}

function dsSetSourceStatus(sourceId, status, count = 0) {
  _dsSourceStatus[sourceId] = status;
  const dot = document.getElementById(`ds-status-${sourceId}`);
  if (!dot) return;
  dot.classList.remove('hidden');
  const colorMap = { loading: 'bg-yellow-400 animate-pulse', ok: 'bg-green-500', error: 'bg-red-400', skipped: 'bg-surface-300' };
  dot.className = `w-2 h-2 rounded-full ${colorMap[status] || 'bg-surface-300'}`;
  dot.title = status === 'ok' ? `${count} listings fetched` : status;
}

// ─── Fetch Single Source ──────────────────────────────────────────────────────

async function dsFetchSource(source) {
  const rssApiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.rssUrl)}&count=50`;
  try {
    const r = await fetch(rssApiUrl, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    if (json.status !== 'ok' || !json.items?.length) throw new Error('Empty feed');
    return json.items.map(item => dsParseRssItem(item, source)).filter(Boolean);
  } catch (err) {
    // Try allorigins as fallback if rss2json fails
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(source.rssUrl)}`;
      const r2 = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
      if (!r2.ok) throw new Error('proxy fail');
      const xml = await r2.text();
      return dsParseRssXml(xml, source);
    } catch {
      return [];
    }
  }
}

// ─── RSS Item Parser ──────────────────────────────────────────────────────────

function dsParseRssItem(item, source) {
  // Strip HTML tags from description
  const rawDesc = item.description || item.content || '';
  const div = document.createElement('div');
  div.innerHTML = rawDesc;
  const plainDesc = (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();

  const title = (item.title || '').replace(/&#\d+;/g, '').trim();
  if (!title || title.length < 3) return null;

  const revenue = dsExtractCurrency(plainDesc, ['revenue', 'annual revenue', 'gross revenue', 'sales', 'annual sales']);
  const ebitda = dsExtractCurrency(plainDesc, ['cash flow', 'ebitda', 'sde', 'net income', 'cash earnings', 'seller discretionary earnings']);
  const askingPrice = dsExtractCurrency(plainDesc, ['asking price', 'listing price', 'price', 'business price']) ||
                      dsExtractCurrency(item.title || '', ['asking price', 'price']);
  const employees = dsExtractEmployees(plainDesc);
  const location = dsExtractLocation(plainDesc) || dsExtractLocation(item.title || '');
  const industry = dsGuessIndustry(title + ' ' + plainDesc);
  const multiple = ebitda && askingPrice ? Math.round((askingPrice / ebitda) * 10) / 10 : null;

  return {
    id: `ds_${source.id}_${btoa(item.link || title).slice(0, 12)}`,
    source: source.id,
    sourceName: source.name,
    sourceIcon: source.icon,
    sourceColor: source.color,
    sourceUrl: item.link || source.searchUrl,
    title,
    description: plainDesc.substring(0, 400),
    industry,
    location: location || '',
    revenue,
    ebitda,
    askingPrice,
    multiple,
    employees,
    listedDate: item.pubDate ? new Date(item.pubDate).toISOString().split('T')[0] : null,
  };
}

function dsParseRssXml(xml, source) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const items = Array.from(doc.querySelectorAll('item'));
    return items.map(el => {
      const get = tag => el.querySelector(tag)?.textContent?.trim() || '';
      return dsParseRssItem({
        title: get('title'),
        description: get('description'),
        content: get('content\\:encoded') || get('encoded'),
        link: get('link') || get('guid'),
        pubDate: get('pubDate'),
      }, source);
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Data Extraction Helpers ──────────────────────────────────────────────────

function dsExtractCurrency(text, labels) {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const label of labels) {
    const idx = t.indexOf(label);
    if (idx === -1) continue;
    // Look at ~120 chars after the label
    const chunk = text.substring(idx, idx + 120);
    const val = dsParseAmount(chunk);
    if (val && val > 1000) return val;
  }
  // Try bare dollar amounts in text (fallback)
  return null;
}

function dsParseAmount(text) {
  if (!text) return null;

  // German number format: dots as thousands separators, comma as decimal
  // e.g. "1.500.000" → 1500000, "1,2 Mio." → 1200000
  // Try German Mio./Mrd. patterns first (€ optional)
  const dePatterns = [
    { re: /(?:€\s*)?([0-9]+(?:[,.][0-9]+)?)\s*Mrd\.?/i,  mult: 1e9  },
    { re: /(?:€\s*)?([0-9]+(?:[,.][0-9]+)?)\s*Mio\.?/i,   mult: 1e6  },
    { re: /(?:€\s*)?([0-9]+(?:[,.][0-9]+)?)\s*Tsd\.?/i,   mult: 1e3  },
    // German plain number with dots as thousands sep: 1.500.000 € or € 1.500.000
    { re: /(?:€\s*)([0-9]{1,3}(?:\.[0-9]{3})+)(?:[,][0-9]+)?(?:\s*€)?/, mult: 1 },
    { re: /([0-9]{1,3}(?:\.[0-9]{3})+)(?:[,][0-9]+)?\s*€/, mult: 1 },
  ];
  for (const { re, mult } of dePatterns) {
    const m = text.match(re);
    if (!m) continue;
    // Remove German thousands dots, swap comma→dot for decimal
    const numStr = m[1].replace(/\./g, '').replace(',', '.');
    const val = parseFloat(numStr) * mult;
    if (!isNaN(val) && val >= 10000) return Math.round(val);
  }

  // Standard USD/EUR patterns
  const patterns = [
    /[$€]\s*([0-9,]+(?:\.[0-9]+)?)\s*(B|billion)/i,
    /[$€]\s*([0-9,]+(?:\.[0-9]+)?)\s*(M|MM|million)/i,
    /[$€]\s*([0-9,]+(?:\.[0-9]+)?)\s*(K|thousand)/i,
    /[$€]\s*([0-9,]+(?:\.[0-9]+)?)/,
    /([0-9]+(?:\.[0-9]+)?)\s*(B|billion)/i,
    /([0-9]+(?:\.[0-9]+)?)\s*(M|MM|million|mm)/i,
    /([0-9]+(?:\.[0-9]+)?)\s*(K|thousand)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;
    let val = parseFloat(m[1].replace(/,/g, ''));
    const suffix = (m[2] || '').toLowerCase();
    if (suffix.startsWith('b')) val *= 1e9;
    else if (suffix.startsWith('m')) val *= 1e6;
    else if (suffix.startsWith('k') || suffix.startsWith('t')) val *= 1000;
    if (val >= 10000) return Math.round(val);
  }
  return null;
}

function dsExtractEmployees(text) {
  const m = text.match(/(\d+)\s*(?:full.?time\s+)?employees?/i) ||
            text.match(/staff\s+of\s+(\d+)/i) ||
            text.match(/(\d+)\s+(?:full.?time|part.?time|FT|PT)\s+/i);
  return m ? parseInt(m[1]) : null;
}

function dsExtractLocation(text) {
  // Match "City, ST" or "City, State" patterns
  const m = text.match(/\b([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b/) ||
            text.match(/Located\s+in\s+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/i) ||
            text.match(/Location[:\s]+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/i);
  return m ? m[1].trim() + (m[2] ? ', ' + m[2] : '') : null;
}

function dsGuessIndustry(text) {
  const t = text.toLowerCase();
  const map = [
    ['Technology', ['software', 'saas', 'tech', 'it service', 'cloud', 'app', 'digital', 'cyber', 'managed service']],
    ['Healthcare Services', ['healthcare', 'medical', 'dental', 'therapy', 'clinic', 'health', 'pharmacy', 'nursing', 'senior care']],
    ['Business Services', ['staffing', 'consulting', 'accounting', 'bookkeeping', 'payroll', 'hr', 'marketing agency', 'logistics', 'cleaning', 'janitorial']],
    ['Industrial', ['manufactur', 'fabricat', 'machining', 'industrial', 'equipment', 'engineering', 'metal', 'welding', 'assembly']],
    ['Construction / Trades', ['construction', 'contractor', 'plumbing', 'hvac', 'electrical', 'roofing', 'landscaping', 'painting', 'flooring', 'pest control']],
    ['Distribution', ['distribut', 'wholesale', 'logistics', 'supply chain', 'warehouse', 'trucking', 'freight', 'import', 'export']],
    ['Food & Beverage', ['restaurant', 'food', 'beverage', 'catering', 'bakery', 'brewery', 'cafe', 'bar', 'hospitality']],
    ['Consumer', ['retail', 'ecommerce', 'e-commerce', 'consumer', 'apparel', 'fashion', 'beauty', 'pet', 'furniture']],
    ['Education', ['education', 'tutoring', 'training', 'school', 'childcare', 'daycare', 'learning', 'curriculum']],
    ['Financial Services', ['insurance', 'financial', 'accounting firm', 'tax', 'wealth management', 'mortgage', 'lending', 'brokerage']],
  ];
  for (const [sector, keywords] of map) {
    if (keywords.some(k => t.includes(k))) return sector;
  }
  return 'Other';
}

// ─── Filters & Sorting ────────────────────────────────────────────────────────

function dsApplyFilters() {
  const industry = document.getElementById('ds-filter-industry')?.value || '';
  const location = (document.getElementById('ds-filter-location')?.value || '').toLowerCase();
  const minRev = parseFloat(document.getElementById('ds-filter-min-rev')?.value || 0) * 1e6;
  const maxRev = parseFloat(document.getElementById('ds-filter-max-rev')?.value || 0) * 1e6;
  const minEbitda = parseFloat(document.getElementById('ds-filter-min-ebitda')?.value || 0) * 1e6;
  const sortBy = document.getElementById('ds-filter-sort')?.value || 'date';

  _dsFiltered = _dsListings.filter(l => {
    if (!_dsEnabledSources.has(l.source)) return false;
    if (industry && l.industry !== industry) return false;
    if (location && !l.location.toLowerCase().includes(location)) return false;
    if (minRev > 0 && (!l.revenue || l.revenue < minRev)) return false;
    if (maxRev > 0 && l.revenue && l.revenue > maxRev) return false;
    if (minEbitda > 0 && (!l.ebitda || l.ebitda < minEbitda)) return false;
    return true;
  });

  // Sort
  _dsFiltered.sort((a, b) => {
    const nullLast = (va, vb) => {
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return 0;
    };
    switch (sortBy) {
      case 'fit-desc': {
        const fa = a.fitScore, fb = b.fitScore;
        if (fa == null && fb == null) return 0;
        if (fa == null) return 1;
        if (fb == null) return -1;
        return fb - fa;
      }
      case 'revenue-desc': return (b.revenue || 0) - (a.revenue || 0) || nullLast(b.revenue, a.revenue);
      case 'revenue-asc': return (a.revenue || 0) - (b.revenue || 0) || nullLast(a.revenue, b.revenue);
      case 'ebitda-desc': return (b.ebitda || 0) - (a.ebitda || 0) || nullLast(b.ebitda, a.ebitda);
      case 'ebitda-asc': return (a.ebitda || 0) - (b.ebitda || 0) || nullLast(a.ebitda, b.ebitda);
      case 'price-desc': return (b.askingPrice || 0) - (a.askingPrice || 0);
      case 'price-asc': return (a.askingPrice || 0) - (b.askingPrice || 0);
      case 'multiple-asc': {
        const ma = a.multiple, mb = b.multiple;
        if (ma == null && mb == null) return 0;
        if (ma == null) return 1;
        if (mb == null) return -1;
        return ma - mb;
      }
      default: return new Date(b.listedDate || 0) - new Date(a.listedDate || 0);
    }
  });

  dsRenderResults();
}

// ─── Results Render ───────────────────────────────────────────────────────────

function dsRenderResults() {
  const el = document.getElementById('ds-results');
  if (!el) return;

  if (_dsFiltered.length === 0) {
    const hasListings = _dsListings.length > 0;
    el.innerHTML = `
      <div class="card p-12 text-center text-surface-400">
        <p class="text-sm font-medium mb-1">${hasListings ? 'No listings match these filters' : 'No listings loaded'}</p>
        <p class="text-xs">${hasListings ? 'Try widening your filters' : 'Click Fetch Listings to load data from marketplaces'}</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <p class="text-sm text-surface-500">${_dsFiltered.length} listing${_dsFiltered.length !== 1 ? 's' : ''} ${_dsListings.length > _dsFiltered.length ? `(filtered from ${_dsListings.length})` : ''}</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      ${_dsFiltered.map(l => dsRenderListingCard(l)).join('')}
    </div>`;
}

function dsRenderListingCard(l) {
  const sym = l.currency === 'EUR' ? '€' : '$';
  const fmtM = v => v ? (v >= 1e6 ? sym + (v / 1e6).toFixed(1) + 'M' : sym + Math.round(v / 1000) + 'K') : '—';
  const colorMap = {
    blue:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    green:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    red:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  const sourceBadge = colorMap[l.sourceColor] || 'bg-surface-100 text-surface-600';

  // Fit score badge (AI-generated for dub.de listings)
  const fitBadge = l.fitScore ? (() => {
    const score = l.fitScore;
    const color = score >= 8 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                : score >= 6 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                : 'bg-surface-100 text-surface-500';
    return `<span class="${color} text-xs px-2 py-0.5 rounded-full font-semibold" title="${escapeHtml(l.fitReason || '')}">⚡ ${score}/10 fit</span>`;
  })() : '';

  return `
    <div class="card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <!-- Header -->
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <h3 class="text-sm font-semibold leading-snug line-clamp-2">${escapeHtml(l.title)}</h3>
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            <span class="text-xs px-2 py-0.5 rounded-full font-medium ${sourceBadge}">${l.sourceIcon} ${l.sourceName}</span>
            ${l.aiAnalyzed ? '<span class="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-300">✨ AI analyzed</span>' : ''}
            ${l.industry ? `<span class="text-xs text-surface-500">${escapeHtml(l.industry)}</span>` : ''}
            ${fitBadge}
          </div>
        </div>
      </div>

      <!-- Location & Date -->
      ${l.location || l.listedDate ? `
        <div class="flex items-center gap-3 text-xs text-surface-400">
          ${l.location ? `<span>📍 ${escapeHtml(l.location)}</span>` : ''}
          ${l.listedDate ? `<span>🗓 ${l.listedDate}</span>` : ''}
          ${l.employees ? `<span>👥 ${l.employees} employees</span>` : ''}
          ${l.currency === 'EUR' ? '<span class="font-medium text-surface-500">EUR</span>' : ''}
        </div>` : ''}

      <!-- Key Financials -->
      <div class="grid grid-cols-3 gap-2">
        <div class="bg-surface-50 dark:bg-surface-800 rounded-lg p-2 text-center">
          <div class="text-xs text-surface-400 mb-0.5">Revenue</div>
          <div class="text-sm font-semibold ${l.revenue ? 'text-surface-900 dark:text-surface-100' : 'text-surface-400'}">${fmtM(l.revenue)}</div>
        </div>
        <div class="bg-surface-50 dark:bg-surface-800 rounded-lg p-2 text-center">
          <div class="text-xs text-surface-400 mb-0.5">EBITDA / CF</div>
          <div class="text-sm font-semibold ${l.ebitda ? 'text-surface-900 dark:text-surface-100' : 'text-surface-400'}">${fmtM(l.ebitda)}</div>
        </div>
        <div class="bg-surface-50 dark:bg-surface-800 rounded-lg p-2 text-center">
          <div class="text-xs text-surface-400 mb-0.5">Ask Price</div>
          <div class="text-sm font-semibold ${l.askingPrice ? 'text-brand-600' : 'text-surface-400'}">${fmtM(l.askingPrice)}</div>
        </div>
      </div>

      ${l.multiple ? `<div class="text-xs text-surface-500 text-center -mt-1">${l.multiple}x EBITDA multiple</div>` : ''}

      <!-- Description -->
      ${l.description ? `<p class="text-xs text-surface-500 line-clamp-2 leading-relaxed">${escapeHtml(l.description)}</p>` : ''}

      <!-- Actions -->
      <div class="flex gap-2 mt-auto pt-1">
        <button onclick="dsAddToPipeline(${JSON.stringify(l).replace(/"/g, '&quot;')})" class="btn-primary btn-sm flex-1">
          + Add to Pipeline
        </button>
        <a href="${escapeHtml(l.sourceUrl)}" target="_blank" rel="noopener" class="btn-secondary btn-sm">
          View →
        </a>
      </div>
    </div>`;
}

// ─── Add to Pipeline ──────────────────────────────────────────────────────────

async function dsAddToPipeline(listing) {
  try {
    const deal = {
      id: generateId(),
      userId: currentUser.id,
      name: listing.title,
      stage: 'Initial Review',
      sector: listing.industry || '',
      location: listing.location || '',
      revenue: listing.revenue || null,
      ebitda: listing.ebitda || null,
      askingPrice: listing.askingPrice || null,
      askingMultiple: listing.multiple || null,
      description: listing.description || '',
      source: listing.sourceName,
      website: listing.sourceUrl || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: `Sourced from ${listing.sourceName}. Original listing: ${listing.sourceUrl}`,
    };
    await DB.add(STORES.deals, deal);
    showToast(`"${listing.title.substring(0, 40)}" added to pipeline`, 'success');
  } catch (err) {
    showToast('Failed to add deal: ' + err.message, 'error');
  }
}

// ─── dub.de Scraper ───────────────────────────────────────────────────────────

// Proxy helpers — try allorigins first, then corsproxy as fallback
async function _dsProxyFetch(url, timeoutMs = 18000) {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];
  for (const proxy of proxies) {
    try {
      const r = await fetch(proxy, { signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) {
        const text = await r.text();
        if (text && text.length > 500) return text;
      }
    } catch { /* try next */ }
  }
  return null;
}

// Fetch multiple pages from dub.de and run AI extraction
async function dsFetchDubDe(source) {
  const baseUrl = 'https://www.dub.de/unternehmen-kaufen/';
  const pageUrls = [baseUrl, `${baseUrl}?seite=2`, `${baseUrl}?seite=3`];

  const allBlocks = [];

  for (const url of pageUrls) {
    try {
      const html = await _dsProxyFetch(url);
      if (!html) continue;
      const blocks = dsDubDeExtractBlocks(html);
      allBlocks.push(...blocks);
    } catch { /* skip failed page */ }
  }

  if (allBlocks.length === 0) return [];
  return await dsDubDeAiParse(allBlocks, source);
}

// Extract candidate listing text blocks from raw dub.de HTML
function dsDubDeExtractBlocks(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Strip noise
    ['nav', 'header', 'footer', 'script', 'style', 'noscript', 'aside', '.cookie', '.consent', '.banner'].forEach(sel => {
      try { doc.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
    });

    // Try known dub.de / common marketplace class patterns first
    const selectors = [
      '.search-result__item', '.result-item', '.listing-item', '.expose-item',
      '.inserat', '.angebot-item', '.company-card', '[class*="expose"]',
      '[class*="listing-"]', '[class*="result-item"]', '[class*="angebot"]',
      'article', '.item',
    ];

    let candidates = [];
    for (const sel of selectors) {
      try {
        const els = Array.from(doc.querySelectorAll(sel));
        // Only use this selector if it looks like actual listings
        const withFinancials = els.filter(el => {
          const t = el.textContent || '';
          return t.includes('€') || t.includes('Kaufpreis') || t.includes('Umsatz') || t.includes('EBITDA');
        });
        if (withFinancials.length >= 3) { candidates = els; break; }
        if (els.length >= 5) { candidates = els; break; }
      } catch {}
    }

    // Fallback: scan all block-level elements for financial content
    if (candidates.length < 3) {
      const all = Array.from(doc.querySelectorAll('div, article, li, section'));
      candidates = all.filter(el => {
        const t = el.textContent || '';
        const len = t.trim().length;
        return len >= 60 && len <= 3000
          && (t.includes('€') || t.includes('Kaufpreis') || t.includes('Umsatz') || t.includes('EBITDA') || t.includes('Mitarbeiter'))
          && !el.querySelector('article, [class*="listing"], [class*="result"]'); // avoid nested dupes
      });
    }

    // De-duplicate and build blocks
    const seen = new Set();
    const blocks = [];

    for (const el of candidates) {
      // Grab the first useful link pointing to a listing detail page
      const link = (
        el.querySelector('a[href*="/expose/"], a[href*="/inserat/"], a[href*="/unternehmen/"], a[href*="/kaufen/"]')?.href ||
        el.querySelector('a[href]')?.href ||
        ''
      );

      const rawText = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (rawText.length < 50) continue;

      // Deduplicate by first 80 chars
      const key = rawText.substring(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);

      blocks.push({ text: rawText.substring(0, 700), link });
      if (blocks.length >= 40) break; // cap per page
    }

    return blocks;
  } catch {
    return [];
  }
}

// AI batch extraction: German listing text → structured English deal objects
async function dsDubDeAiParse(blocks, source) {
  const BATCH_SIZE = 6; // smaller batches for higher quality extraction
  const listings = [];

  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    const batch = blocks.slice(i, i + BATCH_SIZE);
    const numbered = batch.map((b, j) => `[${j + 1}]\n${b.text}`).join('\n\n---\n\n');

    try {
      const raw = await callAI(
        `You are an expert M&A analyst who specializes in German-language business acquisitions and search fund investing. Extract structured data from German business listing snippets from dub.de, Germany's leading M&A marketplace. Return ONLY valid JSON, no markdown, no explanation.`,

        `Extract structured data from these ${batch.length} German business listings from dub.de. Return a JSON array with exactly ${batch.length} objects (same order, even if a listing is unclear — just use best-effort values).

German financial terminology:
- Kaufpreis / Verkaufspreis = Asking Price
- Umsatz / Jahresumsatz = Annual Revenue
- EBITDA / Gewinn / Ertrag = EBITDA/Profit
- Mitarbeiter / Beschäftigte = Employees
- Mio. = million (×1,000,000) | Tsd. = thousand (×1,000) | Mrd. = billion (×1,000,000,000)
- German number format: 1.500.000 = 1,500,000 (dots are thousands separators)

For each listing return:
{
  "title": "Business name or concise English description (translate from German)",
  "industry": "English industry name (e.g. Manufacturing, Software, Healthcare, Retail, Services, Construction, Food & Beverage, Logistics, Other)",
  "location": "City or region in Germany (keep German names, e.g. 'Munich', 'Bayern', 'NRW')",
  "askingPrice": <integer EUR or null>,
  "revenue": <integer EUR or null>,
  "ebitda": <integer EUR or null>,
  "employees": <integer or null>,
  "description": "1-2 sentence English summary of what the business does and why it might be interesting",
  "fitScore": <integer 1-10 rating for search fund acquisition attractiveness based on: recurring revenue, established business, defensible niche, reasonable size>,
  "fitReason": "One short English sentence explaining the fit score"
}

Listings:
${numbered}

Return JSON array only:`,
        900, 0.1
      );

      // Clean and parse
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) continue;

      parsed.forEach((item, j) => {
        if (!item || typeof item !== 'object') return;
        const title = (item.title || '').trim();
        if (!title || title.length < 3) return;

        const askingPrice = typeof item.askingPrice === 'number' && item.askingPrice > 0 ? Math.round(item.askingPrice) : null;
        const revenue     = typeof item.revenue     === 'number' && item.revenue     > 0 ? Math.round(item.revenue)     : null;
        const ebitda      = typeof item.ebitda      === 'number' && item.ebitda      > 0 ? Math.round(item.ebitda)      : null;
        const employees   = typeof item.employees   === 'number' && item.employees   > 0 ? Math.round(item.employees)   : null;
        const multiple    = ebitda && askingPrice   ? Math.round((askingPrice / ebitda) * 10) / 10 : null;
        const fitScore    = (typeof item.fitScore === 'number' && item.fitScore >= 1 && item.fitScore <= 10) ? Math.round(item.fitScore) : null;
        const block       = batch[j] || {};

        // Map AI industry → our taxonomy
        const industryText = `${item.industry || ''} ${title}`;
        const industry = dsGuessIndustry(industryText) !== 'Other'
          ? dsGuessIndustry(industryText)
          : (item.industry || 'Other');

        listings.push({
          id: `ds_dubde_${generateId()}`,
          source: source.id,
          sourceName: source.name,
          sourceIcon: source.icon,
          sourceColor: source.color,
          sourceUrl: block.link || source.searchUrl,
          title,
          description: (item.description || '').trim().substring(0, 400),
          industry,
          location: (item.location || 'Germany').trim(),
          revenue,
          ebitda,
          askingPrice,
          multiple,
          employees,
          listedDate: new Date().toISOString().split('T')[0],
          currency: 'EUR',
          aiAnalyzed: true,
          fitScore,
          fitReason: (item.fitReason || '').trim().substring(0, 120),
        });
      });
    } catch {
      // AI parse failed for this batch — continue with next
      continue;
    }
  }

  return listings;
}

// ─── Excel Import Panel ───────────────────────────────────────────────────────

function renderExcelImportPanel() {
  return `
    <div class="max-w-3xl">
      <div class="card mb-6">
        <h2 class="text-base font-semibold mb-1">Import Deals from Excel or CSV</h2>
        <p class="text-xs text-surface-500 mb-5">Upload a spreadsheet from any broker, platform export, or your own deal log. The AI will detect your column headers and map them to the right fields automatically. Large files (10,000+ rows) are supported.</p>

        <!-- Drop zone -->
        <div id="ds-dropzone" class="border-2 border-dashed border-surface-300 dark:border-surface-600 rounded p-10 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 dark:hover:bg-brand-900/10 transition-colors"
          onclick="document.getElementById('ds-excel-input').click()"
          ondragover="event.preventDefault(); this.classList.add('border-brand-400','bg-brand-50/30')"
          ondragleave="this.classList.remove('border-brand-400','bg-brand-50/30')"
          ondrop="event.preventDefault(); this.classList.remove('border-brand-400','bg-brand-50/30'); dsHandleExcelDrop(event)">
          <svg class="w-10 h-10 mx-auto text-surface-300 dark:text-surface-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
          <p class="text-sm font-medium text-surface-600 dark:text-surface-400">Drop your file here or click to browse</p>
          <p class="text-xs text-surface-400 mt-1">Supports .xlsx, .xls, .csv — any column layout</p>
          <input type="file" id="ds-excel-input" class="hidden" accept=".xlsx,.xls,.csv,.tsv" onchange="dsHandleExcelFile(this.files[0])" />
        </div>
      </div>

      <!-- Column mapping + preview rendered here -->
      <div id="ds-import-preview"></div>
    </div>`;
}

function dsHandleExcelDrop(event) {
  const file = event.dataTransfer?.files?.[0];
  if (file) dsHandleExcelFile(file);
}

async function dsHandleExcelFile(file) {
  if (!file) return;
  const previewEl = document.getElementById('ds-import-preview');
  if (!previewEl) return;

  previewEl.innerHTML = `<div class="card p-6 text-center animate-pulse text-sm text-surface-500">Reading file…</div>`;

  try {
    // Ensure SheetJS is available
    if (typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rawRows.length < 2) throw new Error('File appears to be empty or has only one row');

    const headers = rawRows[0].map(h => String(h).trim());
    const dataRows = rawRows.slice(1).filter(row => row.some(cell => cell !== ''));

    previewEl.innerHTML = `<div class="card p-6 text-center text-sm text-surface-500 animate-pulse">Detected ${headers.length} columns and ${dataRows.length.toLocaleString()} data rows. Mapping columns with AI…</div>`;

    // Use AI to map columns
    const mappings = await dsMagicMapColumns(headers, dataRows.slice(0, 5));

    _dsExcelPreview = { headers, mappings, rows: dataRows, fileName: file.name };
    dsRenderImportPreview();

  } catch (err) {
    previewEl.innerHTML = `<div class="card p-5 border border-red-200 dark:border-red-800"><p class="text-sm text-red-600 font-medium">Import error: ${escapeHtml(err.message)}</p><p class="text-xs text-surface-500 mt-1">Make sure the file is a valid .xlsx, .xls, or .csv file.</p></div>`;
  }
}

// ─── AI Column Mapping ────────────────────────────────────────────────────────

const DS_TARGET_FIELDS = [
  { key: 'name', label: 'Company / Deal Name', required: true },
  { key: 'revenue', label: 'Revenue ($)' },
  { key: 'ebitda', label: 'EBITDA / Cash Flow ($)' },
  { key: 'askingPrice', label: 'Asking Price ($)' },
  { key: 'sector', label: 'Industry / Sector' },
  { key: 'location', label: 'Location / State' },
  { key: 'employees', label: 'Employee Count' },
  { key: 'description', label: 'Description / Summary' },
  { key: 'website', label: 'Website / URL' },
  { key: 'source', label: 'Broker / Source' },
  { key: 'contact', label: 'Contact Name' },
  { key: 'notes', label: 'Notes / Comments' },
];

async function dsMagicMapColumns(headers, sampleRows) {
  // Build a compact sample for AI
  const sample = sampleRows.slice(0, 3).map(r =>
    headers.reduce((obj, h, i) => { obj[h] = String(r[i] || '').substring(0, 60); return obj; }, {})
  );

  const defaultMappings = {};
  DS_TARGET_FIELDS.forEach(f => { defaultMappings[f.key] = null; });

  try {
    const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
    if (!settings?.openaiApiKey && !settings?.claudeApiKey) {
      // Fallback: rule-based mapping without AI
      return dsRuleBasedMapping(headers);
    }

    const raw = await callAI(
      'You are a data analyst. Map spreadsheet column headers to deal fields. Return ONLY a JSON object, no markdown.',
      `Map these spreadsheet columns to deal fields. For each target field, return the exact column header that best matches, or null.\n\nTarget fields: ${DS_TARGET_FIELDS.map(f => f.key + ' (' + f.label + ')').join(', ')}\n\nAvailable columns: ${headers.join(', ')}\n\nSample data (first 3 rows): ${JSON.stringify(sample)}\n\nReturn JSON: { "name": "column name or null", "revenue": "...", ... }`,
      400, 0.1
    );
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    // Validate — only accept headers that actually exist
    const validHeaders = new Set(headers.map(h => h.toLowerCase()));
    const result = {};
    for (const [key, val] of Object.entries(parsed)) {
      result[key] = val && headers.find(h => h.toLowerCase() === val.toLowerCase()) ? val : null;
    }
    // Fill any nulls with rule-based
    const rulesResult = dsRuleBasedMapping(headers);
    DS_TARGET_FIELDS.forEach(f => { if (!result[f.key]) result[f.key] = rulesResult[f.key] || null; });
    return result;
  } catch {
    return dsRuleBasedMapping(headers);
  }
}

function dsRuleBasedMapping(headers) {
  const result = {};
  const rules = {
    name: ['business name', 'company name', 'name', 'title', 'listing name', 'deal name', 'business'],
    revenue: ['revenue', 'annual revenue', 'gross revenue', 'sales', 'annual sales', 'turnover'],
    ebitda: ['ebitda', 'cash flow', 'sde', 'net income', 'cash earnings', 'profit', 'cash profit'],
    askingPrice: ['asking price', 'price', 'list price', 'listing price', 'asking', 'sale price'],
    sector: ['industry', 'sector', 'category', 'type', 'business type'],
    location: ['location', 'state', 'city', 'city, state', 'region', 'geography'],
    employees: ['employees', 'staff', 'headcount', 'num employees', '# employees', 'employee count'],
    description: ['description', 'summary', 'overview', 'details', 'business description', 'notes'],
    website: ['website', 'url', 'web', 'domain', 'listing url', 'link'],
    source: ['source', 'broker', 'platform', 'intermediary', 'sourced from'],
    contact: ['contact', 'contact name', 'broker name', 'agent', 'rep'],
    notes: ['notes', 'comments', 'additional info', 'remarks'],
  };
  for (const [key, patterns] of Object.entries(rules)) {
    result[key] = headers.find(h => patterns.some(p => h.toLowerCase().includes(p))) || null;
  }
  return result;
}

// ─── Import Preview ───────────────────────────────────────────────────────────

function dsRenderImportPreview() {
  const { headers, mappings, rows, fileName } = _dsExcelPreview;
  const previewEl = document.getElementById('ds-import-preview');
  if (!previewEl) return;

  const previewDeals = rows.slice(0, 5).map(r => dsBuildDealFromRow(r, headers, mappings)).filter(d => d.name);

  previewEl.innerHTML = `
    <div class="card mb-4">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-semibold">Column Mapping — ${escapeHtml(fileName)}</h3>
          <p class="text-xs text-surface-500 mt-0.5">${rows.length.toLocaleString()} deals detected · Adjust mappings below if needed</p>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        ${DS_TARGET_FIELDS.map(f => `
          <div>
            <label class="block text-xs font-medium text-surface-500 mb-1">${f.label}${f.required ? ' <span class="text-red-500">*</span>' : ''}</label>
            <select id="ds-map-${f.key}" onchange="dsUpdatePreview()" class="input-field text-sm py-1.5">
              <option value="">— not mapped —</option>
              ${headers.map(h => `<option value="${escapeHtml(h)}" ${mappings[f.key] === h ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Preview of first 5 rows -->
    <div class="card mb-4">
      <h3 class="text-sm font-semibold mb-3">Preview (first 5 deals)</h3>
      <div id="ds-import-rows" class="space-y-2">
        ${dsRenderPreviewRows(previewDeals)}
      </div>
    </div>

    <!-- Import button -->
    <div class="flex items-center gap-4">
      <button onclick="dsBulkImport()" class="btn-primary flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
        Import All ${rows.length.toLocaleString()} Deals into Pipeline
      </button>
      <p class="text-xs text-surface-400">Each deal is added at <strong>Initial Review</strong> stage. Duplicates are skipped.</p>
    </div>`;
}

function dsRenderPreviewRows(deals) {
  if (!deals.length) return '<p class="text-xs text-surface-400 py-2">No valid deals found in first 5 rows. Check that the Name column is mapped.</p>';
  const fmtM = v => v ? (v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + Math.round(v / 1000) + 'K') : '—';
  return deals.map(d => `
    <div class="flex items-center gap-3 p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate">${escapeHtml(d.name)}</p>
        <p class="text-xs text-surface-500">${escapeHtml(d.sector || '')}${d.location ? ' · ' + d.location : ''}</p>
      </div>
      <div class="flex gap-4 text-xs text-right shrink-0">
        <div><div class="text-surface-400">Rev</div><div class="font-medium">${fmtM(d.revenue)}</div></div>
        <div><div class="text-surface-400">EBITDA</div><div class="font-medium">${fmtM(d.ebitda)}</div></div>
        <div><div class="text-surface-400">Ask</div><div class="font-medium text-brand-600">${fmtM(d.askingPrice)}</div></div>
      </div>
    </div>`).join('');
}

function dsUpdatePreview() {
  if (!_dsExcelPreview) return;
  const { headers, rows } = _dsExcelPreview;
  // Read updated mappings from selects
  const mappings = {};
  DS_TARGET_FIELDS.forEach(f => {
    mappings[f.key] = document.getElementById(`ds-map-${f.key}`)?.value || null;
  });
  _dsExcelPreview.mappings = mappings;
  const previewDeals = rows.slice(0, 5).map(r => dsBuildDealFromRow(r, headers, mappings)).filter(d => d.name);
  const rowsEl = document.getElementById('ds-import-rows');
  if (rowsEl) rowsEl.innerHTML = dsRenderPreviewRows(previewDeals);
}

function dsBuildDealFromRow(row, headers, mappings) {
  const get = key => {
    const col = mappings[key];
    if (!col) return null;
    const idx = headers.indexOf(col);
    return idx >= 0 ? String(row[idx] || '').trim() : null;
  };
  const parseMoney = str => {
    if (!str) return null;
    const val = dsParseAmount(str) || parseFloat(str.replace(/[^0-9.]/g, ''));
    return isNaN(val) || val <= 0 ? null : Math.round(val);
  };
  const name = get('name');
  if (!name) return {};
  return {
    name,
    revenue: parseMoney(get('revenue')),
    ebitda: parseMoney(get('ebitda')),
    askingPrice: parseMoney(get('askingPrice')),
    sector: get('sector') || '',
    location: get('location') || '',
    employees: parseInt(get('employees') || 0) || null,
    description: get('description') || '',
    website: get('website') || '',
    source: get('source') || 'Excel Import',
    contact: get('contact') || '',
    notes: get('notes') || '',
  };
}

// ─── Bulk Import ──────────────────────────────────────────────────────────────

async function dsBulkImport() {
  if (!_dsExcelPreview) return;
  const { headers, mappings, rows } = _dsExcelPreview;

  // Get existing deal names to dedupe
  const existingDeals = await DB.getForUser(STORES.deals, currentUser.id);
  const existingNames = new Set(existingDeals.map(d => d.name.toLowerCase().trim()));

  let imported = 0, skipped = 0, errors = 0;

  showToast(`Importing ${rows.length.toLocaleString()} rows…`, 'info');

  // Process in batches of 100 to avoid UI blocking
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const row of batch) {
      const d = dsBuildDealFromRow(row, headers, mappings);
      if (!d.name) { skipped++; continue; }
      if (existingNames.has(d.name.toLowerCase())) { skipped++; continue; }
      try {
        const ebitda = d.ebitda || null;
        const askingPrice = d.askingPrice || null;
        const multiple = ebitda && askingPrice ? Math.round((askingPrice / ebitda) * 10) / 10 : null;
        await DB.add(STORES.deals, {
          id: generateId(),
          userId: currentUser.id,
          name: d.name,
          stage: 'Initial Review',
          sector: d.sector,
          location: d.location,
          revenue: d.revenue,
          ebitda,
          askingPrice,
          askingMultiple: multiple,
          employees: d.employees,
          description: d.description,
          source: d.source,
          website: d.website,
          notes: [d.notes, d.contact ? `Broker/Contact: ${d.contact}` : ''].filter(Boolean).join('\n'),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingNames.add(d.name.toLowerCase());
        imported++;
      } catch { errors++; }
    }
    // Yield to UI between batches
    await new Promise(r => setTimeout(r, 0));
  }

  showToast(`Imported ${imported} deals${skipped ? ` · ${skipped} skipped (duplicates/empty)` : ''}${errors ? ` · ${errors} errors` : ''}`, imported > 0 ? 'success' : 'warning');
  if (imported > 0) {
    _dsExcelPreview = null;
    document.getElementById('ds-import-preview').innerHTML = `
      <div class="card p-6 text-center">
        <p class="text-2xl mb-2">✅</p>
        <p class="text-sm font-medium">${imported} deals added to your pipeline</p>
        <button onclick="navigate('deals')" class="btn-primary mt-3">View Deal Pipeline →</button>
      </div>`;
  }
}
