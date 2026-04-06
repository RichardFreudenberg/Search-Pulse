/* ============================================
   Nexus CRM — Dashboard (Adjustable Layout)
   ============================================ */

// Default widget order — users can drag to reorder
const DEFAULT_WIDGET_ORDER = [
  'stats',
  'call-stats',
  'follow-ups',
  'pipeline',
  'recent-calls',
  'recent-contacts',
  'relationship-health',
];

// Widget visibility defaults
const DEFAULT_WIDGET_VISIBILITY = {
  'stats': true,
  'call-stats': true,
  'follow-ups': true,
  'pipeline': true,
  'recent-calls': true,
  'recent-contacts': true,
  'relationship-health': true,
};

async function getDashboardLayout() {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  return {
    order: settings?.dashboardWidgetOrder || [...DEFAULT_WIDGET_ORDER],
    visibility: settings?.dashboardWidgetVisibility || { ...DEFAULT_WIDGET_VISIBILITY },
  };
}

async function saveDashboardLayout(order, visibility) {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  if (settings) {
    settings.dashboardWidgetOrder = order;
    settings.dashboardWidgetVisibility = visibility;
    await DB.put(STORES.settings, settings);
  }
}

let dashboardEditMode = false;
let draggedWidget = null;
let currentDashboardTab = 'overview'; // 'overview' | 'crm' | 'deals'

