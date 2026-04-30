/* ============================================
   Nexus CRM — German Handelsregister Search
   ============================================
   Searches German commercial register data via
   the OpenCorporates public API (CORS-enabled,
   no scraping needed — real register data).

   API source: api.opencorporates.com
   Data: company name, registration number, court,
         legal form, founding date, address, status.

   API token: optional (free signup at opencorporates.com)
   Without token:  ~50 searches/month
   With free token: ~500 searches/month

   AI layer: GPT/Claude acquisition analysis +
             German outreach email generation.
   ============================================ */

const _HR_OC_BASE = 'https://api.opencorporates.com/v0.4';

// German federal states for jurisdiction filtering
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

// Legal form lookup: maps OpenCorporates company_type → acquisition assessment
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

// Module state
let _hrResults     = [];
let _hrExpandedIdx = null;
let _hrAiCache     = {};  // index → rendered HTML string
let _hrLoading     = false;

// ─── Modal entry point ────────────────────────────────────────────────────────

function openHandelsregisterModal() {
  _hrResults     = [];
  _hrExpandedIdx = null;
  _hrAiCache     = {};
  _hrLoading     = false;

  openModal('🇩🇪 Handelsregister Search', `
    <div class="p-5">

      <!-- Search controls -->
      <div class="flex gap-2 mb-3">
        <input type="text" id="hr-query"
          class="input-field flex-1 text-sm"
          placeholder="Company name or keyword (e.g. Sanitär, Bäckerei, Software GmbH)…"
          onkeydown="if(event.key==='Enter'){event.preventDefault();_hrSearch();}" />
        <select id="hr-state" class="input-field text-sm w-40 flex-shrink-0">
          ${_HR_STATES.map(s => `<option value="${s.code}">${s.label}</option>`).join('')}
        </select>
        <button onclick="_hrSearch()" id="hr-search-btn" class="btn-primary text-sm flex-shrink-0 flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
          </svg>
          Search
        </button>
      </div>

      <!-- Info banner -->
      <div class="flex items-start gap-2.5 mb-4 px-3 py-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800">
        <svg class="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div class="text-xs text-blue-700 dark:text-blue-300 space-y-0.5">
          <p><strong>Source:</strong> OpenCorporates — German Handelsregister data (real register entries, not scraped).</p>
          <p>Search by company name or industry keyword. Click a result to expand details and run AI analysis.</p>
        </div>
      </div>

      <!-- Results area -->
      <div id="hr-results-area" style="max-height:60vh;overflow-y:auto;">
        <div class="flex flex-col items-center justify-center py-12 text-center text-surface-400">
          <svg class="w-10 h-10 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"/>
          </svg>
          <p class="text-sm font-medium">Search the German business register</p>
          <p class="text-xs mt-1">Enter a company name, industry, or city above</p>
        </div>
      </div>
    </div>
  `, [{ label: 'Close', onclick: 'closeModal()', class: 'btn-secondary' }]);

  setTimeout(() => document.getElementById('hr-query')?.focus(), 80);
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function _hrSearch() {
  if (_hrLoading) return;
  const query = (document.getElementById('hr-query')?.value || '').trim();
  if (!query) { document.getElementById('hr-query')?.focus(); return; }

  const state  = document.getElementById('hr-state')?.value || 'de';
  const area   = document.getElementById('hr-results-area');
  const btn    = document.getElementById('hr-search-btn');
  if (!area) return;

  _hrLoading     = true;
  _hrExpandedIdx = null;
  _hrAiCache     = {};
  if (btn) { btn.disabled = true; btn.textContent = 'Searching…'; }

  area.innerHTML = `
    <div class="flex items-center justify-center gap-3 py-12 text-surface-400">
      <svg class="animate-spin w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <span class="text-sm">Searching Handelsregister…</span>
    </div>`;

  try {
    const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`).catch(() => ({})) || {};
    const token    = settings.openCorporatesApiToken || '';

    const params = new URLSearchParams({
      q:                 query,
      jurisdiction_code: state,
      per_page:          '20',
      order:             'score',
    });
    if (token) params.set('api_token', token);

    const resp = await fetch(`${_HR_OC_BASE}/companies/search?${params}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(20000),
    });

    if (resp.status === 429 || resp.status === 503) {
      throw new Error('rate_limit');
    }
    if (!resp.ok) throw new Error(`API returned ${resp.status}`);

    const json  = await resp.json();
    _hrResults  = (json.results?.companies || []).map(c => c.company).filter(Boolean);
    _hrRenderList();

  } catch (err) {
    const isRateLimit = err.message === 'rate_limit' || err.name === 'AbortError';
    area.innerHTML = `
      <div class="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <p class="text-sm font-semibold text-red-700 dark:text-red-400">${isRateLimit ? 'Rate limit reached' : 'Search failed'}</p>
        <p class="text-xs text-red-600 dark:text-red-500 mt-1">${isRateLimit
          ? 'You\'ve used the free monthly quota. Add a free OpenCorporates API token in Settings → German Business Registry to get 500 searches/month.'
          : escapeHtml(err.message)}</p>
        ${isRateLimit ? `<a href="https://opencorporates.com/users/account" target="_blank" class="inline-block mt-2 text-xs text-brand-600 hover:underline">Get free token at opencorporates.com →</a>` : ''}
      </div>`;
  } finally {
    _hrLoading = false;
    const b = document.getElementById('hr-search-btn');
    if (b) {
      b.disabled = false;
      b.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg> Search`;
    }
  }
}

// ─── List render ──────────────────────────────────────────────────────────────

function _hrRenderList() {
  const area = document.getElementById('hr-results-area');
  if (!area) return;

  if (_hrResults.length === 0) {
    area.innerHTML = `
      <div class="text-center py-10 text-surface-400">
        <p class="text-sm">No companies found</p>
        <p class="text-xs mt-1">Try a different spelling, add GmbH, or switch state to "All Germany"</p>
      </div>`;
    return;
  }

  area.innerHTML = `
    <p class="text-xs text-surface-400 mb-3">${_hrResults.length} result${_hrResults.length === 1 ? '' : 's'} from German commercial register</p>
    <div class="space-y-2">
      ${_hrResults.map((c, i) => _hrCardHtml(c, i)).join('')}
    </div>`;
}

// ─── Company card ─────────────────────────────────────────────────────────────

function _hrCardHtml(company, idx) {
  const lf      = _hrGetLegalForm(company.company_type);
  const age     = _hrAge(company.incorporation_date);
  const active  = !company.dissolution_date && (company.current_status || '').toLowerCase() !== 'dissolved';
  const address = _hrAddress(company.registered_address);
  const expanded = _hrExpandedIdx === idx;

  const acquisitionScore = lf?.acquirable && active && age && age > 10 ? 'High' : lf?.acquirable && active ? 'Medium' : 'Low';
  const scoreColor = acquisitionScore === 'High' ? 'green' : acquisitionScore === 'Medium' ? 'amber' : 'surface';

  return `
    <div class="border border-surface-200 dark:border-surface-700 rounded-xl overflow-hidden transition-all ${!active ? 'opacity-50' : ''}">

      <!-- Card header -->
      <button class="w-full flex items-start gap-3 p-3 text-left hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors"
              onclick="_hrToggle(${idx})">
        <!-- Flag badge -->
        <div class="w-9 h-9 rounded-lg bg-black flex items-center justify-center flex-shrink-0 text-white font-extrabold text-xs tracking-tight leading-none">
          DE
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-sm font-semibold truncate">${escapeHtml(company.name)}</span>
            ${lf ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-500 font-medium">${lf.short}</span>` : ''}
            ${!active ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600">Dissolved</span>` : ''}
          </div>
          <p class="text-xs text-surface-500 mt-0.5 truncate">
            ${address || 'Address not listed'}
            ${age !== null ? ` · ${age} yrs` : ''}
            ${company.company_number ? ` · ${company.company_number}` : ''}
          </p>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0 ml-1">
          ${active && lf?.acquirable ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-${scoreColor}-50 dark:bg-${scoreColor}-900/20 text-${scoreColor}-600 dark:text-${scoreColor}-400 font-semibold whitespace-nowrap">${acquisitionScore} potential</span>` : ''}
          <svg class="w-3.5 h-3.5 text-surface-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </button>

      <!-- Expanded panel -->
      ${expanded ? _hrDetailHtml(company, idx, lf, age, address, active) : ''}
    </div>`;
}

function _hrDetailHtml(company, idx, lf, age, address, active) {
  const aiHtml = _hrAiCache[idx] || '';
  return `
    <div class="border-t border-surface-200 dark:border-surface-700">

      <!-- Data grid -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 px-4 py-3 text-xs bg-surface-50 dark:bg-surface-800/30">
        ${company.company_number ? `<div><p class="text-surface-400 font-medium mb-0.5">Register No.</p><p class="font-semibold">${escapeHtml(company.company_number)}</p></div>` : ''}
        ${company.incorporation_date ? `<div><p class="text-surface-400 font-medium mb-0.5">Founded</p><p class="font-semibold">${escapeHtml(company.incorporation_date)}${age !== null ? ` (${age} yrs)` : ''}</p></div>` : ''}
        ${company.company_type ? `<div><p class="text-surface-400 font-medium mb-0.5">Legal Form</p><p class="font-semibold">${escapeHtml(company.company_type)}</p></div>` : ''}
        ${company.jurisdiction_code ? `<div><p class="text-surface-400 font-medium mb-0.5">State</p><p class="font-semibold">${escapeHtml(company.jurisdiction_code.replace('de_', '').toUpperCase())}</p></div>` : ''}
        ${company.current_status ? `<div><p class="text-surface-400 font-medium mb-0.5">Status</p><p class="font-semibold">${escapeHtml(company.current_status)}</p></div>` : ''}
        ${address ? `<div class="col-span-2"><p class="text-surface-400 font-medium mb-0.5">Address</p><p class="font-semibold">${escapeHtml(address)}</p></div>` : ''}
      </div>

      <!-- Legal form note -->
      ${lf ? `
        <div class="mx-3 my-2 px-3 py-2 rounded-lg bg-${lf.color}-50 dark:bg-${lf.color}-900/15 border border-${lf.color}-200 dark:border-${lf.color}-800">
          <p class="text-xs text-${lf.color}-700 dark:text-${lf.color}-300 leading-snug">${lf.note}</p>
        </div>` : ''}

      <!-- Action buttons -->
      <div class="flex flex-wrap gap-2 px-3 py-2.5 border-t border-surface-100 dark:border-surface-800">
        <button onclick="_hrRunAI(${idx})" class="btn-primary btn-sm flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/></svg>
          AI Analysis + German Email
        </button>
        <button onclick="_hrAddToCRM(${idx})" id="hr-add-btn-${idx}" class="btn-secondary btn-sm flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          Add to CRM
        </button>
        ${company.opencorporates_url ? `
          <a href="${escapeHtml(company.opencorporates_url)}" target="_blank" class="btn-secondary btn-sm flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"/></svg>
            OpenCorporates
          </a>` : ''}
      </div>

      <!-- AI output zone -->
      <div id="hr-ai-${idx}" class="px-3 pb-3">
        ${aiHtml}
      </div>
    </div>`;
}

// ─── Toggle expand ────────────────────────────────────────────────────────────

function _hrToggle(idx) {
  _hrExpandedIdx = _hrExpandedIdx === idx ? null : idx;
  _hrRenderList();
  // Restore cached AI output after re-render
  if (_hrExpandedIdx !== null && _hrAiCache[_hrExpandedIdx]) {
    const el = document.getElementById(`hr-ai-${_hrExpandedIdx}`);
    if (el) el.innerHTML = _hrAiCache[_hrExpandedIdx];
  }
}

// ─── AI Analysis ──────────────────────────────────────────────────────────────

async function _hrRunAI(idx) {
  const company = _hrResults[idx];
  if (!company) return;

  const aiEl = document.getElementById(`hr-ai-${idx}`);
  if (!aiEl) return;

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
    const lf      = _hrGetLegalForm(company.company_type);

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

    const raw = await callAI(systemPrompt, userPrompt, 1100, 0.3);

    // Render nicely — split on double newlines, apply basic markdown
    const rendered = _hrFormatAiResponse(raw);

    const html = `
      <div class="rounded-xl border border-brand-200 dark:border-brand-700 bg-white dark:bg-surface-900 overflow-hidden">
        <div class="flex items-center gap-2 px-4 py-2.5 bg-brand-50 dark:bg-brand-900/20 border-b border-brand-200 dark:border-brand-700">
          <svg class="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
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

// Format the AI markdown response into HTML sections
function _hrFormatAiResponse(text) {
  return text
    .split(/\n{2,}/)
    .map(block => {
      // Bold headers like **SECTION TITLE**
      if (/^\*\*[A-Z]/.test(block)) {
        const headerMatch = block.match(/^\*\*(.+?)\*\*/);
        const header = headerMatch ? headerMatch[1] : '';
        const rest   = block.replace(/^\*\*(.+?)\*\*/, '').replace(/^[\s:—-]+/, '');
        const isEmail = header.toLowerCase().includes('email') || header.toLowerCase().includes('betreff');
        return `
          <div class="${isEmail ? 'bg-surface-50 dark:bg-surface-800 rounded-lg p-3 border border-surface-200 dark:border-surface-700' : ''}">
            <p class="font-semibold text-surface-900 dark:text-surface-100 mb-1 text-[11px] uppercase tracking-wide">${escapeHtml(header)}</p>
            ${rest ? `<p class="${isEmail ? 'font-mono text-[11px] whitespace-pre-wrap text-surface-600 dark:text-surface-400' : ''}">${isEmail ? escapeHtml(rest.trim()) : escapeHtml(rest.trim())}</p>` : ''}
          </div>`;
      }
      // Bullet lists
      if (block.trim().startsWith('-') || block.trim().startsWith('•')) {
        const items = block.split('\n').filter(l => l.trim());
        return `<ul class="space-y-1 ml-2">${items.map(l =>
          `<li class="flex items-start gap-1.5"><span class="text-brand-400 flex-shrink-0 mt-0.5">·</span><span>${escapeHtml(l.replace(/^[-•*]\s*/, ''))}</span></li>`
        ).join('')}</ul>`;
      }
      // Normal paragraph
      if (block.trim()) {
        return `<p>${escapeHtml(block.trim()).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`;
      }
      return '';
    })
    .filter(Boolean)
    .join('');
}

// ─── Add to CRM ──────────────────────────────────────────────────────────────

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
      logoUrl:     '',
      source:      'handelsregister',
      hrNumber:    company.company_number  || '',
      hrStatus:    company.current_status  || '',
      hrFounded:   company.incorporation_date || '',
      hrAddress:   address || '',
    });

    showToast(`${company.name} added to Companies ✓`, 'success');
    if (btn) {
      btn.textContent = '✓ Added to CRM';
      btn.classList.add('opacity-60');
    }
  } catch (err) {
    showToast('Failed to save company: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15"/></svg> Add to CRM`; }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _hrGetLegalForm(companyType) {
  if (!companyType) return null;
  const ct = companyType.trim();
  for (const [key, val] of Object.entries(_HR_LEGAL_FORMS)) {
    if (ct === key || ct.startsWith(key) || ct.includes(key)) return val;
  }
  // Generic matching for variants
  if (ct.includes('GmbH')) return { short: 'GmbH', acquirable: true, color: 'green', note: 'GmbH — owner-managed structure, strong acquisition candidate.' };
  if (ct.includes('AG'))   return { short: 'AG',   acquirable: false, color: 'amber', note: 'AG — public share structure. Verify if private or listed.' };
  if (ct.includes('KG'))   return { short: 'KG',   acquirable: true,  color: 'yellow', note: 'KG — partnership. Verify ownership split and exit terms.' };
  if (ct.includes('UG'))   return { short: 'UG',   acquirable: true,  color: 'yellow', note: 'Mini-GmbH. Typically smaller company — verify scale.' };
  return null;
}

function _hrAge(incorporationDate) {
  if (!incorporationDate) return null;
  const diff = Date.now() - new Date(incorporationDate).getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

function _hrAddress(addr) {
  if (!addr) return '';
  return [addr.street_address, addr.postal_code, addr.locality, addr.region]
    .filter(Boolean).join(', ');
}
