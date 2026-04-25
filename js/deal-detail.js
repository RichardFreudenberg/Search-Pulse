/* ============================================
   Nexus CRM — Deal Detail Page (Tabbed)
   ============================================ */

let currentDealId = null;
let currentDealTab = 'overview';

async function viewDeal(dealId) {
  currentDealId = dealId;
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-6xl mx-auto">${renderLoadingSkeleton(6)}</div>`;

  const deal = await DB.get(STORES.deals, dealId);
  if (!deal) { showToast('Deal not found', 'error'); navigate('deals'); return; }

  // Load persisted number-display format preference
  try {
    const _numSettings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
    if (_numSettings?.numberDisplayFormat) _dealNumFormat = _numSettings.numberDisplayFormat;
  } catch (_) {}

  // Fetch counts for tabs
  const [tabNotes, tabDocs, tabTasks, tabCalls] = await Promise.all([
    DB.getAllByIndex(STORES.dealNotes, 'dealId', dealId).then(r => r.filter(x => x.userId === currentUser.id).length).catch(() => 0),
    DB.getAllByIndex(STORES.dealDocuments, 'dealId', dealId).then(r => r.filter(x => x.userId === currentUser.id).length).catch(() => 0),
    DB.getAllByIndex(STORES.dealTasks, 'dealId', dealId).then(r => r.filter(x => x.userId === currentUser.id && x.status !== 'done').length).catch(() => 0),
    DB.getAllByIndex(STORES.dealCalls, 'dealId', dealId).then(r => r.filter(x => x.userId === currentUser.id).length).catch(() => 0),
  ]);

  // Guard: if we were on a removed tab, fall back to overview
  if (['scoring', 'gap-finder'].includes(currentDealTab)) currentDealTab = 'overview';

  const tabs = [
    { id: 'overview',   label: 'Overview',      icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>' },
    { id: 'financials', label: 'Financials',    icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>' },
    { id: 'fit-score',  label: 'Fit Score',     icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 6.627 5.373 12 12 12s12-5.373 12-12c0-2.13-.558-4.128-1.534-5.856A11.955 11.955 0 0112 5.044z" /></svg>' },
    { id: 'diligence',  label: 'AI Diligence',  icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>' },
    { id: 'calls',      label: 'Calls',         icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/></svg>', count: tabCalls || null },
    { id: 'notes',      label: 'Notes',         icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>', count: tabNotes },
    { id: 'documents',  label: 'Documents',     icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>', count: tabDocs },
    { id: 'tasks',      label: 'Tasks',         icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>', count: tabTasks },
    { id: 'dd',         label: 'Due Diligence', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>' },
    { id: 'model',      label: 'Financial Model', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>' },
    { id: 'nda',        label: 'NDA',           icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 6.627 5.373 12 12 12s12-5.373 12-12c0-2.13-.558-4.128-1.534-5.856"/></svg>' },
    { id: 'history',    label: 'History',       icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>' },
  ];

  const stageColor = DEAL_STAGE_COLORS[deal.stage] || 'gray';
  const stageColorClass = `bg-${stageColor}-100 text-${stageColor}-700 dark:bg-${stageColor}-900/30 dark:text-${stageColor}-400`;

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <!-- Header -->
      <div class="flex items-start justify-between mb-6">
        <div>
          <button onclick="navigate('deals')" class="text-sm text-brand-600 hover:text-brand-700 font-medium mb-2 inline-flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
            Back to Pipeline
          </button>
          <h1 class="text-2xl font-semibold">${escapeHtml(deal.name)}</h1>
          <div class="flex items-center gap-3 mt-2 flex-wrap">
            <span class="badge ${stageColorClass}">${escapeHtml(deal.stage)}</span>
            ${deal.priority ? `<span class="badge badge-${deal.priority === 'high' ? 'red' : deal.priority === 'medium' ? 'yellow' : 'blue'}">${deal.priority}</span>` : ''}
            ${deal.score !== null && deal.score !== undefined ? renderScoreBadge(deal.score) : ''}
            ${deal.sector ? `<span class="text-sm text-surface-500">${escapeHtml(deal.sector)}</span>` : ''}
            ${deal.location ? `<span class="text-sm text-surface-400">${escapeHtml(deal.location)}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button onclick="openEditDealModal('${dealId}')" class="btn-secondary btn-sm">Edit</button>
          <button onclick="openDealMemo('${dealId}')" class="btn-secondary btn-sm" title="Generate AI investment memo">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            Investment Memo
          </button>
          ${!['Closed - Won', 'Closed - Lost', 'Rejected'].includes(deal.stage) ? `<button onclick="openKillDealModal('${dealId}', '${escapeHtml(deal.name).replace(/'/g, "\\'")}')" class="btn-secondary btn-sm text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/10">Kill Deal</button>` : ''}
          <button onclick="deleteDeal('${dealId}')" class="btn-danger btn-sm">Delete</button>
        </div>
      </div>

      <!-- Quick Stats Row — all clickable, open financial analysis -->
      <div class="mb-6">
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-2">
          ${(() => {
            const sym     = fxSymbol(deal.currency);
            const margin  = deal.revenue && deal.ebitda ? ((deal.ebitda / deal.revenue) * 100).toFixed(0) + '%' : '—';
            const multiple = deal.askingMultiple
              ? deal.askingMultiple + 'x'
              : (deal.askingPrice && deal.ebitda ? (deal.askingPrice / deal.ebitda).toFixed(1) + 'x' : '—');
            const evRev = deal.askingPrice && deal.revenue ? (deal.askingPrice / deal.revenue).toFixed(1) + 'x' : null;
            const stats = [
              { label: 'Revenue',        value: deal.revenue    ? fmtDealMoney(deal.revenue,    sym) : '—', sub: deal.revenue    ? 'annual' : 'not set',                       color: 'brand'  },
              { label: 'EBITDA',         value: deal.ebitda     ? fmtDealMoney(deal.ebitda,     sym) : '—', sub: deal.ebitda && deal.revenue ? margin + ' margin' : 'not set', color: 'green'  },
              { label: 'EBITDA Margin',  value: margin,                                                     sub: margin !== '—' ? 'operating efficiency' : 'need rev + EBITDA', color: margin !== '—' && parseInt(margin) >= 20 ? 'green' : 'yellow' },
              { label: 'Asking Price',   value: deal.askingPrice ? fmtDealMoney(deal.askingPrice, sym) : '—', sub: evRev ? evRev + ' EV/Rev' : 'not set',                     color: 'purple' },
              { label: 'EBITDA Multiple', value: multiple,                                                  sub: multiple !== '—' ? 'enterprise value' : 'need price + EBITDA', color: 'orange' },
            ];
            return stats.map(s => `
              <button onclick="openEditDealModal('${dealId}')" title="Click to edit financials" class="card p-3 text-center hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-sm transition-all cursor-pointer text-left group">
                <p class="text-xs text-surface-500 group-hover:text-brand-500 transition-colors">${s.label}</p>
                <p class="text-xl font-bold mt-0.5">${s.value}</p>
                <p class="text-xs text-surface-400 mt-0.5">${s.sub}</p>
              </button>
            `).join('');
          })()}
        </div>
        <!-- Format toggle -->
        <div class="flex items-center gap-1.5 justify-end">
          <span class="text-xs text-surface-400">Display:</span>
          ${['auto','M','K','raw'].map(fmt => {
            const labels = { auto: 'Auto', M: 'Millions', K: 'Thousands', raw: 'Full' };
            const active = _dealNumFormat === fmt;
            return `<button onclick="_setDealNumFormat('${fmt}')" class="px-2 py-0.5 rounded text-xs font-medium transition-colors ${active ? 'bg-brand-600 text-white' : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700'}">${labels[fmt]}</button>`;
          }).join('')}
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 overflow-x-auto pb-2 mb-6 border-b border-surface-200 dark:border-surface-800">
        ${tabs.map(t => `
          <button onclick="switchDealTab('${t.id}')" class="deal-tab flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${currentDealTab === t.id ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50/50 dark:bg-brand-900/20' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'}" data-tab="${t.id}">
            ${t.icon} ${t.label}
            ${t.count != null ? `<span class="text-xs px-1.5 py-0.5 rounded-full ${currentDealTab === t.id ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'bg-surface-100 dark:bg-surface-800 text-surface-500'}">${t.count}</span>` : ''}
          </button>
        `).join('')}
      </div>

      <!-- Tab Content -->
      <div id="deal-tab-content">
        ${renderLoadingSkeleton(3)}
      </div>
    </div>
  `;

  switchDealTab(currentDealTab);
}

async function switchDealTab(tabId) {
  currentDealTab = tabId;
  const container = document.getElementById('deal-tab-content');
  if (!container) return;

  // Update tab active states
  document.querySelectorAll('.deal-tab').forEach(el => {
    const isActive = el.dataset.tab === tabId;
    el.className = `deal-tab flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${isActive ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50/50 dark:bg-brand-900/20' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'}`;
  });

  container.innerHTML = renderLoadingSkeleton(3);

  switch (tabId) {
    case 'overview':  container.innerHTML = await renderDealOverviewTab(); break;
    case 'financials':
      container.innerHTML = await renderDealFinancialsTab();
      setTimeout(() => _initFinancialChartsForDeal(currentDealId), 60);
      break;
    case 'calls':     container.innerHTML = await renderDealCallsTab(); break;
    case 'notes':     container.innerHTML = await renderDealNotesTab(); break;
    case 'documents':
      container.innerHTML = await renderDealDocsTab();
      // Async: render folder section after the tab HTML is in the DOM
      if (typeof folderRenderSection === 'function') folderRenderSection(currentDealId);
      break;
    case 'diligence': container.innerHTML = await renderDealDiligenceTab(); break;
    case 'tasks':     container.innerHTML = await renderDealTasksTab(); break;
    case 'fit-score': container.innerHTML = await renderDealFitScoreTab(); break;
    case 'history':   container.innerHTML = await renderDealHistoryTab(); break;
    case 'model':     container.innerHTML = await renderDealFinancialModelTab(); break;
    case 'nda':       container.innerHTML = renderDealNdaTab(currentDealId); break;
    case 'dd':        container.innerHTML = await renderDealDDTab(currentDealId); break;
    default:          container.innerHTML = await renderDealOverviewTab();
  }
}

// === OVERVIEW TAB ===
async function renderDealOverviewTab() {
  const deal = await DB.get(STORES.deals, currentDealId);
  if (!deal) return '';

  return `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <!-- Description -->
        <div class="card">
          <h3 class="text-sm font-semibold mb-3">Description</h3>
          <p class="text-sm text-surface-600 dark:text-surface-400 whitespace-pre-wrap">${deal.description ? escapeHtml(deal.description) : '<span class="text-surface-400 italic">No description yet. Click Edit to add one.</span>'}</p>
        </div>
        ${deal.thesis ? `
        <div class="card">
          <h3 class="text-sm font-semibold mb-3">Investment Thesis</h3>
          <p class="text-sm text-surface-600 dark:text-surface-400 whitespace-pre-wrap">${escapeHtml(deal.thesis)}</p>
        </div>` : ''}

        <!-- Stage Pipeline Visual -->
        <div class="card">
          <h3 class="text-sm font-semibold mb-4">Pipeline Progress</h3>
          <div class="flex flex-wrap gap-1">
            ${DEAL_STAGES.filter(s => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(s)).map(stage => {
              const isCurrent = stage === deal.stage;
              const stageIdx = DEAL_STAGES.indexOf(stage);
              const dealIdx = DEAL_STAGES.indexOf(deal.stage);
              const isPast = stageIdx < dealIdx && !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(deal.stage);
              return `<button onclick="moveDealToStage('${deal.id}', '${stage}')" class="px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${isCurrent ? 'bg-brand-600 text-white shadow-sm' : isPast ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700'}">${escapeHtml(stage)}</button>`;
            }).join('')}
          </div>
        </div>

        <!-- Highlights -->
        ${deal.highlights && deal.highlights.length > 0 ? `
        <div class="card">
          <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
            <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Key Highlights
          </h3>
          <ul class="space-y-2">
            ${deal.highlights.map(h => `
              <li class="flex items-start gap-2.5">
                <span class="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 mt-1.5"></span>
                <span class="text-sm text-surface-700 dark:text-surface-300">${escapeHtml(h)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
        ` : ''}

        <!-- Concerns -->
        ${deal.concerns && deal.concerns.length > 0 ? `
        <div class="card">
          <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
            <svg class="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
            Key Concerns / Risks
          </h3>
          <ul class="space-y-2">
            ${deal.concerns.map(c => `
              <li class="flex items-start gap-2.5">
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 mt-1.5"></span>
                <span class="text-sm text-surface-700 dark:text-surface-300">${escapeHtml(c)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
        ` : ''}
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Financial Analysis -->
        ${(deal.revenue || deal.ebitda || deal.askingPrice) ? `
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold">Financial Analysis</h3>
            <button onclick="openEditDealModal('${deal.id}')" class="text-xs text-brand-600 hover:underline">Edit</button>
          </div>
          <dl class="space-y-2.5 text-sm">
            ${deal.revenue ? `<div class="flex justify-between"><dt class="text-surface-500">Revenue</dt><dd class="font-semibold">${fmtDealMoney(deal.revenue, fxSymbol(deal.currency))}</dd></div>` : ''}
            ${deal.ebitda ? `<div class="flex justify-between"><dt class="text-surface-500">EBITDA</dt><dd class="font-semibold">${fmtDealMoney(deal.ebitda, fxSymbol(deal.currency))}</dd></div>` : ''}
            ${deal.revenue && deal.ebitda ? `<div class="flex justify-between"><dt class="text-surface-500">EBITDA Margin</dt><dd class="font-semibold ${(deal.ebitda/deal.revenue) >= 0.20 ? 'text-green-600' : 'text-yellow-600'}">${((deal.ebitda/deal.revenue)*100).toFixed(1)}%</dd></div>` : ''}
            ${deal.askingPrice ? `<div class="flex justify-between pt-1.5 border-t border-surface-100 dark:border-surface-800"><dt class="text-surface-500">Asking Price</dt><dd class="font-semibold">${fmtDealMoney(deal.askingPrice, fxSymbol(deal.currency))}</dd></div>` : ''}
            ${(deal.askingMultiple || (deal.askingPrice && deal.ebitda)) ? `<div class="flex justify-between"><dt class="text-surface-500">EBITDA Multiple</dt><dd class="font-semibold">${(deal.askingMultiple || deal.askingPrice / deal.ebitda).toFixed(1)}x</dd></div>` : ''}
            ${deal.askingPrice && deal.revenue ? `<div class="flex justify-between"><dt class="text-surface-500">EV / Revenue</dt><dd class="font-semibold">${(deal.askingPrice / deal.revenue).toFixed(1)}x</dd></div>` : ''}
            ${deal.ebitda ? `
              <div class="pt-1.5 border-t border-surface-100 dark:border-surface-800">
                <p class="text-xs text-surface-400 mb-1.5">Financing Estimates (illustrative)</p>
                <div class="flex justify-between"><dt class="text-surface-500 text-xs">Debt Capacity (3x)</dt><dd class="text-xs font-medium">${fmtDealMoney(deal.ebitda * 3, fxSymbol(deal.currency))}</dd></div>
                ${deal.askingPrice ? `<div class="flex justify-between mt-1"><dt class="text-surface-500 text-xs">Equity Required</dt><dd class="text-xs font-medium">${fmtDealMoney(Math.max(0, deal.askingPrice - deal.ebitda * 3), fxSymbol(deal.currency))}</dd></div>` : ''}
              </div>
            ` : ''}
          </dl>
        </div>
        ` : ''}

        <div class="card">
          <h3 class="text-sm font-semibold mb-3">Details</h3>
          <dl class="space-y-3 text-sm">
            ${[
              ['Source', deal.source],
              ['Sector', deal.sector],
              ['Sub-sector', deal.subsector],
              ['Location', deal.location],
              ['Employees', deal.employeeCount],
              ['Next Action', deal.nextAction],
              ['Next Action Date', deal.nextActionDate ? formatDate(deal.nextActionDate) : null],
              ['Created', formatDateTime(deal.createdAt)],
              ['Last Updated', formatRelative(deal.updatedAt)],
            ].filter(([,v]) => v).map(([label, value]) => `
              <div class="flex justify-between">
                <dt class="text-surface-500">${label}</dt>
                <dd class="font-medium text-right">${escapeHtml(String(value))}</dd>
              </div>
            `).join('')}
          </dl>
        </div>

        ${deal.contactIds && deal.contactIds.length > 0 ? `
        <div class="card">
          <h3 class="text-sm font-semibold mb-3">Linked Contacts</h3>
          <div class="space-y-2" id="deal-linked-contacts"></div>
        </div>` : ''}

        ${deal.tags && deal.tags.length > 0 ? `
        <div class="card">
          <h3 class="text-sm font-semibold mb-3">Tags</h3>
          <div class="flex flex-wrap gap-1">
            ${deal.tags.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>` : ''}

        <!-- Due Diligence Shortcut -->
        <div class="card p-4 bg-gradient-to-br from-brand-50 to-purple-50 dark:from-brand-900/20 dark:to-purple-900/20 border-brand-200 dark:border-brand-800">
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>
            </div>
            <div>
              <h3 class="text-sm font-semibold mb-0.5">Due Diligence</h3>
              <p class="text-xs text-surface-500 mb-3">AI-powered 8-workstream commercial DD — market, customers, competition, pricing, growth, unit economics, GTM, risks.</p>
              <button onclick="switchDealTab('dd')" class="btn-primary btn-sm w-full">
                Run Due Diligence
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// === NOTES TAB ===
async function renderDealNotesTab() {
  const notes = (await DB.getAllByIndex(STORES.dealNotes, 'dealId', currentDealId))
    .filter(n => n.userId === currentUser.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return `
    <div>
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-sm font-semibold">${notes.length} note${notes.length !== 1 ? 's' : ''}</h3>
        <button onclick="openDealNoteModal('${currentDealId}')" class="btn-primary btn-sm">+ Add Note</button>
      </div>
      ${notes.length === 0 ? `
        <div class="card text-center py-8">
          <p class="text-sm text-surface-500">No notes yet. Add your first note about this deal.</p>
        </div>
      ` : notes.map(note => `
        <div class="card mb-3">
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="badge badge-${note.type === 'call_note' ? 'blue' : note.type === 'meeting_note' ? 'purple' : 'green'}">${note.type === 'call_note' ? 'Call' : note.type === 'meeting_note' ? 'Meeting' : 'Note'}</span>
              ${note.pinned ? '<svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 24 24"><path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>' : ''}
            </div>
            <div class="flex items-center gap-1">
              <span class="text-xs text-surface-400">${formatDateTime(note.createdAt)}</span>
              <button onclick="openDealNoteModal('${currentDealId}', '${note.id}')" class="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
              </button>
              <button onclick="deleteDealNote('${note.id}')" class="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-400 hover:text-red-500">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </button>
            </div>
          </div>
          <p class="text-sm whitespace-pre-wrap">${escapeHtml(note.content)}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function openDealNoteModal(dealId, noteId) {
  const loadNote = noteId ? DB.get(STORES.dealNotes, noteId) : Promise.resolve(null);
  loadNote.then(note => {
    openModal(note ? 'Edit Note' : 'Add Note', `
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Type</label>
          <select id="deal-note-type" class="input-field">
            <option value="note" ${note?.type === 'note' ? 'selected' : ''}>General Note</option>
            <option value="call_note" ${note?.type === 'call_note' ? 'selected' : ''}>Call Note</option>
            <option value="meeting_note" ${note?.type === 'meeting_note' ? 'selected' : ''}>Meeting Note</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Content</label>
          <textarea id="deal-note-content" class="input-field" rows="8" placeholder="Write your notes here...">${note ? escapeHtml(note.content) : ''}</textarea>
        </div>
        <div class="flex items-center gap-2">
          <input type="checkbox" id="deal-note-pinned" ${note?.pinned ? 'checked' : ''} class="rounded border-surface-300" />
          <label for="deal-note-pinned" class="text-sm">Pin this note</label>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-800">
          <button onclick="closeModal()" class="btn-secondary">Cancel</button>
          <button onclick="saveDealNote('${dealId}', '${noteId || ''}')" class="btn-primary">Save Note</button>
        </div>
      </div>
    `);
  });
}

async function saveDealNote(dealId, noteId) {
  const content = document.getElementById('deal-note-content').value.trim();
  if (!content) return showToast('Note content is required', 'error');

  const type = document.getElementById('deal-note-type').value;
  const pinned = document.getElementById('deal-note-pinned').checked;

  const note = noteId ? await DB.get(STORES.dealNotes, noteId) : {
    id: generateId(),
    dealId,
    userId: currentUser.id,
    createdAt: new Date().toISOString(),
  };

  note.content = content;
  note.type = type;
  note.pinned = pinned;
  note.updatedAt = new Date().toISOString();

  await DB.put(STORES.dealNotes, note);
  await logDealHistory(dealId, noteId ? 'note_updated' : 'note_added', { noteId: note.id, type });

  closeModal();
  showToast('Note saved', 'success');
  switchDealTab('notes');
}

async function deleteDealNote(noteId) {
  confirmDialog('Delete Note', 'This note will be permanently deleted.', async () => {
    await DB.delete(STORES.dealNotes, noteId);
    await logDealHistory(currentDealId, 'note_deleted', { noteId });
    showToast('Note deleted', 'success');
    switchDealTab('notes');
  });
}

// === DOCUMENTS TAB ===
async function renderDealDocsTab() {
  const docs = (await DB.getAllByIndex(STORES.dealDocuments, 'dealId', currentDealId))
    .filter(d => d.userId === currentUser.id)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  // Check for missing document types
  const uploadedCategories = new Set(docs.map(d => d.category));
  const recommendedDocs = [
    { cat: 'cim', label: 'CIM / Teaser' },
    { cat: 'financials', label: 'Financial Statements' },
    { cat: 'tax', label: 'Tax Returns' },
    { cat: 'legal', label: 'Key Contracts' },
  ];
  const missing = recommendedDocs.filter(r => !uploadedCategories.has(r.cat));

  const folderSupported = 'showDirectoryPicker' in window;

  return `
    <div>

      <!-- ── Linked Folder Section ─────────────────── -->
      <div class="mb-5">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-surface-400 dark:text-surface-500">Linked Folder</h3>
          ${!folderSupported ? `<span class="text-xs text-surface-400">Chrome/Edge required</span>` : ''}
        </div>
        <div id="folder-access-wrapper">
          <div class="fa-scanning"><div class="fa-spinner"></div><span>Loading folder…</span></div>
        </div>
      </div>

      <!-- ── Uploaded Documents ────────────────────── -->
      <div>
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-surface-400 dark:text-surface-500">Uploaded Documents</h3>
          <button onclick="openDocUploadModal('${currentDealId}')" class="btn-primary btn-sm">+ Upload</button>
        </div>

        ${missing.length > 0 ? `
          <div class="bg-yellow-50 dark:bg-yellow-900/15 border border-yellow-200 dark:border-yellow-800 rounded p-3 mb-3">
            <div class="flex items-center gap-2 mb-1">
              <svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              <span class="text-xs font-semibold text-yellow-700 dark:text-yellow-400">Suggested uploads</span>
            </div>
            <p class="text-xs text-yellow-600 dark:text-yellow-300">For richer AI analysis, upload: ${missing.map(m => m.label).join(', ')}</p>
          </div>
        ` : ''}

        ${docs.length === 0 ? `
          <div class="card text-center py-6">
            <p class="text-sm text-surface-500">No documents uploaded yet. Upload CIMs, financials, or other deal materials — or link a folder above.</p>
          </div>
        ` : `
          <div class="space-y-2">
            ${docs.map(doc => renderDocumentCard(doc)).join('')}
          </div>
        `}
      </div>

    </div>
  `;
}

// === AI DILIGENCE TAB ===
async function renderDealDiligenceTab() {
  const reports = (await DB.getAllByIndex(STORES.dealDiligence, 'dealId', currentDealId))
    .filter(r => r.userId === currentUser.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const docs = await DB.getAllByIndex(STORES.dealDocuments, 'dealId', currentDealId);
  const docCount = docs.filter(d => d.userId === currentUser.id).length;
  const extractedCount = docs.filter(d => d.userId === currentUser.id && d.extractedText).length;

  return `
    <div>
      <!-- Run Diligence Panel -->
      <div class="card mb-6 bg-gradient-to-r from-brand-50 to-purple-50 dark:from-brand-900/20 dark:to-purple-900/20 border-brand-200 dark:border-brand-800">
        <div class="flex items-center gap-3 mb-3">
          <div class="p-2 rounded bg-brand-100 dark:bg-brand-900/30">
            <svg class="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
          </div>
          <div>
            <h3 class="text-sm font-semibold">AI Due Diligence</h3>
            <p class="text-xs text-surface-500">${docCount} documents uploaded, ${extractedCount} with extracted text</p>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          ${Object.entries(DILIGENCE_TYPES).filter(([k]) => k !== 'qa_response').map(([type, info]) => `
            <button onclick="startDiligenceRun('${currentDealId}', '${type}')" class="p-2.5 rounded border border-surface-200 dark:border-surface-700 hover:border-brand-400 dark:hover:border-brand-600 bg-white dark:bg-surface-900 text-left transition-all hover:shadow-sm group">
              <span class="text-lg">${info.icon}</span>
              <p class="text-xs font-medium mt-1 group-hover:text-brand-600">${info.label}</p>
            </button>
          `).join('')}
        </div>
        ${docCount === 0 ? `<p class="text-xs text-yellow-600 dark:text-yellow-400">Upload documents for deeper analysis. Without them, AI will analyze deal metadata only.</p>` : ''}
      </div>

      <!-- Q&A Section -->
      <div class="card mb-6">
        <h3 class="text-sm font-semibold mb-3">Ask a Question About This Deal</h3>
        <div class="flex gap-2">
          <input type="text" id="deal-qa-input" class="input-field flex-1" placeholder="e.g., What is the customer concentration risk?" onkeydown="if(event.key==='Enter')askDealQuestionUI()" />
          <button onclick="askDealQuestionUI()" class="btn-primary btn-sm">Ask</button>
        </div>
        <div id="deal-qa-result" class="mt-3"></div>
      </div>

      <!-- Previous Reports -->
      <div>
        <h3 class="text-sm font-semibold mb-3">${reports.length} Previous Report${reports.length !== 1 ? 's' : ''}</h3>
        ${reports.length === 0 ? `
          <div class="card text-center py-8">
            <p class="text-sm text-surface-500">No AI reports yet. Run your first diligence analysis above.</p>
          </div>
        ` : reports.map(r => renderDiligenceReport(r)).join('')}
      </div>
    </div>
  `;
}

async function startDiligenceRun(dealId, type) {
  const typeInfo = DILIGENCE_TYPES[type];
  showToast(`Running ${typeInfo.label}...`, 'info');

  try {
    await runDiligenceAnalysis(dealId, type);
    showToast(`${typeInfo.label} completed`, 'success');
    switchDealTab('diligence');
  } catch (err) {
    showToast('AI analysis failed: ' + err.message, 'error');
    switchDealTab('diligence');
  }
}

async function askDealQuestionUI() {
  const input = document.getElementById('deal-qa-input');
  const question = input.value.trim();
  if (!question) return;

  const resultDiv = document.getElementById('deal-qa-result');
  resultDiv.innerHTML = `<div class="flex items-center gap-2 p-3"><div class="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full"></div><span class="text-sm text-surface-500">Thinking...</span></div>`;
  input.value = '';

  try {
    const result = await askDealQuestion(currentDealId, question);
    resultDiv.innerHTML = `
      <div class="p-4 bg-surface-50 dark:bg-surface-800 rounded">
        <p class="text-xs text-surface-400 mb-2">Q: ${escapeHtml(question)}</p>
        <div class="text-sm deal-ai-output">${renderMarkdown(result.response)}</div>
        <p class="text-xs text-surface-400 mt-2">${result.tokensUsed} tokens &bull; ${(result.durationMs / 1000).toFixed(1)}s</p>
      </div>
    `;
  } catch (err) {
    resultDiv.innerHTML = `<p class="text-sm text-red-500 p-3">${escapeHtml(err.message)}</p>`;
  }
}

// === TASK TEMPLATES ===
const DEAL_TASK_TEMPLATES = {
  'Standard DD': [
    { title: 'Review CIM / teaser document', category: 'General', priority: 'high' },
    { title: 'Request and review 3 years of financial statements', category: 'Financial', priority: 'high' },
    { title: 'Review tax returns (3 years)', category: 'Financial', priority: 'high' },
    { title: 'Analyze revenue concentration by customer', category: 'Financial', priority: 'high' },
    { title: 'Review all key contracts (customers, suppliers, leases)', category: 'Legal', priority: 'high' },
    { title: 'Background check on owner / key management', category: 'Management', priority: 'medium' },
    { title: 'Site visit and facility walkthrough', category: 'Operational', priority: 'medium' },
    { title: 'Interview key employees', category: 'Management', priority: 'medium' },
    { title: 'Verify customer references (3+)', category: 'Operational', priority: 'medium' },
    { title: 'Review online reviews and reputation', category: 'Operational', priority: 'low' },
    { title: 'Confirm no outstanding litigation or legal issues', category: 'Legal', priority: 'high' },
    { title: 'Understand seller motivation and timeline', category: 'General', priority: 'medium' },
  ],
  'Financial DD': [
    { title: 'Normalize EBITDA (add-backs & one-time items)', category: 'Financial', priority: 'high' },
    { title: 'Analyze revenue trends by product/service line', category: 'Financial', priority: 'high' },
    { title: 'Review accounts receivable aging schedule', category: 'Financial', priority: 'high' },
    { title: 'Analyze gross margin by customer / segment', category: 'Financial', priority: 'high' },
    { title: 'Review debt schedule and any seller obligations', category: 'Financial', priority: 'high' },
    { title: 'Working capital analysis (NWC peg)', category: 'Financial', priority: 'high' },
    { title: 'Verify payroll and compensation structure', category: 'Financial', priority: 'medium' },
    { title: 'Review capital expenditure history and projections', category: 'Financial', priority: 'medium' },
    { title: 'Confirm inventory valuation method', category: 'Financial', priority: 'medium' },
    { title: 'Review Quality of Earnings report (if available)', category: 'Financial', priority: 'high' },
  ],
  'Legal DD': [
    { title: 'Review corporate structure and ownership cap table', category: 'Legal', priority: 'high' },
    { title: 'Review all material customer contracts', category: 'Legal', priority: 'high' },
    { title: 'Review all material supplier / vendor contracts', category: 'Legal', priority: 'high' },
    { title: 'Review lease agreements (office, equipment)', category: 'Legal', priority: 'high' },
    { title: 'Confirm IP ownership (trademarks, patents, software)', category: 'Legal', priority: 'high' },
    { title: 'Review any outstanding litigation or claims', category: 'Legal', priority: 'high' },
    { title: 'Review employment agreements and non-competes', category: 'Legal', priority: 'medium' },
    { title: 'Confirm regulatory compliance and licenses', category: 'Legal', priority: 'medium' },
    { title: 'Review insurance policies', category: 'Legal', priority: 'low' },
    { title: 'Confirm environmental compliance (if applicable)', category: 'Legal', priority: 'low' },
  ],
  'Management DD': [
    { title: 'Deep-dive interview with owner / CEO', category: 'Management', priority: 'high' },
    { title: 'Interview CFO / controller', category: 'Management', priority: 'high' },
    { title: 'Interview top sales rep or sales manager', category: 'Management', priority: 'medium' },
    { title: 'Interview operations manager', category: 'Management', priority: 'medium' },
    { title: 'Assess owner dependency — what happens if they leave?', category: 'Management', priority: 'high' },
    { title: 'Review org chart and reporting structure', category: 'Management', priority: 'medium' },
    { title: 'Understand key employee retention plans', category: 'Management', priority: 'medium' },
    { title: 'Confirm management willing to stay through transition', category: 'Management', priority: 'high' },
    { title: 'Reference checks on management from suppliers/customers', category: 'Management', priority: 'medium' },
  ],
  'LOI → Exclusivity Checklist': [
    { title: 'Submit signed LOI to seller', category: 'General', priority: 'high' },
    { title: 'Confirm exclusivity period and terms', category: 'Legal', priority: 'high' },
    { title: 'Engage M&A attorney for legal DD', category: 'Legal', priority: 'high' },
    { title: 'Engage accounting firm for QoE', category: 'Financial', priority: 'high' },
    { title: 'Set up data room access', category: 'General', priority: 'high' },
    { title: 'Draft DD request list and send to seller', category: 'General', priority: 'high' },
    { title: 'Notify SBA lender / financing source', category: 'Financial', priority: 'medium' },
    { title: 'Set weekly check-in cadence with seller', category: 'General', priority: 'medium' },
  ],
};

function openDealTaskTemplateModal(dealId) {
  const names = Object.keys(DEAL_TASK_TEMPLATES);
  openModal(`
    <div class="p-6">
      <h3 class="text-base font-semibold mb-1">Apply DD Task Template</h3>
      <p class="text-sm text-surface-500 mb-5">Select a template to bulk-add tasks to this deal. Existing tasks won't be affected.</p>
      <div class="space-y-2 mb-5">
        ${names.map(name => {
          const tasks = DEAL_TASK_TEMPLATES[name];
          return `
            <label class="flex items-start gap-3 p-3 border border-surface-200 dark:border-surface-700 rounded-lg cursor-pointer hover:border-brand-400 dark:hover:border-brand-600 transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:has-[:checked]:bg-brand-900/20">
              <input type="radio" name="task-template" value="${escapeHtml(name)}" class="mt-0.5 accent-brand-600" />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">${escapeHtml(name)}</p>
                <p class="text-xs text-surface-400 mt-0.5">${tasks.length} tasks · ${[...new Set(tasks.map(t => t.category))].join(', ')}</p>
              </div>
            </label>`;
        }).join('')}
      </div>
      <div class="flex items-center gap-3 mb-5">
        <input type="date" id="template-due-offset-date" class="input-field flex-1" placeholder="Base due date (optional)" />
        <p class="text-xs text-surface-400 w-40">Tasks will be spaced across the next 30 days from this date</p>
      </div>
      <div class="flex justify-end gap-3">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="applyDealTaskTemplate('${dealId}')" class="btn-primary">Apply Template</button>
      </div>
    </div>
  `, { small: true });
}

async function applyDealTaskTemplate(dealId) {
  const selected = document.querySelector('input[name="task-template"]:checked')?.value;
  if (!selected || !DEAL_TASK_TEMPLATES[selected]) {
    showToast('Please select a template', 'warning'); return;
  }
  const tasks = DEAL_TASK_TEMPLATES[selected];
  const baseDateInput = document.getElementById('template-due-offset-date')?.value;
  const baseDate = baseDateInput ? new Date(baseDateInput) : new Date();

  // Spread tasks across 30 days; high-priority tasks get earlier dates
  const priorities = { high: 0, medium: 1, low: 2 };
  const sortedTasks = [...tasks].sort((a, b) => (priorities[a.priority] || 1) - (priorities[b.priority] || 1));

  for (let i = 0; i < sortedTasks.length; i++) {
    const t = sortedTasks[i];
    const daysOffset = Math.round((i / sortedTasks.length) * 30);
    const dueDate = new Date(baseDate);
    dueDate.setDate(dueDate.getDate() + daysOffset);

    await DB.add(STORES.dealTasks, {
      id: generateId(),
      dealId,
      userId: currentUser.id,
      title: t.title,
      description: '',
      category: t.category,
      priority: t.priority,
      status: 'todo',
      dueDate: dueDate.toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  await logDealHistory(dealId, 'task_template_applied', { template: selected, taskCount: tasks.length });
  closeModal();
  showToast(`${tasks.length} tasks added from "${selected}"`, 'success');
  switchDealTab('tasks');
}

// === TASKS TAB ===
async function renderDealTasksTab() {
  const tasks = (await DB.getAllByIndex(STORES.dealTasks, 'dealId', currentDealId))
    .filter(t => t.userId === currentUser.id)
    .sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (a.status !== 'done' && b.status === 'done') return -1;
      return new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999');
    });

  const todoTasks = tasks.filter(t => t.status !== 'done');
  const doneTasks = tasks.filter(t => t.status === 'done');

  return `
    <div>
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-sm font-semibold">${todoTasks.length} open task${todoTasks.length !== 1 ? 's' : ''}</h3>
        <div class="flex gap-2">
          <button onclick="openDealTaskTemplateModal('${currentDealId}')" class="btn-secondary btn-sm">Apply Template</button>
          <button onclick="openDealTaskModal('${currentDealId}')" class="btn-primary btn-sm">+ Add Task</button>
        </div>
      </div>

      ${todoTasks.length === 0 && doneTasks.length === 0 ? `
        <div class="card text-center py-8">
          <p class="text-sm text-surface-500">No tasks yet. Add diligence items, follow-ups, or to-dos.</p>
        </div>
      ` : `
        <div class="space-y-2 mb-6">
          ${todoTasks.map(t => renderDealTaskItem(t)).join('')}
        </div>
        ${doneTasks.length > 0 ? `
          <details class="mb-4">
            <summary class="text-sm text-surface-500 cursor-pointer hover:text-surface-700">${doneTasks.length} completed task${doneTasks.length !== 1 ? 's' : ''}</summary>
            <div class="space-y-2 mt-2 opacity-60">
              ${doneTasks.map(t => renderDealTaskItem(t)).join('')}
            </div>
          </details>
        ` : ''}
      `}
    </div>
  `;
}

function renderDealTaskItem(task) {
  const isDone = task.status === 'done';
  const isOverdue = task.dueDate && !isDone && new Date(task.dueDate) < new Date();
  const priorityColors = { high: 'text-red-500', medium: 'text-yellow-500', low: 'text-blue-500' };

  return `
    <div class="flex items-start gap-3 p-3 rounded border border-surface-200 dark:border-surface-700 ${isOverdue ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' : ''}">
      <button onclick="toggleDealTaskStatus('${task.id}')" class="mt-0.5 flex-shrink-0">
        ${isDone
          ? '<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
          : '<svg class="w-5 h-5 text-surface-300 hover:text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.5" /></svg>'}
      </button>
      <div class="flex-1 min-w-0">
        <div class="text-sm ${isDone ? 'line-through text-surface-400' : 'font-medium'}">${escapeHtml(task.title)}</div>
        ${task.description ? `<p class="text-xs text-surface-500 mt-0.5">${escapeHtml(task.description)}</p>` : ''}
        <div class="flex items-center gap-2 mt-1">
          ${task.category ? `<span class="text-xs text-surface-400">${escapeHtml(task.category)}</span>` : ''}
          ${task.dueDate ? `<span class="text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-surface-400'}">${isOverdue ? 'Overdue: ' : 'Due: '}${formatDate(task.dueDate)}</span>` : ''}
          <span class="${priorityColors[task.priority] || ''} text-xs">${task.priority || ''}</span>
        </div>
      </div>
      <button onclick="deleteDealTask('${task.id}')" class="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-400 hover:text-red-500">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  `;
}

function openDealTaskModal(dealId, taskId) {
  const loadTask = taskId ? DB.get(STORES.dealTasks, taskId) : Promise.resolve(null);
  loadTask.then(task => {
    openModal(task ? 'Edit Task' : 'Add Task', `
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Title</label>
          <input type="text" id="deal-task-title" class="input-field" value="${task ? escapeHtml(task.title) : ''}" placeholder="e.g., Review financial statements" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Description</label>
          <textarea id="deal-task-desc" class="input-field" rows="3" placeholder="Optional details...">${task ? escapeHtml(task.description || '') : ''}</textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Due Date</label>
            <input type="date" id="deal-task-due" class="input-field" value="${task?.dueDate || ''}" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Priority</label>
            <select id="deal-task-priority" class="input-field">
              <option value="medium" ${task?.priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${task?.priority === 'high' ? 'selected' : ''}>High</option>
              <option value="low" ${task?.priority === 'low' ? 'selected' : ''}>Low</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Category</label>
          <select id="deal-task-category" class="input-field">
            <option value="">General</option>
            <option value="financial" ${task?.category === 'financial' ? 'selected' : ''}>Financial</option>
            <option value="legal" ${task?.category === 'legal' ? 'selected' : ''}>Legal</option>
            <option value="operational" ${task?.category === 'operational' ? 'selected' : ''}>Operational</option>
            <option value="management" ${task?.category === 'management' ? 'selected' : ''}>Management</option>
            <option value="integration" ${task?.category === 'integration' ? 'selected' : ''}>Integration</option>
          </select>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-800">
          <button onclick="closeModal()" class="btn-secondary">Cancel</button>
          <button onclick="saveDealTask('${dealId}', '${taskId || ''}')" class="btn-primary">Save Task</button>
        </div>
      </div>
    `);
  });
}

async function saveDealTask(dealId, taskId) {
  const title = document.getElementById('deal-task-title').value.trim();
  if (!title) return showToast('Task title is required', 'error');

  const task = taskId ? await DB.get(STORES.dealTasks, taskId) : {
    id: generateId(),
    dealId,
    userId: currentUser.id,
    status: 'todo',
    createdAt: new Date().toISOString(),
  };

  task.title = title;
  task.description = document.getElementById('deal-task-desc').value.trim();
  task.dueDate = document.getElementById('deal-task-due').value || null;
  task.priority = document.getElementById('deal-task-priority').value;
  task.category = document.getElementById('deal-task-category').value;
  task.updatedAt = new Date().toISOString();

  await DB.put(STORES.dealTasks, task);
  await logDealHistory(dealId, taskId ? 'task_updated' : 'task_added', { taskId: task.id, title });

  closeModal();
  showToast('Task saved', 'success');
  switchDealTab('tasks');
}

async function toggleDealTaskStatus(taskId) {
  const task = await DB.get(STORES.dealTasks, taskId);
  if (!task) return;
  task.status = task.status === 'done' ? 'todo' : 'done';
  task.completedAt = task.status === 'done' ? new Date().toISOString() : null;
  task.updatedAt = new Date().toISOString();
  await DB.put(STORES.dealTasks, task);
  await logDealHistory(task.dealId, 'task_status_changed', { taskId, status: task.status, title: task.title });
  switchDealTab('tasks');
}

async function deleteDealTask(taskId) {
  const task = await DB.get(STORES.dealTasks, taskId);
  await DB.delete(STORES.dealTasks, taskId);
  if (task) await logDealHistory(task.dealId, 'task_deleted', { taskId, title: task.title });
  showToast('Task deleted', 'success');
  switchDealTab('tasks');
}

// === SCORING TAB ===
async function renderDealScoringTab() {
  const deal = await DB.get(STORES.deals, currentDealId);
  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold">Deal Score</h3>
          <button onclick="openScoringModal('${currentDealId}')" class="btn-primary btn-sm">Score Deal</button>
        </div>
        ${deal.score !== null && deal.score !== undefined ? `
          <div class="text-center py-4">
            <div class="text-4xl font-bold ${deal.score >= 7 ? 'text-green-600' : deal.score >= 5 ? 'text-yellow-600' : 'text-red-600'}">${deal.score.toFixed(1)}</div>
            <p class="text-sm text-surface-500 mt-1">out of 10</p>
          </div>
        ` : `<p class="text-sm text-surface-500 text-center py-8">Not scored yet. Click "Score Deal" to evaluate.</p>`}
      </div>
      <div class="card">
        <h3 class="text-sm font-semibold mb-4">Score Breakdown</h3>
        ${renderScoreBreakdown(deal.scoreBreakdown, DEFAULT_SCORING_CRITERIA)}
      </div>
    </div>
  `;
}

// === HISTORY TAB ===
async function renderDealHistoryTab() {
  const history = (await DB.getAllByIndex(STORES.dealHistory, 'dealId', currentDealId))
    .filter(h => h.userId === currentUser.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const actionLabels = {
    created: 'Deal created',
    stage_changed: 'Stage changed',
    field_updated: 'Deal updated',
    document_uploaded: 'Document uploaded',
    document_deleted: 'Document deleted',
    diligence_run: 'AI diligence run',
    note_added: 'Note added',
    note_updated: 'Note updated',
    note_deleted: 'Note deleted',
    task_added: 'Task added',
    task_updated: 'Task updated',
    task_deleted: 'Task deleted',
    task_status_changed: 'Task status changed',
    score_updated: 'Score updated',
  };

  const actionColors = {
    created: '#40c057',
    stage_changed: '#e64980',
    field_updated: '#868e96',
    document_uploaded: '#15aabf',
    document_deleted: '#fa5252',
    diligence_run: '#7048e8',
    note_added: '#4c6ef5',
    score_updated: '#fab005',
    task_added: '#40c057',
    task_status_changed: '#15aabf',
  };

  return `
    <div>
      <h3 class="text-sm font-semibold mb-4">Audit Trail (${history.length} events)</h3>
      ${history.length === 0 ? `
        <div class="card text-center py-8">
          <p class="text-sm text-surface-500">No history yet.</p>
        </div>
      ` : `
        <div class="space-y-0">
          ${history.map(h => {
            const label = actionLabels[h.action] || h.action;
            const color = actionColors[h.action] || '#868e96';
            let detail = '';
            if (h.details) {
              if (h.action === 'stage_changed') detail = `${h.details.from} → ${h.details.to}`;
              else if (h.action === 'document_uploaded') detail = h.details.name || '';
              else if (h.action === 'diligence_run') detail = `${DILIGENCE_TYPES[h.details.type]?.label || h.details.type} (${h.details.tokensUsed || '?'} tokens)`;
              else if (h.action === 'score_updated') detail = `Score: ${h.details.score?.toFixed(1) || '—'}/10`;
              else if (h.action === 'task_status_changed') detail = `${h.details.title}: ${h.details.status}`;
              else if (h.details.title) detail = h.details.title;
              else if (h.details.name) detail = h.details.name;
            }
            return `
              <div class="timeline-item">
                <div class="timeline-dot" style="border-color: ${color}"></div>
                <div>
                  <p class="text-sm font-medium">${escapeHtml(label)}</p>
                  ${detail ? `<p class="text-xs text-surface-500 mt-0.5">${escapeHtml(detail)}</p>` : ''}
                  <p class="text-xs text-surface-400 mt-1">${formatDateTime(h.timestamp)}</p>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

// === NDA REVIEW TAB ===
function renderDealNdaTab(dealId) {
  // Load past NDA reviews async after the HTML is in the DOM
  setTimeout(async () => {
    const container = document.getElementById('nda-deal-history');
    if (!container) return;
    try {
      const all = await DB.getAllByIndex(STORES.dealDiligence, 'dealId', dealId);
      const ndaReviews = all.filter(r => r.type === 'nda_review').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (ndaReviews.length === 0) {
        container.innerHTML = '<p class="text-xs text-surface-400 italic">No NDA reviews yet for this deal.</p>';
        return;
      }
      container.innerHTML = `
        <h4 class="text-sm font-medium text-surface-600 dark:text-surface-400 mb-2">Past NDA Reviews (${ndaReviews.length})</h4>
        ${ndaReviews.map(r => `
          <div class="card">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium">${escapeHtml(r.fileName || 'NDA Review')}</span>
              <span class="text-xs text-surface-400">${new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="deal-ai-output text-xs max-h-48 overflow-y-auto">${renderMarkdown(r.content || '')}</div>
          </div>
        `).join('')}
      `;
    } catch (e) {
      container.innerHTML = '';
    }
  }, 0);

  return `
    <div class="space-y-4">
      <div class="card">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 6.627 5.373 12 12 12s12-5.373 12-12c0-2.13-.558-4.128-1.534-5.856"/></svg>
          </div>
          <div>
            <h3 class="text-sm font-semibold">AI NDA Checker</h3>
            <p class="text-xs text-surface-500">Upload reference NDAs to define acceptable terms, then review new NDAs clause by clause.</p>
          </div>
        </div>
        <div class="flex flex-col sm:flex-row gap-3">
          <button onclick="openNdaCheckerModal('${dealId}')" class="btn-primary flex-1">Open NDA Checker</button>
          <button onclick="openNdaReview('${dealId}')" class="btn-secondary flex-1">Quick Review NDA</button>
        </div>
      </div>
      <div id="nda-deal-history" class="space-y-3">
        <p class="text-xs text-surface-500 italic">Loading past NDA reviews...</p>
      </div>
    </div>
  `;
}

// === FINANCIAL MODEL TAB ===
async function renderDealFinancialModelTab() {
  const deal = await DB.get(STORES.deals, currentDealId);
  if (!deal) return '';

  // Use saved model or fall back to deal financials
  const s = deal.financialModel || {};
  const currency       = s.currency       ?? deal.currency       ?? 'USD';
  const revenue        = s.revenue        ?? deal.revenue        ?? 0;
  const ebitda         = s.ebitda         ?? deal.ebitda         ?? 0;
  const rawMultiple    = s.multiple       ?? (deal.askingPrice && ebitda > 0 ? +(deal.askingPrice / ebitda).toFixed(1) : 4.5);
  const multiple       = Math.min(10, Math.max(2, rawMultiple));
  const purchasePrice  = s.purchasePrice  ?? deal.askingPrice    ?? Math.round(ebitda * multiple);
  const equityPct      = s.equityPct      ?? 20;
  const sbaPct         = s.sbaPct         ?? 70;
  const sellerNotePct  = s.sellerNotePct  ?? 10;
  const sbaRate        = s.sbaRate        ?? 7.5;
  const sbaTerm        = s.sbaTerm        ?? 10;
  const sellerNoteRate = s.sellerNoteRate ?? 5;
  const sellerNoteTerm = s.sellerNoteTerm ?? 5;
  const growthRate     = s.growthRate     ?? 5;
  const exitMultiple   = s.exitMultiple   ?? multiple;

  const currencySymbols = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$' };
  const currencySym    = currencySymbols[currency] || '$';

  const initVals = _dealModelCalcValues({
    revenue, ebitda, multiple, purchasePrice,
    equityPct, sbaPct, sellerNotePct,
    sbaRate, sbaTerm, sellerNoteRate, sellerNoteTerm,
    growthRate, exitMultiple,
  });

  const inputNum = (id, val, opts = '') =>
    `<input type="number" id="${id}" class="input-field text-sm" value="${val}" ${opts}
      oninput="_dealModelRecalc()" onchange="_dealModelRecalc()"/>`;

  return `
    <div class="space-y-6">

      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 class="text-base font-semibold">Financial Model</h3>
          <p class="text-sm text-surface-500 mt-0.5">LOI calculator · capital stack · 5-year returns</p>
        </div>
        <div class="flex gap-2">
          <button onclick="runDealModelAI()" class="btn-secondary btn-sm flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
            </svg>
            AI Analysis
          </button>
          <button onclick="saveDealFinancialModel()" class="btn-primary btn-sm">Save Model</button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- ── LEFT: Inputs ── -->
        <div class="space-y-4">

          <!-- 1. Business Financials -->
          <div class="card">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500">① Business Financials</h4>
              <select id="fm-currency" class="text-xs border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                onchange="_dealModelRecalc()">
                ${['USD','EUR','GBP','CAD','AUD'].map(c =>
                  `<option value="${c}" ${currency === c ? 'selected' : ''}>${c}</option>`
                ).join('')}
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium mb-1">TTM Revenue (${currencySym})</label>
                ${inputNum('fm-revenue', revenue, 'min="0"')}
              </div>
              <div>
                <label class="block text-xs font-medium mb-1">TTM EBITDA (${currencySym})</label>
                ${inputNum('fm-ebitda', ebitda, 'min="0"')}
              </div>
            </div>
          </div>

          <!-- 2. Purchase Price -->
          <div class="card">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">② Purchase Price</h4>
            <div class="space-y-3">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-xs font-medium">EBITDA Multiple</label>
                  <span id="fm-multiple-display" class="text-sm font-bold text-brand-600 dark:text-brand-400">${multiple.toFixed(1)}x</span>
                </div>
                <input type="range" id="fm-multiple" class="w-full accent-brand-600 cursor-pointer"
                  min="2" max="10" step="0.1" value="${multiple}"
                  oninput="_dealModelRecalc()"/>
                <div class="flex justify-between text-[11px] text-surface-400 mt-0.5">
                  <span>2x</span><span>4x</span><span>6x</span><span>8x</span><span>10x</span>
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium mb-1">
                  Purchase Price ($)
                  <span class="text-surface-400 font-normal">— or override manually</span>
                </label>
                ${inputNum('fm-purchase-price', purchasePrice, 'min="0"')}
              </div>
            </div>
          </div>

          <!-- 3. Capital Structure -->
          <div class="card">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">③ Capital Structure</h4>
            <div class="grid grid-cols-3 gap-2 mb-3">
              <div>
                <label class="block text-[11px] font-semibold mb-1 text-blue-600 dark:text-blue-400">Equity %</label>
                <input type="number" id="fm-equity-pct" class="input-field text-sm" value="${equityPct}"
                  min="0" max="100" oninput="_dealModelRecalc()" onchange="_dealModelRecalc()"/>
              </div>
              <div>
                <label class="block text-[11px] font-semibold mb-1 text-emerald-600 dark:text-emerald-400">Bank Loan %</label>
                <input type="number" id="fm-sba-pct" class="input-field text-sm" value="${sbaPct}"
                  min="0" max="100" oninput="_dealModelRecalc()" onchange="_dealModelRecalc()"/>
              </div>
              <div>
                <label class="block text-[11px] font-semibold mb-1 text-amber-600 dark:text-amber-400">Seller Note %</label>
                <input type="number" id="fm-seller-pct" class="input-field text-sm" value="${sellerNotePct}"
                  min="0" max="100" oninput="_dealModelRecalc()" onchange="_dealModelRecalc()"/>
              </div>
            </div>
            <!-- Stacked bar -->
            <div id="fm-stack-bar" class="h-4 rounded-full overflow-hidden flex mb-2">
              <div class="bg-blue-500 transition-all duration-300" style="width:${equityPct}%"></div>
              <div class="bg-emerald-500 transition-all duration-300" style="width:${sbaPct}%"></div>
              <div class="bg-amber-500 transition-all duration-300" style="width:${sellerNotePct}%"></div>
            </div>
            <div class="flex gap-4 text-xs text-surface-600 dark:text-surface-400">
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span>Equity</span>
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>Bank Loan</span>
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>Seller Note</span>
            </div>
          </div>

          <!-- 4. Debt Terms -->
          <div class="card">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">④ Debt Terms</h4>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] font-medium mb-1 text-emerald-600 dark:text-emerald-400">Bank Loan Rate (%)</label>
                ${inputNum('fm-sba-rate', sbaRate, 'min="0" max="20" step="0.1"')}
              </div>
              <div>
                <label class="block text-[11px] font-medium mb-1 text-emerald-600 dark:text-emerald-400">Bank Loan Term (years)</label>
                ${inputNum('fm-sba-term', sbaTerm, 'min="1" max="25"')}
              </div>
              <div>
                <label class="block text-[11px] font-medium mb-1 text-amber-600 dark:text-amber-400">Seller Note Rate (%)</label>
                ${inputNum('fm-seller-rate', sellerNoteRate, 'min="0" max="20" step="0.1"')}
              </div>
              <div>
                <label class="block text-[11px] font-medium mb-1 text-amber-600 dark:text-amber-400">Seller Note Term (years)</label>
                ${inputNum('fm-seller-term', sellerNoteTerm, 'min="1" max="15"')}
              </div>
            </div>
          </div>

          <!-- 5. Growth & Exit -->
          <div class="card">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">⑤ Growth &amp; Exit Assumptions</h4>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium mb-1">Revenue Growth (% / yr)</label>
                ${inputNum('fm-growth', growthRate, 'min="0" max="50" step="0.5"')}
              </div>
              <div>
                <label class="block text-xs font-medium mb-1">Exit Multiple (Year 5)</label>
                ${inputNum('fm-exit-multiple', exitMultiple, 'min="1" max="15" step="0.1"')}
              </div>
            </div>
          </div>

        </div><!-- /LEFT -->

        <!-- ── RIGHT: Output metrics ── -->
        <div>
          <div id="fm-output">
            ${_dealModelOutputHtml(initVals, currencySym)}
          </div>
        </div>

      </div><!-- /grid -->

      <!-- 5-Year Projection -->
      <div id="fm-projection">
        ${_dealModelProjectionHtml(initVals, currencySym)}
      </div>

    </div>
  `;
}

/* ─── Pure calculation ───────────────────────────────────────────────────────── */
function _dealModelCalcValues(p) {
  const rev            = +p.revenue        || 0;
  const ebitda         = +p.ebitda         || 0;
  const multiple       = +p.multiple       || 4.5;
  const price          = +p.purchasePrice  || ebitda * multiple;
  const equityFrac     = (+p.equityPct     || 0) / 100;
  const sbaFrac        = (+p.sbaPct        || 0) / 100;
  const sellerFrac     = (+p.sellerNotePct || 0) / 100;
  const sbaRate        = +p.sbaRate        || 0;
  const sbaTerm        = +p.sbaTerm        || 10;
  const sellerRate     = +p.sellerNoteRate || 0;
  const sellerTerm     = +p.sellerNoteTerm || 5;
  const growthRate     = (+p.growthRate    || 0) / 100;
  const exitMultiple   = +p.exitMultiple   || multiple;

  const equity      = price * equityFrac;
  const sbaLoan     = price * sbaFrac;
  const sellerNote  = price * sellerFrac;

  // Annualised loan payment (PMT)
  const pmtAnnual = (annualRatePct, years, pv) => {
    if (pv <= 0) return 0;
    if (annualRatePct === 0) return years > 0 ? pv / years : 0;
    const r = annualRatePct / 100 / 12;
    const n = years * 12;
    return pv * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) * 12;
  };

  const sbaService    = pmtAnnual(sbaRate, sbaTerm, sbaLoan);
  const sellerService = pmtAnnual(sellerRate, sellerTerm, sellerNote);
  const totalDS       = sbaService + sellerService;

  const dscr      = totalDS > 0 ? ebitda / totalDS : null;
  const year1FCF  = ebitda - totalDS;
  const cocReturn = equity > 0 ? year1FCF / equity * 100 : null;

  // Remaining loan balance after k monthly payments
  const remBal = (pv, annualRatePct, totalYears, elapsedYears) => {
    if (pv <= 0) return 0;
    const elapsedMonths = Math.min(elapsedYears * 12, totalYears * 12);
    if (elapsedMonths >= totalYears * 12) return 0;
    if (annualRatePct === 0) return pv * (1 - elapsedMonths / (totalYears * 12));
    const r  = annualRatePct / 100 / 12;
    const n  = totalYears * 12;
    const pmt = pv * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    const rem = totalYears * 12 - elapsedMonths;
    return pmt * (1 - Math.pow(1 + r, -rem)) / r;
  };

  // 5-year projection
  const margin = rev > 0 ? ebitda / rev : (price > 0 ? 0.2 : 0);
  const years  = [];
  let cumFCF   = 0;
  for (let y = 1; y <= 5; y++) {
    const yRev   = rev * Math.pow(1 + growthRate, y);
    const yEBITDA = yRev * margin;
    const yFCF   = yEBITDA - totalDS;
    cumFCF += yFCF;
    years.push({ year: y, rev: yRev, ebitda: yEBITDA, ds: totalDS, fcf: yFCF, cumFCF });
  }

  // Year-5 exit
  const y5EBITDA    = years[4]?.ebitda ?? 0;
  const exitValue   = y5EBITDA * exitMultiple;
  const remDebt5    = remBal(sbaLoan, sbaRate, sbaTerm, 5)
                    + remBal(sellerNote, sellerRate, sellerTerm, 5);
  const exitEquity  = Math.max(0, exitValue - remDebt5);
  const moic        = equity > 0 ? exitEquity / equity : null;

  return {
    price, equity, sbaLoan, sellerNote,
    sbaService, sellerService, totalDS,
    dscr, year1FCF, cocReturn,
    years, exitValue, exitEquity, moic,
    ebitda, rev,
    equityPct: +p.equityPct || 0,
    sbaPct:    +p.sbaPct    || 0,
    sellerPct: +p.sellerNotePct || 0,
  };
}

/* ─── Output metrics panel ───────────────────────────────────────────────────── */
function _dealModelOutputHtml(v, sym = '$') {
  const fmt = n => {
    if (n == null || isNaN(n)) return '—';
    if (Math.abs(n) >= 1e6) return sym + (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return sym + (n / 1e3).toFixed(0) + 'K';
    return sym + n.toFixed(0);
  };
  const pct = n => (n == null || isNaN(n)) ? '—' : n.toFixed(1) + '%';
  const x   = n => (n == null || isNaN(n)) ? '—' : n.toFixed(2) + 'x';

  // DSCR colour
  const dscrVal  = v.dscr;
  const dscrColor = dscrVal == null  ? 'text-surface-400'
                  : dscrVal >= 1.35  ? 'text-emerald-600 dark:text-emerald-400'
                  : dscrVal >= 1.10  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400';
  const dscrLabel = dscrVal == null  ? ''
                  : dscrVal >= 1.35  ? '✓ Strong'
                  : dscrVal >= 1.10  ? '⚠ Tight'
                  : '✗ Below 1.1';

  // CoC colour
  const cocColor = v.cocReturn == null     ? 'text-surface-400'
                 : v.cocReturn >= 20       ? 'text-emerald-600 dark:text-emerald-400'
                 : v.cocReturn >= 10       ? 'text-amber-600 dark:text-amber-400'
                 : 'text-red-600 dark:text-red-400';

  const metric = (label, value, sub, valueClass = '') => `
    <div class="card py-3 text-center">
      <p class="text-[11px] text-surface-500 font-medium">${label}</p>
      <p class="text-lg font-bold mt-0.5 ${valueClass}">${value}</p>
      ${sub ? `<p class="text-[11px] text-surface-400 mt-0.5">${sub}</p>` : ''}
    </div>`;

  return `
    <div class="space-y-4">

      <!-- Capital amounts -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">Capital Stack</p>
        <div class="grid grid-cols-3 gap-2">
          ${metric('Equity', fmt(v.equity), pct(v.equityPct), 'text-blue-600 dark:text-blue-400')}
          ${metric('Bank Loan', fmt(v.sbaLoan), pct(v.sbaPct), 'text-emerald-600 dark:text-emerald-400')}
          ${metric('Seller Note', fmt(v.sellerNote), pct(v.sellerPct), 'text-amber-600 dark:text-amber-400')}
        </div>
      </div>

      <!-- Purchase price big -->
      <div class="card py-4 text-center bg-brand-50 dark:bg-brand-900/10 border border-brand-100 dark:border-brand-800/30">
        <p class="text-xs text-brand-600 dark:text-brand-400 font-semibold uppercase tracking-wide">Purchase Price</p>
        <p class="text-3xl font-bold text-brand-700 dark:text-brand-300 mt-1">${fmt(v.price)}</p>
      </div>

      <!-- Debt service & coverage -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">Debt Service &amp; Coverage</p>
        <div class="grid grid-cols-2 gap-2">
          ${metric('Annual Debt Service', fmt(v.totalDS), fmt(v.sbaService) + ' bank + ' + fmt(v.sellerService) + ' note')}
          ${metric('DSCR', v.dscr != null ? v.dscr.toFixed(2) + 'x' : '—', dscrLabel, dscrColor)}
        </div>
      </div>

      <!-- Returns -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">Returns</p>
        <div class="grid grid-cols-2 gap-2">
          ${metric('Year 1 FCF', fmt(v.year1FCF), v.year1FCF >= 0 ? 'after debt service' : '⚠ negative', v.year1FCF >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600')}
          ${metric('Cash-on-Cash Yr 1', pct(v.cocReturn), 'FCF / equity', cocColor)}
          ${metric('Exit Value (Yr 5)', fmt(v.exitValue), x(v.moic != null ? v.moic : null) + ' MOIC')}
          ${metric('Exit Equity (Yr 5)', fmt(v.exitEquity), 'after remaining debt', v.moic != null && v.moic >= 2 ? 'text-emerald-600 dark:text-emerald-400' : '')}
        </div>
      </div>

    </div>`;
}

/* ─── 5-Year Projection Table ────────────────────────────────────────────────── */
function _dealModelProjectionHtml(v, sym = '$') {
  const fmt = n => {
    if (n == null || isNaN(n)) return '—';
    if (Math.abs(n) >= 1e6) return sym + (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return sym + (n / 1e3).toFixed(0) + 'K';
    return sym + n.toFixed(0);
  };
  const fcfColor = n => n >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold';

  const rows = v.years.map(y => `
    <tr class="border-t border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50">
      <td class="py-2.5 px-3 text-sm font-medium">Year ${y.year}</td>
      <td class="py-2.5 px-3 text-sm text-right">${fmt(y.rev)}</td>
      <td class="py-2.5 px-3 text-sm text-right">${fmt(y.ebitda)}</td>
      <td class="py-2.5 px-3 text-sm text-right text-surface-500">(${fmt(y.ds)})</td>
      <td class="py-2.5 px-3 text-sm text-right ${fcfColor(y.fcf)}">${fmt(y.fcf)}</td>
      <td class="py-2.5 px-3 text-sm text-right ${fcfColor(y.cumFCF)}">${fmt(y.cumFCF)}</td>
    </tr>
  `).join('');

  return `
    <div class="card overflow-x-auto">
      <h4 class="text-sm font-semibold mb-3">5-Year Cash Flow Projection</h4>
      <table class="w-full min-w-[560px]">
        <thead>
          <tr class="text-[11px] font-semibold text-surface-500 uppercase tracking-wide">
            <th class="pb-2 px-3 text-left">Year</th>
            <th class="pb-2 px-3 text-right">Revenue</th>
            <th class="pb-2 px-3 text-right">EBITDA</th>
            <th class="pb-2 px-3 text-right">Debt Service</th>
            <th class="pb-2 px-3 text-right">Free Cash Flow</th>
            <th class="pb-2 px-3 text-right">Cumulative FCF</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="border-t-2 border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50">
            <td class="py-2.5 px-3 text-sm font-semibold" colspan="4">Year 5 Exit (${fmt(v.exitValue)})</td>
            <td class="py-2.5 px-3 text-sm font-semibold text-right text-brand-600 dark:text-brand-400" colspan="2">Exit Equity: ${fmt(v.exitEquity)}</td>
          </tr>
        </tfoot>
      </table>
      <p class="text-[11px] text-surface-400 mt-3">
        Assumes stable EBITDA margin, constant annual debt service, and exit at Year 5 EBITDA × exit multiple.
        Bank financing modeled with monthly amortization. Seller note treated as interest-only-then-balloon if term &lt; 5 yrs.
      </p>
    </div>`;
}

/* ─── Live recalculation ─────────────────────────────────────────────────────── */
function _dealModelRecalc(manualPrice = false) {
  const g  = id => parseFloat(document.getElementById(id)?.value) || 0;
  const gs = id => document.getElementById(id);

  const revenue    = g('fm-revenue');
  const ebitda     = g('fm-ebitda');
  const multiple   = g('fm-multiple');
  const equityPct  = g('fm-equity-pct');
  const sbaPct     = g('fm-sba-pct');
  const sellerPct  = g('fm-seller-pct');
  const sbaRate    = g('fm-sba-rate');
  const sbaTerm    = g('fm-sba-term');
  const sellerRate = g('fm-seller-rate');
  const sellerTerm = g('fm-seller-term');
  const growthRate = g('fm-growth');
  const exitMultiple = g('fm-exit-multiple');

  // Sync multiple display label
  const dispEl = gs('fm-multiple-display');
  if (dispEl) dispEl.textContent = multiple.toFixed(1) + 'x';

  // Auto-compute purchase price when slider/ebitda changes (unless manually typed)
  let purchasePrice;
  if (manualPrice) {
    purchasePrice = g('fm-purchase-price');
  } else {
    purchasePrice = ebitda * multiple;
    const priceEl = gs('fm-purchase-price');
    if (priceEl) priceEl.value = Math.round(purchasePrice);
  }

  // Update capital stack bar
  const bar = gs('fm-stack-bar');
  if (bar) {
    bar.innerHTML = `
      <div class="bg-blue-500 transition-all duration-300" style="width:${Math.min(equityPct, 100)}%"></div>
      <div class="bg-emerald-500 transition-all duration-300" style="width:${Math.min(sbaPct, 100 - equityPct)}%"></div>
      <div class="bg-amber-500 transition-all duration-300" style="width:${Math.min(sellerPct, Math.max(0, 100 - equityPct - sbaPct))}%"></div>`;
  }

  // Read currency from DOM
  const currencySymbols = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$' };
  const currencyCode = gs('fm-currency')?.value || 'USD';
  const sym = currencySymbols[currencyCode] || '$';

  const vals = _dealModelCalcValues({
    revenue, ebitda, multiple, purchasePrice,
    equityPct, sbaPct, sellerNotePct: sellerPct,
    sbaRate, sbaTerm, sellerNoteRate: sellerRate, sellerNoteTerm: sellerTerm,
    growthRate, exitMultiple,
  });

  const out = gs('fm-output');
  if (out) out.innerHTML = _dealModelOutputHtml(vals, sym);

  const proj = gs('fm-projection');
  if (proj) proj.innerHTML = _dealModelProjectionHtml(vals, sym);
}

/* ─── Save model to deal record ──────────────────────────────────────────────── */
async function saveDealFinancialModel() {
  const g  = id => parseFloat(document.getElementById(id)?.value) || 0;
  const gs = id => document.getElementById(id);
  try {
    const deal = await DB.get(STORES.deals, currentDealId);
    if (!deal) return;
    deal.financialModel = {
      currency:       gs('fm-currency')?.value || 'USD',
      revenue:        g('fm-revenue'),
      ebitda:         g('fm-ebitda'),
      multiple:       g('fm-multiple'),
      purchasePrice:  g('fm-purchase-price'),
      equityPct:      g('fm-equity-pct'),
      sbaPct:         g('fm-sba-pct'),
      sellerNotePct:  g('fm-seller-pct'),
      sbaRate:        g('fm-sba-rate'),
      sbaTerm:        g('fm-sba-term'),
      sellerNoteRate: g('fm-seller-rate'),
      sellerNoteTerm: g('fm-seller-term'),
      growthRate:     g('fm-growth'),
      exitMultiple:   g('fm-exit-multiple'),
      savedAt:        new Date().toISOString(),
    };
    deal.updatedAt = new Date().toISOString();
    await DB.put(STORES.deals, deal);
    await logDealHistory(currentDealId, 'updated', { field: 'financialModel', note: 'Financial model saved' });
    showToast('Financial model saved', 'success');
  } catch (err) {
    showToast('Could not save model: ' + err.message, 'error');
  }
}

/* ─── AI Financial Model Analysis ───────────────────────────────────────────── */
async function runDealModelAI() {
  // Snapshot current values from DOM
  const g  = id => parseFloat(document.getElementById(id)?.value) || 0;
  const gs = id => document.getElementById(id);

  const currencyCode = gs('fm-currency')?.value || 'USD';
  const currencySymbols = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$' };
  const sym = currencySymbols[currencyCode] || '$';

  const fmt = n => {
    if (n == null || isNaN(n)) return '—';
    if (Math.abs(n) >= 1e6) return sym + (n / 1e6).toFixed(2) + 'M';
    if (Math.abs(n) >= 1e3) return sym + (n / 1e3).toFixed(0) + 'K';
    return sym + n.toFixed(0);
  };

  const vals = _dealModelCalcValues({
    revenue:       g('fm-revenue'),
    ebitda:        g('fm-ebitda'),
    multiple:      g('fm-multiple'),
    purchasePrice: g('fm-purchase-price'),
    equityPct:     g('fm-equity-pct'),
    sbaPct:        g('fm-sba-pct'),
    sellerNotePct: g('fm-seller-pct'),
    sbaRate:       g('fm-sba-rate'),
    sbaTerm:       g('fm-sba-term'),
    sellerNoteRate: g('fm-seller-rate'),
    sellerNoteTerm: g('fm-seller-term'),
    growthRate:    g('fm-growth'),
    exitMultiple:  g('fm-exit-multiple'),
  });

  const deal = await DB.get(STORES.deals, currentDealId);
  const dealName = deal?.name || 'this deal';

  openModal(`
    <div class="flex items-start gap-3 mb-4">
      <div class="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
        <svg class="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
        </svg>
      </div>
      <div>
        <h3 class="text-base font-semibold">AI Financial Analysis</h3>
        <p class="text-xs text-surface-500 mt-0.5">Reviewing deal structure for <strong>${escapeHtml(dealName)}</strong></p>
      </div>
    </div>

    <!-- Key metrics snapshot -->
    <div class="grid grid-cols-3 gap-2 mb-4">
      <div class="rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800 p-2.5 text-center">
        <p class="text-[11px] text-surface-500">Purchase Price</p>
        <p class="text-sm font-bold mt-0.5">${fmt(vals.price)}</p>
      </div>
      <div class="rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800 p-2.5 text-center">
        <p class="text-[11px] text-surface-500">DSCR</p>
        <p class="text-sm font-bold mt-0.5 ${vals.dscr >= 1.35 ? 'text-emerald-600' : vals.dscr >= 1.10 ? 'text-amber-600' : 'text-red-600'}">${vals.dscr != null ? vals.dscr.toFixed(2) + 'x' : '—'}</p>
      </div>
      <div class="rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800 p-2.5 text-center">
        <p class="text-[11px] text-surface-500">Year 1 CoC</p>
        <p class="text-sm font-bold mt-0.5">${vals.cocReturn != null ? vals.cocReturn.toFixed(1) + '%' : '—'}</p>
      </div>
    </div>

    <div id="dmai-result" class="hidden bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-700 p-4 mb-4 max-h-80 overflow-y-auto">
      <div id="dmai-text" class="text-sm text-surface-700 dark:text-surface-300 leading-relaxed whitespace-pre-wrap"></div>
    </div>

    <div class="flex justify-end gap-2">
      <button onclick="closeModal()" class="btn-secondary">Close</button>
      <button id="dmai-btn" onclick="_runDealModelAIGenerate()" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
        </svg>
        Analyse Deal Structure
      </button>
    </div>
  `);

  // Store vals on window temporarily for the modal's generate function
  window._dmaiVals = { vals, fmt, dealName, currencyCode };
}

async function _runDealModelAIGenerate() {
  const { vals, fmt, dealName, currencyCode } = window._dmaiVals || {};
  if (!vals) return;

  const btn = document.getElementById('dmai-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Analysing…'; }

  const systemPrompt = `You are an expert search fund advisor with deep experience in SMB acquisitions.
Analyse the financial model provided and give concise, actionable feedback.
Structure your response with clear sections: Deal Structure Assessment, DSCR Analysis, Return Profile, Key Risks, and One Recommendation.
Be direct and specific. Under 350 words.`;

  const userPrompt = `Analyse this search fund acquisition model:

Deal: ${dealName} (${currencyCode})
Purchase Price: ${fmt(vals.price)}
EBITDA: ${fmt(vals.ebitda)} | Revenue: ${fmt(vals.rev)}
EV/EBITDA Multiple: ${vals.price > 0 && vals.ebitda > 0 ? (vals.price / vals.ebitda).toFixed(1) + 'x' : 'N/A'}

Capital Stack:
- Equity: ${fmt(vals.equity)} (${vals.equityPct.toFixed(1)}%)
- Bank Financing: ${fmt(vals.sbaLoan)} (${vals.sbaPct.toFixed(1)}%) — Annual: ${fmt(vals.sbaService)}
- Seller Note: ${fmt(vals.sellerNote)} (${vals.sellerPct.toFixed(1)}%) — Annual: ${fmt(vals.sellerService)}
- Total Annual Debt Service: ${fmt(vals.totalDS)}

Coverage & Returns:
- DSCR: ${vals.dscr != null ? vals.dscr.toFixed(2) + 'x' : 'N/A'}
- Year 1 Free Cash Flow: ${fmt(vals.year1FCF)}
- Year 1 Cash-on-Cash Return: ${vals.cocReturn != null ? vals.cocReturn.toFixed(1) + '%' : 'N/A'}
- Year 5 Exit Value: ${fmt(vals.exitValue)} | Exit Equity: ${fmt(vals.exitEquity)}
- MOIC: ${vals.moic != null ? vals.moic.toFixed(2) + 'x' : 'N/A'}`;

  try {
    const analysis = await callAI(systemPrompt, userPrompt, 600, 0.4);
    const textEl   = document.getElementById('dmai-text');
    const result   = document.getElementById('dmai-result');
    if (textEl) textEl.textContent = analysis;
    if (result) result.classList.remove('hidden');
  } catch (err) {
    showToast('AI analysis failed: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Re-analyse'; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// === FINANCIALS TAB — Historical charts & financial dashboard per deal =========
// ═══════════════════════════════════════════════════════════════════════════════

async function renderDealFinancialsTab() {
  const deal = await DB.get(STORES.deals, currentDealId);
  if (!deal) return '';

  const history    = deal.financialHistory || [];
  const hasHistory = history.length > 0;

  const docs    = await DB.getAllByIndex(STORES.dealDocuments, 'dealId', currentDealId);
  const hasDocs = docs.some(d => d.userId === currentUser.id && (d.extractedText || d.extractedTables));

  const sym     = fxSymbol(deal.currency);
  const fmt$    = n => n != null ? fmtDealMoney(n, sym) : '—';
  const margin  = deal.revenue && deal.ebitda
    ? ((deal.ebitda / deal.revenue) * 100).toFixed(1) + '%' : '—';
  const multiple = deal.askingMultiple
    ? deal.askingMultiple.toFixed(1) + 'x'
    : (deal.askingPrice && deal.ebitda
      ? (deal.askingPrice / deal.ebitda).toFixed(1) + 'x' : '—');

  const snapshotCards = [
    { label: 'Revenue (TTM)',  value: fmt$(deal.revenue),  note: deal.revenue  ? 'annual' : 'not set' },
    { label: 'EBITDA (TTM)',   value: fmt$(deal.ebitda),   note: deal.ebitda   ? margin + ' margin' : 'not set' },
    { label: 'EBITDA Margin',  value: margin,              note: margin !== '—' ? 'operating efficiency' : 'need rev + EBITDA' },
    { label: 'EV / EBITDA',    value: multiple,            note: multiple !== '—' ? 'asking multiple' : 'need price + EBITDA' },
  ].map(s => `
    <div class="card p-4 text-center">
      <p class="text-xs text-surface-500 mb-1">${s.label}</p>
      <p class="text-xl font-bold">${s.value}</p>
      <p class="text-xs text-surface-400 mt-0.5">${s.note}</p>
    </div>
  `).join('');

  const tableRows = history.map((h, i) => {
    const prev      = i > 0 ? history[i - 1].revenue : null;
    const growth    = h.revenue && prev ? ((h.revenue - prev) / prev * 100) : null;
    const ebitdaM   = h.ebitdaMargin != null ? h.ebitdaMargin
      : (h.revenue && h.ebitda ? (h.ebitda / h.revenue * 100) : null);
    const growthStr = growth != null
      ? `<span class="${growth >= 0 ? 'text-green-600' : 'text-red-600'} font-medium">${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%</span>`
      : '<span class="text-surface-400">—</span>';
    return `
      <tr class="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors ${h.isProjected ? 'opacity-60 italic' : ''}">
        <td class="py-2.5 pr-4 font-medium whitespace-nowrap">${escapeHtml(h.label || String(h.year))}${h.isProjected ? ' <span class="text-xs text-surface-400 not-italic">(proj.)</span>' : ''}</td>
        <td class="py-2.5 pr-4 text-right font-semibold">${h.revenue  != null ? fmtDealMoney(h.revenue,  sym) : '<span class="text-surface-400">—</span>'}</td>
        <td class="py-2.5 pr-4 text-right">${growthStr}</td>
        <td class="py-2.5 pr-4 text-right font-semibold">${h.ebitda   != null ? fmtDealMoney(h.ebitda,   sym) : '<span class="text-surface-400">—</span>'}</td>
        <td class="py-2.5 pr-4 text-right ${ebitdaM != null ? (ebitdaM >= 20 ? 'text-green-600 font-semibold' : 'text-yellow-600') : ''}">${ebitdaM != null ? ebitdaM.toFixed(1) + '%' : '<span class="text-surface-400">—</span>'}</td>
        <td class="py-2.5 text-right">${h.grossMargin != null ? h.grossMargin.toFixed(1) + '%' : '<span class="text-surface-400">—</span>'}</td>
      </tr>
    `;
  }).join('');

  const historySection = hasHistory ? `
    <!-- Charts row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card">
        <h3 class="text-sm font-semibold mb-4">Revenue &amp; EBITDA</h3>
        <div style="position:relative;height:220px;"><canvas id="fin-rev-chart"></canvas></div>
      </div>
      <div class="card">
        <h3 class="text-sm font-semibold mb-4">Margin Trends (%)</h3>
        <div style="position:relative;height:220px;"><canvas id="fin-margin-chart"></canvas></div>
      </div>
    </div>

    <!-- History table -->
    <div class="card overflow-x-auto">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold">Annual History (${history.length} year${history.length !== 1 ? 's' : ''})</h3>
        <div class="flex items-center gap-2">
          <button onclick="_openFinancialHistoryEntry('${currentDealId}')" class="btn-secondary btn-sm">+ Add Year</button>
          <button onclick="_refreshFinancialHistory('${currentDealId}')" class="btn-secondary btn-sm flex items-center gap-1.5" title="Re-extract from all uploaded documents">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            Refresh from Docs
          </button>
        </div>
      </div>
      <table class="w-full text-sm min-w-[540px]">
        <thead>
          <tr class="border-b border-surface-200 dark:border-surface-700">
            <th class="text-left py-2 pr-4 text-xs font-semibold text-surface-500 uppercase tracking-wide">Year</th>
            <th class="text-right py-2 pr-4 text-xs font-semibold text-surface-500 uppercase tracking-wide">Revenue</th>
            <th class="text-right py-2 pr-4 text-xs font-semibold text-surface-500 uppercase tracking-wide">YoY Growth</th>
            <th class="text-right py-2 pr-4 text-xs font-semibold text-surface-500 uppercase tracking-wide">EBITDA</th>
            <th class="text-right py-2 pr-4 text-xs font-semibold text-surface-500 uppercase tracking-wide">EBITDA %</th>
            <th class="text-right py-2 text-xs font-semibold text-surface-500 uppercase tracking-wide">Gross Margin</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  ` : `
    <!-- Empty state -->
    <div class="card text-center py-12">
      <div class="w-14 h-14 rounded-full bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mx-auto mb-4">
        <svg class="w-7 h-7 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>
        </svg>
      </div>
      <h3 class="text-sm font-semibold mb-2">No Financial History Yet</h3>
      <p class="text-sm text-surface-500 mb-6 max-w-sm mx-auto">Upload financial statements or P&amp;L reports to automatically extract multi-year data and display it as interactive charts. You can also enter data manually.</p>
      <div class="flex flex-wrap items-center justify-center gap-3">
        ${hasDocs ? `
        <button onclick="_refreshFinancialHistory('${currentDealId}')" class="btn-primary flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
          Extract from Existing Documents
        </button>` : ''}
        <button onclick="switchDealTab('documents')" class="btn-secondary flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
          Upload Financial Statements
        </button>
        <button onclick="_openFinancialHistoryEntry('${currentDealId}')" class="btn-secondary flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          Enter Manually
        </button>
      </div>
    </div>
  `;

  return `
    <div class="space-y-6">
      <!-- Snapshot metrics -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">${snapshotCards}</div>

      ${historySection}

      ${hasHistory ? `
      <div class="card flex items-center justify-between gap-4">
        <div>
          <p class="text-sm font-semibold">Add or correct a year</p>
          <p class="text-xs text-surface-400 mt-0.5">Manually enter or adjust historical data for any period.</p>
        </div>
        <button onclick="_openFinancialHistoryEntry('${currentDealId}')" class="btn-secondary btn-sm flex-shrink-0 flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          Add Year
        </button>
      </div>
      ` : ''}
    </div>
  `;
}

/* ─── Chart initializer — called after HTML is injected into the DOM ─────────── */
async function _initFinancialChartsForDeal(dealId) {
  if (typeof Chart === 'undefined') return;

  const deal    = await DB.get(STORES.deals, dealId).catch(() => null);
  const history = deal?.financialHistory || [];
  if (!history.length) return;

  const sym  = fxSymbol(deal?.currency);

  // Choose chart divisor/unit based on current format preference
  const chartUnit = (() => {
    switch (_dealNumFormat) {
      case 'K':   return { div: 1e3,   label: 'K' };
      case 'raw': return { div: 1,     label: '' };
      case 'M':
      default:    return { div: 1e6,   label: 'M' };
    }
  })();

  const labels        = history.map(h => h.label || String(h.year));
  const revenues      = history.map(h => h.revenue  != null ? +(h.revenue  / chartUnit.div).toFixed(3) : null);
  const ebitdas       = history.map(h => h.ebitda   != null ? +(h.ebitda   / chartUnit.div).toFixed(3) : null);
  const ebitdaMargins = history.map(h => {
    if (h.ebitdaMargin != null) return +h.ebitdaMargin.toFixed(1);
    if (h.revenue && h.ebitda)  return +((h.ebitda / h.revenue) * 100).toFixed(1);
    return null;
  });
  const grossMargins  = history.map(h => h.grossMargin != null ? +h.grossMargin.toFixed(1) : null);

  const isDark  = document.documentElement.classList.contains('dark');
  const gridCol = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const textCol = isDark ? '#94a3b8'                : '#64748b';

  // ── Revenue & EBITDA grouped bar chart ──────────────────────────────────────
  const revEl = document.getElementById('fin-rev-chart');
  if (revEl) {
    if (revEl._chart) revEl._chart.destroy();
    revEl._chart = new Chart(revEl, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: `Revenue (${sym}${chartUnit.label})`,
            data: revenues,
            backgroundColor: history.map(h => h.isProjected ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.75)'),
            borderColor:     'rgba(99,102,241,1)',
            borderWidth: 1, borderRadius: 4,
          },
          {
            label: `EBITDA (${sym}${chartUnit.label})`,
            data: ebitdas,
            backgroundColor: history.map(h => h.isProjected ? 'rgba(34,197,94,0.30)' : 'rgba(34,197,94,0.70)'),
            borderColor:     'rgba(34,197,94,1)',
            borderWidth: 1, borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textCol, font: { size: 11 } } } },
        scales: {
          x: { grid: { color: gridCol }, ticks: { color: textCol, font: { size: 11 } } },
          y: { grid: { color: gridCol }, ticks: { color: textCol, font: { size: 11 }, callback: v => sym + v + chartUnit.label } },
        },
      },
    });
  }

  // ── Margin line chart ────────────────────────────────────────────────────────
  const marginEl   = document.getElementById('fin-margin-chart');
  const hasEbitdaM = ebitdaMargins.some(v => v != null);
  const hasGrossM  = grossMargins.some(v => v != null);
  if (marginEl && (hasEbitdaM || hasGrossM)) {
    if (marginEl._chart) marginEl._chart.destroy();
    const datasets = [];
    if (hasEbitdaM) datasets.push({
      label: 'EBITDA Margin (%)',
      data: ebitdaMargins,
      borderColor: 'rgba(168,85,247,1)',
      backgroundColor: 'rgba(168,85,247,0.12)',
      fill: true, tension: 0.35,
      pointRadius: 4, pointBackgroundColor: 'rgba(168,85,247,1)',
    });
    if (hasGrossM) datasets.push({
      label: 'Gross Margin (%)',
      data: grossMargins,
      borderColor: 'rgba(249,115,22,1)',
      backgroundColor: 'rgba(249,115,22,0.10)',
      fill: true, tension: 0.35,
      pointRadius: 4, pointBackgroundColor: 'rgba(249,115,22,1)',
    });
    marginEl._chart = new Chart(marginEl, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textCol, font: { size: 11 } } } },
        scales: {
          x: { grid: { color: gridCol }, ticks: { color: textCol, font: { size: 11 } } },
          y: { grid: { color: gridCol }, ticks: { color: textCol, font: { size: 11 }, callback: v => v + '%' } },
        },
      },
    });
  }
}
