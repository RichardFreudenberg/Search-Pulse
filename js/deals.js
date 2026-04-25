/* ============================================
   Nexus CRM — Deal Pipeline & Management
   ============================================ */

const DEAL_STAGES = [
  'Sourced', 'First Look', 'Contacted', 'NDA Signed', 'CIM Received',
  'Management Call', 'LOI Drafted', 'LOI Submitted', 'Due Diligence',
  'Exclusivity', 'Legal / Closing', 'Closed - Won', 'Closed - Lost', 'Rejected',
];

const DEAL_ACTIVE_STAGES = DEAL_STAGES.filter(s => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(s));

const DEAL_STAGE_COLORS = {
  'Sourced': 'blue', 'First Look': 'indigo', 'Contacted': 'violet',
  'NDA Signed': 'purple', 'CIM Received': 'fuchsia', 'Management Call': 'pink',
  'LOI Drafted': 'yellow', 'LOI Submitted': 'amber', 'Due Diligence': 'orange',
  'Exclusivity': 'rose', 'Legal / Closing': 'cyan',
  'Closed - Won': 'green', 'Closed - Lost': 'red', 'Rejected': 'gray',
};

const DEAL_SOURCES = ['Broker', 'Proprietary', 'Referral', 'Online Listing', 'Conference', 'Cold Outreach', 'Advisor', 'Other'];
const DEAL_SECTORS = ['Business Services', 'Healthcare Services', 'Technology', 'Industrial', 'Consumer', 'Education', 'Construction / Trades', 'Distribution', 'Food & Beverage', 'Financial Services', 'Other'];

// ─── Currency & FX Module ─────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'USD', symbol: '$',    name: 'US Dollar' },
  { code: 'EUR', symbol: '€',    name: 'Euro' },
  { code: 'GBP', symbol: '£',    name: 'British Pound' },
  { code: 'CHF', symbol: 'CHF ', name: 'Swiss Franc' },
  { code: 'CAD', symbol: 'C$',   name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$',   name: 'Australian Dollar' },
  { code: 'SEK', symbol: 'kr ',  name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr ',  name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr ',  name: 'Danish Krone' },
  { code: 'JPY', symbol: '¥',    name: 'Japanese Yen' },
];

const _FX_CACHE_KEY = 'pulse_fx_rates_v1';
const _FX_CACHE_TTL = 3_600_000; // 1 hour

// Module-level FX state (loaded once per render cycle)
let _fxRates       = null;  // { USD:1, EUR:0.92, ... }
let _fxBaseCurrency = 'USD';
let _fxRatesAge     = null;  // ISO string of last fetch

async function fxLoadRates() {
  // 1. Try localStorage cache
  try {
    const cached = JSON.parse(localStorage.getItem(_FX_CACHE_KEY) || '{}');
    if (cached.ts && Date.now() - cached.ts < _FX_CACHE_TTL && cached.rates) {
      _fxRates = cached.rates;
      _fxRatesAge = new Date(cached.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return;
    }
  } catch {}

  // 2. Fetch live rates (Open Exchange Rates — free, no key required)
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const json = await r.json();
      if (json.result === 'success' && json.rates) {
        _fxRates = json.rates;
        const now = Date.now();
        _fxRatesAge = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        localStorage.setItem(_FX_CACHE_KEY, JSON.stringify({ ts: now, rates: _fxRates }));
        return;
      }
    }
  } catch {}

  // 3. Static fallback (approximate rates as of 2025)
  _fxRates = { USD: 1, EUR: 0.92, GBP: 0.79, CHF: 0.90, CAD: 1.37, AUD: 1.55, SEK: 10.5, NOK: 10.7, DKK: 6.90, JPY: 149 };
  _fxRatesAge = 'offline';
}

/** Convert amount from one currency to another using loaded rates. */
function fxConvert(amount, fromCurrency, toCurrency) {
  if (!amount || !_fxRates) return amount || 0;
  const from = fromCurrency || 'USD';
  const to   = toCurrency   || 'USD';
  if (from === to) return amount;
  const fromRate = _fxRates[from] || 1;
  const toRate   = _fxRates[to]   || 1;
  return amount * (toRate / fromRate);
}

/** Currency symbol for a code. */
function fxSymbol(code) {
  return (CURRENCIES.find(c => c.code === (code || 'USD'))?.symbol || '$').trim();
}

/** Format a monetary amount in its native deal currency (for deal cards / tables). */
function fxFmtNative(amount, currencyCode) {
  if (!amount) return '—';
  return fmtDealMoney(amount, fxSymbol(currencyCode));
}

/** Format an amount already converted to the base currency. */
function fxFmtBase(amount) {
  return fxFmtNative(amount, _fxBaseCurrency);
}

// ─── Number Display Format ─────────────────────────────────────────────────────
// Controlled globally so board / table / cards / deal detail all share one mode.

let _dealNumFormat = 'auto'; // 'auto' | 'K' | 'M' | 'raw'

/**
 * Format a raw dollar amount using the current display mode.
 * @param {number|string|null} n   - Raw value in full units (e.g. 2500000)
 * @param {string}             sym - Currency symbol (e.g. '$', '€')
 */
function fmtDealMoney(n, sym) {
  if (n == null || n === '' || isNaN(Number(n))) return '—';
  n   = Number(n);
  sym = (sym || '$').replace(/\s+/g, '');
  const abs = Math.abs(n);
  switch (_dealNumFormat) {
    case 'M':
      return sym + (n / 1e6).toFixed(2) + 'M';
    case 'K': {
      const kVal = n / 1e3;
      return sym + (abs < 10e3 ? kVal.toFixed(1) : Math.round(kVal).toLocaleString()) + 'K';
    }
    case 'raw':
      return sym + Math.round(n).toLocaleString();
    default: // 'auto' — pick the most readable unit
      if (abs >= 1e9) return sym + (n / 1e9).toFixed(2) + 'B';
      if (abs >= 1e6) return sym + (n / 1e6).toFixed(2) + 'M';
      if (abs >= 1e3) return sym + Math.round(n / 1e3).toLocaleString() + 'K';
      return sym + Math.round(n).toLocaleString();
  }
}

/** Change the global number format and refresh the current deal view. */
async function _setDealNumFormat(fmt) {
  _dealNumFormat = fmt;
  // Persist to settings
  try {
    const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
    if (settings) {
      settings.numberDisplayFormat = fmt;
      await DB.put(STORES.settings, settings);
    }
  } catch (_) {}
  // Refresh deal page if open
  if (typeof currentDealId !== 'undefined' && currentDealId) {
    viewDeal(currentDealId);
  }
}

// Hex colors for stage funnel bars (Tailwind CSS variables are not available at runtime)
const DEAL_STAGE_HEX = {
  'blue': '#3b82f6', 'indigo': '#6366f1', 'violet': '#8b5cf6',
  'purple': '#a855f7', 'fuchsia': '#d946ef', 'pink': '#ec4899',
  'yellow': '#eab308', 'amber': '#f59e0b', 'orange': '#f97316',
  'rose': '#f43f5e', 'cyan': '#06b6d4', 'green': '#22c55e',
  'red': '#ef4444', 'gray': '#6b7280', 'brand': '#4c6ef5',
};

let dealsViewMode = 'board'; // 'board' or 'table'
let dealsFilter = { stage: 'active', source: '', search: '', sort: 'newest' };
let dealsBoardHideEmpty = true; // hide columns with no deals by default

// === AUDIT TRAIL ===
async function logDealHistory(dealId, action, details = {}) {
  await DB.put(STORES.dealHistory, {
    id: generateId(),
    dealId,
    userId: currentUser.id,
    action,
    details,
    timestamp: new Date().toISOString(),
  });
}

