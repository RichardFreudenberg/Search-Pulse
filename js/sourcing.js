/* ============================================
   Pulse CRM — Deal Sourcing Campaign Tracker
   ============================================ */

const CAMPAIGN_STATUSES = ['Active', 'Paused', 'Completed', 'Closed'];
const CAMPAIGN_TYPES = ['Cold Outreach', 'Broker Blast', 'Referral Drive', 'Conference Follow-up', 'Online Listing', 'Industry Association', 'Other'];

const SOURCING_SECTOR_COLORS = {
  'Business Services': '#3b82f6', 'Healthcare Services': '#10b981', 'Technology': '#8b5cf6',
  'Industrial': '#f97316', 'Consumer': '#ec4899', 'Education': '#06b6d4',
  'Construction / Trades': '#f59e0b', 'Distribution': '#6366f1',
  'Food & Beverage': '#22c55e', 'Financial Services': '#a855f7', 'Other': '#6b7280',
};

// === MAIN RENDER ===
async function renderSourcing() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto">${renderLoadingSkeleton(4)}</div>`;

  const [campaigns, contacts, deals] = await Promise.all([
    DB.getForUser(STORES.sourcingCampaigns, currentUser.id),
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.deals, currentUser.id),
  ]);

  // Enrich each campaign with contact/deal counts
  const enriched = campaigns.map(c => ({
    ...c,
    contactCount: contacts.filter(ct => ct.campaignId === c.id).length,
    dealCount: deals.filter(d => d.campaignId === c.id).length,
  }));

  const active = enriched.filter(c => c.status === 'Active');
  const totalOutreach = enriched.reduce((s, c) => s + (c.outreachCount || 0), 0);
  const totalResponses = enriched.reduce((s, c) => s + (c.responseCount || 0), 0);
  const totalCalls = enriched.reduce((s, c) => s + (c.callCount || 0), 0);
  const totalDeals = enriched.reduce((s, c) => s + c.dealCount, 0);
  const overallConversion = totalOutreach > 0 ? ((totalResponses / totalOutreach) * 100).toFixed(1) : null;

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      ${renderPageHeader('Sourcing Campaigns',
        `${active.length} active campaign${active.length !== 1 ? 's' : ''} · ${totalOutreach} total outreach`,
        `<button onclick="openNewCampaignModal()" class="btn-primary btn-sm">+ New Campaign</button>`
      )}

      <!-- Stats Row -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        ${renderStatCard('Active Campaigns', active.length,
          '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>',
          'brand', '')}
        ${renderStatCard('Outreach Sent', totalOutreach,
          '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>',
          'blue', '')}
        ${renderStatCard('Responses', totalResponses + (overallConversion ? ` (${overallConversion}%)` : ''),
          '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>',
          'green', '')}
        ${renderStatCard('Deals Sourced', totalDeals,
          '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>',
          'purple', '')}
      </div>

      ${enriched.length === 0 ? `
        <div class="card text-center py-16">
          <svg class="w-12 h-12 mx-auto text-surface-300 dark:text-surface-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></svg>
          <h3 class="text-lg font-semibold mb-2">No campaigns yet</h3>
          <p class="text-sm text-surface-500 mb-6 max-w-sm mx-auto">Track your outbound sourcing efforts — cold email campaigns, broker blasts, referral drives, and more.</p>
          <button onclick="openNewCampaignModal()" class="btn-primary">Create First Campaign</button>
        </div>
      ` : `
        <!-- Campaign Cards -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          ${enriched.sort((a, b) => {
            const order = { 'Active': 0, 'Paused': 1, 'Completed': 2, 'Closed': 3 };
            return (order[a.status] || 0) - (order[b.status] || 0) || new Date(b.createdAt) - new Date(a.createdAt);
          }).map(c => renderCampaignCard(c)).join('')}
        </div>

        <!-- Sector breakdown -->
        ${(() => {
          const sectorGroups = {};
          enriched.forEach(c => {
            if (c.sector) sectorGroups[c.sector] = (sectorGroups[c.sector] || 0) + (c.outreachCount || 0);
          });
          const sectors = Object.entries(sectorGroups).sort((a, b) => b[1] - a[1]);
          const maxVal = sectors.length > 0 ? sectors[0][1] : 1;
          if (sectors.length === 0) return '';
          return `
            <div class="card mb-6">
              <h3 class="text-sm font-semibold mb-4">Outreach by Sector</h3>
              <div class="space-y-2.5">
                ${sectors.map(([sector, count]) => {
                  const color = SOURCING_SECTOR_COLORS[sector] || '#6b7280';
                  return `
                    <div class="flex items-center gap-3">
                      <span class="text-xs text-surface-600 dark:text-surface-400 w-36 flex-shrink-0 truncate font-medium">${escapeHtml(sector)}</span>
                      <div class="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-2">
                        <div class="h-2 rounded-full transition-all" style="width:${Math.round(count / maxVal * 100)}%; background:${color}"></div>
                      </div>
                      <span class="text-xs font-semibold text-surface-700 dark:text-surface-300 w-8 text-right flex-shrink-0">${count}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        })()}
      `}
    </div>
  `;
}

function renderCampaignCard(c) {
  const responseRate = c.outreachCount > 0 ? ((c.responseCount || 0) / c.outreachCount * 100).toFixed(0) : null;
  const callRate = c.responseCount > 0 ? ((c.callCount || 0) / c.responseCount * 100).toFixed(0) : null;
  const statusColors = { 'Active': '#22c55e', 'Paused': '#f59e0b', 'Completed': '#6366f1', 'Closed': '#6b7280' };
  const statusColor = statusColors[c.status] || '#6b7280';

  return `
    <div class="card hover:shadow-md transition-shadow cursor-pointer" onclick="viewCampaign('${c.id}')">
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5">
            <h3 class="font-semibold truncate">${escapeHtml(c.name)}</h3>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style="background:${statusColor}20; color:${statusColor}">${c.status}</span>
          </div>
          <p class="text-xs text-surface-400">${c.type || 'Campaign'} ${c.sector ? `· ${escapeHtml(c.sector)}` : ''} ${c.geography ? `· ${escapeHtml(c.geography)}` : ''}</p>
        </div>
        <div class="flex gap-1 ml-2 flex-shrink-0">
          <button onclick="event.stopPropagation(); openEditCampaignModal('${c.id}')" class="p-1.5 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 transition-colors" title="Edit">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
          </button>
        </div>
      </div>

      <!-- Funnel metrics -->
      <div class="grid grid-cols-4 gap-2 mb-3">
        ${[
          { label: 'Outreach', value: c.outreachCount || 0, color: '#6366f1' },
          { label: 'Responses', value: c.responseCount || 0, sub: responseRate ? responseRate + '%' : null, color: '#3b82f6' },
          { label: 'Calls', value: c.callCount || 0, sub: callRate ? callRate + '%' : null, color: '#22c55e' },
          { label: 'Deals', value: c.dealCount || 0, color: '#a855f7' },
        ].map(m => `
          <div class="text-center p-2 rounded-lg bg-surface-50 dark:bg-surface-800">
            <p class="text-lg font-bold" style="color:${m.color}">${m.value}</p>
            <p class="text-[10px] text-surface-400 leading-tight">${m.label}</p>
            ${m.sub ? `<p class="text-[10px] font-semibold text-surface-500">${m.sub}</p>` : ''}
          </div>
        `).join('')}
      </div>

      <!-- Funnel bar visualization -->
      ${c.outreachCount > 0 ? `
        <div class="space-y-1">
          ${[
            { label: 'Response rate', val: c.responseCount || 0, max: c.outreachCount, color: '#3b82f6' },
            { label: 'Call rate', val: c.callCount || 0, max: c.outreachCount, color: '#22c55e' },
            { label: 'Deal rate', val: c.dealCount || 0, max: c.outreachCount, color: '#a855f7' },
          ].map(b => `
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-surface-400 w-20 flex-shrink-0">${b.label}</span>
              <div class="flex-1 bg-surface-100 dark:bg-surface-700 rounded-full h-1.5">
                <div class="h-1.5 rounded-full" style="width:${Math.min(100, Math.round(b.val / b.max * 100))}%; background:${b.color}"></div>
              </div>
              <span class="text-[10px] font-medium text-surface-500 w-8 text-right">${Math.min(100, Math.round(b.val / b.max * 100))}%</span>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-xs text-surface-400 text-center py-1">Log outreach to track progress</p>`}

      ${c.notes ? `<p class="text-xs text-surface-400 mt-3 pt-3 border-t border-surface-100 dark:border-surface-800 line-clamp-2">${escapeHtml(c.notes)}</p>` : ''}
    </div>
  `;
}

// === CAMPAIGN DETAIL VIEW ===
async function viewCampaign(campaignId) {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-5xl mx-auto">${renderLoadingSkeleton(4)}</div>`;

  const [campaign, allContacts, allDeals] = await Promise.all([
    DB.get(STORES.sourcingCampaigns, campaignId),
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.deals, currentUser.id),
  ]);
  if (!campaign) { showToast('Campaign not found', 'error'); navigate('sourcing'); return; }

  const contacts = allContacts.filter(c => c.campaignId === campaignId);
  const deals = allDeals.filter(d => d.campaignId === campaignId);
  const responseRate = campaign.outreachCount > 0 ? ((campaign.responseCount || 0) / campaign.outreachCount * 100).toFixed(0) : null;

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <button onclick="navigate('sourcing')" class="text-sm text-brand-600 hover:text-brand-700 font-medium mb-4 inline-flex items-center gap-1">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
        Back to Campaigns
      </button>

      <div class="flex items-start justify-between mb-6">
        <div>
          <h1 class="text-2xl font-semibold">${escapeHtml(campaign.name)}</h1>
          <p class="text-sm text-surface-500 mt-1">${campaign.type || 'Campaign'} ${campaign.sector ? '· ' + escapeHtml(campaign.sector) : ''} ${campaign.geography ? '· ' + escapeHtml(campaign.geography) : ''}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="openEditCampaignModal('${campaignId}')" class="btn-secondary btn-sm">Edit</button>
          <button onclick="deleteCampaign('${campaignId}')" class="btn-danger btn-sm">Delete</button>
        </div>
      </div>

      <!-- Funnel metrics -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        ${[
          { label: 'Outreach Sent', value: campaign.outreachCount || 0, sub: 'total contacts reached', color: '#6366f1' },
          { label: 'Responses', value: campaign.responseCount || 0, sub: responseRate ? responseRate + '% response rate' : 'no outreach yet', color: '#3b82f6' },
          { label: 'Calls Booked', value: campaign.callCount || 0, sub: campaign.responseCount > 0 ? Math.round((campaign.callCount || 0) / campaign.responseCount * 100) + '% of responses' : '—', color: '#22c55e' },
          { label: 'Deals Sourced', value: deals.length, sub: deals.length > 0 ? deals.filter(d => !['Closed - Lost','Rejected'].includes(d.stage)).length + ' still active' : 'none yet', color: '#a855f7' },
        ].map(m => `
          <div class="card p-4 text-center">
            <p class="text-2xl font-bold" style="color:${m.color}">${m.value}</p>
            <p class="text-sm font-medium text-surface-700 dark:text-surface-300 mt-0.5">${m.label}</p>
            <p class="text-xs text-surface-400 mt-0.5">${m.sub}</p>
          </div>
        `).join('')}
      </div>

      <!-- Log activity panel -->
      <div class="card mb-6">
        <h3 class="text-sm font-semibold mb-3">Log Activity</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button onclick="logCampaignActivity('${campaignId}', 'outreach')" class="p-3 rounded-lg border-2 border-dashed border-surface-300 dark:border-surface-600 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all text-center">
            <p class="text-lg font-bold text-brand-600">+</p>
            <p class="text-xs font-medium mt-0.5">Log Outreach</p>
            <p class="text-[10px] text-surface-400">Emails / calls sent</p>
          </button>
          <button onclick="logCampaignActivity('${campaignId}', 'response')" class="p-3 rounded-lg border-2 border-dashed border-surface-300 dark:border-surface-600 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all text-center">
            <p class="text-lg font-bold text-green-600">+</p>
            <p class="text-xs font-medium mt-0.5">Log Response</p>
            <p class="text-[10px] text-surface-400">Reply received</p>
          </button>
          <button onclick="logCampaignActivity('${campaignId}', 'call')" class="p-3 rounded-lg border-2 border-dashed border-surface-300 dark:border-surface-600 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all text-center">
            <p class="text-lg font-bold text-purple-600">+</p>
            <p class="text-xs font-medium mt-0.5">Log Call</p>
            <p class="text-[10px] text-surface-400">Conversation held</p>
          </button>
          <button onclick="openNewDealModal(); /* pre-fill campaignId */" class="p-3 rounded-lg border-2 border-dashed border-surface-300 dark:border-surface-600 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all text-center">
            <p class="text-lg font-bold text-amber-600">+</p>
            <p class="text-xs font-medium mt-0.5">Add Deal</p>
            <p class="text-[10px] text-surface-400">From this campaign</p>
          </button>
        </div>
      </div>

      <!-- Contacts from this campaign -->
      <div class="card mb-6">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold">Contacts (${contacts.length})</h3>
          <button onclick="openNewContactModal({campaignId: '${campaignId}'})" class="btn-secondary btn-sm text-xs">+ Add Contact</button>
        </div>
        ${contacts.length === 0 ? `<p class="text-sm text-surface-400 text-center py-4">No contacts linked to this campaign yet.</p>` : `
          <div class="space-y-1">
            ${contacts.slice(0, 10).map(c => `
              <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer" onclick="viewContact('${c.id}')">
                ${renderAvatar(c.fullName, c.photoUrl, 'sm')}
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">${escapeHtml(c.fullName)}</p>
                  <p class="text-xs text-surface-400 truncate">${escapeHtml(c.title || '')} ${c.relationshipType ? '· ' + escapeHtml(c.relationshipType) : ''}</p>
                </div>
                ${renderStageBadge(c.stage)}
              </div>
            `).join('')}
            ${contacts.length > 10 ? `<p class="text-xs text-center text-brand-600 py-1">${contacts.length - 10} more — <button onclick="navigate('contacts')" class="hover:underline">view all contacts</button></p>` : ''}
          </div>
        `}
      </div>

      <!-- Deals from this campaign -->
      ${deals.length > 0 ? `
        <div class="card">
          <h3 class="text-sm font-semibold mb-3">Deals Sourced (${deals.length})</h3>
          <div class="space-y-2">
            ${deals.map(d => {
              const hex = DEAL_STAGE_HEX[DEAL_STAGE_COLORS[d.stage] || 'gray'] || '#6b7280';
              return `
                <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer" onclick="viewDeal('${d.id}')">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium">${escapeHtml(d.name)}</p>
                    <p class="text-xs text-surface-400">${d.sector || ''}</p>
                  </div>
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background:${hex}20; color:${hex}">${escapeHtml(d.stage)}</span>
                  ${d.revenue ? `<span class="text-xs text-surface-500">$${(d.revenue / 1e6).toFixed(1)}M</span>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      ${campaign.notes ? `
        <div class="card mt-6">
          <h3 class="text-sm font-semibold mb-2">Notes</h3>
          <p class="text-sm text-surface-600 dark:text-surface-400 whitespace-pre-wrap">${escapeHtml(campaign.notes)}</p>
        </div>
      ` : ''}
    </div>
  `;
}

// === LOG ACTIVITY ===
async function logCampaignActivity(campaignId, type) {
  const labels = { outreach: 'outreach sent', response: 'responses received', call: 'calls booked' };
  const fields = { outreach: 'outreachCount', response: 'responseCount', call: 'callCount' };

  const countStr = prompt(`How many ${labels[type] || type}? (enter a number to add)`);
  if (!countStr) return;
  const n = parseInt(countStr);
  if (isNaN(n) || n <= 0) { showToast('Please enter a valid number', 'error'); return; }

  const campaign = await DB.get(STORES.sourcingCampaigns, campaignId);
  if (!campaign) return;
  campaign[fields[type]] = (campaign[fields[type]] || 0) + n;
  await DB.put(STORES.sourcingCampaigns, campaign);
  showToast(`+${n} ${labels[type]} logged`, 'success');
  viewCampaign(campaignId);
}

// === NEW / EDIT CAMPAIGN MODAL ===
async function openNewCampaignModal(prefill = {}) {
  _renderCampaignModal(null, prefill);
}

async function openEditCampaignModal(campaignId) {
  const campaign = await DB.get(STORES.sourcingCampaigns, campaignId);
  if (!campaign) return;
  _renderCampaignModal(campaignId, campaign);
}

function _renderCampaignModal(campaignId, data = {}) {
  const isEdit = !!campaignId;
  openModal(`
    <div class="p-6">
      <h2 class="text-lg font-semibold mb-5">${isEdit ? 'Edit Campaign' : 'New Sourcing Campaign'}</h2>
      <form id="campaign-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Campaign Name *</label>
          <input type="text" id="camp-name" class="input-field" placeholder="e.g. Southeast HVAC Outreach Q1" required value="${escapeHtml(data.name || '')}" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Campaign Type</label>
            <select id="camp-type" class="input-field">
              <option value="">— Select type —</option>
              ${CAMPAIGN_TYPES.map(t => `<option value="${t}" ${(data.type || '') === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Status</label>
            <select id="camp-status" class="input-field">
              ${CAMPAIGN_STATUSES.map(s => `<option value="${s}" ${(data.status || 'Active') === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Target Sector</label>
            <select id="camp-sector" class="input-field">
              <option value="">All sectors</option>
              ${DEAL_SECTORS.map(s => `<option value="${s}" ${(data.sector || '') === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Geography</label>
            <input type="text" id="camp-geography" class="input-field" placeholder="e.g. Southeast US" value="${escapeHtml(data.geography || '')}" />
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Revenue Target Range</label>
            <input type="text" id="camp-revenue-range" class="input-field" placeholder="e.g. $2M–$10M" value="${escapeHtml(data.revenueRange || '')}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Start Date</label>
            <input type="date" id="camp-start-date" class="input-field" value="${data.startDate ? data.startDate.substring(0, 10) : ''}" />
          </div>
        </div>
        ${isEdit ? `
          <div class="grid grid-cols-3 gap-3 p-3 rounded-lg bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
            <div>
              <label class="block text-xs font-medium text-surface-500 mb-1">Outreach Sent</label>
              <input type="number" id="camp-outreach" class="input-field text-center" min="0" value="${data.outreachCount || 0}" />
            </div>
            <div>
              <label class="block text-xs font-medium text-surface-500 mb-1">Responses</label>
              <input type="number" id="camp-responses" class="input-field text-center" min="0" value="${data.responseCount || 0}" />
            </div>
            <div>
              <label class="block text-xs font-medium text-surface-500 mb-1">Calls Booked</label>
              <input type="number" id="camp-calls" class="input-field text-center" min="0" value="${data.callCount || 0}" />
            </div>
          </div>
        ` : ''}
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Notes / Strategy</label>
          <textarea id="camp-notes" class="input-field" rows="3" placeholder="Describe your outreach approach, target criteria, messaging strategy…">${escapeHtml(data.notes || '')}</textarea>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
          <button type="submit" class="btn-primary">${isEdit ? 'Save Changes' : 'Create Campaign'}</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('campaign-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('camp-name').value.trim();
    if (!name) return;

    const payload = {
      userId: currentUser.id,
      name,
      type: document.getElementById('camp-type').value,
      status: document.getElementById('camp-status').value || 'Active',
      sector: document.getElementById('camp-sector').value,
      geography: document.getElementById('camp-geography').value.trim(),
      revenueRange: document.getElementById('camp-revenue-range').value.trim(),
      startDate: document.getElementById('camp-start-date').value || null,
      notes: document.getElementById('camp-notes').value.trim(),
    };

    if (isEdit) {
      payload.outreachCount = parseInt(document.getElementById('camp-outreach')?.value) || 0;
      payload.responseCount = parseInt(document.getElementById('camp-responses')?.value) || 0;
      payload.callCount = parseInt(document.getElementById('camp-calls')?.value) || 0;
      const existing = await DB.get(STORES.sourcingCampaigns, campaignId);
      await DB.put(STORES.sourcingCampaigns, { ...existing, ...payload });
      closeModal();
      showToast('Campaign updated', 'success');
      viewCampaign(campaignId);
    } else {
      payload.outreachCount = 0;
      payload.responseCount = 0;
      payload.callCount = 0;
      const newCampaign = await DB.add(STORES.sourcingCampaigns, payload);
      closeModal();
      showToast('Campaign created', 'success');
      viewCampaign(newCampaign.id);
    }
  });
}

// === DELETE ===
async function deleteCampaign(campaignId) {
  confirmDialog('Delete Campaign', 'This will permanently delete this campaign. Contacts linked to it will not be deleted.', async () => {
    await DB.delete(STORES.sourcingCampaigns, campaignId);
    showToast('Campaign deleted', 'success');
    navigate('sourcing');
  });
}
