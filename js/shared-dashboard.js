/* ============================================
   Pulse — Shareable Dashboard
   ============================================ */

const SHARE_SECTIONS = [
  { id: 'crm_stats', label: 'CRM Overview (contacts, calls, follow-ups)' },
  { id: 'relationship_health', label: 'Relationship Health Breakdown' },
  { id: 'stage_distribution', label: 'Contact Stage Distribution' },
  { id: 'deal_pipeline', label: 'Deal Pipeline Summary' },
  { id: 'deal_sourcing', label: 'Deal Sourcing Breakdown' },
  { id: 'deal_financials', label: 'Deal Financials (revenue, EBITDA ranges)' },
  { id: 'recent_activity', label: 'Recent Activity Feed' },
  { id: 'top_contacts', label: 'Top Contacts List' },
];

function openShareDashboardModal() {
  const checkboxes = SHARE_SECTIONS.map(s => `
    <label class="flex items-center gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800 cursor-pointer transition-colors">
      <input type="checkbox" class="share-section-cb w-4 h-4 rounded text-brand-600" value="${s.id}" checked />
      <span class="text-sm">${s.label}</span>
    </label>
  `).join('');

  openModal('Share Dashboard', `
    <div class="p-6 space-y-4">
      <p class="text-sm text-surface-600 dark:text-surface-400">Select what to include in the shared view. Recipients open the link — no login required.</p>
      <div class="space-y-2">${checkboxes}</div>
      <div class="pt-2 border-t border-surface-200 dark:border-surface-800">
        <label class="block text-sm font-medium mb-1">Recipient email (for mailto link)</label>
        <input type="email" id="share-recipient-email" class="input-field" placeholder="colleague@example.com" />
      </div>
      <div class="flex justify-end gap-3 pt-2">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="generateShareLink()" class="btn-primary">Generate Share Link</button>
      </div>
    </div>
  `);
}

async function generateShareLink() {
  const selected = Array.from(document.querySelectorAll('.share-section-cb:checked')).map(cb => cb.value);
  if (selected.length === 0) {
    showToast('Select at least one section to share', 'warning');
    return;
  }

  const recipientEmail = document.getElementById('share-recipient-email')?.value || '';

  // Gather data for selected sections
  const [contacts, companies, calls, deals] = await Promise.all([
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.companies, currentUser.id),
    DB.getForUser(STORES.calls, currentUser.id),
    DB.getAll(STORES.deals).then(all => all.filter(d => d.userId === currentUser.id)),
  ]);

  const active = contacts.filter(c => !c.archived);
  const overdue = active.filter(c => c.nextFollowUpDate && new Date(c.nextFollowUpDate) < new Date());
  const stageCount = {};
  active.forEach(c => { stageCount[c.stage] = (stageCount[c.stage] || 0) + 1; });

  const sourceCount = {};
  deals.forEach(d => { if (d.source) sourceCount[d.source] = (sourceCount[d.source] || 0) + 1; });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    generatedBy: currentUser.name,
    sections: selected,
    data: {
      crm: {
        totalContacts: active.length,
        totalCompanies: companies.length,
        totalCalls: calls.length,
        overdueFollowUps: overdue.length,
        stageDistribution: stageCount,
        recentContacts: active.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 8).map(c => ({ name: c.name, title: c.title, company: c.companyName, stage: c.stage })),
      },
      deals: {
        total: deals.length,
        active: deals.filter(d => !['Closed - Won','Closed - Lost','Rejected'].includes(d.stage)).length,
        pipelineValue: deals.filter(d => !['Closed - Lost','Rejected'].includes(d.stage))
          .reduce((s, d) => s + (d.askingPrice || 0), 0),
        byStage: deals.reduce((acc, d) => { acc[d.stage] = (acc[d.stage] || 0) + 1; return acc; }, {}),
        bySource: sourceCount,
        list: deals.map(d => ({
          name: d.name, stage: d.stage, source: d.source, sector: d.sector,
          revenue: d.revenue, ebitda: d.ebitda, askingPrice: d.askingPrice, priority: d.priority,
        })),
      },
    },
  };

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))));
  const shareUrl = `${location.origin}${location.pathname}#shared/${encoded}`;

  const subject = encodeURIComponent(`${currentUser.name} shared a Pulse Dashboard`);
  const body = encodeURIComponent(`Hi,\n\n${currentUser.name} has shared a CRM & Deal Pipeline dashboard with you.\n\nOpen the link below to view it (no login required):\n${shareUrl}\n\n— Sent via Pulse`);
  const mailtoLink = recipientEmail
    ? `mailto:${recipientEmail}?subject=${subject}&body=${body}`
    : `mailto:?subject=${subject}&body=${body}`;

  openModal('Share Link Ready', `
    <div class="p-6 space-y-4">
      <div class="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
        <svg class="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        <span class="text-sm text-green-700 dark:text-green-300 font-medium">Dashboard snapshot created — ${selected.length} sections included</span>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Share link</label>
        <div class="flex gap-2">
          <input type="text" id="share-url-display" class="input-field text-xs font-mono flex-1" readonly value="${shareUrl.substring(0, 80)}..." />
          <button onclick="copyShareUrl(${JSON.stringify(shareUrl)})" class="btn-secondary text-sm px-3">Copy</button>
        </div>
      </div>
      <div class="flex flex-col sm:flex-row gap-3 pt-2">
        <a href="${mailtoLink}" class="btn-primary text-center text-sm flex-1">
          Open Email Client
        </a>
        <button onclick="copyShareUrl(${JSON.stringify(shareUrl)}); closeModal();" class="btn-secondary text-sm flex-1">Copy & Close</button>
      </div>
      <p class="text-xs text-surface-400 text-center">Recipients can view this snapshot without logging in. Data is embedded in the URL.</p>
    </div>
  `);
}

