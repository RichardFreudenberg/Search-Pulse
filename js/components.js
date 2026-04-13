/* ============================================
   Nexus CRM — Shared Components
   ============================================ */

function renderPageHeader(title, subtitle, actions = '') {
  return `
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="text-surface-500 dark:text-surface-400 text-sm mt-1">${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <div class="flex items-center gap-3">${actions}</div>
    </div>
  `;
}

function renderEmptyState(icon, title, description, actionHtml = '') {
  return `
    <div class="empty-state">
      ${icon}
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      ${actionHtml ? `<div class="mt-4">${actionHtml}</div>` : ''}
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
    brand: 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400',
    green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
  };

  const clickAttrs = onclick
    ? `onclick="${onclick}" role="button" tabindex="0" title="Click to see details" style="cursor:pointer"`
    : '';

  return `
    <div class="card${onclick ? ' hover:border-brand-300 dark:hover:border-brand-700 transition-colors' : ''}" ${clickAttrs}>
      <div class="flex items-start justify-between">
        <div class="stat-card">
          <span class="stat-label">${escapeHtml(label)}</span>
          <span class="stat-value">${value}</span>
        </div>
        <div class="p-2.5 rounded ${colorMap[color] || colorMap.brand}">
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

function renderTimeline(activities) {
  if (!activities.length) {
    return '<p class="text-sm text-surface-500 py-4">No activity yet</p>';
  }

  return `
    <div class="space-y-0">
      ${activities.map(a => `
        <div class="timeline-item">
          <div class="timeline-dot" style="border-color: ${getActivityColor(a.type)}"></div>
          <div>
            <p class="text-sm font-medium">${escapeHtml(a.title)}</p>
            ${a.description ? `<p class="text-xs text-surface-500 mt-0.5">${escapeHtml(a.description)}</p>` : ''}
            <p class="text-xs text-surface-400 mt-1">${formatDateTime(a.timestamp)}</p>
          </div>
        </div>
      `).join('')}
    </div>
  `;
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