async function renderDashboard() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto">${renderLoadingSkeleton(5)}</div>`;

  const [contacts, companies, calls, reminders, activities, layout, allDeals] = await Promise.all([
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.companies, currentUser.id),
    DB.getForUser(STORES.calls, currentUser.id),
    DB.getForUser(STORES.reminders, currentUser.id),
    DB.getForUser(STORES.activities, currentUser.id),
    getDashboardLayout(),
    DB.getAll(STORES.deals).then(all => all.filter(d => d.userId === currentUser.id)).catch(() => []),
  ]);

  const activeContacts = contacts.filter(c => !c.archived);
  const overdueFollowUps = activeContacts.filter(c => c.nextFollowUpDate && isOverdue(c.nextFollowUpDate));
  const dueToday = activeContacts.filter(c => c.nextFollowUpDate && isDueToday(c.nextFollowUpDate));
  const dueThisWeek = activeContacts.filter(c => c.nextFollowUpDate && isDueThisWeek(c.nextFollowUpDate) && !isDueToday(c.nextFollowUpDate));
  const recentContacts = sortByDate([...activeContacts], 'createdAt').slice(0, 5);
  const recentCalls = sortByDate([...calls], 'date').slice(0, 5);

  // Stage distribution
  const stageCount = {};
  STAGES.forEach(s => stageCount[s] = 0);
  activeContacts.forEach(c => { stageCount[c.stage] = (stageCount[c.stage] || 0) + 1; });

  // Relationship health
  const healthy = activeContacts.filter(c => {
    if (!c.lastContactDate) return false;
    const days = Math.abs(daysUntil(c.lastContactDate));
    return days <= 30;
  }).length;
  const stale = activeContacts.filter(c => {
    if (!c.lastContactDate) return true;
    const days = Math.abs(daysUntil(c.lastContactDate));
    return days > 60;
  }).length;
  const atRisk = activeContacts.length - healthy - stale;

  const companyMap = {};
  companies.forEach(c => companyMap[c.id] = c);

  const contactMap = {};
  activeContacts.forEach(c => contactMap[c.id] = c);

  // Call statistics
  const callsByTitle = {};
  const callsByCompany = {};
  calls.forEach(call => {
    const contact = contactMap[call.contactId];
    if (contact) {
      const title = normalizeTitle(contact.title || 'Unknown');
      callsByTitle[title] = (callsByTitle[title] || 0) + 1;
      const company = companyMap[contact.companyId];
      const companyName = company ? company.name : (contact.companyName || 'Independent');
      callsByCompany[companyName] = (callsByCompany[companyName] || 0) + 1;
    }
  });

  const topTitles = Object.entries(callsByTitle).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topCompanies = Object.entries(callsByCompany).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxTitleCalls = topTitles.length > 0 ? topTitles[0][1] : 1;
  const maxCompanyCalls = topCompanies.length > 0 ? topCompanies[0][1] : 1;
  const barColors = ['#4c6ef5', '#7048e8', '#ae3ec9', '#e64980', '#f03e3e', '#d9480f', '#fab005', '#40c057'];

  // Build widget HTML map
  const widgetData = {
    'stats': {
      label: 'Quick Stats',
      fullWidth: true,
      html: `
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          ${renderStatCard('Total Contacts', activeContacts.length,
            '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>', 'brand')}
          ${renderStatCard('Total Calls', calls.length,
            '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>', 'purple')}
          ${renderStatCard('Due Today', dueToday.length,
            '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>', 'yellow')}
          ${renderStatCard('Overdue', overdueFollowUps.length,
            '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>', 'red')}
        </div>
      `,
    },
    'call-stats': {
      label: 'Call Statistics',
      fullWidth: true,
      html: calls.length > 0 ? `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="card">
            <h2 class="text-base font-semibold mb-4">Calls by Position</h2>
            ${topTitles.length > 0 ? `
              <div class="space-y-3">
                ${topTitles.map(([title, count], i) => {
                  const pct = (count / maxTitleCalls) * 100;
                  return `
                    <div>
                      <div class="flex items-center justify-between mb-1">
                        <span class="text-sm text-surface-600 dark:text-surface-400 truncate mr-2">${escapeHtml(title)}</span>
                        <span class="text-sm font-semibold whitespace-nowrap">${count} call${count !== 1 ? 's' : ''}</span>
                      </div>
                      <div class="progress-bar">
                        <div class="progress-bar-fill" style="width: ${pct}%; background-color: ${barColors[i % barColors.length]}"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : '<p class="text-sm text-surface-500 text-center py-4">No call data yet</p>'}
          </div>
          <div class="card">
            <h2 class="text-base font-semibold mb-4">Calls by Company</h2>
            ${topCompanies.length > 0 ? `
              <div class="space-y-3">
                ${topCompanies.map(([company, count], i) => {
                  const pct = (count / maxCompanyCalls) * 100;
                  const comp = companies.find(c => c.name === company);
                  return `
                    <div>
                      <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center gap-2 min-w-0 mr-2">
                          ${comp ? renderCompanyLogo(comp, 'sm') : `<div class="avatar avatar-sm" style="background-color: ${avatarColor(company)}15; color: ${avatarColor(company)}">${getInitials(company)}</div>`}
                          <span class="text-sm text-surface-600 dark:text-surface-400 truncate">${escapeHtml(company)}</span>
                        </div>
                        <span class="text-sm font-semibold whitespace-nowrap">${count} call${count !== 1 ? 's' : ''}</span>
                      </div>
                      <div class="progress-bar">
                        <div class="progress-bar-fill" style="width: ${pct}%; background-color: ${barColors[i % barColors.length]}"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : '<p class="text-sm text-surface-500 text-center py-4">No call data yet</p>'}
          </div>
        </div>
      ` : '',
    },
    'follow-ups': {
      label: 'Upcoming Follow-ups',
      span: 2,
      html: `
        <div class="card h-full">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-semibold">Upcoming Follow-ups</h2>
            <button onclick="navigate('reminders')" class="text-sm text-brand-600 hover:text-brand-700 font-medium">View all &rarr;</button>
          </div>
          ${overdueFollowUps.length === 0 && dueToday.length === 0 && dueThisWeek.length === 0 ? `
            <div class="text-center py-8">
              <svg class="w-10 h-10 mx-auto text-surface-300 dark:text-surface-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p class="text-sm text-surface-500">All caught up! No pending follow-ups.</p>
            </div>
          ` : `
            <div class="space-y-1">
              ${overdueFollowUps.slice(0, 3).map(c => renderFollowUpItem(c, companyMap[c.companyId], 'overdue')).join('')}
              ${dueToday.slice(0, 3).map(c => renderFollowUpItem(c, companyMap[c.companyId], 'today')).join('')}
              ${dueThisWeek.slice(0, 4).map(c => renderFollowUpItem(c, companyMap[c.companyId], 'week')).join('')}
            </div>
          `}
        </div>
      `,
    },
    'pipeline': {
      label: 'Pipeline by Stage',
      span: 1,
      html: `
        <div class="card h-full">
          <h2 class="text-base font-semibold mb-4">Pipeline by Stage</h2>
          <div class="space-y-3">
            ${STAGES.map(stage => {
              const count = stageCount[stage] || 0;
              const pct = activeContacts.length > 0 ? (count / activeContacts.length * 100) : 0;
              const color = STAGE_COLORS[stage];
              const barColor = {
                blue: 'bg-brand-500', green: 'bg-green-500', purple: 'bg-purple-500',
                yellow: 'bg-yellow-500', red: 'bg-red-500',
              }[color] || 'bg-surface-400';
              return `
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm text-surface-600 dark:text-surface-400">${escapeHtml(stage)}</span>
                    <span class="text-sm font-medium">${count}</span>
                  </div>
                  <div class="progress-bar">
                    <div class="progress-bar-fill ${barColor}" style="width: ${pct}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `,
    },
    'recent-calls': {
      label: 'Recent Calls',
      span: 1,
      html: `
        <div class="card h-full">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-semibold">Recent Calls</h2>
            <button onclick="navigate('calls')" class="text-sm text-brand-600 hover:text-brand-700 font-medium">View all &rarr;</button>
          </div>
          ${recentCalls.length === 0 ? `
            <p class="text-sm text-surface-500 py-4 text-center">No calls logged yet</p>
          ` : `
            <div class="space-y-3">
              ${renderRecentCallsListSync(recentCalls, activeContacts)}
            </div>
          `}
        </div>
      `,
    },
    'recent-contacts': {
      label: 'Recently Added',
      span: 1,
      html: `
        <div class="card h-full">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-semibold">Recently Added</h2>
            <button onclick="navigate('contacts')" class="text-sm text-brand-600 hover:text-brand-700 font-medium">View all &rarr;</button>
          </div>
          ${recentContacts.length === 0 ? `
            <p class="text-sm text-surface-500 py-4 text-center">No contacts yet</p>
          ` : `
            <div class="space-y-3">
              ${recentContacts.map(c => `
                <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer" onclick="viewContact('${c.id}')">
                  ${renderAvatar(c.fullName, c.photoUrl, 'sm', c.linkedInUrl)}
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium truncate">${escapeHtml(c.fullName)}</div>
                    <div class="text-xs text-surface-500 truncate">${escapeHtml(c.title || '')}</div>
                  </div>
                  <span class="text-xs text-surface-400">${formatRelative(c.createdAt)}</span>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      `,
    },
    'relationship-health': {
      label: 'Relationship Health',
      span: 1,
      html: `
        <div class="card h-full">
          <h2 class="text-base font-semibold mb-4">Relationship Health</h2>
          ${activeContacts.length === 0 ? `
            <p class="text-sm text-surface-500 py-4 text-center">Add contacts to track health</p>
          ` : `
            <div class="space-y-4">
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded-full bg-green-500"></div>
                <span class="text-sm flex-1">Active (&le;30 days)</span>
                <span class="text-sm font-semibold">${healthy}</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span class="text-sm flex-1">At risk (31&ndash;60 days)</span>
                <span class="text-sm font-semibold">${atRisk}</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="w-3 h-3 rounded-full bg-red-500"></div>
                <span class="text-sm flex-1">Stale (&gt;60 days)</span>
                <span class="text-sm font-semibold">${stale}</span>
              </div>
              <div class="flex justify-center pt-2">
                ${renderDonut(healthy, atRisk, stale)}
              </div>
            </div>
          `}
        </div>
      `,
    },
  };

  // Ensure all widgets exist in order (in case new ones were added)
  const order = layout.order.filter(id => widgetData[id]);
  for (const id of DEFAULT_WIDGET_ORDER) {
    if (!order.includes(id)) order.push(id);
  }
  const visibility = { ...DEFAULT_WIDGET_VISIBILITY, ...layout.visibility };

  // Build the grouped widget sections
  // Full-width widgets render in their own row, grid widgets are grouped in 3-col rows
  let widgetHtml = '';
  let gridBuffer = [];

  function flushGrid() {
    if (gridBuffer.length === 0) return;
    widgetHtml += `<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 dashboard-grid">`;
    for (const item of gridBuffer) {
      const spanClass = item.span === 2 ? 'lg:col-span-2' : '';
      widgetHtml += `
        <div class="dashboard-widget ${spanClass}" data-widget-id="${item.id}" draggable="${dashboardEditMode}" ${dashboardEditMode ? 'ondragstart="onWidgetDragStart(event)" ondragover="onWidgetDragOver(event)" ondragend="onWidgetDragEnd(event)" ondrop="onWidgetDrop(event)"' : ''}>
          ${dashboardEditMode ? renderWidgetEditOverlay(item.id, item.label) : ''}
          ${item.html}
        </div>
      `;
    }
    widgetHtml += `</div>`;
    gridBuffer = [];
  }

  for (const id of order) {
    if (!visibility[id]) continue;
    const w = widgetData[id];
    if (!w || (!w.html && !w.fullWidth)) continue;

    if (w.fullWidth) {
      flushGrid();
      widgetHtml += `
        <div class="mb-8 dashboard-widget" data-widget-id="${id}" draggable="${dashboardEditMode}" ${dashboardEditMode ? 'ondragstart="onWidgetDragStart(event)" ondragover="onWidgetDragOver(event)" ondragend="onWidgetDragEnd(event)" ondrop="onWidgetDrop(event)"' : ''}>
          ${dashboardEditMode ? renderWidgetEditOverlay(id, w.label) : ''}
          ${w.html}
        </div>
      `;
    } else {
      gridBuffer.push({ id, ...w });
      // Flush when we've accumulated 3 columns worth
      const totalSpan = gridBuffer.reduce((s, b) => s + (b.span || 1), 0);
      if (totalSpan >= 3) flushGrid();
    }
  }
  flushGrid();

  // === DEAL STATS for Overview & Deals tabs ===
  const activeDeals = allDeals.filter(d => !['Closed - Won','Closed - Lost','Rejected'].includes(d.stage));
  const hotDeals = activeDeals.filter(d => d.priority === 'high' || (d.score && d.score >= 7));
  const pipelineValue = activeDeals.reduce((s, d) => s + (d.askingPrice || 0), 0);
  const dealsByStage = {};
  allDeals.forEach(d => { dealsByStage[d.stage] = (dealsByStage[d.stage] || 0) + 1; });
  const dealsBySource = {};
  allDeals.forEach(d => { if (d.source) dealsBySource[d.source] = (dealsBySource[d.source] || 0) + 1; });

  const fmtVal = (n) => n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n}`;
  const callMonthLabels = typeof getLastNMonthLabels === 'function' ? getLastNMonthLabels(6) : [];
  const callMonthData = typeof countByMonth === 'function' ? countByMonth(calls, 'date', 6) : [];
  const contactMonthData = typeof countByMonth === 'function' ? countByMonth(activeContacts, 'createdAt', 6) : [];

  // Overview tab HTML
  const overviewHtml = `
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      ${[
        ['Contacts', activeContacts.length, 'brand'],
        ['Companies', companies.length, 'purple'],
        ['Calls', calls.length, 'indigo'],
        ['Active Deals', activeDeals.length, 'green'],
        ['Hot Deals', hotDeals.length, 'yellow'],
        ['Pipeline Value', fmtVal(pipelineValue), 'pink'],
      ].map(([label, val, color]) => `
        <div class="card text-center py-4">
          <p class="text-xl font-bold text-${color}-600 dark:text-${color}-400">${val}</p>
          <p class="text-xs text-surface-500 mt-1">${label}</p>
        </div>
      `).join('')}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div class="card">
        <h3 class="text-sm font-semibold mb-4">Activity Over Time (6 months)</h3>
        <div class="chart-container" style="height:200px">
          <canvas id="dash-activity-chart"></canvas>
        </div>
      </div>
      <div class="card">
        <h3 class="text-sm font-semibold mb-4">Relationship Health</h3>
        <div class="flex items-center gap-4">
          <div class="chart-container flex-1" style="height:180px">
            <canvas id="dash-health-chart"></canvas>
          </div>
          <div class="space-y-2 text-xs">
            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-green-500 flex-shrink-0"></span><span>Active: ${healthy}</span></div>
            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-yellow-500 flex-shrink-0"></span><span>At Risk: ${atRisk}</span></div>
            <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-full bg-red-500 flex-shrink-0"></span><span>Stale: ${stale}</span></div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card">
        <h3 class="text-sm font-semibold mb-1">Contact Pipeline</h3>
        <p class="text-xs text-surface-400 mb-4">Contacts by relationship stage</p>
        <div class="chart-container" style="height:220px">
          <canvas id="dash-stage-chart"></canvas>
        </div>
      </div>
      <div class="card">
        <h3 class="text-sm font-semibold mb-1">Deal Pipeline</h3>
        <p class="text-xs text-surface-400 mb-4">${allDeals.length > 0 ? 'Active deals by stage' : 'No deals yet — go to Deal Pipeline to add'}</p>
        ${allDeals.length > 0 ? `
          <div class="chart-container" style="height:220px">
            <canvas id="dash-deal-stage-chart"></canvas>
          </div>
        ` : `
          <div class="flex flex-col items-center justify-center py-12 text-surface-400">
            <svg class="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
            <button onclick="navigate('deals')" class="btn-primary btn-sm mt-2">Go to Deal Pipeline</button>
          </div>
        `}
      </div>
    </div>
  `;

  // Deals stats tab HTML
  const dealsStatsHtml = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      ${[
        ['Total Deals', allDeals.length],
        ['Active', activeDeals.length],
        ['Hot / High Priority', hotDeals.length],
        ['Pipeline Value', fmtVal(pipelineValue)],
      ].map(([label, val]) => `
        <div class="card text-center py-4">
          <p class="text-2xl font-bold text-brand-600">${val}</p>
          <p class="text-xs text-surface-500 mt-1">${label}</p>
        </div>
      `).join('')}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div class="card">
        <h3 class="text-sm font-semibold mb-4">Deals by Stage</h3>
        ${allDeals.length > 0 ? `
          <div class="chart-container" style="height:260px">
            <canvas id="deal-stage-bar-chart"></canvas>
          </div>
        ` : '<p class="text-sm text-surface-400 text-center py-8">No deals yet</p>'}
      </div>
      <div class="card">
        <h3 class="text-sm font-semibold mb-4">Deal Sourcing</h3>
        ${Object.keys(dealsBySource).length > 0 ? `
          <div class="chart-container" style="height:260px">
            <canvas id="deal-source-donut-chart"></canvas>
          </div>
        ` : '<p class="text-sm text-surface-400 text-center py-8">No sourcing data yet</p>'}
      </div>
    </div>

    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold">Active Deals</h3>
        <button onclick="navigate('deals')" class="text-sm text-brand-600 hover:text-brand-700 font-medium">Full pipeline &rarr;</button>
      </div>
      ${activeDeals.length === 0 ? '<p class="text-sm text-surface-400 text-center py-6">No active deals</p>' : `
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="border-b border-surface-200 dark:border-surface-700 text-xs text-surface-500">
              <th class="text-left pb-2 font-medium">Company</th>
              <th class="text-left pb-2 font-medium">Stage</th>
              <th class="text-left pb-2 font-medium">Source</th>
              <th class="text-right pb-2 font-medium">Revenue</th>
              <th class="text-right pb-2 font-medium">Ask Price</th>
            </tr></thead>
            <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
              ${activeDeals.slice(0, 8).map(deal => `
                <tr class="hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer" onclick="viewDeal('${deal.id}')">
                  <td class="py-2 font-medium">${escapeHtml(deal.name)}</td>
                  <td class="py-2 text-surface-500 text-xs">${deal.stage || '—'}</td>
                  <td class="py-2 text-surface-500 text-xs">${deal.source || '—'}</td>
                  <td class="py-2 text-right text-xs">${deal.revenue ? fmtVal(deal.revenue) : '—'}</td>
                  <td class="py-2 text-right text-xs font-medium">${deal.askingPrice ? fmtVal(deal.askingPrice) : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  const tabBar = `
    <div class="flex items-center gap-1 mb-6 bg-surface-100 dark:bg-surface-800 p-1 rounded-xl w-fit">
      <button onclick="switchDashboardTab('overview')" class="dash-tab ${currentDashboardTab === 'overview' ? 'active' : ''}">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
        Overview
      </button>
      <button onclick="switchDashboardTab('crm')" class="dash-tab ${currentDashboardTab === 'crm' ? 'active' : ''}">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
        CRM Network
      </button>
      <button onclick="switchDashboardTab('deals')" class="dash-tab ${currentDashboardTab === 'deals' ? 'active' : ''}">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
        Deals
      </button>
    </div>
  `;

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 class="text-2xl font-bold">Dashboard</h1>
          <p class="text-surface-500 text-sm">Welcome back, ${escapeHtml(currentUser.name.split(' ')[0])}</p>
        </div>
        ${currentDashboardTab === 'crm' ? `
          <button onclick="toggleDashboardEditMode()" class="btn-secondary btn-sm flex items-center gap-2" id="dashboard-edit-btn">
            ${dashboardEditMode ? `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 12.75l6 6 9-13.5" /></svg>Done` : `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>Customize`}
          </button>
        ` : ''}
      </div>

      ${tabBar}

      ${currentDashboardTab === 'overview' ? overviewHtml : ''}
      ${currentDashboardTab === 'deals' ? dealsStatsHtml : ''}

      ${currentDashboardTab === 'crm' ? `
        ${dashboardEditMode ? renderWidgetToggleBar(order, visibility, widgetData) : ''}
        <div id="dashboard-widgets">${widgetHtml}</div>
      ` : ''}
    </div>
  `;

  // Initialize charts after DOM is ready
  if (currentDashboardTab === 'overview' && typeof createLineChart === 'function') {
    setTimeout(() => {
      if (callMonthLabels.length > 0) {
        createLineChart('dash-activity-chart', callMonthLabels, [
          { label: 'Calls', data: callMonthData },
          { label: 'New Contacts', data: contactMonthData },
        ]);
      }
      if (healthy + atRisk + stale > 0) {
        createDoughnutChart('dash-health-chart',
          ['Active', 'At Risk', 'Stale'],
          [healthy, atRisk, stale],
          { colors: ['#22c55e','#eab308','#ef4444'] }
        );
      }
      const stageLabels = STAGES.filter(s => (stageCount[s] || 0) > 0);
      const stageData = stageLabels.map(s => stageCount[s] || 0);
      if (stageLabels.length > 0) {
        createBarChart('dash-stage-chart', stageLabels, stageData, { singleColor: '#5c7cfa' });
      }
      const dealStageKeys = Object.keys(dealsByStage).filter(k => dealsByStage[k] > 0);
      if (dealStageKeys.length > 0) {
        createBarChart('dash-deal-stage-chart', dealStageKeys, dealStageKeys.map(k => dealsByStage[k]), { singleColor: '#20c997' });
      }
    }, 50);
  }

  if (currentDashboardTab === 'deals' && typeof createBarChart === 'function') {
    setTimeout(() => {
      const stageKeys = Object.keys(dealsByStage).filter(k => dealsByStage[k] > 0);
      if (stageKeys.length > 0) {
        createBarChart('deal-stage-bar-chart', stageKeys, stageKeys.map(k => dealsByStage[k]));
      }
      const srcKeys = Object.keys(dealsBySource).filter(k => dealsBySource[k] > 0);
      if (srcKeys.length > 0) {
        createDoughnutChart('deal-source-donut-chart', srcKeys, srcKeys.map(k => dealsBySource[k]));
      }
    }, 50);
  }
}

function switchDashboardTab(tab) {
  currentDashboardTab = tab;
  renderDashboard();
}

function renderWidgetEditOverlay(id, label) {
  return `
    <div class="absolute inset-0 z-10 bg-brand-50/50 dark:bg-brand-900/20 border-2 border-dashed border-brand-300 dark:border-brand-700 rounded-2xl flex items-start justify-between p-3 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
      <span class="text-xs font-semibold text-brand-700 dark:text-brand-300 bg-white dark:bg-surface-900 rounded-lg px-2 py-1 shadow-sm pointer-events-auto">${escapeHtml(label)}</span>
      <svg class="w-5 h-5 text-brand-400 cursor-grab pointer-events-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
    </div>
  `;
}

function renderWidgetToggleBar(order, visibility, widgetData) {
  const allWidgets = DEFAULT_WIDGET_ORDER.map(id => ({
    id,
    label: widgetData[id]?.label || id,
    visible: visibility[id] !== false,
  }));

  return `
    <div class="card mb-6 bg-brand-50/50 dark:bg-brand-900/10 border-brand-200 dark:border-brand-800">
      <div class="flex items-center gap-2 mb-3">
        <svg class="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        <h3 class="text-sm font-semibold text-brand-700 dark:text-brand-300">Customize Dashboard</h3>
      </div>
      <p class="text-xs text-surface-500 mb-3">Toggle widgets on/off. Drag widgets on the dashboard to reorder them.</p>
      <div class="flex flex-wrap gap-2">
        ${allWidgets.map(w => `
          <button onclick="toggleDashboardWidget('${w.id}')" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${w.visible
            ? 'bg-brand-600 text-white shadow-sm'
            : 'bg-white dark:bg-surface-800 text-surface-500 border border-surface-200 dark:border-surface-700'}">
            ${w.visible ? '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 12.75l6 6 9-13.5" /></svg>' : '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>'}
            ${w.label}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

async function toggleDashboardEditMode() {
  dashboardEditMode = !dashboardEditMode;
  renderDashboard();
  if (dashboardEditMode) {
    showToast('Drag widgets to reorder. Toggle visibility with the buttons above.', 'info');
  }
}

async function toggleDashboardWidget(widgetId) {
  const layout = await getDashboardLayout();
  layout.visibility[widgetId] = !layout.visibility[widgetId];
  await saveDashboardLayout(layout.order, layout.visibility);
  renderDashboard();
}

// Drag and drop for widget reordering
function onWidgetDragStart(e) {
  const widget = e.target.closest('.dashboard-widget');
  if (!widget) return;
  draggedWidget = widget.dataset.widgetId;
  widget.style.opacity = '0.5';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedWidget);
}

function onWidgetDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const widget = e.target.closest('.dashboard-widget');
  if (widget && widget.dataset.widgetId !== draggedWidget) {
    widget.style.borderColor = '#4c6ef5';
    widget.style.borderWidth = '2px';
    widget.style.borderStyle = 'solid';
    widget.style.borderRadius = '1rem';
  }
}

function onWidgetDragEnd(e) {
  draggedWidget = null;
  // Reset all widget styles
  document.querySelectorAll('.dashboard-widget').forEach(w => {
    w.style.opacity = '';
    w.style.borderColor = '';
    w.style.borderWidth = '';
    w.style.borderStyle = '';
  });
}

async function onWidgetDrop(e) {
  e.preventDefault();
  const targetWidget = e.target.closest('.dashboard-widget');
  if (!targetWidget || !draggedWidget) return;

  const targetId = targetWidget.dataset.widgetId;
  if (targetId === draggedWidget) return;

  const layout = await getDashboardLayout();
  const order = layout.order;

  const fromIndex = order.indexOf(draggedWidget);
  const toIndex = order.indexOf(targetId);

  if (fromIndex === -1 || toIndex === -1) return;

  // Remove from old position and insert at new
  order.splice(fromIndex, 1);
  order.splice(toIndex, 0, draggedWidget);

  await saveDashboardLayout(order, layout.visibility);
  draggedWidget = null;
  renderDashboard();
  showToast('Dashboard layout updated', 'success');
}

// Reset dashboard to defaults
async function resetDashboardLayout() {
  await saveDashboardLayout([...DEFAULT_WIDGET_ORDER], { ...DEFAULT_WIDGET_VISIBILITY });
  showToast('Dashboard reset to default layout', 'success');
  renderDashboard();
}

// Normalize job titles into categories for stats
function normalizeTitle(title) {
  if (!title || title === 'Unknown') return 'Unknown';
  const t = title.toLowerCase();
  if (t.includes('managing director') || t.includes('md')) return 'Managing Director';
  if (t.includes('partner') && !t.includes('search')) return 'Partner';
  if (t.includes('principal')) return 'Principal';
  if (t.includes('ceo') || t.includes('chief executive')) return 'CEO / Founder';
  if (t.includes('cfo') || t.includes('chief financial')) return 'CFO';
  if (t.includes('coo') || t.includes('chief operating')) return 'COO';
  if (t.includes('director')) return 'Director';
  if (t.includes('vp') || t.includes('vice president')) return 'VP';
  if (t.includes('founder')) return 'CEO / Founder';
  if (t.includes('advisor') || t.includes('consultant')) return 'Advisor / Consultant';
  if (t.includes('broker')) return 'Broker';
  if (t.includes('analyst')) return 'Analyst';
  if (t.includes('associate')) return 'Associate';
  if (t.includes('manager')) return 'Manager';
  if (t.includes('search fund') || t.includes('searcher')) return 'Search Fund Entrepreneur';
  if (t.includes('engagement')) return 'Engagement Manager';
  if (t.includes('operating')) return 'Operating Advisor';
  return title;
}

function renderFollowUpItem(contact, company, urgency) {
  const urgencyStyles = {
    overdue: 'border-l-2 border-red-500 bg-red-50/50 dark:bg-red-900/10',
    today: 'border-l-2 border-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10',
    week: 'border-l-2 border-brand-500 bg-brand-50/30 dark:bg-brand-900/10',
  };

  const urgencyLabels = {
    overdue: `<span class="text-xs font-medium text-red-600 dark:text-red-400">${formatFutureRelative(contact.nextFollowUpDate)}</span>`,
    today: '<span class="text-xs font-medium text-yellow-600 dark:text-yellow-400">Today</span>',
    week: `<span class="text-xs text-surface-500">${formatFutureRelative(contact.nextFollowUpDate)}</span>`,
  };

  return `
    <div class="flex items-center gap-3 p-3 rounded-lg ${urgencyStyles[urgency]} cursor-pointer" onclick="viewContact('${contact.id}')">
      ${renderAvatar(contact.fullName, contact.photoUrl, 'sm', contact.linkedInUrl)}
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(contact.fullName)}</div>
        <div class="text-xs text-surface-500 truncate">${company ? escapeHtml(company.name) : escapeHtml(contact.title || '')}</div>
      </div>
      ${urgencyLabels[urgency]}
    </div>
  `;
}

// Synchronous version for use in widget rendering
function renderRecentCallsListSync(calls, contacts) {
  const contactMap = {};
  contacts.forEach(c => contactMap[c.id] = c);

  return calls.map(call => {
    const contact = contactMap[call.contactId];
    return `
      <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer" onclick="${contact ? `viewContact('${contact.id}')` : ''}">
        ${contact ? renderAvatar(contact.fullName, contact.photoUrl, 'sm', contact.linkedInUrl) : '<div class="avatar avatar-sm">?</div>'}
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium truncate">${contact ? escapeHtml(contact.fullName) : 'Unknown'}</div>
          <div class="text-xs text-surface-500 truncate">${escapeHtml(call.outcome || truncate(call.notes, 50) || 'No notes')}</div>
        </div>
        <span class="text-xs text-surface-400">${formatRelative(call.date)}</span>
      </div>
    `;
  }).join('');
}

// Keep async version for backward compatibility
async function renderRecentCallsList(calls, contacts) {
  return renderRecentCallsListSync(calls, contacts);
}

function renderDonut(healthy, atRisk, stale) {
  const total = healthy + atRisk + stale;
  if (total === 0) return '';

  const size = 120;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const pctHealthy = healthy / total;
  const pctAtRisk = atRisk / total;
  const pctStale = stale / total;

  const offset2 = pctHealthy * circumference;
  const offset3 = (pctHealthy + pctAtRisk) * circumference;

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="#e9ecef" stroke-width="${stroke}" class="dark:stroke-surface-700" />
      ${pctHealthy > 0 ? `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="#40c057" stroke-width="${stroke}"
        stroke-dasharray="${pctHealthy * circumference} ${circumference}" stroke-dashoffset="0"
        transform="rotate(-90 ${size/2} ${size/2})" />` : ''}
      ${pctAtRisk > 0 ? `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="#fab005" stroke-width="${stroke}"
        stroke-dasharray="${pctAtRisk * circumference} ${circumference}" stroke-dashoffset="${-offset2}"
        transform="rotate(-90 ${size/2} ${size/2})" />` : ''}
      ${pctStale > 0 ? `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="#fa5252" stroke-width="${stroke}"
        stroke-dasharray="${pctStale * circumference} ${circumference}" stroke-dashoffset="${-offset3}"
        transform="rotate(-90 ${size/2} ${size/2})" />` : ''}
      <text x="50%" y="50%" text-anchor="middle" dy="0.35em" class="text-lg font-bold fill-current">${total}</text>
    </svg>
  `;
}