function copyShareUrl(url) {
  navigator.clipboard.writeText(url).then(() => showToast('Share link copied!', 'success'));
}

// Called on app load — check if URL contains a shared dashboard hash
function checkSharedDashboardRoute() {
  const hash = location.hash;
  if (!hash.startsWith('#shared/')) return false;

  const encoded = hash.slice('#shared/'.length);
  try {
    const snapshot = JSON.parse(decodeURIComponent(escape(atob(encoded))));
    renderSharedDashboardView(snapshot);
    return true;
  } catch (e) {
    console.error('Invalid share link', e);
    return false;
  }
}

function renderSharedDashboardView(snapshot) {
  // Hide auth screen, hide app shell, show shared view
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.add('hidden');

  let sharedView = document.getElementById('shared-view');
  if (!sharedView) {
    sharedView = document.createElement('div');
    sharedView.id = 'shared-view';
    sharedView.className = 'min-h-screen bg-surface-50 dark:bg-surface-950';
    document.body.appendChild(sharedView);
  }
  sharedView.classList.remove('hidden');

  const d = snapshot.data;
  const sections = snapshot.sections;
  const fmt = (n) => n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n}`;

  let html = `
    <div class="max-w-5xl mx-auto p-6 space-y-6 animate-fade-in">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div class="flex items-center gap-3 mb-1">
            <div class="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5"/></svg>
            </div>
            <h1 class="text-xl font-bold">Pulse — Shared Dashboard</h1>
          </div>
          <p class="text-sm text-surface-500">Shared by <strong>${escapeHtml(snapshot.generatedBy)}</strong> · Generated ${new Date(snapshot.generatedAt).toLocaleDateString()}</p>
        </div>
        <span class="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-3 py-1 rounded-full font-medium">Read-only snapshot</span>
      </div>
  `;

  if (sections.includes('crm_stats')) {
    html += `
      <div class="card">
        <h2 class="text-base font-semibold mb-4">CRM Overview</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          ${[
            ['Contacts', d.crm.totalContacts],
            ['Companies', d.crm.totalCompanies],
            ['Calls Logged', d.crm.totalCalls],
            ['Overdue Follow-ups', d.crm.overdueFollowUps],
          ].map(([label, val]) => `
            <div class="text-center p-4 bg-surface-50 dark:bg-surface-800 rounded-xl">
              <p class="text-2xl font-bold text-brand-600">${val}</p>
              <p class="text-xs text-surface-500 mt-1">${label}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (sections.includes('stage_distribution') && d.crm.stageDistribution) {
    const stages = Object.entries(d.crm.stageDistribution).filter(([,v]) => v > 0);
    html += `
      <div class="card">
        <h2 class="text-base font-semibold mb-4">Contact Stage Distribution</h2>
        <div class="space-y-2">
          ${stages.map(([stage, count]) => {
            const max = Math.max(...stages.map(([,v]) => v));
            const pct = max ? Math.round(count / max * 100) : 0;
            return `
              <div class="flex items-center gap-3">
                <span class="text-xs text-surface-500 w-32 truncate">${stage}</span>
                <div class="flex-1 bg-surface-200 dark:bg-surface-700 rounded-full h-2">
                  <div class="bg-brand-500 h-2 rounded-full" style="width:${pct}%"></div>
                </div>
                <span class="text-xs font-medium w-6 text-right">${count}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  if (sections.includes('deal_pipeline') && d.deals) {
    html += `
      <div class="card">
        <h2 class="text-base font-semibold mb-4">Deal Pipeline</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <div class="text-center p-4 bg-surface-50 dark:bg-surface-800 rounded-xl">
            <p class="text-2xl font-bold text-brand-600">${d.deals.total}</p>
            <p class="text-xs text-surface-500 mt-1">Total Deals</p>
          </div>
          <div class="text-center p-4 bg-surface-50 dark:bg-surface-800 rounded-xl">
            <p class="text-2xl font-bold text-green-600">${d.deals.active}</p>
            <p class="text-xs text-surface-500 mt-1">Active Deals</p>
          </div>
          <div class="text-center p-4 bg-surface-50 dark:bg-surface-800 rounded-xl col-span-2 sm:col-span-1">
            <p class="text-2xl font-bold text-purple-600">${fmt(d.deals.pipelineValue)}</p>
            <p class="text-xs text-surface-500 mt-1">Pipeline Value</p>
          </div>
        </div>
        ${d.deals.list && sections.includes('deal_financials') ? `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="border-b border-surface-200 dark:border-surface-700">
                <th class="text-left pb-2 text-surface-500 font-medium text-xs">Company</th>
                <th class="text-left pb-2 text-surface-500 font-medium text-xs">Stage</th>
                <th class="text-right pb-2 text-surface-500 font-medium text-xs">Revenue</th>
                <th class="text-right pb-2 text-surface-500 font-medium text-xs">Ask Price</th>
              </tr></thead>
              <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
                ${d.deals.list.slice(0, 10).map(deal => `
                  <tr>
                    <td class="py-2 font-medium">${escapeHtml(deal.name)}</td>
                    <td class="py-2 text-surface-500 text-xs">${deal.stage || '—'}</td>
                    <td class="py-2 text-right text-xs">${deal.revenue ? fmt(deal.revenue) : '—'}</td>
                    <td class="py-2 text-right text-xs">${deal.askingPrice ? fmt(deal.askingPrice) : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>
    `;
  }

  if (sections.includes('deal_sourcing') && d.deals?.bySource) {
    const sources = Object.entries(d.deals.bySource).filter(([,v]) => v > 0);
    const maxSrc = Math.max(...sources.map(([,v]) => v));
    html += `
      <div class="card">
        <h2 class="text-base font-semibold mb-4">Deal Sourcing</h2>
        <div class="space-y-2">
          ${sources.map(([src, count]) => `
            <div class="flex items-center gap-3">
              <span class="text-xs text-surface-500 w-28 truncate">${src}</span>
              <div class="flex-1 bg-surface-200 dark:bg-surface-700 rounded-full h-2">
                <div class="bg-purple-500 h-2 rounded-full" style="width:${maxSrc ? Math.round(count/maxSrc*100) : 0}%"></div>
              </div>
              <span class="text-xs font-medium w-6 text-right">${count}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (sections.includes('top_contacts') && d.crm.recentContacts?.length) {
    html += `
      <div class="card">
        <h2 class="text-base font-semibold mb-4">Recent Contacts</h2>
        <div class="space-y-2">
          ${d.crm.recentContacts.map(c => `
            <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800">
              <div class="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-brand-700 dark:text-brand-300 font-semibold text-sm">${escapeHtml(c.name.charAt(0))}</div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium truncate">${escapeHtml(c.name)}</p>
                <p class="text-xs text-surface-500 truncate">${escapeHtml(c.title || '')}${c.company ? ' · ' + escapeHtml(c.company) : ''}</p>
              </div>
              <span class="text-xs text-surface-400">${c.stage || ''}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  html += `
      <div class="text-center py-4 border-t border-surface-200 dark:border-surface-800">
        <p class="text-xs text-surface-400">Generated by Pulse · <a href="${location.origin}${location.pathname}" class="text-brand-500 hover:underline">Get your own</a></p>
      </div>
    </div>
  `;

  sharedView.innerHTML = html;
}
