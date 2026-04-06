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

let dealsViewMode = 'board'; // 'board' or 'table'
let dealsFilter = { stage: 'active', source: '', search: '', sort: 'newest' };

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

  const deals = await DB.getForUser(STORES.deals, currentUser.id);
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
         <button onclick="openNewDealModal()" class="btn-primary btn-sm">+ New Deal</button>`
      )}

      <!-- Stats Row -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        ${renderStatCard('Active Deals', activeDeals.length, '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>', 'brand')}
        ${renderStatCard('Hot Deals', hotDeals.length, '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" /></svg>', 'red')}
        ${renderStatCard('In Diligence', activeDeals.filter(d => ['Due Diligence', 'Exclusivity'].includes(d.stage)).length, '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>', 'purple')}
        ${renderStatCard('Overdue Tasks', overdueTasks.length, '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>', 'yellow')}
        ${renderStatCard('Total Deals', deals.length, '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" /></svg>', 'green')}
      </div>

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
          <button onclick="dealsViewMode='board'; renderDeals()" class="px-3 py-2 text-sm ${dealsViewMode === 'board' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600' : 'text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800'}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" /></svg>
          </button>
          <button onclick="dealsViewMode='table'; renderDeals()" class="px-3 py-2 text-sm ${dealsViewMode === 'table' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600' : 'text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800'}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" /></svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      ${dealsViewMode === 'board' ? renderDealsPipelineBoard(filtered) : renderDealsTableView(filtered)}
    </div>
  `;
}