// === MAIN RENDER ===
async function renderDeals() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto">${renderLoadingSkeleton(6)}</div>`;

  // Load FX rates and base currency preference in parallel with DB fetch
  const [deals, userSettings] = await Promise.all([
    DB.getForUser(STORES.deals, currentUser.id),
    DB.get(STORES.settings, `settings_${currentUser.id}`).catch(() => null),
    fxLoadRates(),
  ]);
  _fxBaseCurrency = userSettings?.baseCurrency || 'USD';
  const allTasks = await DB.getForUser(STORES.dealTasks, currentUser.id);
  const allDiligence = await DB.getForUser(STORES.dealDiligence, currentUser.id);

  const activeDeals = deals.filter(d => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage));
  const overdueTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date());
  const recentAI = allDiligence.filter(r => r.status === 'completed').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const hotDeals = activeDeals.filter(d => d.priority === 'high' || (d.score && d.score >= 7)).slice(0, 5);

  // Filter deals
  let filtered = [...deals];
  if (dealsFilter.stage === 'active') filtered = filtered.filter(d => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage));
  else if (dealsFilter.stage === 'closed') filtered = filtered.filter(d => ['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage));
  else if (dealsFilter.stage && dealsFilter.stage !== 'all') filtered = filtered.filter(d => d.stage === dealsFilter.stage);

  if (dealsFilter.source) filtered = filtered.filter(d => d.source === dealsFilter.source);
  if (dealsFilter.search) {
    const q = dealsFilter.search.toLowerCase();
    filtered = filtered.filter(d => d.name.toLowerCase().includes(q) || (d.sector || '').toLowerCase().includes(q) || (d.location || '').toLowerCase().includes(q));
  }

  // Sort
  if (dealsFilter.sort === 'newest') filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  else if (dealsFilter.sort === 'oldest') filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  else if (dealsFilter.sort === 'score') filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
  else if (dealsFilter.sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      ${renderPageHeader('Deal Pipeline', `${activeDeals.length} active deal${activeDeals.length !== 1 ? 's' : ''} across ${new Set(activeDeals.map(d => d.stage)).size} stages`,
        `<button onclick="openDealImportModal()" class="btn-secondary btn-sm">Import CSV</button>
         <button onclick="openCompanyMemoTool()" class="btn-secondary btn-sm" title="Generate investment memo from any company website">
           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
           Company Memo
         </button>
         <button onclick="openNewDealModal()" class="btn-primary btn-sm">+ New Deal</button>`
      )}

      <!-- Stats Row -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        ${renderStatCard('Active Deals', activeDeals.length, '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>', 'brand', "showPipelineStatsModal('active')")}
        ${renderStatCard('Hot Deals', hotDeals.length, '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" /></svg>', 'red', "showPipelineStatsModal('hot')")}
        ${renderStatCard('In Diligence', activeDeals.filter(d => ['Due Diligence', 'Exclusivity'].includes(d.stage)).length, '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>', 'purple', "showPipelineStatsModal('diligence')")}
        ${renderStatCard('Overdue Tasks', overdueTasks.length, '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>', 'yellow', "showOverdueTasksModal()")}
        ${renderStatCard('Total Deals', deals.length, '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>', 'green', "showPipelineStatsModal('all')")}
      </div>

      ${deals.length > 0 ? renderPipelineAnalyticsSection(deals, activeDeals) : ''}

      ${deals.length > 0 ? `<div id="funnel-conversion-section"></div>` : ''}

      <!-- Sourcing Breakdown -->
      ${deals.length > 0 ? (() => {
        const srcCount = {};
        deals.forEach(d => { if (d.source) srcCount[d.source] = (srcCount[d.source] || 0) + 1; });
        const sources = Object.entries(srcCount).sort((a, b) => b[1] - a[1]);
        const maxSrc = sources.length > 0 ? sources[0][1] : 1;
        const srcColors = { 'Proprietary': '#22c55e', 'Broker': '#3b82f6', 'Referral': '#a855f7', 'Cold Outreach': '#f97316', 'Online Listing': '#06b6d4', 'Conference': '#eab308', 'Advisor': '#ec4899', 'Other': '#6b7280' };
        return sources.length > 0 ? `
          <div class="card mb-6">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-semibold">Deal Sourcing</h3>
              <span class="text-xs text-surface-400">${deals.length} total</span>
            </div>
            <div class="flex flex-wrap gap-3">
              ${sources.map(([src, count]) => `
                <button onclick="dealsFilter.source = dealsFilter.source === '${src}' ? '' : '${src}'; renderDeals()" class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dealsFilter.source === src ? 'ring-2 ring-brand-500' : ''}" style="background:${srcColors[src] || '#6b7280'}20; color:${srcColors[src] || '#6b7280'}">
                  <span class="w-2 h-2 rounded-full" style="background:${srcColors[src] || '#6b7280'}"></span>
                  ${src}: ${count} (${Math.round(count / deals.length * 100)}%)
                  <div class="w-16 bg-surface-200 dark:bg-surface-700 rounded-full h-1 ml-1">
                    <div class="h-1 rounded-full" style="width:${Math.round(count / maxSrc * 100)}%; background:${srcColors[src] || '#6b7280'}"></div>
                  </div>
                </button>
              `).join('')}
              ${dealsFilter.source ? `<button onclick="dealsFilter.source=''; renderDeals()" class="text-xs text-brand-600 hover:underline px-2">Clear filter ×</button>` : ''}
            </div>
          </div>
        ` : '';
      })() : ''}

      <!-- Filters Row -->
      <div class="flex flex-wrap items-center gap-3 mb-6">
        <div class="flex-1 min-w-[200px]">
          <input type="text" id="deals-search" class="input-field" placeholder="Search deals..." value="${escapeHtml(dealsFilter.search)}" oninput="dealsFilter.search = this.value; renderDeals()" />
        </div>
        <select id="deals-stage-filter" class="input-field w-auto" onchange="dealsFilter.stage = this.value; renderDeals()">
          <option value="active" ${dealsFilter.stage === 'active' ? 'selected' : ''}>Active Deals</option>
          <option value="all" ${dealsFilter.stage === 'all' ? 'selected' : ''}>All Deals</option>
          <option value="closed" ${dealsFilter.stage === 'closed' ? 'selected' : ''}>Closed / Rejected</option>
          ${DEAL_STAGES.map(s => `<option value="${s}" ${dealsFilter.stage === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <select class="input-field w-auto" onchange="dealsFilter.sort = this.value; renderDeals()">
          <option value="newest" ${dealsFilter.sort === 'newest' ? 'selected' : ''}>Newest First</option>
          <option value="oldest" ${dealsFilter.sort === 'oldest' ? 'selected' : ''}>Oldest First</option>
          <option value="score" ${dealsFilter.sort === 'score' ? 'selected' : ''}>Highest Score</option>
          <option value="name" ${dealsFilter.sort === 'name' ? 'selected' : ''}>Name A-Z</option>
        </select>
        <select class="input-field w-auto" onchange="dealsFilter.source = this.value; renderDeals()">
          <option value="" ${!dealsFilter.source ? 'selected' : ''}>All Sources</option>
          ${DEAL_SOURCES.map(s => `<option value="${s}" ${dealsFilter.source === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <div class="flex rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
          <button onclick="dealsViewMode='board'; renderDeals()" class="px-3 py-2 text-sm ${dealsViewMode === 'board' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600' : 'text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800'}" title="Kanban board">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" /></svg>
          </button>
          <button onclick="dealsViewMode='table'; renderDeals()" class="px-3 py-2 text-sm ${dealsViewMode === 'table' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600' : 'text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800'}" title="Table view">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" /></svg>
          </button>
        </div>
        ${dealsViewMode === 'board' ? `
        <button onclick="dealsBoardHideEmpty=!dealsBoardHideEmpty; renderDeals()" class="px-3 py-2 text-sm rounded-lg border border-surface-200 dark:border-surface-700 flex items-center gap-1.5 ${dealsBoardHideEmpty ? 'text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800' : 'bg-brand-50 dark:bg-brand-900/30 text-brand-600'}" title="${dealsBoardHideEmpty ? 'Show empty stages' : 'Hide empty stages'}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"/></svg>
          <span class="text-xs">${dealsBoardHideEmpty ? 'Show all' : 'Hide empty'}</span>
        </button>` : ''}
      </div>

      <!-- Content -->
      ${dealsViewMode === 'board' ? renderDealsPipelineBoard(filtered) : renderDealsTableView(filtered)}
    </div>
  `;

  // Load funnel analytics asynchronously (needs DB read for deal history)
  if (deals.length > 0) {
    setTimeout(() => loadFunnelConversionSection(deals), 0);
  }
}

// === PIPELINE ANALYTICS ===
function renderPipelineAnalyticsSection(deals, activeDeals) {
  const withPrice = activeDeals.filter(d => d.askingPrice);
  const withRevenue = activeDeals.filter(d => d.revenue);
  const withEbitda = activeDeals.filter(d => d.ebitda && d.revenue);
  const withMultiple = activeDeals.filter(d => d.askingMultiple || (d.askingPrice && d.ebitda));
  const getM = d => d.askingMultiple || (d.askingPrice && d.ebitda ? d.askingPrice / d.ebitda : null);

  // Convert all financial values to base currency before summing
  const toBase = (amount, currency) => fxConvert(amount, currency || 'USD', _fxBaseCurrency);
  const totalValue  = withPrice.reduce((s, d) => s + toBase(d.askingPrice, d.currency), 0);
  const avgRevenue  = withRevenue.length  ? withRevenue.reduce((s, d)  => s + toBase(d.revenue,  d.currency), 0) / withRevenue.length  : null;
  const avgMultiple = withMultiple.length ? withMultiple.reduce((s, d) => s + getM(d), 0)                       / withMultiple.length : null;
  const avgMargin   = withEbitda.length   ? withEbitda.reduce((s, d)  => s + (d.ebitda / d.revenue * 100), 0)  / withEbitda.length   : null;

  // Detect if any deal uses a non-base currency (to show FX note)
  const hasMixedCurrencies = activeDeals.some(d => d.currency && d.currency !== _fxBaseCurrency);

  const stageCounts = {};
  DEAL_ACTIVE_STAGES.forEach(s => { stageCounts[s] = 0; });
  activeDeals.forEach(d => { if (stageCounts[d.stage] !== undefined) stageCounts[d.stage]++; });
  const maxStageCount = Math.max(1, ...Object.values(stageCounts));
  const funnelStages = DEAL_ACTIVE_STAGES.filter(s => stageCounts[s] > 0);

  const hasAnyMetric = totalValue > 0 || avgRevenue || avgMultiple || avgMargin;
  const baseSym = fxSymbol(_fxBaseCurrency);

  return `
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="text-sm font-semibold">Pipeline Analytics</h3>
          ${hasMixedCurrencies ? `
            <span class="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium" title="Live exchange rates applied — converted to ${_fxBaseCurrency}">
              ≈ ${_fxBaseCurrency}${_fxRatesAge ? ` · rates ${_fxRatesAge}` : ''}
            </span>
          ` : ''}
        </div>
        <button onclick="showPipelineStatsModal()" class="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium">Full Report →</button>
      </div>
      ${hasAnyMetric ? `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        ${totalValue > 0 ? `
          <button onclick="showPipelineStatsModal('value')" class="kpi-card text-left">
            <div class="kpi-label">Pipeline Value</div>
            <div class="kpi-value" style="font-size:20px">${fxFmtBase(totalValue)}</div>
            <div class="kpi-delta up">↑ ${withPrice.length} deal${withPrice.length !== 1 ? 's' : ''} with price</div>
          </button>
        ` : ''}
        ${avgRevenue ? `
          <button onclick="showPipelineStatsModal('revenue')" class="kpi-card text-left">
            <div class="kpi-label">Avg Revenue</div>
            <div class="kpi-value" style="font-size:20px">${fxFmtBase(avgRevenue)}</div>
            <div class="kpi-delta up">↑ ${withRevenue.length} deal${withRevenue.length !== 1 ? 's' : ''}</div>
          </button>
        ` : ''}
        ${avgMultiple ? `
          <button onclick="showPipelineStatsModal('multiples')" class="kpi-card text-left">
            <div class="kpi-label">Avg EBITDA Multiple</div>
            <div class="kpi-value" style="font-size:20px">${avgMultiple.toFixed(1)}x</div>
            <div class="kpi-delta up">↑ ${withMultiple.length} deal${withMultiple.length !== 1 ? 's' : ''}</div>
          </button>
        ` : ''}
        ${avgMargin ? `
          <button onclick="showPipelineStatsModal('margins')" class="kpi-card text-left">
            <div class="kpi-label">Avg EBITDA Margin</div>
            <div class="kpi-value" style="font-size:20px">${avgMargin.toFixed(0)}%</div>
            <div class="kpi-delta up">↑ ${withEbitda.length} deal${withEbitda.length !== 1 ? 's' : ''}</div>
          </button>
        ` : ''}
      </div>
      ` : ''}
      ${funnelStages.length > 0 ? `
        <div>
          <p class="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-2">Stage Funnel — click to filter</p>
          <div class="space-y-1.5">
            ${funnelStages.map(stage => {
              const count = stageCounts[stage];
              const pct = Math.round(count / maxStageCount * 100);
              const color = DEAL_STAGE_COLORS[stage] || 'gray';
              const isFiltered = dealsFilter.stage === stage;
              return `
                <button onclick="dealsFilter.stage = dealsFilter.stage === '${stage}' ? 'active' : '${stage}'; renderDeals()" class="w-full flex items-center gap-3 px-2 py-1 rounded-lg transition-colors ${isFiltered ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-surface-50 dark:hover:bg-surface-800'} text-left">
                  <span class="text-xs text-surface-600 dark:text-surface-400 w-32 flex-shrink-0 truncate font-medium">${stage}</span>
                  <div class="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-2 min-w-0">
                    <div class="h-2 rounded-full transition-all" style="width:${pct}%; background: ${DEAL_STAGE_HEX[color] || '#6366f1'}"></div>
                  </div>
                  <span class="text-xs font-semibold text-surface-700 dark:text-surface-300 w-5 text-right flex-shrink-0">${count}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// === FUNNEL CONVERSION ANALYTICS ===
async function loadFunnelConversionSection(deals) {
  const el = document.getElementById('funnel-conversion-section');
  if (!el) return;

  const history = await DB.getForUser(STORES.dealHistory, currentUser.id).catch(() => []);
  const stageChanges = history.filter(h => h.action === 'stage_change');

  // Build a map of dealId → sorted stage history
  const dealStageHistory = {};
  stageChanges.forEach(h => {
    if (!dealStageHistory[h.dealId]) dealStageHistory[h.dealId] = [];
    dealStageHistory[h.dealId].push(h);
  });
  Object.values(dealStageHistory).forEach(arr => arr.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));

  const activeDeals = deals.filter(d => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage));

  // For each active stage, calculate:
  // - current count
  // - avg days in stage (time since last stage_change, or since createdAt)
  // - stale deals (> 30 days in stage with no movement)
  const stageStats = DEAL_ACTIVE_STAGES.map(stage => {
    const inStage = activeDeals.filter(d => d.stage === stage);
    const now = new Date();
    const daysInStage = inStage.map(d => {
      const history = dealStageHistory[d.id] || [];
      // Find when this deal entered its current stage
      const entryEvent = [...history].reverse().find(h => h.details?.to === stage || h.details?.newStage === stage);
      const entryDate = entryEvent ? new Date(entryEvent.timestamp) : new Date(d.createdAt);
      return Math.floor((now - entryDate) / 86400000);
    });
    const avgDays = daysInStage.length ? Math.round(daysInStage.reduce((a, b) => a + b, 0) / daysInStage.length) : null;
    const staleDeals = inStage.filter((d, i) => daysInStage[i] > 30);
    return { stage, count: inStage.length, avgDays, staleDeals, deals: inStage };
  }).filter(s => s.count > 0);

  // Conversion rates: of deals that have EVER been in stage N, how many reached stage N+1?
  const stageIndexMap = Object.fromEntries(DEAL_ACTIVE_STAGES.map((s, i) => [s, i]));
  const conversionRates = DEAL_ACTIVE_STAGES.map((stage, idx) => {
    if (idx === DEAL_ACTIVE_STAGES.length - 1) return null;
    const nextStage = DEAL_ACTIVE_STAGES[idx + 1];
    // A deal "reached" a stage if it's currently at or past that stage
    const reachedThis = deals.filter(d => {
      const dIdx = DEAL_ACTIVE_STAGES.indexOf(d.stage);
      const closedPast = ['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage);
      return dIdx >= idx || closedPast || d.stage === 'Closed - Won';
    }).length;
    const reachedNext = deals.filter(d => {
      const dIdx = DEAL_ACTIVE_STAGES.indexOf(d.stage);
      const closedWon = d.stage === 'Closed - Won';
      return dIdx >= idx + 1 || closedWon;
    }).length;
    if (reachedThis === 0) return null;
    return { from: stage, to: nextStage, rate: Math.round(reachedNext / reachedThis * 100), reachedThis, reachedNext };
  }).filter(Boolean);

  // Total stale count
  const totalStale = stageStats.reduce((s, st) => s + st.staleDeals.length, 0);

  // Avg time to close (Closed Won deals)
  const closedWon = deals.filter(d => d.stage === 'Closed - Won');
  const avgCloseTime = closedWon.length ? Math.round(
    closedWon.reduce((s, d) => s + Math.floor((new Date() - new Date(d.createdAt)) / 86400000), 0) / closedWon.length
  ) : null;

  el.innerHTML = `
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-semibold">Funnel Conversion</h3>
          <p class="text-xs text-surface-400 mt-0.5">Stage velocity &amp; conversion rates</p>
        </div>
        <div class="flex items-center gap-3">
          ${totalStale > 0 ? `<button onclick="showStaleDealsModal()" class="text-xs px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-medium hover:bg-amber-100 transition-colors">${totalStale} stale deal${totalStale !== 1 ? 's' : ''} &gt;30 days →</button>` : ''}
          ${avgCloseTime ? `<span class="text-xs text-surface-400">Avg close time: <strong>${avgCloseTime}d</strong></span>` : ''}
        </div>
      </div>

      <!-- Stage velocity table -->
      <div class="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700 mb-5">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
              <th class="text-left text-xs font-semibold text-surface-500 px-3 py-2">Stage</th>
              <th class="text-center text-xs font-semibold text-surface-500 px-3 py-2">Deals</th>
              <th class="text-center text-xs font-semibold text-surface-500 px-3 py-2">Avg Days Here</th>
              <th class="text-center text-xs font-semibold text-surface-500 px-3 py-2">Stale (&gt;30d)</th>
              <th class="text-center text-xs font-semibold text-surface-500 px-3 py-2">→ Next Stage</th>
            </tr>
          </thead>
          <tbody>
            ${stageStats.map(s => {
              const hex = DEAL_STAGE_HEX[DEAL_STAGE_COLORS[s.stage] || 'gray'] || '#6b7280';
              const conv = conversionRates.find(c => c.from === s.stage);
              const staleClass = s.staleDeals.length > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-surface-400';
              const daysClass = s.avgDays > 30 ? 'text-red-500 font-semibold' : s.avgDays > 14 ? 'text-amber-500 font-medium' : 'text-surface-700 dark:text-surface-300';
              return `
                <tr class="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer" onclick="showPipelineStatsModal('stage_${encodeURIComponent(s.stage)}')">
                  <td class="px-3 py-2">
                    <div class="flex items-center gap-2">
                      <div class="w-2 h-2 rounded-full flex-shrink-0" style="background:${hex}"></div>
                      <span class="font-medium text-surface-800 dark:text-surface-200">${s.stage}</span>
                    </div>
                  </td>
                  <td class="px-3 py-2 text-center font-semibold">${s.count}</td>
                  <td class="px-3 py-2 text-center ${daysClass}">${s.avgDays !== null ? s.avgDays + 'd' : '—'}</td>
                  <td class="px-3 py-2 text-center ${staleClass}">${s.staleDeals.length > 0 ? `<button onclick="event.stopPropagation(); showStageStaleDrilldown('${encodeURIComponent(s.stage)}')" class="hover:underline">${s.staleDeals.length}</button>` : '—'}</td>
                  <td class="px-3 py-2 text-center">
                    ${conv ? `
                      <div class="flex items-center justify-center gap-1.5">
                        <div class="w-16 bg-surface-100 dark:bg-surface-700 rounded-full h-1.5">
                          <div class="h-1.5 rounded-full ${conv.rate >= 50 ? 'bg-green-500' : conv.rate >= 25 ? 'bg-amber-500' : 'bg-red-400'}" style="width:${conv.rate}%"></div>
                        </div>
                        <span class="text-xs font-semibold ${conv.rate >= 50 ? 'text-green-600' : conv.rate >= 25 ? 'text-amber-600' : 'text-red-500'}">${conv.rate}%</span>
                      </div>
                    ` : '<span class="text-surface-300">—</span>'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Mini funnel visualisation -->
      ${conversionRates.length > 0 ? `
        <div>
          <p class="text-xs font-semibold text-surface-400 uppercase tracking-wide mb-2">Pipeline drop-off</p>
          <div class="flex items-center gap-1 flex-wrap">
            ${conversionRates.slice(0, 8).map(c => `
              <div class="flex items-center gap-1">
                <span class="text-xs text-surface-500 whitespace-nowrap">${c.from.split(' ')[0]}</span>
                <span class="text-xs font-bold ${c.rate >= 50 ? 'text-green-600' : c.rate >= 25 ? 'text-amber-500' : 'text-red-500'}">${c.rate}%→</span>
              </div>
            `).join('')}
            <span class="text-xs text-surface-400 ml-1">Close</span>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

async function showStaleDealsModal() {
  const deals = await DB.getForUser(STORES.deals, currentUser.id);
  const history = await DB.getForUser(STORES.dealHistory, currentUser.id).catch(() => []);
  const stageChanges = history.filter(h => h.action === 'stage_change');
  const dealStageHistory = {};
  stageChanges.forEach(h => {
    if (!dealStageHistory[h.dealId]) dealStageHistory[h.dealId] = [];
    dealStageHistory[h.dealId].push(h);
  });

  const now = new Date();
  const activeDeals = deals.filter(d => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage));
  const stale = activeDeals.map(d => {
    const hist = (dealStageHistory[d.id] || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const entryEvent = [...hist].reverse().find(h => h.details?.to === d.stage || h.details?.newStage === d.stage);
    const entryDate = entryEvent ? new Date(entryEvent.timestamp) : new Date(d.createdAt);
    const days = Math.floor((now - entryDate) / 86400000);
    return { ...d, daysInStage: days };
  }).filter(d => d.daysInStage > 30).sort((a, b) => b.daysInStage - a.daysInStage);

  _renderDealListModal(
    `${stale.length} Stale Deal${stale.length !== 1 ? 's' : ''}`,
    'Deals that have not moved stages in over 30 days — sorted by time stuck',
    stale.map(d => ({
      ...d,
      _subtitle: `${d.daysInStage} days in ${d.stage}`,
    })),
    'No stale deals! All active deals have moved stages recently.'
  );
}

async function showStageStaleDrilldown(encodedStage) {
  const stage = decodeURIComponent(encodedStage);
  const deals = await DB.getForUser(STORES.deals, currentUser.id);
  const history = await DB.getForUser(STORES.dealHistory, currentUser.id).catch(() => []);
  const stageChanges = history.filter(h => h.action === 'stage_change');
  const dealStageHistory = {};
  stageChanges.forEach(h => {
    if (!dealStageHistory[h.dealId]) dealStageHistory[h.dealId] = [];
    dealStageHistory[h.dealId].push(h);
  });
  const now = new Date();
  const inStage = deals.filter(d => d.stage === stage).map(d => {
    const hist = (dealStageHistory[d.id] || []).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const entryEvent = [...hist].reverse().find(h => h.details?.to === stage || h.details?.newStage === stage);
    const entryDate = entryEvent ? new Date(entryEvent.timestamp) : new Date(d.createdAt);
    return { ...d, daysInStage: Math.floor((now - entryDate) / 86400000) };
  }).filter(d => d.daysInStage > 30).sort((a, b) => b.daysInStage - a.daysInStage);
  _renderDealListModal(`Stale in "${stage}"`, `${inStage.length} deal${inStage.length !== 1 ? 's' : ''} stuck here for 30+ days`, inStage, 'No stale deals in this stage.');
}

function _renderDealListModal(title, subtitle, dealsList, emptyMsg) {
  const rows = dealsList.map(deal => {
    const stageColor = DEAL_STAGE_HEX[DEAL_STAGE_COLORS[deal.stage] || 'gray'] || '#6b7280';
    const revenue = fxFmtNative(deal.revenue, deal.currency);
    const margin = deal.revenue && deal.ebitda ? ((deal.ebitda / deal.revenue) * 100).toFixed(0) + '%' : '—';
    const multiple = deal.askingMultiple
      ? deal.askingMultiple.toFixed(1) + 'x'
      : (deal.askingPrice && deal.ebitda ? (deal.askingPrice / deal.ebitda).toFixed(1) + 'x' : '—');
    return `
      <div class="flex items-center gap-3 p-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800 cursor-pointer transition-colors" onclick="closeModal(); viewDeal('${deal.id}')">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-sm font-semibold text-surface-900 dark:text-surface-100">${escapeHtml(deal.name)}</p>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background:${stageColor}20; color:${stageColor}">${escapeHtml(deal.stage)}</span>
            ${deal.priority === 'high' ? '<span class="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 inline-block" title="High priority"></span>' : ''}
          </div>
          ${deal.sector || deal.location ? `<p class="text-xs text-surface-400 mt-0.5">${[deal.sector, deal.location].filter(Boolean).join(' · ')}</p>` : ''}
        </div>
        <div class="flex items-center gap-4 flex-shrink-0 text-right">
          <div class="hidden sm:block">
            <p class="text-xs text-surface-400">Revenue</p>
            <p class="text-sm font-semibold">${revenue}</p>
          </div>
          <div class="hidden sm:block">
            <p class="text-xs text-surface-400">Margin</p>
            <p class="text-sm font-semibold">${margin}</p>
          </div>
          <div>
            <p class="text-xs text-surface-400">Multiple</p>
            <p class="text-sm font-semibold">${multiple}</p>
          </div>
          ${deal.score != null ? `<div>${renderScoreBar(deal.score, 'sm')}</div>` : ''}
          <svg class="w-4 h-4 text-surface-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
        </div>
      </div>
    `;
  }).join('');

  openModal(`
    <div class="p-6">
      <div class="flex items-start justify-between mb-1">
        <h2 class="text-lg font-bold">${escapeHtml(title)}</h2>
        <button onclick="closeModal()" class="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 flex-shrink-0"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
      </div>
      ${subtitle ? `<p class="text-sm text-surface-500 mb-4">${escapeHtml(subtitle)}</p>` : '<div class="mb-4"></div>'}
      ${dealsList.length === 0
        ? `<div class="text-center py-10 text-surface-400"><p class="text-sm">${emptyMsg || 'No deals found.'}</p></div>`
        : `<div class="space-y-2 max-h-[65vh] overflow-y-auto">${rows}</div>`
      }
    </div>
  `, { wide: true });
}

async function showPipelineStatsModal(section = 'overview') {
  const deals = await DB.getForUser(STORES.deals, currentUser.id);
  if (deals.length === 0) { showToast('No deals to analyze', 'info'); return; }

  const activeDeals = deals.filter(d => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage));
  const closedWon = deals.filter(d => d.stage === 'Closed - Won');
  const withPrice = deals.filter(d => d.askingPrice);
  const withRevenue = deals.filter(d => d.revenue);
  const withEbitda = deals.filter(d => d.ebitda && d.revenue);
  const getM = d => d.askingMultiple || (d.askingPrice && d.ebitda ? d.askingPrice / d.ebitda : null);
  const withMultiple = deals.filter(d => getM(d) !== null);

  // Section-specific filtered views — show the actual deals behind the number
  if (section === 'hot') {
    const hotDeals = activeDeals.filter(d => d.priority === 'high' || (d.score && d.score >= 7))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    return _renderDealListModal('Hot Deals', `${hotDeals.length} deal${hotDeals.length !== 1 ? 's' : ''} with high priority or score ≥ 7`, hotDeals, 'No hot deals right now. Mark a deal as high priority or score it 7+.');
  }
  if (section === 'value') {
    const priceDeals = withPrice.filter(d => activeDeals.includes(d)).sort((a, b) => b.askingPrice - a.askingPrice);
    return _renderDealListModal('Pipeline Value', `${priceDeals.length} active deal${priceDeals.length !== 1 ? 's' : ''} with asking price — sorted by value`, priceDeals, 'No deals have an asking price set.');
  }
  if (section === 'revenue') {
    const revDeals = withRevenue.filter(d => activeDeals.includes(d)).sort((a, b) => b.revenue - a.revenue);
    return _renderDealListModal('Revenue Breakdown', `${revDeals.length} deal${revDeals.length !== 1 ? 's' : ''} with revenue data — sorted by revenue`, revDeals, 'No deals have revenue data set.');
  }
  if (section === 'multiples') {
    const multDeals = withMultiple.filter(d => activeDeals.includes(d)).sort((a, b) => getM(a) - getM(b));
    return _renderDealListModal('EBITDA Multiples', `${multDeals.length} deal${multDeals.length !== 1 ? 's' : ''} with multiple data — sorted by multiple`, multDeals, 'No deals have multiple data set.');
  }
  if (section === 'margins') {
    const marginDeals = withEbitda.filter(d => activeDeals.includes(d))
      .sort((a, b) => (b.ebitda / b.revenue) - (a.ebitda / a.revenue));
    return _renderDealListModal('EBITDA Margins', `${marginDeals.length} deal${marginDeals.length !== 1 ? 's' : ''} with margin data — sorted by margin`, marginDeals, 'No deals have both revenue and EBITDA set.');
  }
  if (section === 'diligence') {
    const ddDeals = activeDeals.filter(d => ['Due Diligence', 'Exclusivity'].includes(d.stage))
      .sort((a, b) => DEAL_STAGES.indexOf(b.stage) - DEAL_STAGES.indexOf(a.stage));
    return _renderDealListModal('In Diligence', `${ddDeals.length} deal${ddDeals.length !== 1 ? 's' : ''} in Due Diligence or Exclusivity`, ddDeals, 'No deals currently in diligence.');
  }
  if (section === 'active') {
    return _renderDealListModal('Active Deals', `${activeDeals.length} deal${activeDeals.length !== 1 ? 's' : ''} in the pipeline`, activeDeals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), 'No active deals.');
  }
  if (section === 'all') {
    return _renderDealListModal('All Deals', `${deals.length} total deal${deals.length !== 1 ? 's' : ''}`, deals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), 'No deals yet.');
  }
  if (section.startsWith('stage_')) {
    const stage = decodeURIComponent(section.replace('stage_', ''));
    const stageDeals = deals.filter(d => d.stage === stage).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return _renderDealListModal(`${stage}`, `${stageDeals.length} deal${stageDeals.length !== 1 ? 's' : ''} in this stage`, stageDeals, `No deals in ${stage}.`);
  }

  const toBase = (amount, currency) => fxConvert(amount, currency || 'USD', _fxBaseCurrency);
  const totalActivePipelineValue = activeDeals.filter(d => d.askingPrice).reduce((s, d) => s + toBase(d.askingPrice, d.currency), 0);
  const avgRevenue = withRevenue.length ? withRevenue.reduce((s, d) => s + toBase(d.revenue, d.currency), 0) / withRevenue.length : null;
  const avgEbitda = deals.filter(d => d.ebitda).length ? deals.filter(d => d.ebitda).reduce((s, d) => s + toBase(d.ebitda, d.currency), 0) / deals.filter(d => d.ebitda).length : null;
  const avgMultiple = withMultiple.length ? withMultiple.reduce((s, d) => s + getM(d), 0) / withMultiple.length : null;
  const avgMargin = withEbitda.length ? withEbitda.reduce((s, d) => s + (d.ebitda / d.revenue * 100), 0) / withEbitda.length : null;

  // Revenue distribution buckets
  const revBuckets = [
    { label: '< $2M', min: 0, max: 2e6 },
    { label: '$2–5M', min: 2e6, max: 5e6 },
    { label: '$5–10M', min: 5e6, max: 10e6 },
    { label: '$10–20M', min: 10e6, max: 20e6 },
    { label: '$20M+', min: 20e6, max: Infinity },
  ];
  const revDist = revBuckets.map(b => ({
    ...b,
    count: withRevenue.filter(d => d.revenue >= b.min && d.revenue < b.max).length,
  })).filter(b => b.count > 0);

  // Multiple distribution
  const multBuckets = [
    { label: '< 4x', min: 0, max: 4 },
    { label: '4–5x', min: 4, max: 5 },
    { label: '5–6x', min: 5, max: 6 },
    { label: '6–7x', min: 6, max: 7 },
    { label: '7–8x', min: 7, max: 8 },
    { label: '8x+', min: 8, max: Infinity },
  ];
  const multDist = multBuckets.map(b => ({
    ...b,
    count: withMultiple.filter(d => { const m = getM(d); return m >= b.min && m < b.max; }).length,
  })).filter(b => b.count > 0);

  // Sector breakdown
  const sectorGroups = {};
  deals.forEach(d => {
    const s = d.sector || 'Unknown';
    if (!sectorGroups[s]) sectorGroups[s] = [];
    sectorGroups[s].push(d);
  });
  const sectorsSorted = Object.entries(sectorGroups).sort((a, b) => b[1].length - a[1].length);

  // Source breakdown
  const srcGroups = {};
  deals.forEach(d => {
    const s = d.source || 'Unknown';
    if (!srcGroups[s]) srcGroups[s] = [];
    srcGroups[s].push(d);
  });
  const srcsSorted = Object.entries(srcGroups).sort((a, b) => b[1].length - a[1].length);
  const maxSrc = srcsSorted.length ? srcsSorted[0][1].length : 1;

  const formatM = v => (v !== null && v !== undefined) ? fxFmtBase(v) : '—';

  openModal(`
    <div class="p-6 max-h-[85vh] overflow-y-auto space-y-7">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold">Pipeline Statistics</h2>
        <button onclick="closeModal()" class="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
      </div>

      <!-- Summary KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-4 text-center">
          <p class="text-2xl font-bold text-brand-700 dark:text-brand-300">${activeDeals.length}</p>
          <p class="text-xs text-brand-600 dark:text-brand-400 mt-0.5">Active Deals</p>
        </div>
        <div class="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center">
          <p class="text-2xl font-bold text-green-700 dark:text-green-300">${totalActivePipelineValue > 0 ? fxFmtBase(totalActivePipelineValue) : '—'}</p>
          <p class="text-xs text-green-600 dark:text-green-400 mt-0.5">Active Pipeline Value (${_fxBaseCurrency})</p>
        </div>
        <div class="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 text-center">
          <p class="text-2xl font-bold text-purple-700 dark:text-purple-300">${avgMultiple ? avgMultiple.toFixed(1) + 'x' : '—'}</p>
          <p class="text-xs text-purple-600 dark:text-purple-400 mt-0.5">Avg EBITDA Multiple</p>
        </div>
        <div class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 text-center">
          <p class="text-2xl font-bold text-amber-700 dark:text-amber-300">${closedWon.length}</p>
          <p class="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Closed Won</p>
        </div>
      </div>

      <!-- Financial Benchmarks -->
      <div>
        <h3 class="text-sm font-semibold mb-3">Financial Benchmarks</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          ${[
            ['Avg Revenue', avgRevenue ? formatM(avgRevenue) : '—', withRevenue.length + ' deals'],
            ['Avg EBITDA', avgEbitda ? formatM(avgEbitda) : '—', deals.filter(d => d.ebitda).length + ' deals'],
            ['Avg EBITDA Margin', avgMargin ? avgMargin.toFixed(0) + '%' : '—', withEbitda.length + ' deals'],
            ['Avg EBITDA Multiple', avgMultiple ? avgMultiple.toFixed(1) + 'x' : '—', withMultiple.length + ' deals'],
            ['Total Pipeline Value', formatM(totalActivePipelineValue), withPrice.filter(d => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage)).length + ' with price'],
            ['Median Revenue', (() => { const rs = withRevenue.map(d => d.revenue).sort((a, b) => a - b); return rs.length ? formatM(rs[Math.floor(rs.length / 2)]) : '—'; })(), ''],
          ].map(([label, value, sub]) => `
            <div class="p-3 rounded-lg bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
              <p class="text-xs text-surface-500 mb-1">${label}</p>
              <p class="text-lg font-bold text-surface-900 dark:text-surface-100">${value}</p>
              ${sub ? `<p class="text-xs text-surface-400 mt-0.5">${sub}</p>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Revenue Distribution -->
      ${revDist.length > 0 ? `
        <div>
          <h3 class="text-sm font-semibold mb-3">Revenue Distribution</h3>
          <div class="space-y-2">
            ${revDist.map(b => `
              <div class="flex items-center gap-3">
                <span class="text-xs text-surface-500 w-16 flex-shrink-0">${b.label}</span>
                <div class="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-2.5">
                  <div class="h-2.5 rounded-full bg-brand-500" style="width:${Math.round(b.count / withRevenue.length * 100)}%"></div>
                </div>
                <span class="text-xs font-semibold text-surface-700 dark:text-surface-300 w-4 text-right">${b.count}</span>
                <span class="text-xs text-surface-400 w-8">${Math.round(b.count / withRevenue.length * 100)}%</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Multiple Distribution -->
      ${multDist.length > 1 ? `
        <div>
          <h3 class="text-sm font-semibold mb-3">Multiple Distribution</h3>
          <div class="space-y-2">
            ${multDist.map(b => `
              <div class="flex items-center gap-3">
                <span class="text-xs text-surface-500 w-16 flex-shrink-0">${b.label}</span>
                <div class="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-2.5">
                  <div class="h-2.5 rounded-full bg-purple-500" style="width:${Math.round(b.count / withMultiple.length * 100)}%"></div>
                </div>
                <span class="text-xs font-semibold text-surface-700 dark:text-surface-300 w-4 text-right">${b.count}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- By Sector -->
      ${sectorsSorted.length > 0 ? `
        <div>
          <h3 class="text-sm font-semibold mb-3">By Sector</h3>
          <div class="overflow-x-auto">
            <table class="data-table text-sm">
              <thead><tr><th>Sector</th><th>Deals</th><th>Avg Revenue</th><th>Avg Multiple</th></tr></thead>
              <tbody>
                ${sectorsSorted.map(([sector, sDeals]) => {
                  const sRev = sDeals.filter(d => d.revenue);
                  const sMult = sDeals.filter(d => getM(d) !== null);
                  return `
                    <tr>
                      <td class="font-medium">${escapeHtml(sector)}</td>
                      <td>${sDeals.length}</td>
                      <td>${sRev.length ? fxFmtBase(sRev.reduce((s, d) => s + toBase(d.revenue, d.currency), 0) / sRev.length) : '—'}</td>
                      <td>${sMult.length ? (sMult.reduce((s, d) => s + getM(d), 0) / sMult.length).toFixed(1) + 'x' : '—'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- By Source -->
      <div>
        <h3 class="text-sm font-semibold mb-3">By Source</h3>
        <div class="space-y-2">
          ${srcsSorted.map(([src, sDeals]) => `
            <div class="flex items-center gap-3">
              <span class="text-xs text-surface-600 dark:text-surface-400 font-medium w-28 flex-shrink-0">${escapeHtml(src)}</span>
              <div class="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-2.5">
                <div class="h-2.5 rounded-full bg-green-500" style="width:${Math.round(sDeals.length / maxSrc * 100)}%"></div>
              </div>
              <span class="text-xs font-semibold w-4 text-right">${sDeals.length}</span>
              <span class="text-xs text-surface-400 w-8">${Math.round(sDeals.length / deals.length * 100)}%</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- All Deals Table -->
      <div>
        <h3 class="text-sm font-semibold mb-3">All Deals (${deals.length})</h3>
        <div class="overflow-x-auto rounded-lg border border-surface-200 dark:border-surface-700">
          <table class="data-table">
            <thead><tr><th>Deal</th><th>Stage</th><th>Revenue</th><th>EBITDA</th><th>Margin</th><th>Multiple</th><th>Score</th></tr></thead>
            <tbody>
              ${deals.sort((a, b) => (b.askingPrice || 0) - (a.askingPrice || 0)).map(deal => {
                const m = getM(deal);
                const margin = deal.revenue && deal.ebitda ? (deal.ebitda / deal.revenue * 100).toFixed(0) + '%' : '—';
                const stageColor = DEAL_STAGE_COLORS[deal.stage] || 'gray';
                return `
                  <tr class="clickable" onclick="closeModal(); viewDeal('${deal.id}')">
                    <td>
                      <div class="font-medium">${escapeHtml(deal.name)}</div>
                      ${deal.sector ? `<div class="text-xs text-surface-400">${escapeHtml(deal.sector)}</div>` : ''}
                    </td>
                    <td><span class="badge bg-${stageColor}-100 text-${stageColor}-700 dark:bg-${stageColor}-900/30 dark:text-${stageColor}-400">${escapeHtml(deal.stage)}</span></td>
                    <td>${fxFmtNative(deal.revenue, deal.currency)}</td>
                    <td>${fxFmtNative(deal.ebitda, deal.currency)}</td>
                    <td>${margin}</td>
                    <td>${m ? m.toFixed(1) + 'x' : '—'}</td>
                    <td>${renderScoreBar(deal.score, 'sm')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);
}

async function showOverdueTasksModal() {
  const allTasks = await DB.getForUser(STORES.dealTasks, currentUser.id);
  const overdue = allTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date())
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  if (overdue.length === 0) { showToast('No overdue tasks!', 'success'); return; }

  const deals = await DB.getForUser(STORES.deals, currentUser.id);
  const dealMap = Object.fromEntries(deals.map(d => [d.id, d]));

  openModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-semibold">${overdue.length} Overdue Task${overdue.length !== 1 ? 's' : ''}</h2>
        <button onclick="closeModal()" class="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12"/></svg></button>
      </div>
      <div class="space-y-2">
        ${overdue.map(task => {
          const deal = dealMap[task.dealId];
          const daysPast = Math.floor((new Date() - new Date(task.dueDate)) / 86400000);
          return `
            <div class="flex items-start gap-3 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
              <button onclick="toggleDealTaskStatus('${task.id}')" class="mt-0.5 flex-shrink-0" title="Mark done">
                <svg class="w-5 h-5 text-surface-300 hover:text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.5"/></svg>
              </button>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-surface-900 dark:text-surface-100">${escapeHtml(task.title)}</p>
                ${deal ? `<button onclick="closeModal(); viewDeal('${deal.id}')" class="text-xs text-brand-600 hover:underline mt-0.5">${escapeHtml(deal.name)}</button>` : ''}
                <p class="text-xs text-red-600 dark:text-red-400 mt-0.5">${daysPast} day${daysPast !== 1 ? 's' : ''} overdue — was due ${formatDate(task.dueDate)}</p>
              </div>
              <span class="text-xs px-2 py-0.5 rounded ${task.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : task.priority === 'low' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}">${task.priority || 'medium'}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `);
}

// === PIPELINE BOARD (KANBAN) ===
function renderDealsPipelineBoard(deals) {
  const stageGroups = {};
  DEAL_ACTIVE_STAGES.forEach(s => stageGroups[s] = []);
  deals.filter(d => DEAL_ACTIVE_STAGES.includes(d.stage)).forEach(d => {
    if (stageGroups[d.stage]) stageGroups[d.stage].push(d);
  });

  const hasAnyDeals = DEAL_ACTIVE_STAGES.some(s => stageGroups[s].length > 0);
  const displayStages = (dealsBoardHideEmpty && hasAnyDeals)
    ? DEAL_ACTIVE_STAGES.filter(s => stageGroups[s].length > 0)
    : DEAL_ACTIVE_STAGES;

  return `
    <div class="sp-kanban-board">
      ${displayStages.map(stage => {
        const stageDeals = stageGroups[stage] || [];
        const color = DEAL_STAGE_COLORS[stage] || 'gray';
        const dotHex = DEAL_STAGE_HEX[color] || '#9191a8';
        const totalValue = stageDeals.reduce((s, d) => s + (d.askingPrice || 0), 0);
        const valueFmt = totalValue > 0 ? fxFmtNative(totalValue, 'USD') : null;
        return `
          <div class="sp-kanban-col" data-stage="${stage}"
            ondragover="event.preventDefault(); this.classList.add('sp-kanban-col--drag')"
            ondragleave="this.classList.remove('sp-kanban-col--drag')"
            ondrop="onDealDrop(event, '${stage}'); this.classList.remove('sp-kanban-col--drag')">
            <div class="sp-kanban-header">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <div class="sp-kanban-dot" style="background:${dotHex}"></div>
                <span class="sp-kanban-stage">${escapeHtml(stage)}</span>
              </div>
              <span class="sp-kanban-count">${stageDeals.length}</span>
            </div>
            <div class="sp-kanban-meta flex items-center justify-between">
              <span>${stageDeals.length} deal${stageDeals.length !== 1 ? 's' : ''}</span>
              ${valueFmt ? `<span class="text-xs text-surface-400 font-medium">${valueFmt}</span>` : ''}
            </div>
            <div class="sp-kanban-body">
              ${stageDeals.map(deal => renderDealCard(deal)).join('')}
              ${stageDeals.length === 0 ? `<div class="sp-kanban-empty">Drop deals here</div>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderDealCard(deal) {
  const hasScore = deal.score !== null && deal.score !== undefined;
  const margin = deal.revenue && deal.ebitda ? ((deal.ebitda / deal.revenue) * 100).toFixed(0) : null;
  const multiple = deal.askingMultiple
    ? deal.askingMultiple.toFixed(1)
    : (deal.askingPrice && deal.ebitda ? (deal.askingPrice / deal.ebitda).toFixed(1) : null);
  const stageColor = DEAL_STAGE_COLORS[deal.stage] || 'gray';

  // Aging: days since the deal entered this stage
  const agingRefDate = deal.stageEnteredAt || deal.updatedAt || deal.createdAt;
  const agingDays = agingRefDate ? Math.floor((Date.now() - new Date(agingRefDate).getTime()) / 86400000) : null;
  const agingBadge = agingDays !== null && agingDays >= 14
    ? `<span class="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${agingDays >= 30 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}" title="${agingDays} days in this stage">${agingDays}d</span>`
    : '';

  const scoreColor = hasScore ? (deal.score >= 7 ? '#16a34a' : deal.score >= 5 ? '#d97706' : '#9191a8') : null;
  const scorePct = hasScore ? Math.min(deal.score * 10, 100) : 0;

  return `
    <div class="sp-deal-card"
      draggable="true"
      ondragstart="event.dataTransfer.setData('text/plain', '${deal.id}'); event.dataTransfer.effectAllowed='move'"
      onclick="viewDeal('${deal.id}')">

      <div class="sp-deal-name">
        <span class="truncate">${escapeHtml(deal.name)}</span>
        <div class="flex items-center gap-1 flex-shrink-0">
          ${agingBadge}
          ${deal.priority === 'high' ? '<span class="sp-deal-priority" title="High priority"></span>' : ''}
        </div>
      </div>

      ${deal.sector || deal.location ? `<div class="sp-deal-meta">${escapeHtml([deal.sector, deal.location].filter(Boolean).join(' · '))}</div>` : ''}

      ${(deal.revenue || deal.ebitda || multiple) ? `
        <div class="sp-deal-metrics">
          ${deal.revenue ? `<span>${fxFmtNative(deal.revenue, deal.currency)}</span>` : ''}
          ${margin ? `<span class="sp-metric-green">${margin}% margin</span>` : ''}
          ${multiple ? `<span class="sp-metric-purple">${multiple}x</span>` : ''}
        </div>
      ` : ''}

      ${hasScore ? `
        <div class="sp-score-row">
          <div class="sp-score-bar-wrap">
            <div class="sp-score-bar" style="width:${scorePct}%;background:${scoreColor}"></div>
          </div>
          <span class="sp-score-num" style="color:${scoreColor}">${deal.score.toFixed(1)}</span>
        </div>
      ` : ''}

      ${deal.source ? `<div class="sp-deal-source">${escapeHtml(deal.source)}</div>` : ''}

      ${deal.nextActionDate ? `
        <div class="sp-deal-action ${new Date(deal.nextActionDate) < new Date() ? 'sp-deal-action--overdue' : ''}">
          ${deal.nextAction ? escapeHtml(deal.nextAction) : 'Next action'}: ${formatDate(deal.nextActionDate)}
        </div>
      ` : ''}
    </div>
  `;
}

async function onDealDrop(event, targetStage) {
  event.preventDefault();
  const dealId = event.dataTransfer.getData('text/plain');
  if (!dealId) return;
  await moveDealToStage(dealId, targetStage);
}

async function moveDealToStage(dealId, newStage) {
  const deal = await DB.get(STORES.deals, dealId);
  if (!deal || deal.stage === newStage) return;

  const oldStage = deal.stage;
  deal.stage = newStage;
  deal.stageEnteredAt = new Date().toISOString(); // track when deal entered this stage (for aging)
  deal.updatedAt = new Date().toISOString();

  if (['Closed - Won', 'Closed - Lost', 'Rejected'].includes(newStage)) {
    deal.closedAt = new Date().toISOString();
    deal.status = newStage === 'Closed - Won' ? 'closed_won' : newStage === 'Rejected' ? 'rejected' : 'closed_lost';
  } else {
    deal.status = 'active';
    deal.closedAt = null;
  }

  await DB.put(STORES.deals, deal);
  await logDealHistory(dealId, 'stage_changed', { from: oldStage, to: newStage });
  showToast(`${deal.name}: ${oldStage} → ${newStage}`, 'success');

  // Re-render appropriately
  if (currentDealId === dealId) {
    viewDeal(dealId);
  } else {
    renderDeals();
  }
}

// === TABLE VIEW ===
function renderDealsTableView(deals) {
  if (deals.length === 0) {
    return `<div class="card text-center py-12"><p class="text-sm text-surface-500">No deals found. Create your first deal or adjust filters.</p></div>`;
  }

  return `
    <div class="card overflow-hidden p-0">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead><tr>
            <th>Deal</th><th>Stage</th><th>Source</th><th>Revenue</th><th>EBITDA</th><th>Multiple</th><th>Score</th><th>Next Action</th>
          </tr></thead>
          <tbody>
            ${deals.map(deal => {
              const stageColor = DEAL_STAGE_COLORS[deal.stage] || 'gray';
              return `
                <tr class="clickable" onclick="viewDeal('${deal.id}')">
                  <td>
                    <div class="min-w-0">
                      <div class="font-medium truncate">${escapeHtml(deal.name)}</div>
                      <div class="text-xs text-surface-500">${[deal.sector, deal.location].filter(Boolean).join(' · ')}</div>
                    </div>
                  </td>
                  <td><span class="badge bg-${stageColor}-100 text-${stageColor}-700 dark:bg-${stageColor}-900/30 dark:text-${stageColor}-400">${escapeHtml(deal.stage)}</span></td>
                  <td class="text-surface-500">${escapeHtml(deal.source || '—')}</td>
                  <td class="font-medium">${fxFmtNative(deal.revenue, deal.currency)}</td>
                  <td class="font-medium">${fxFmtNative(deal.ebitda, deal.currency)}</td>
                  <td>${deal.askingMultiple ? deal.askingMultiple + 'x' : '—'}</td>
                  <td>${renderScoreBar(deal.score, 'sm')}</td>
                  <td class="${deal.nextActionDate && new Date(deal.nextActionDate) < new Date() ? 'text-red-500' : 'text-surface-500'} text-sm">
                    ${deal.nextActionDate ? formatDate(deal.nextActionDate) : '—'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// === DEAL CRUD ===
function openNewDealModal() { openEditDealModal(null); }

async function openEditDealModal(dealId) {
  const deal = dealId ? await DB.get(STORES.deals, dealId) : null;
  const contacts = await DB.getForUser(STORES.contacts, currentUser.id);

  openModal(deal ? 'Edit Deal' : 'New Deal', `
    <div class="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
      <!-- AI Import Banner -->
      <div class="rounded-xl border border-brand-200 dark:border-brand-800 overflow-hidden">
        <div class="bg-brand-50 dark:bg-brand-900/20 px-4 py-3">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-800/50 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-brand-600 dark:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold text-brand-800 dark:text-brand-200">AI Auto-fill from CIM / Teaser / Financials</p>
              <p class="text-xs text-brand-600 dark:text-brand-400 mt-0.5">Upload a PDF — AI extracts company info, revenue, EBITDA, margins, and more. Document is saved to the deal.</p>
            </div>
            <label id="deal-pdf-label" class="btn-primary btn-sm cursor-pointer whitespace-nowrap flex-shrink-0 flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
              Upload & Extract
              <input type="file" id="deal-pdf-import" accept=".pdf,.PDF,.xlsx,.xls,.txt,.csv" class="hidden" onchange="importDealFromPDF(this)" />
            </label>
          </div>
          <!-- Progress / result area -->
          <div id="deal-pdf-status" class="hidden mt-3">
            <div class="flex items-center gap-2 text-xs text-brand-700 dark:text-brand-300">
              <svg class="w-3 h-3 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              <span id="deal-pdf-status-text">Processing…</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="md:col-span-2">
          <label class="block text-sm font-medium mb-1">Company / Deal Name *</label>
          <input type="text" id="deal-name" class="input-field" value="${deal ? escapeHtml(deal.name) : ''}" placeholder="Acme Services LLC" required />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Code Name <span class="text-surface-400 font-normal text-xs">(internal)</span></label>
          <input type="text" id="deal-code-name" class="input-field" value="${deal?.codeName || ''}" placeholder="e.g. Project Falcon" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Company Website</label>
          <div class="flex gap-2">
            <input type="url" id="deal-website" class="input-field flex-1" value="${deal?.website || ''}" placeholder="https://acme.com" />
            <button type="button" onclick="autoPopulateDealFromWebsite()" class="btn-secondary btn-sm whitespace-nowrap px-2" title="Auto-fill from website">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
            </button>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Stage</label>
          <select id="deal-stage" class="input-field">
            ${DEAL_STAGES.map(s => `<option value="${s}" ${(deal?.stage || 'Sourced') === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Source</label>
          <select id="deal-source" class="input-field">
            <option value="">Select source...</option>
            ${DEAL_SOURCES.map(s => `<option value="${s}" ${deal?.source === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Sector</label>
          <select id="deal-sector" class="input-field">
            <option value="">Select sector...</option>
            ${DEAL_SECTORS.map(s => `<option value="${s}" ${deal?.sector === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Sub-sector</label>
          <input type="text" id="deal-subsector" class="input-field" value="${deal?.subsector || ''}" placeholder="e.g., Managed IT Services" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Location</label>
          <input type="text" id="deal-location" class="input-field" value="${deal?.location || ''}" placeholder="City, State" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Priority</label>
          <select id="deal-priority" class="input-field">
            <option value="medium" ${deal?.priority === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${deal?.priority === 'high' ? 'selected' : ''}>High</option>
            <option value="low" ${deal?.priority === 'low' ? 'selected' : ''}>Low</option>
          </select>
        </div>
      </div>

      <div class="border-t border-surface-200 dark:border-surface-800 pt-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold">Financials</h3>
          <div class="flex items-center gap-2">
            <label class="text-xs text-surface-500 font-medium">Currency</label>
            <select id="deal-currency" class="input-field py-1 text-sm w-28" onchange="updateDealMultiple()">
              ${CURRENCIES.map(c => `<option value="${c.code}" ${(deal?.currency || _fxBaseCurrency || 'USD') === c.code ? 'selected' : ''}>${c.symbol.trim()} ${c.code} — ${c.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Revenue</label>
            <input type="number" id="deal-revenue" class="input-field" value="${deal?.revenue || ''}" placeholder="5000000" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">EBITDA</label>
            <input type="number" id="deal-ebitda" class="input-field" value="${deal?.ebitda || ''}" placeholder="1000000" oninput="updateDealMultiple()" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Asking Price</label>
            <input type="number" id="deal-asking-price" class="input-field" value="${deal?.askingPrice || ''}" placeholder="5000000" oninput="updateDealMultiple()" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Multiple (x)</label>
            <input type="number" id="deal-multiple" class="input-field" step="0.1" value="${deal?.askingMultiple || ''}" placeholder="5.0" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Employees</label>
            <input type="number" id="deal-employees" class="input-field" value="${deal?.employeeCount || ''}" placeholder="50" />
          </div>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Description</label>
        <textarea id="deal-description" class="input-field" rows="3" placeholder="Brief description of the business...">${deal?.description || ''}</textarea>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Investment Thesis</label>
        <textarea id="deal-thesis" class="input-field" rows="2" placeholder="Why is this deal interesting?">${deal?.thesis || ''}</textarea>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Next Action</label>
          <input type="text" id="deal-next-action" class="input-field" value="${deal?.nextAction || ''}" placeholder="e.g., Schedule call with broker" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Next Action Date</label>
          <input type="date" id="deal-next-date" class="input-field" value="${deal?.nextActionDate || ''}" />
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium mb-1">Tags (comma-separated)</label>
        <input type="text" id="deal-tags" class="input-field" value="${(deal?.tags || []).join(', ')}" placeholder="e.g., SBA eligible, recurring revenue" />
      </div>

      <div class="flex justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-800">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="saveDeal('${dealId || ''}')" class="btn-primary">${deal ? 'Save Changes' : 'Create Deal'}</button>
      </div>
    </div>
  `);
}

async function saveDeal(dealId) {
  const name = document.getElementById('deal-name').value.trim();
  if (!name) return showToast('Deal name is required', 'error');

  // Duplicate check for new deals
  if (!dealId) {
    const existing = await DB.getForUser(STORES.deals, currentUser.id);
    const dupe = existing.find(d => d.name.toLowerCase() === name.toLowerCase());
    if (dupe) {
      if (!confirm(`A deal named "${dupe.name}" already exists. Create anyway?`)) return;
    }
  }

  const deal = dealId ? await DB.get(STORES.deals, dealId) : {
    id: generateId(),
    userId: currentUser.id,
    status: 'active',
    score: null,
    scoreBreakdown: null,
    lastDiligenceRunAt: null,
    contactIds: [],
    closedAt: null,
    createdAt: new Date().toISOString(),
  };

  const oldStage = deal.stage;
  deal.name = name;
  deal.codeName = document.getElementById('deal-code-name').value.trim();
  deal.website = document.getElementById('deal-website').value.trim();
  deal.stage = document.getElementById('deal-stage').value;
  deal.source = document.getElementById('deal-source').value;
  deal.sector = document.getElementById('deal-sector').value;
  deal.subsector = document.getElementById('deal-subsector').value.trim();
  deal.location = document.getElementById('deal-location').value.trim();
  deal.priority = document.getElementById('deal-priority').value;
  deal.currency = document.getElementById('deal-currency')?.value || 'USD';
  deal.revenue = parseFloat(document.getElementById('deal-revenue').value) || null;
  deal.ebitda = parseFloat(document.getElementById('deal-ebitda').value) || null;
  deal.askingPrice = parseFloat(document.getElementById('deal-asking-price').value) || null;
  deal.askingMultiple = parseFloat(document.getElementById('deal-multiple').value) || null;
  deal.employeeCount = parseInt(document.getElementById('deal-employees').value) || null;
  deal.description = document.getElementById('deal-description').value.trim();
  deal.thesis = document.getElementById('deal-thesis').value.trim();
  deal.nextAction = document.getElementById('deal-next-action').value.trim();
  deal.nextActionDate = document.getElementById('deal-next-date').value || null;
  deal.tags = document.getElementById('deal-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  deal.updatedAt = new Date().toISOString();

  await DB.put(STORES.deals, deal);

  if (!dealId) {
    await logDealHistory(deal.id, 'created', { name, stage: deal.stage });
  } else {
    await logDealHistory(deal.id, 'field_updated', { fields: 'edited' });
    if (oldStage && oldStage !== deal.stage) {
      await logDealHistory(deal.id, 'stage_changed', { from: oldStage, to: deal.stage });
    }
  }

  closeModal();
  showToast(dealId ? 'Deal updated' : 'Deal created', 'success');

  // Auto-attach any pending CIM PDF that was used for import
  if (!dealId && window._pendingDealPDF) {
    const { file, base64, category } = window._pendingDealPDF;
    window._pendingDealPDF = null;
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const docRecord = {
        id: generateId(),
        dealId: deal.id,
        userId: currentUser.id,
        name: file.name,
        type: ext === 'pdf' ? 'pdf' : 'other',
        category,
        mimeType: file.type,
        size: file.size,
        data: base64,
        extractedText: null,
        uploadedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // Also extract text so Gap Finder / AI can use it later
      if (ext === 'pdf' && typeof pdfjsLib !== 'undefined') {
        try { docRecord.extractedText = await extractTextFromPDF(base64); } catch {}
      }
      await DB.put(STORES.dealDocuments, docRecord);
      showToast('CIM attached to deal automatically', 'info');
    } catch (e) {
      console.warn('Auto-attach PDF failed:', e);
    }
  }

  if (currentDealId === dealId) {
    viewDeal(dealId);
  } else {
    renderDeals();
  }
}

async function deleteDeal(dealId) {
  confirmDialog('Delete Deal', 'This deal and all its notes, documents, tasks, and history will be permanently deleted.', async () => {
    // Delete associated records
    const allDocs = await DB.getAllByIndex(STORES.dealDocuments, 'dealId', dealId);
    for (const doc of allDocs) await DB.delete(STORES.dealDocuments, doc.id);

    const allNotes = await DB.getAllByIndex(STORES.dealNotes, 'dealId', dealId);
    for (const note of allNotes) await DB.delete(STORES.dealNotes, note.id);

    const allTasks = await DB.getAllByIndex(STORES.dealTasks, 'dealId', dealId);
    for (const task of allTasks) await DB.delete(STORES.dealTasks, task.id);

    const allDiligence = await DB.getAllByIndex(STORES.dealDiligence, 'dealId', dealId);
    for (const d of allDiligence) await DB.delete(STORES.dealDiligence, d.id);

    const allHistory = await DB.getAllByIndex(STORES.dealHistory, 'dealId', dealId);
    for (const h of allHistory) await DB.delete(STORES.dealHistory, h.id);

    await DB.delete(STORES.deals, dealId);

    showToast('Deal deleted', 'success');
    currentDealId = null;
    navigate('deals');
  });
}

// === CSV IMPORT ===
function openDealImportModal() {
  openModal('Import Deals from CSV', `
    <div class="p-6 space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">CSV File</label>
        <input type="file" id="csv-import-file" accept=".csv" class="input-field" />
        <p class="text-xs text-surface-400 mt-1">Expected columns: name, sector, location, source, revenue, ebitda, asking_price, multiple, employees, description</p>
      </div>
      <div class="bg-surface-50 dark:bg-surface-800 rounded p-3">
        <p class="text-xs text-surface-500"><strong>Column mapping:</strong> The importer matches columns by name (case-insensitive). Unrecognized columns are ignored. Revenue, EBITDA, and price values should be numbers (no $ or commas).</p>
      </div>
      <div id="csv-preview" class="hidden"></div>
      <div class="flex justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-800">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="previewCSVImport()" class="btn-secondary" id="csv-preview-btn">Preview</button>
        <button onclick="executeCSVImport()" class="btn-primary" id="csv-import-btn" disabled>Import</button>
      </div>
    </div>
  `);
}

let parsedCSVDeals = [];

async function previewCSVImport() {
  const input = document.getElementById('csv-import-file');
  if (!input.files.length) return showToast('Select a CSV file', 'error');

  const text = await input.files[0].text();
  parsedCSVDeals = parseCSV(text);

  if (parsedCSVDeals.length === 0) return showToast('No valid rows found', 'error');

  document.getElementById('csv-preview').innerHTML = `
    <div class="max-h-48 overflow-y-auto">
      <p class="text-sm font-medium mb-2">${parsedCSVDeals.length} deals found:</p>
      ${parsedCSVDeals.slice(0, 10).map(d => `
        <div class="flex items-center gap-2 p-2 text-sm border-b border-surface-100 dark:border-surface-800">
          <span class="font-medium">${escapeHtml(d.name)}</span>
          ${d.sector ? `<span class="text-xs text-surface-400">${escapeHtml(d.sector)}</span>` : ''}
          ${d.revenue ? `<span class="text-xs text-surface-400">$${(d.revenue / 1e6).toFixed(1)}M</span>` : ''}
        </div>
      `).join('')}
      ${parsedCSVDeals.length > 10 ? `<p class="text-xs text-surface-400 p-2">...and ${parsedCSVDeals.length - 10} more</p>` : ''}
    </div>
  `;
  document.getElementById('csv-preview').classList.remove('hidden');
  document.getElementById('csv-import-btn').disabled = false;
}

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const deals = [];

  const colMap = {
    name: headers.findIndex(h => ['name', 'company', 'company_name', 'deal', 'business'].includes(h)),
    sector: headers.findIndex(h => ['sector', 'industry'].includes(h)),
    location: headers.findIndex(h => ['location', 'city', 'geography', 'state'].includes(h)),
    source: headers.findIndex(h => ['source', 'deal_source', 'origin'].includes(h)),
    revenue: headers.findIndex(h => ['revenue', 'sales', 'annual_revenue'].includes(h)),
    ebitda: headers.findIndex(h => ['ebitda', 'earnings'].includes(h)),
    askingPrice: headers.findIndex(h => ['asking_price', 'price', 'asking', 'enterprise_value'].includes(h)),
    askingMultiple: headers.findIndex(h => ['multiple', 'ev_multiple', 'asking_multiple'].includes(h)),
    employeeCount: headers.findIndex(h => ['employees', 'employee_count', 'headcount'].includes(h)),
    description: headers.findIndex(h => ['description', 'notes', 'summary'].includes(h)),
  };

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const name = colMap.name >= 0 ? vals[colMap.name]?.trim() : null;
    if (!name) continue;

    deals.push({
      name,
      sector: colMap.sector >= 0 ? vals[colMap.sector]?.trim() || '' : '',
      location: colMap.location >= 0 ? vals[colMap.location]?.trim() || '' : '',
      source: colMap.source >= 0 ? vals[colMap.source]?.trim() || '' : '',
      revenue: colMap.revenue >= 0 ? parseFloat((vals[colMap.revenue] || '').replace(/[$,]/g, '')) || null : null,
      ebitda: colMap.ebitda >= 0 ? parseFloat((vals[colMap.ebitda] || '').replace(/[$,]/g, '')) || null : null,
      askingPrice: colMap.askingPrice >= 0 ? parseFloat((vals[colMap.askingPrice] || '').replace(/[$,]/g, '')) || null : null,
      askingMultiple: colMap.askingMultiple >= 0 ? parseFloat(vals[colMap.askingMultiple]) || null : null,
      employeeCount: colMap.employeeCount >= 0 ? parseInt(vals[colMap.employeeCount]) || null : null,
      description: colMap.description >= 0 ? vals[colMap.description]?.trim() || '' : '',
    });
  }

  return deals;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += char;
  }
  result.push(current);
  return result;
}

async function executeCSVImport() {
  if (parsedCSVDeals.length === 0) return;

  const existing = await DB.getForUser(STORES.deals, currentUser.id);
  const existingNames = new Set(existing.map(d => d.name.toLowerCase()));
  let imported = 0, skipped = 0;

  for (const d of parsedCSVDeals) {
    if (existingNames.has(d.name.toLowerCase())) { skipped++; continue; }

    const deal = {
      id: generateId(),
      userId: currentUser.id,
      name: d.name,
      stage: 'Sourced',
      status: 'active',
      priority: 'medium',
      source: d.source || '',
      sector: d.sector || '',
      subsector: '',
      revenue: d.revenue,
      ebitda: d.ebitda,
      askingPrice: d.askingPrice,
      askingMultiple: d.askingMultiple,
      employeeCount: d.employeeCount,
      location: d.location || '',
      description: d.description || '',
      thesis: '',
      contactIds: [],
      tags: [],
      score: null,
      scoreBreakdown: null,
      lastDiligenceRunAt: null,
      nextActionDate: null,
      nextAction: '',
      rejectionReason: null,
      closedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await DB.put(STORES.deals, deal);
    await logDealHistory(deal.id, 'created', { name: deal.name, source: 'csv_import' });
    imported++;
  }

  closeModal();
  showToast(`Imported ${imported} deals (${skipped} duplicates skipped)`, 'success');
  parsedCSVDeals = [];
  renderDeals();
}

// === DEAL AUTO-MULTIPLE ===
function updateDealMultiple() {
  const ebitda = parseFloat(document.getElementById('deal-ebitda')?.value);
  const price = parseFloat(document.getElementById('deal-asking-price')?.value);
  const multipleInput = document.getElementById('deal-multiple');
  if (multipleInput && ebitda > 0 && price > 0) {
    multipleInput.value = (price / ebitda).toFixed(1);
  }
}

// === KILL DEAL ===
function openKillDealModal(dealId, dealName) {
  openModal('Close / Kill Deal', `
    <div class="p-6 space-y-4">
      <p class="text-sm text-surface-600 dark:text-surface-400">How should <strong>${escapeHtml(dealName)}</strong> be closed?</p>
      <div>
        <label class="block text-sm font-medium mb-2">Outcome</label>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex items-center gap-2 p-3 border-2 border-surface-200 dark:border-surface-700 rounded cursor-pointer hover:border-brand-400 has-[:checked]:border-red-500 has-[:checked]:bg-red-50 dark:has-[:checked]:bg-red-900/10">
            <input type="radio" name="kill-stage" value="Closed - Lost" class="accent-red-500" checked />
            <div><p class="text-sm font-medium">Closed — Lost</p><p class="text-xs text-surface-500">Passed on or lost to competitor</p></div>
          </label>
          <label class="flex items-center gap-2 p-3 border-2 border-surface-200 dark:border-surface-700 rounded cursor-pointer hover:border-brand-400 has-[:checked]:border-gray-500 has-[:checked]:bg-gray-50 dark:has-[:checked]:bg-gray-900/10">
            <input type="radio" name="kill-stage" value="Rejected" class="accent-gray-500" />
            <div><p class="text-sm font-medium">Rejected</p><p class="text-xs text-surface-500">Not fit for criteria</p></div>
          </label>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Reason <span class="text-surface-400 font-normal">(optional)</span></label>
        <textarea id="kill-reason" class="input-field" rows="2" placeholder="e.g. Valuation too high, customer concentration risk, management misalignment…"></textarea>
      </div>
      <div class="flex justify-end gap-3 pt-2 border-t border-surface-200 dark:border-surface-800">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="confirmKillDeal('${dealId}')" class="btn-danger">Close Deal</button>
      </div>
    </div>
  `, { small: true });
}

async function confirmKillDeal(dealId) {
  const stage = document.querySelector('input[name="kill-stage"]:checked')?.value || 'Closed - Lost';
  const reason = document.getElementById('kill-reason')?.value.trim();
  closeModal();
  await moveDealToStage(dealId, stage);
  if (reason) {
    await DB.add(STORES.dealNotes, {
      id: generateId(),
      dealId,
      userId: currentUser.id,
      content: `Deal closed (${stage}): ${reason}`,
      type: 'note',
      createdAt: new Date().toISOString(),
    });
  }
  showToast(`Deal marked as ${stage}`, 'info');
}

// === PDF IMPORT TO DEAL ===
async function importDealFromPDF(input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];

  const statusEl   = document.getElementById('deal-pdf-status');
  const statusText = document.getElementById('deal-pdf-status-text');
  const label      = document.getElementById('deal-pdf-label');

  function setStatus(msg, showSpinner = true) {
    if (statusEl) statusEl.classList.remove('hidden');
    if (statusText) statusText.textContent = msg;
    const spinner = statusEl?.querySelector('svg');
    if (spinner) spinner.style.display = showSpinner ? '' : 'none';
  }
  function clearStatus(msg, isError) {
    if (statusEl) statusEl.classList.add('hidden');
    if (label) label.style.opacity = '1';
    if (msg) showToast(msg, isError ? 'error' : 'success');
  }

  if (file.size > 30 * 1024 * 1024) { clearStatus('File too large (max 30MB)', true); return; }
  if (label) label.style.opacity = '0.5';

  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  if (!settings?.openaiApiKey && !settings?.claudeApiKey) {
    clearStatus('Add an OpenAI or Claude API key in Settings first', true);
    return;
  }

  // ── Step 1: Read file ─────────────────────────────────────────────────
  setStatus('Reading file…');
  let base64;
  try {
    base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  } catch (err) {
    clearStatus('Could not read file: ' + err.message, true);
    return;
  }

  // ── Step 2: Extract text from PDF (structure-aware) ───────────────────
  setStatus('Extracting text from PDF…');
  let fullText = '';
  let pageTexts = []; // per-page for smart section selection

  try {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'pdf') {
      if (typeof pdfjsLib === 'undefined') throw new Error('PDF library not loaded');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      const rawB64 = base64.includes(',') ? base64.split(',')[1] : base64;
      const binaryStr = atob(rawB64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const pagesToRead = Math.min(pdf.numPages, 80); // read up to 80 pages

      for (let i = 1; i <= pagesToRead; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();

        // Group text by Y-position to preserve row structure (tables etc.)
        const byY = {};
        for (const item of content.items) {
          if (!item.str?.trim()) continue;
          const y = Math.round(item.transform[5] / 4) * 4; // bucket to 4pt grid
          if (!byY[y]) byY[y] = [];
          byY[y].push(item.str);
        }
        // Sort Y descending (PDF coordinates: top = high Y)
        const lines = Object.keys(byY).sort((a, b) => b - a)
          .map(y => byY[y].join('  '));
        const pageText = lines.join('\n');
        pageTexts.push(pageText);
        fullText += `\n=== Page ${i} ===\n${pageText}`;
      }

    } else if (['xlsx','xls'].includes(ext) && typeof XLSX !== 'undefined') {
      const rawB64 = base64.includes(',') ? base64.split(',')[1] : base64;
      const binaryStr = atob(rawB64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const wb = XLSX.read(bytes, { type: 'array' });
      for (const sheetName of wb.SheetNames) {
        fullText += `\n=== Sheet: ${sheetName} ===\n` + XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
      }
      pageTexts = [fullText];

    } else if (['txt','csv'].includes(ext)) {
      fullText = atob(base64.split(',')[1] || base64);
      pageTexts = [fullText];
    }

    fullText = fullText.trim();
  } catch (err) {
    clearStatus('Text extraction failed: ' + err.message, true);
    return;
  }

  if (!fullText || fullText.length < 50) {
    clearStatus('No readable text found. The file may be image-based or scanned — try a text-based PDF.', true);
    return;
  }

  setStatus(`Extracted ${Math.round(fullText.length / 1000)}K characters across ${pageTexts.length} pages — sending to AI…`);

  // ── Step 3: Smart text selection for AI context ───────────────────────
  // Strategy: first 5 pages (company overview) + any page containing
  // financial keywords (revenue, EBITDA, etc.) + last 3 pages (summary)
  const FINANCIAL_KEYWORDS = /revenue|ebitda|gross\s*margin|net\s*income|cash\s*flow|asking\s*price|enterprise\s*value|customers?|employees?|recurring/i;

  let introText = pageTexts.slice(0, 5).join('\n\n').substring(0, 5000);
  let financialPages = pageTexts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => FINANCIAL_KEYWORDS.test(p))
    .slice(0, 8)
    .map(({ p }) => p.substring(0, 800))
    .join('\n\n---\n\n');
  let tailText = pageTexts.slice(-3).join('\n\n').substring(0, 2000);

  const contextForAI = [
    '=== INTRO / OVERVIEW SECTION ===',
    introText,
    financialPages ? '\n\n=== FINANCIAL HIGHLIGHTS (pages with financial data) ===' : '',
    financialPages,
    tailText ? '\n\n=== DOCUMENT TAIL / SUMMARY ===' : '',
    tailText,
  ].join('\n').substring(0, 12000); // stay within ~3K tokens

  // ── Step 4: AI extraction — comprehensive prompt ──────────────────────
  let parsed = null;
  let usedFallback = false;

  const systemPrompt = `You are an expert M&A analyst extracting structured data from a Confidential Information Memorandum (CIM), teaser, or financial document for a search fund acquisition. Extract every data point you can find. Return ONLY valid JSON — no markdown, no explanation.`;

  const userPrompt = `Extract all deal information from this document and return a JSON object with EXACTLY these fields (use null for anything not found):

{
  "companyName": "Full legal or trade name of the company",
  "sector": "ONE of: Business Services | Healthcare Services | Technology | Industrial | Consumer | Education | Construction / Trades | Distribution | Food & Beverage | Financial Services | Other",
  "subsector": "More specific description e.g. 'Managed IT Services', 'Dental DSO', 'HVAC Contractor'",
  "location": "City, State format e.g. 'Austin, TX'",
  "revenue": <number in USD, e.g. 8500000 for $8.5M — null if not found>,
  "ebitda": <number in USD — prefer Adjusted EBITDA if available>,
  "askingPrice": <number in USD — enterprise value or asking price>,
  "askingMultiple": <number — EV/EBITDA multiple e.g. 5.5>,
  "employeeCount": <integer>,
  "revenueGrowthRate": <number — annual % growth rate e.g. 12.5>,
  "ebitdaMargin": <number — EBITDA as % of revenue e.g. 22.4>,
  "recurringRevenuePct": <number — % of revenue that is recurring/contracted e.g. 75>,
  "customerConcentration": "Brief string e.g. 'Top customer is 18% of revenue, top 5 are 42%'",
  "description": "3-5 sentence plain English description of what the company does, its market position, and why it has been successful. Be specific.",
  "thesis": "2-3 sentence investment thesis — why this is an attractive search fund acquisition (e.g. defensible market, recurring revenue, owner retiring, platform opportunity)",
  "concerns": "Key risks or red flags noted in the document — be specific. Null if none mentioned.",
  "tags": ["tag1", "tag2"] // e.g. ["recurring revenue", "owner retiring", "HVAC", "SBA eligible", "platform"]
}

IMPORTANT RULES:
- All dollar amounts must be plain numbers (no $ signs, no commas)
- Revenue and EBITDA: use the most recent TTM / LTM figures if available
- If only a multiple is shown (e.g. "asking 5.5x EBITDA"), compute askingPrice = ebitda × multiple
- For the description: mention the service/product, geography, customer type, and any notable differentiation
- Extract sector from context — don't guess if unclear

DOCUMENT:
${contextForAI}`;

  try {
    const raw = await callAI(systemPrompt, userPrompt, 1000, 0.05);
    const cleaned = raw.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch (jsonErr) {
      // Try extracting the JSON object with a regex if there's surrounding text
      const match = cleaned.match(/\{[\s\S]+\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { usedFallback = true; }
      } else {
        usedFallback = true;
      }
    }
  } catch (err) {
    if (err.message.match(/quota|limit|billing|insufficient|overload|429|402/i)) {
      setStatus('AI quota reached — using pattern extraction…');
      usedFallback = true;
    } else {
      clearStatus('AI extraction failed: ' + err.message, true);
      return;
    }
  }

  // ── Step 5: Regex fallback ────────────────────────────────────────────
  if (usedFallback || !parsed) {
    parsed = parseDealTextWithRegex(fullText);
  }

  if (!parsed) {
    clearStatus('Could not extract any data from this document.', true);
    return;
  }

  // ── Step 6: Apply extracted fields to the form ────────────────────────
  setStatus('Filling in deal fields…', false);

  try {
    let filled = [];
    const setField = (id, val) => {
      if (val == null || val === '' || val === 0) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.value = String(val);
      // Highlight filled fields briefly
      el.style.transition = 'background 0.4s';
      el.style.background = 'rgba(37,99,235,0.07)';
      setTimeout(() => { el.style.background = ''; }, 1800);
      filled.push(id);
    };

    // Basic info
    if (parsed.companyName) setField('deal-name', parsed.companyName);
    setField('deal-location', parsed.location);
    setField('deal-subsector', parsed.subsector);

    // Sector matching
    if (parsed.sector) {
      const sel = document.getElementById('deal-sector');
      if (sel) {
        const sectors = typeof DEAL_SECTORS !== 'undefined' ? DEAL_SECTORS : [];
        const exact = sectors.find(s => s.toLowerCase() === (parsed.sector || '').toLowerCase());
        const partial = sectors.find(s =>
          s.toLowerCase().includes((parsed.sector || '').toLowerCase().split('/')[0].trim()) ||
          (parsed.sector || '').toLowerCase().includes(s.toLowerCase().split(' ')[0])
        );
        const match = exact || partial;
        if (match) { sel.value = match; filled.push('sector'); }
      }
    }

    // Financials
    setField('deal-revenue', parsed.revenue ? Math.round(parsed.revenue) : null);
    setField('deal-ebitda', parsed.ebitda ? Math.round(parsed.ebitda) : null);
    setField('deal-asking-price', parsed.askingPrice ? Math.round(parsed.askingPrice) : null);
    setField('deal-employees', parsed.employeeCount);

    // Multiple — compute if missing
    if (parsed.askingMultiple) {
      setField('deal-multiple', parsed.askingMultiple);
    } else if (parsed.ebitda && parsed.askingPrice) {
      setField('deal-multiple', (parsed.askingPrice / parsed.ebitda).toFixed(2));
    }

    // Description — build rich version including financial context
    if (parsed.description) {
      let desc = parsed.description;
      const extras = [];
      if (parsed.revenueGrowthRate) extras.push(`Revenue growing at ~${parsed.revenueGrowthRate}% annually.`);
      if (parsed.recurringRevenuePct) extras.push(`~${parsed.recurringRevenuePct}% recurring/contracted revenue.`);
      if (parsed.customerConcentration) extras.push(`Customer concentration: ${parsed.customerConcentration}.`);
      if (extras.length) desc += ' ' + extras.join(' ');
      setField('deal-description', desc.trim());
    }

    // Thesis
    if (parsed.thesis) setField('deal-thesis', parsed.thesis);

    // Tags
    if (Array.isArray(parsed.tags) && parsed.tags.length) {
      const tagsField = document.getElementById('deal-tags');
      if (tagsField && !tagsField.value.trim()) {
        tagsField.value = parsed.tags.join(', ');
        filled.push('tags');
      }
    }

    updateDealMultiple();

    // ── Step 7: Show extraction summary panel ─────────────────────────
    const summaryItems = [];
    if (parsed.revenue) summaryItems.push(`Revenue: $${(parsed.revenue/1e6).toFixed(1)}M`);
    if (parsed.ebitda) summaryItems.push(`EBITDA: $${(parsed.ebitda/1e6).toFixed(1)}M`);
    if (parsed.ebitdaMargin) summaryItems.push(`Margin: ${parsed.ebitdaMargin.toFixed(0)}%`);
    if (parsed.revenueGrowthRate) summaryItems.push(`Growth: ${parsed.revenueGrowthRate}%`);
    if (parsed.askingMultiple || (parsed.ebitda && parsed.askingPrice)) {
      const mult = parsed.askingMultiple || (parsed.askingPrice / parsed.ebitda).toFixed(1);
      summaryItems.push(`Multiple: ${mult}x`);
    }
    if (parsed.recurringRevenuePct) summaryItems.push(`Recurring: ${parsed.recurringRevenuePct}%`);
    if (parsed.employeeCount) summaryItems.push(`Employees: ${parsed.employeeCount}`);

    const summaryEl = document.getElementById('deal-pdf-status');
    if (summaryEl && summaryItems.length) {
      summaryEl.classList.remove('hidden');
      summaryEl.innerHTML = `
        <div class="mt-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800">
          <p class="text-xs font-semibold text-green-700 dark:text-green-400 mb-1.5">
            ✓ Auto-filled ${filled.length} fields from document${usedFallback ? ' (pattern extraction)' : ''}
          </p>
          <div class="flex flex-wrap gap-x-4 gap-y-0.5">
            ${summaryItems.map(s => `<span class="text-xs text-green-600 dark:text-green-500">${escapeHtml(s)}</span>`).join('')}
          </div>
          ${parsed.concerns ? `<p class="text-xs text-yellow-700 dark:text-yellow-400 mt-1.5">⚠ Concerns noted: ${escapeHtml(String(parsed.concerns).substring(0, 120))}</p>` : ''}
          <p class="text-xs text-green-600 dark:text-green-500 mt-1.5 opacity-70">Review and adjust before saving. Document will be attached to the deal.</p>
        </div>
      `;
      // Store PDF for auto-attach after save
      window._pendingDealPDF = { file, base64, category: 'cim' };
    }

    if (filled.length === 0) {
      clearStatus('Could not extract usable data. Try a text-based (not scanned) PDF.', true);
    } else {
      if (label) label.style.opacity = '1';
    }
  } catch (err) {
    clearStatus('Error applying fields: ' + err.message, true);
  }
}

// === WEBSITE AUTO-POPULATE FOR DEAL ===
// === REGEX-BASED PDF PARSER (no AI needed) ===
function parseDealTextWithRegex(text) {
  const t = text.replace(/\s+/g, ' ');
  const result = { companyName: null, sector: null, location: null, revenue: null, ebitda: null, askingPrice: null, employeeCount: null, description: null };

  // Parse dollar amounts — handles "$5M", "$5.2 million", "$5,200,000"
  function parseDollar(str) {
    if (!str) return null;
    str = str.replace(/,/g, '');
    const m = str.match(/([\d.]+)\s*(billion|million|mm|m|k|b)?/i);
    if (!m) return null;
    let n = parseFloat(m[1]);
    const unit = (m[2] || '').toLowerCase();
    if (unit === 'billion' || unit === 'b') n *= 1e9;
    else if (unit === 'million' || unit === 'mm' || unit === 'm') n *= 1e6;
    else if (unit === 'k') n *= 1e3;
    return n > 0 ? Math.round(n) : null;
  }

  // Revenue — look for "revenue of $X", "revenues: $X", "net revenue $X"
  const revPatterns = [
    /(?:annual\s+)?(?:net\s+)?revenues?\s*(?:of|:)?\s*\$?([\d.,]+\s*(?:million|mm|m|billion|b|k)?)/i,
    /\$?([\d.,]+\s*(?:million|mm|m|billion|b|k)?)\s+(?:in\s+)?(?:annual\s+)?revenues?/i,
    /(?:ttm|ltm|trailing)\s+revenues?\s*[:\-]?\s*\$?([\d.,]+\s*(?:million|mm|m|b|k)?)/i,
  ];
  for (const p of revPatterns) {
    const m = t.match(p);
    if (m) { result.revenue = parseDollar(m[1]); if (result.revenue) break; }
  }

  // EBITDA
  const ebitdaPatterns = [
    /ebitda\s*(?:of|:)?\s*\$?([\d.,]+\s*(?:million|mm|m|billion|b|k)?)/i,
    /\$?([\d.,]+\s*(?:million|mm|m|b|k)?)\s+(?:in\s+)?ebitda/i,
    /adjusted\s+ebitda\s*[:\-]?\s*\$?([\d.,]+\s*(?:million|mm|m|b|k)?)/i,
  ];
  for (const p of ebitdaPatterns) {
    const m = t.match(p);
    if (m) { result.ebitda = parseDollar(m[1]); if (result.ebitda) break; }
  }

  // Asking / list price
  const pricePatterns = [
    /asking\s+(?:price|value)\s*[:\-]?\s*\$?([\d.,]+\s*(?:million|mm|m|b|k)?)/i,
    /(?:list|sale|purchase|transaction)\s+(?:price|value)\s*[:\-]?\s*\$?([\d.,]+\s*(?:million|mm|m|b|k)?)/i,
    /(?:enterprise|ev)\s+value\s*[:\-]?\s*\$?([\d.,]+\s*(?:million|mm|m|b|k)?)/i,
  ];
  for (const p of pricePatterns) {
    const m = t.match(p);
    if (m) { result.askingPrice = parseDollar(m[1]); if (result.askingPrice) break; }
  }

  // Employees
  const empM = t.match(/(\d[\d,]+)\s+(?:full[- ]time\s+)?employees/i) ||
               t.match(/employees\s*[:\-]?\s*(\d[\d,]+)/i) ||
               t.match(/(?:team|staff|headcount)\s+of\s+(\d[\d,]+)/i);
  if (empM) result.employeeCount = parseInt(empM[1].replace(/,/g, '')) || null;

  // Location — US state abbreviations or "City, ST"
  const locM = t.match(/(?:headquartered|located|based)\s+in\s+([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/i) ||
               t.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2})\b/);
  if (locM) result.location = locM[1].trim();

  // Company name — first line or after "Company:" / "Company Overview"
  const nameM = t.match(/(?:company\s*(?:name|overview)?|about)\s*[:\-]\s*([A-Z][A-Za-z0-9\s&,.''-]{2,50}?)(?:\n|\.|\s{2})/i) ||
                t.match(/^([A-Z][A-Za-z0-9\s&,.''-]{2,50}?)\s+(?:is\s+a|LLC|Inc|Corp|Ltd|LP)/m);
  if (nameM) result.companyName = nameM[1].trim().replace(/\s+/g, ' ');

  // Sector keywords
  const sectorKeywords = {
    'Technology': ['software', 'saas', 'tech', 'it services', 'cloud', 'cybersecurity', 'data'],
    'Healthcare Services': ['healthcare', 'medical', 'dental', 'physician', 'clinical', 'health'],
    'Business Services': ['business services', 'staffing', 'outsourc', 'consulting', 'professional services', 'bpo'],
    'Industrial': ['manufactur', 'industrial', 'equipment', 'engineering', 'fabricat'],
    'Construction / Trades': ['construction', 'contractor', 'plumbing', 'hvac', 'electrical', 'roofing'],
    'Distribution': ['distribut', 'wholesale', 'logistics', 'supply chain', 'warehouse'],
    'Consumer': ['consumer', 'retail', 'ecommerce', 'brand', 'apparel'],
    'Food & Beverage': ['food', 'beverage', 'restaurant', 'catering', 'hospitality'],
    'Financial Services': ['financial', 'insurance', 'accounting', 'wealth', 'fintech'],
    'Education': ['education', 'learning', 'training', 'school', 'tutoring'],
  };
  const tLower = t.toLowerCase();
  for (const [sector, keywords] of Object.entries(sectorKeywords)) {
    if (keywords.some(k => tLower.includes(k))) { result.sector = sector; break; }
  }

  // Description — first substantial sentence that looks like a company description
  const descM = t.match(/(?:is\s+a\s+(?:leading\s+)?|provides?\s+|offers?\s+|Company\s+Overview[:\s]+)([^.!?]{40,250}[.!?])/i);
  if (descM) result.description = descM[0].trim().substring(0, 300);

  return result;
}

async function autoPopulateDealFromWebsite() {
  const url = document.getElementById('deal-website')?.value.trim();
  if (!url) { showToast('Enter a website URL first', 'warning'); return; }
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  if (!settings?.openaiApiKey && !settings?.claudeApiKey) { showToast('Add an OpenAI or Claude API key in Settings', 'warning'); return; }
  showToast('Fetching company info from website…', 'info');
  try {
    const info = await fetchCompanyInfoFromUrl(url);
    if (info.description) {
      const desc = document.getElementById('deal-description');
      if (!desc.value.trim()) desc.value = info.description;
    }
    if (info.industry) {
      const sectorSel = document.getElementById('deal-sector');
      const match = DEAL_SECTORS.find(s => s.toLowerCase().includes((info.industry || '').toLowerCase().split(' ')[0]));
      if (match && !sectorSel.value) sectorSel.value = match;
    }
    if (info.employeeCount) {
      const emp = document.getElementById('deal-employees');
      if (!emp.value) emp.value = info.employeeCount;
    }
    showToast('Company info populated from website', 'success');
  } catch (err) {
    showToast('Could not fetch website: ' + err.message, 'error');
  }
}
