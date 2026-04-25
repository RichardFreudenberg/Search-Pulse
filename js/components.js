/* ============================================
   Nexus CRM — Shared Components
   ============================================ */

function renderPageHeader(title, subtitle, actions = '') {
  return `
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
      <div>
        <h1 class="page-header-title">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="page-sub mt-2">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <div class="flex items-center gap-3 flex-shrink-0 pt-0.5">${actions}</div>
    </div>
  `;
}

function renderEmptyState(icon, title, description, actionHtml = '') {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      ${actionHtml ? `<div class="mt-5">${actionHtml}</div>` : ''}
    </div>
  `;
}

function renderLoadingSkeleton(rows = 3) {
  let html = '';
  for (let i = 0; i < rows; i++) {
    html += `
      <div class="flex items-center gap-4 p-4 animate-pulse">
        <div class="skeleton w-10 h-10 rounded-full flex-shrink-0"></div>
        <div class="flex-1 space-y-2">
          <div class="skeleton h-4 w-1/3"></div>
          <div class="skeleton h-3 w-1/2"></div>
        </div>
        <div class="skeleton h-6 w-20 rounded-full"></div>
      </div>
    `;
  }
  return html;
}

function renderStatCard(label, value, icon, color = 'brand', onclick = null) {
  const colorMap = {
    brand:  'bg-brand-50  dark:bg-brand-900/20  text-brand-600  dark:text-brand-400',
    green:  'bg-green-50  dark:bg-green-900/20  text-green-600  dark:text-green-400',
    red:    'bg-red-50    dark:bg-red-900/20    text-red-600    dark:text-red-400',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  };

  const clickAttrs = onclick
    ? `onclick="${onclick}" role="button" tabindex="0" title="Click to see details" style="cursor:pointer"`
    : '';

  return `
    <div class="card${onclick ? ' card-interactive' : ''}" ${clickAttrs}>
      <div class="flex items-start justify-between gap-3">
        <div class="stat-card flex-1 min-w-0">
          <span class="stat-label">${escapeHtml(label)}</span>
          <span class="stat-value">${value}</span>
        </div>
        <div class="stat-icon-wrap flex-shrink-0 ${colorMap[color] || colorMap.brand}">
          ${icon}
        </div>
      </div>
    </div>
  `;
}

function renderContactRow(contact, company) {
  const overdueClass = contact.nextFollowUpDate && isOverdue(contact.nextFollowUpDate) ? 'text-red-600 dark:text-red-400 font-medium' : '';
  const followUpText = contact.nextFollowUpDate ? formatFutureRelative(contact.nextFollowUpDate) : '—';

  return `
    <tr class="clickable" onclick="viewContact('${contact.id}')">
      <td>
        <div class="flex items-center gap-3">
          ${renderAvatar(contact.fullName, contact.photoUrl, 'md', contact.linkedInUrl)}
          <div class="min-w-0">
            <div class="font-medium truncate">${escapeHtml(contact.fullName)}</div>
            <div class="text-xs text-surface-500 truncate">${escapeHtml(contact.title || '')}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="flex items-center gap-2">
          ${company ? renderCompanyLogo(company, 'sm') : ''}
          <span class="truncate">${company ? escapeHtml(company.name) : '—'}</span>
        </div>
      </td>
      <td>${renderStageBadge(contact.stage)}</td>
      <td class="text-surface-500">${contact.lastContactDate ? formatRelative(contact.lastContactDate) : '—'}</td>
      <td class="${overdueClass}">${followUpText}</td>
      <td>
        <div class="flex gap-1 flex-wrap">
          ${(contact.tags || []).slice(0, 2).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}
          ${(contact.tags || []).length > 2 ? `<span class="chip">+${contact.tags.length - 2}</span>` : ''}
        </div>
      </td>
    </tr>
  `;
}

function renderContactCard(contact, company) {
  const overdueClass = contact.nextFollowUpDate && isOverdue(contact.nextFollowUpDate) ? 'text-red-600 dark:text-red-400' : 'text-surface-500';

  return `
    <div class="card card-interactive" onclick="viewContact('${contact.id}')">
      <div class="flex items-start gap-3">
        ${renderAvatar(contact.fullName, contact.photoUrl, 'lg', contact.linkedInUrl)}
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h3 class="font-medium truncate">${escapeHtml(contact.fullName)}</h3>
              <p class="text-sm text-surface-500 truncate">${escapeHtml(contact.title || '')}${contact.title && company ? ' at ' : ''}${company ? escapeHtml(company.name) : ''}</p>
            </div>
            ${renderStageBadge(contact.stage)}
          </div>
          <div class="flex items-center gap-4 mt-3 text-xs">
            ${contact.lastContactDate ? `<span class="text-surface-500">Last: ${formatRelative(contact.lastContactDate)}</span>` : ''}
            ${contact.nextFollowUpDate ? `<span class="${overdueClass}">Follow-up: ${formatFutureRelative(contact.nextFollowUpDate)}</span>` : ''}
          </div>
          ${(contact.tags || []).length > 0 ? `
            <div class="flex gap-1 flex-wrap mt-2">
              ${contact.tags.slice(0, 3).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}
              ${contact.tags.length > 3 ? `<span class="chip">+${contact.tags.length - 3}</span>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderTagInput(selectedTags, availableTags, inputId) {
  return `
    <div class="space-y-2">
      <div id="${inputId}-tags" class="flex flex-wrap gap-1 min-h-[2rem]">
        ${selectedTags.map(t => `
          <span class="chip chip-removable" onclick="removeTagFromInput('${inputId}', '${escapeHtml(t)}')">
            ${escapeHtml(t)}
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </span>
        `).join('')}
      </div>
      <select id="${inputId}" class="input-field" onchange="addTagFromInput('${inputId}')">
        <option value="">Add a tag…</option>
        ${availableTags.filter(t => !selectedTags.includes(t.name)).map(t => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join('')}
      </select>
    </div>
  `;
}

// Tag input helper state
const tagInputState = {};

function addTagFromInput(inputId) {
  const select = document.getElementById(inputId);
  const tag = select.value;
  if (!tag) return;

  if (!tagInputState[inputId]) tagInputState[inputId] = [];
  if (!tagInputState[inputId].includes(tag)) {
    tagInputState[inputId].push(tag);
  }
  select.value = '';

  // Re-render tags
  const container = document.getElementById(`${inputId}-tags`);
  container.innerHTML = tagInputState[inputId].map(t => `
    <span class="chip chip-removable" onclick="removeTagFromInput('${inputId}', '${escapeHtml(t)}')">
      ${escapeHtml(t)}
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
    </span>
  `).join('');

  // Hide selected option
  const option = select.querySelector(`option[value="${CSS.escape(tag)}"]`);
  if (option) option.style.display = 'none';
}

function removeTagFromInput(inputId, tag) {
  if (!tagInputState[inputId]) return;
  tagInputState[inputId] = tagInputState[inputId].filter(t => t !== tag);

  const container = document.getElementById(`${inputId}-tags`);
  container.innerHTML = tagInputState[inputId].map(t => `
    <span class="chip chip-removable" onclick="removeTagFromInput('${inputId}', '${escapeHtml(t)}')">
      ${escapeHtml(t)}
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
    </span>
  `).join('');

  // Show option again
  const select = document.getElementById(inputId);
  const option = select.querySelector(`option[value="${CSS.escape(tag)}"]`);
  if (option) option.style.display = '';
}

function getTagInputValues(inputId) {
  return tagInputState[inputId] || [];
}

function initTagInput(inputId, tags) {
  tagInputState[inputId] = [...tags];
}

let _timelineFilter = 'all';

function renderTimeline(activities) {
  // Cache activities so filter chips can re-render without re-fetching
  window._currentTimeline = activities;

  if (!activities.length) {
    return '<p class="text-sm text-surface-500 py-6 text-center">No activity yet — calls, notes, and reminders will appear here.</p>';
  }

  const typesPresent = [...new Set(activities.map(a => a.type).filter(Boolean))];
  const filtered = _timelineFilter === 'all' ? activities : activities.filter(a => a.type === _timelineFilter);

  // Date bucket helper
  const now = new Date();
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(+today - 86400000);
  const weekAgo   = new Date(+today - 6 * 86400000);
  const monthAgo  = new Date(+today - 29 * 86400000);
  function dateBucket(ts) {
    const d = new Date(ts);
    if (d >= today)     return 'Today';
    if (d >= yesterday) return 'Yesterday';
    if (d >= weekAgo)   return 'This Week';
    if (d >= monthAgo)  return 'This Month';
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // Group newest-first
  const groups = [];
  let lastBucket = null;
  [...filtered].reverse().forEach(a => {
    const bucket = dateBucket(a.timestamp);
    if (bucket !== lastBucket) { groups.push({ bucket, items: [] }); lastBucket = bucket; }
    groups[groups.length - 1].items.push(a);
  });

  const typeLabels = { call: 'Calls', note: 'Notes', reminder: 'Reminders', enrichment: 'Enrichment', email: 'Emails', created: 'Created', updated: 'Updates', stage_change: 'Stage Changes' };

  return `
    <div>
      <!-- Filter chips -->
      <div class="flex flex-wrap gap-2 mb-5">
        <button onclick="_timelineFilter='all'; document.getElementById('timeline-tab').innerHTML=renderTimeline(window._currentTimeline||[])"
          class="px-3 py-1 rounded-full text-xs font-medium transition-all ${_timelineFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-surface-100 dark:bg-surface-800 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700'}">
          All (${activities.length})
        </button>
        ${typesPresent.map(t => `
          <button onclick="_timelineFilter='${t}'; document.getElementById('timeline-tab').innerHTML=renderTimeline(window._currentTimeline||[])"
            class="px-3 py-1 rounded-full text-xs font-medium border transition-all ${_timelineFilter === t ? 'bg-brand-600 text-white border-transparent' : 'bg-surface-100 dark:bg-surface-800 border-surface-200 dark:border-surface-700 text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-700'}">
            ${typeLabels[t] || t} (${activities.filter(a => a.type === t).length})
          </button>`).join('')}
      </div>

      ${filtered.length === 0
        ? `<p class="text-sm text-surface-400 text-center py-4">No ${typeLabels[_timelineFilter] || _timelineFilter} activity recorded.</p>`
        : `<div class="space-y-6">
            ${groups.map(group => `
              <div>
                <div class="flex items-center gap-3 mb-3">
                  <span class="text-xs font-semibold text-surface-400 uppercase tracking-wider whitespace-nowrap">${group.bucket}</span>
                  <div class="flex-1 h-px bg-surface-200 dark:bg-surface-700"></div>
                </div>
                <div class="space-y-1">
                  ${group.items.map(a => `
                    <div class="flex gap-3 p-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors">
                      <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5"
                        style="background:${getActivityColor(a.type)}18; color:${getActivityColor(a.type)}">
                        ${getActivityIcon(a.type)}
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-surface-800 dark:text-surface-200 leading-snug">${escapeHtml(a.title)}</p>
                        ${a.description ? `<p class="text-xs text-surface-500 mt-0.5 leading-relaxed">${escapeHtml(a.description)}</p>` : ''}
                        <p class="text-xs text-surface-400 mt-1">${formatDateTime(a.timestamp)}</p>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>`}
    </div>
  `;
}

function getActivityIcon(type) {
  const icons = {
    call:         '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>',
    note:         '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>',
    reminder:     '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/></svg>',
    enrichment:   '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09z"/></svg>',
    email:        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>',
    created:      '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    updated:      '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>',
    stage_change: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>',
  };
  return icons[type] || '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
}

function getActivityColor(type) {
  const colors = {
    call: '#4c6ef5',
    note: '#7048e8',
    reminder: '#fab005',
    enrichment: '#15aabf',
    created: '#40c057',
    updated: '#868e96',
    stage_change: '#e64980',
  };
  return colors[type] || '#868e96';
}