// === PIPELINE BOARD (KANBAN) ===
function renderDealsPipelineBoard(deals) {
  const stageGroups = {};
  DEAL_ACTIVE_STAGES.forEach(s => stageGroups[s] = []);
  deals.filter(d => DEAL_ACTIVE_STAGES.includes(d.stage)).forEach(d => {
    if (stageGroups[d.stage]) stageGroups[d.stage].push(d);
  });

  // Only show stages that have deals or are nearby the active stages
  const usedStages = DEAL_ACTIVE_STAGES.filter(s => stageGroups[s].length > 0);
  const displayStages = usedStages.length > 0 ? DEAL_ACTIVE_STAGES : DEAL_ACTIVE_STAGES.slice(0, 6);

  return `
    <div class="overflow-x-auto pb-4">
      <div class="flex gap-4" style="min-width: ${displayStages.length * 260}px">
        ${displayStages.map(stage => {
          const stageDeals = stageGroups[stage] || [];
          const color = DEAL_STAGE_COLORS[stage] || 'gray';
          return `
            <div class="flex-shrink-0 w-[240px]" data-stage="${stage}"
              ondragover="event.preventDefault(); this.classList.add('ring-2', 'ring-brand-400', 'rounded-xl')"
              ondragleave="this.classList.remove('ring-2', 'ring-brand-400', 'rounded-xl')"
              ondrop="onDealDrop(event, '${stage}'); this.classList.remove('ring-2', 'ring-brand-400', 'rounded-xl')">
              <div class="flex items-center justify-between mb-3 px-1">
                <div class="flex items-center gap-2">
                  <div class="w-2 h-2 rounded-full bg-${color}-500"></div>
                  <span class="text-xs font-semibold text-surface-600 dark:text-surface-400">${escapeHtml(stage)}</span>
                </div>
                <span class="text-xs text-surface-400 bg-surface-100 dark:bg-surface-800 rounded-full px-2 py-0.5">${stageDeals.length}</span>
              </div>
              <div class="space-y-2 min-h-[100px]">
                ${stageDeals.map(deal => renderDealCard(deal)).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderDealCard(deal) {
  const hasScore = deal.score !== null && deal.score !== undefined;
  return `
    <div class="card p-3 cursor-pointer hover:shadow-md transition-shadow group"
      draggable="true"
      ondragstart="event.dataTransfer.setData('text/plain', '${deal.id}'); event.dataTransfer.effectAllowed='move'"
      onclick="viewDeal('${deal.id}')">
      <div class="flex items-start justify-between mb-1">
        <h4 class="text-sm font-medium truncate flex-1">${escapeHtml(deal.name)}</h4>
        ${deal.priority === 'high' ? '<span class="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-1.5"></span>' : ''}
      </div>
      ${deal.sector ? `<p class="text-xs text-surface-500 truncate">${escapeHtml(deal.sector)}</p>` : ''}
      <div class="flex items-center gap-2 mt-2">
        ${deal.revenue ? `<span class="text-xs text-surface-400">$${(deal.revenue / 1e6).toFixed(1)}M</span>` : ''}
        ${deal.ebitda ? `<span class="text-xs text-surface-400">${deal.revenue ? ((deal.ebitda / deal.revenue) * 100).toFixed(0) + '%' : '$' + (deal.ebitda / 1e6).toFixed(1) + 'M'}</span>` : ''}
        ${hasScore ? renderScoreBadge(deal.score) : ''}
      </div>
      ${deal.nextActionDate ? `<p class="text-xs mt-1.5 ${new Date(deal.nextActionDate) < new Date() ? 'text-red-500 font-medium' : 'text-surface-400'}">${deal.nextAction ? escapeHtml(deal.nextAction) : 'Follow-up'}: ${formatDate(deal.nextActionDate)}</p>` : ''}
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
                  <td class="font-medium">${deal.revenue ? '$' + (deal.revenue / 1e6).toFixed(1) + 'M' : '—'}</td>
                  <td class="font-medium">${deal.ebitda ? '$' + (deal.ebitda / 1e6).toFixed(1) + 'M' : '—'}</td>
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
      <!-- PDF Import Banner -->
      <div class="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-xl p-3">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-brand-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
          <div class="flex-1">
            <p class="text-xs font-medium text-brand-800 dark:text-brand-200">Import from CIM / Teaser PDF</p>
            <p class="text-xs text-brand-600 dark:text-brand-400">Auto-fill deal fields using AI (requires OpenAI key in Settings)</p>
          </div>
          <label id="deal-pdf-label" class="btn-secondary btn-sm cursor-pointer whitespace-nowrap">
            <input type="file" id="deal-pdf-import" accept=".pdf,.PDF" class="hidden" onchange="importDealFromPDF(this)" />
            📄 Upload PDF
          </label>
        </div>
        <div id="deal-pdf-status" class="hidden mt-2 text-xs text-brand-700 dark:text-brand-300 flex items-center gap-2">
          <svg class="w-3 h-3 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
          <span id="deal-pdf-status-text">Processing…</span>
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
        <h3 class="text-sm font-semibold mb-3">Financials</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Revenue ($)</label>
            <input type="number" id="deal-revenue" class="input-field" value="${deal?.revenue || ''}" placeholder="5000000" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">EBITDA ($)</label>
            <input type="number" id="deal-ebitda" class="input-field" value="${deal?.ebitda || ''}" placeholder="1000000" oninput="updateDealMultiple()" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Asking Price ($)</label>
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
      <div class="bg-surface-50 dark:bg-surface-800 rounded-xl p-3">
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
          <label class="flex items-center gap-2 p-3 border-2 border-surface-200 dark:border-surface-700 rounded-xl cursor-pointer hover:border-brand-400 has-[:checked]:border-red-500 has-[:checked]:bg-red-50 dark:has-[:checked]:bg-red-900/10">
            <input type="radio" name="kill-stage" value="Closed - Lost" class="accent-red-500" checked />
            <div><p class="text-sm font-medium">Closed — Lost</p><p class="text-xs text-surface-500">Passed on or lost to competitor</p></div>
          </label>
          <label class="flex items-center gap-2 p-3 border-2 border-surface-200 dark:border-surface-700 rounded-xl cursor-pointer hover:border-brand-400 has-[:checked]:border-gray-500 has-[:checked]:bg-gray-50 dark:has-[:checked]:bg-gray-900/10">
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

  const statusEl = document.getElementById('deal-pdf-status');
  const statusText = document.getElementById('deal-pdf-status-text');
  const label = document.getElementById('deal-pdf-label');

  function setStatus(msg) {
    if (statusEl) statusEl.classList.remove('hidden');
    if (statusText) statusText.textContent = msg;
  }
  function clearStatus(msg, isError) {
    if (statusEl) statusEl.classList.add('hidden');
    if (label) label.style.opacity = '1';
    if (msg) showToast(msg, isError ? 'error' : 'success');
  }

  if (file.size > 25 * 1024 * 1024) { clearStatus('File too large (max 25MB)', true); return; }
  if (label) label.style.opacity = '0.5';

  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  if (!settings?.openaiApiKey && !settings?.claudeApiKey) {
    clearStatus('Add an OpenAI or Claude API key in Settings first', true);
    return;
  }

  // Step 1: Read file
  setStatus('Reading PDF file…');
  let base64;
  try {
    base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  } catch (err) {
    clearStatus('Could not read file: ' + err.message, true);
    return;
  }

  // Step 2: Extract text from PDF using pdf.js
  setStatus('Extracting text from PDF…');
  let text = '';
  try {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF library not loaded');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const rawB64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const binaryStr = atob(rawB64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const pagesToRead = Math.min(pdf.numPages, 30);
    for (let i = 1; i <= pagesToRead; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    text = text.trim();
  } catch (err) {
    clearStatus('PDF text extraction failed: ' + err.message, true);
    return;
  }

  if (!text || text.length < 30) {
    clearStatus('No readable text found in PDF. The document may be image-based or scanned.', true);
    return;
  }

  // Step 3: Smart text trimming — take first 2500 + last 1500 chars to cover intro + financials
  const trimmedText = text.length > 4000
    ? text.substring(0, 2500) + '\n...\n' + text.substring(text.length - 1500)
    : text;

  // Step 3: Try AI parsing, fall back to regex if quota exceeded
  setStatus(`Extracted ${text.length} chars — parsing…`);

  let parsed = null;
  let usedFallback = false;

  if (settings.openaiApiKey || settings.claudeApiKey) {
    try {
      const raw = await callAI(
        'Extract deal info from the document. Return ONLY a JSON object, no markdown.',
        `Return JSON with these fields (null if not found): companyName, sector (one of: Business Services,Healthcare Services,Technology,Industrial,Consumer,Education,Construction / Trades,Distribution,Food & Beverage,Financial Services,Other), location, revenue (USD number), ebitda (USD number), askingPrice (USD number), employeeCount (integer), description (2-3 sentences).\n\n${trimmedText}`,
        500, 0.1
      );
      let content = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      try { parsed = JSON.parse(content); } catch { usedFallback = true; }
    } catch (err) {
      // Quota / rate-limit / billing errors → fall back to regex silently
      if (err.message.match(/quota|limit|billing|insufficient|overload|429|402/i)) {
        setStatus('API limit reached — using pattern extraction…');
        usedFallback = true;
      } else {
        clearStatus('AI parsing failed: ' + err.message, true);
        return;
      }
    }
  } else {
    usedFallback = true;
  }

  // Regex fallback — extract numbers and common patterns without AI
  if (usedFallback || !parsed) {
    parsed = parseDealTextWithRegex(text);
  }

  try {
    // Apply fields to form
    let filled = [];
    const setField = (id, val) => {
      if (val == null || val === '') return;
      const el = document.getElementById(id);
      if (el) { el.value = val; filled.push(id); }
    };

    if (parsed.companyName) setField('deal-name', parsed.companyName);
    if (parsed.sector) {
      const sel = document.getElementById('deal-sector');
      if (sel) {
        const exact = DEAL_SECTORS.find(s => s.toLowerCase() === (parsed.sector || '').toLowerCase());
        const partial = DEAL_SECTORS.find(s => s.toLowerCase().includes((parsed.sector || '').toLowerCase()) || (parsed.sector || '').toLowerCase().includes(s.toLowerCase().split(' ')[0]));
        if (exact) { sel.value = exact; filled.push('sector'); }
        else if (partial) { sel.value = partial; filled.push('sector'); }
      }
    }
    setField('deal-location', parsed.location);
    setField('deal-revenue', parsed.revenue);
    setField('deal-ebitda', parsed.ebitda);
    setField('deal-asking-price', parsed.askingPrice);
    setField('deal-employees', parsed.employeeCount);
    setField('deal-description', parsed.description);
    if (parsed.thesis) setField('deal-thesis', parsed.thesis);
    updateDealMultiple();
    if (filled.length === 0) {
      clearStatus('Could not extract data from this document. Try a text-based (not scanned) PDF.', true);
    } else {
      const method = usedFallback ? ' (pattern extraction — no AI credits used)' : '';
      clearStatus(`✓ Populated ${filled.length} field${filled.length !== 1 ? 's' : ''}${method}`, false);
    }
  } catch (err) {
    clearStatus('Parsing failed: ' + err.message, true);
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
