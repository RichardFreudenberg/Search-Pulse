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

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>' },
    { id: 'notes', label: 'Notes', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>' },
    { id: 'documents', label: 'Documents', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>' },
    { id: 'diligence', label: 'AI Diligence', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>' },
    { id: 'tasks', label: 'Tasks', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>' },
    { id: 'scoring', label: 'Scoring', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>' },
    { id: 'history', label: 'History', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>' },
    { id: 'nda', label: 'NDA Review', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 6.627 5.373 12 12 12s12-5.373 12-12c0-2.13-.558-4.128-1.534-5.856"/></svg>' },
    { id: 'dd', label: 'Due Diligence', icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" /></svg>' },
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
        <div class="flex items-center gap-2">
          <button onclick="openEditDealModal('${dealId}')" class="btn-secondary btn-sm">Edit</button>
          ${!['Closed - Won', 'Closed - Lost', 'Rejected'].includes(deal.stage) ? `<button onclick="openKillDealModal('${dealId}', '${escapeHtml(deal.name).replace(/'/g, "\\'")}')" class="btn-secondary btn-sm text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/10">Kill Deal</button>` : ''}
          <button onclick="deleteDeal('${dealId}')" class="btn-danger btn-sm">Delete</button>
        </div>
      </div>

      <!-- Quick Stats Row -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div class="card p-3 text-center">
          <p class="text-xs text-surface-500">Revenue</p>
          <p class="text-lg font-bold">${deal.revenue ? '$' + (deal.revenue / 1e6).toFixed(1) + 'M' : '—'}</p>
        </div>
        <div class="card p-3 text-center">
          <p class="text-xs text-surface-500">EBITDA</p>
          <p class="text-lg font-bold">${deal.ebitda ? '$' + (deal.ebitda / 1e6).toFixed(1) + 'M' : '—'}</p>
        </div>
        <div class="card p-3 text-center">
          <p class="text-xs text-surface-500">Margin</p>
          <p class="text-lg font-bold">${deal.revenue && deal.ebitda ? ((deal.ebitda / deal.revenue) * 100).toFixed(0) + '%' : '—'}</p>
        </div>
        <div class="card p-3 text-center">
          <p class="text-xs text-surface-500">Ask Price</p>
          <p class="text-lg font-bold">${deal.askingPrice ? '$' + (deal.askingPrice / 1e6).toFixed(1) + 'M' : '—'}</p>
        </div>
        <div class="card p-3 text-center">
          <p class="text-xs text-surface-500">Multiple</p>
          <p class="text-lg font-bold">${deal.askingMultiple ? deal.askingMultiple + 'x' : '—'}</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 overflow-x-auto pb-2 mb-6 border-b border-surface-200 dark:border-surface-800">
        ${tabs.map(t => `
          <button onclick="switchDealTab('${t.id}')" class="deal-tab flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${currentDealTab === t.id ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50/50 dark:bg-brand-900/20' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'}" data-tab="${t.id}">
            ${t.icon} ${t.label}
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
    case 'overview': container.innerHTML = await renderDealOverviewTab(); break;
    case 'notes': container.innerHTML = await renderDealNotesTab(); break;
    case 'documents': container.innerHTML = await renderDealDocsTab(); break;
    case 'diligence': container.innerHTML = await renderDealDiligenceTab(); break;
    case 'tasks': container.innerHTML = await renderDealTasksTab(); break;
    case 'scoring': container.innerHTML = await renderDealScoringTab(); break;
    case 'history': container.innerHTML = await renderDealHistoryTab(); break;
    case 'nda': container.innerHTML = renderDealNdaTab(currentDealId); break;
    case 'dd': container.innerHTML = await renderDealDDTab(currentDealId); break;
    default: container.innerHTML = await renderDealOverviewTab();
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
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
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

  return `
    <div>
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-sm font-semibold">${docs.length} document${docs.length !== 1 ? 's' : ''}</h3>
        <button onclick="openDocUploadModal('${currentDealId}')" class="btn-primary btn-sm">+ Upload Document</button>
      </div>

      ${missing.length > 0 ? `
        <div class="bg-yellow-50 dark:bg-yellow-900/15 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 mb-4">
          <div class="flex items-center gap-2 mb-1">
            <svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
            <span class="text-xs font-semibold text-yellow-700 dark:text-yellow-400">Missing Documents</span>
          </div>
          <p class="text-xs text-yellow-600 dark:text-yellow-300">For better AI diligence, upload: ${missing.map(m => m.label).join(', ')}</p>
        </div>
      ` : ''}

      ${docs.length === 0 ? `
        <div class="card text-center py-8">
          <p class="text-sm text-surface-500">No documents uploaded yet. Upload CIMs, financials, or other deal materials.</p>
        </div>
      ` : `
        <div class="space-y-2">
          ${docs.map(doc => renderDocumentCard(doc)).join('')}
        </div>
      `}
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
          <div class="p-2 rounded-xl bg-brand-100 dark:bg-brand-900/30">
            <svg class="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
          </div>
          <div>
            <h3 class="text-sm font-semibold">AI Due Diligence</h3>
            <p class="text-xs text-surface-500">${docCount} documents uploaded, ${extractedCount} with extracted text</p>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          ${Object.entries(DILIGENCE_TYPES).filter(([k]) => k !== 'qa_response').map(([type, info]) => `
            <button onclick="startDiligenceRun('${currentDealId}', '${type}')" class="p-2.5 rounded-xl border border-surface-200 dark:border-surface-700 hover:border-brand-400 dark:hover:border-brand-600 bg-white dark:bg-surface-900 text-left transition-all hover:shadow-sm group">
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
      <div class="p-4 bg-surface-50 dark:bg-surface-800 rounded-xl">
        <p class="text-xs text-surface-400 mb-2">Q: ${escapeHtml(question)}</p>
        <div class="text-sm deal-ai-output">${renderMarkdown(result.response)}</div>
        <p class="text-xs text-surface-400 mt-2">${result.tokensUsed} tokens &bull; ${(result.durationMs / 1000).toFixed(1)}s</p>
      </div>
    `;
  } catch (err) {
    resultDiv.innerHTML = `<p class="text-sm text-red-500 p-3">${escapeHtml(err.message)}</p>`;
  }
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
        <button onclick="openDealTaskModal('${currentDealId}')" class="btn-primary btn-sm">+ Add Task</button>
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
    <div class="flex items-start gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-700 ${isOverdue ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' : ''}">
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
          <div class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
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
