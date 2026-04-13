/* ============================================
   Nexus CRM — Global Search & Smart Suggestions
   ============================================ */

function setupGlobalSearch() {
  const input = document.getElementById('global-search');
  const results = document.getElementById('search-results');

  const doSearch = debounce(async (query) => {
    if (!query || query.length < 2) {
      results.classList.add('hidden');
      return;
    }

    const q = query.toLowerCase();
    const [contacts, companies, notes, reminders] = await Promise.all([
      DB.getForUser(STORES.contacts, currentUser.id),
      DB.getForUser(STORES.companies, currentUser.id),
      DB.getForUser(STORES.notes, currentUser.id),
      DB.getForUser(STORES.reminders, currentUser.id),
    ]);

    const companyMap = buildMap(companies);

    const matchedContacts = contacts.filter(c => !c.archived && (
      c.fullName.toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.location || '').toLowerCase().includes(q) ||
      (c.tags || []).some(t => t.toLowerCase().includes(q))
    )).slice(0, 5);

    const matchedCompanies = companies.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.industry || '').toLowerCase().includes(q)
    ).slice(0, 3);

    const matchedNotes = notes.filter(n =>
      (n.content || '').toLowerCase().includes(q) ||
      (n.cleanedContent || '').toLowerCase().includes(q)
    ).slice(0, 3);

    const matchedReminders = reminders.filter(r =>
      r.status === 'pending' && (
        (r.title || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      )
    ).slice(0, 3);

    if (matchedContacts.length === 0 && matchedCompanies.length === 0 && matchedNotes.length === 0 && matchedReminders.length === 0) {
      results.innerHTML = '<div class="p-4 text-sm text-surface-500 text-center">No results found</div>';
      results.classList.remove('hidden');
      return;
    }

    let html = '';

    if (matchedContacts.length > 0) {
      html += '<div class="px-3 py-2 text-xs font-semibold text-surface-400 uppercase">Contacts</div>';
      html += matchedContacts.map(c => {
        const company = companyMap[c.companyId];
        return `
          <button class="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-800 text-left" onclick="closeSearch(); viewContact('${c.id}')">
            ${renderAvatar(c.fullName, c.photoUrl, 'sm', c.linkedInUrl)}
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium truncate">${highlightMatch(c.fullName, q)}</div>
              <div class="text-xs text-surface-500 truncate">${escapeHtml(c.title || '')}${company ? ' · ' + escapeHtml(company.name) : ''}</div>
            </div>
            ${renderStageBadge(c.stage)}
          </button>
        `;
      }).join('');
    }

    if (matchedCompanies.length > 0) {
      html += '<div class="px-3 py-2 text-xs font-semibold text-surface-400 uppercase border-t border-surface-100 dark:border-surface-800">Companies</div>';
      html += matchedCompanies.map(c => `
        <button class="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-800 text-left" onclick="closeSearch(); viewCompany('${c.id}')">
          ${renderCompanyLogo(c, 'sm')}
          <div class="min-w-0">
            <div class="text-sm font-medium">${highlightMatch(c.name, q)}</div>
            ${c.industry ? `<div class="text-xs text-surface-500">${escapeHtml(c.industry)}</div>` : ''}
          </div>
        </button>
      `).join('');
    }

    if (matchedNotes.length > 0) {
      html += '<div class="px-3 py-2 text-xs font-semibold text-surface-400 uppercase border-t border-surface-100 dark:border-surface-800">Notes</div>';
      for (const n of matchedNotes) {
        const contact = contacts.find(c => c.id === n.contactId);
        html += `
          <button class="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-800 text-left" onclick="closeSearch(); ${contact ? `viewContact('${contact.id}')` : ''}">
            <svg class="w-5 h-5 text-surface-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            <div class="min-w-0">
              <div class="text-xs text-surface-500">${contact ? escapeHtml(contact.fullName) : 'Note'}</div>
              <div class="text-sm truncate">${highlightMatch(truncate(n.content, 80), q)}</div>
            </div>
          </button>
        `;
      }
    }

    if (matchedReminders.length > 0) {
      html += '<div class="px-3 py-2 text-xs font-semibold text-surface-400 uppercase border-t border-surface-100 dark:border-surface-800">Reminders</div>';
      html += matchedReminders.map(r => `
        <button class="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-800 text-left" onclick="closeSearch(); navigate('reminders')">
          <svg class="w-5 h-5 text-surface-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
          <div class="min-w-0">
            <div class="text-sm font-medium truncate">${highlightMatch(r.title, q)}</div>
            <div class="text-xs text-surface-500">${formatFutureRelative(r.dueDate)}</div>
          </div>
        </button>
      `).join('');
    }

    results.innerHTML = html;
    results.classList.remove('hidden');
  }, 200);

  input.addEventListener('input', (e) => doSearch(e.target.value));
  input.addEventListener('focus', (e) => { if (e.target.value.length >= 2) doSearch(e.target.value); });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#global-search') && !e.target.closest('#search-results')) {
      results.classList.add('hidden');
    }
  });

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      input.focus();
    }
    if (e.key === 'Escape' && document.activeElement === input) {
      input.blur();
      results.classList.add('hidden');
    }
  });
}

function closeSearch() {
  document.getElementById('search-results').classList.add('hidden');
  document.getElementById('global-search').value = '';
}

function highlightMatch(text, query) {
  if (!text || !query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-900 text-inherit rounded px-0.5">$1</mark>');
}

// Smart Suggestions
async function getSmartSuggestions() {
  if (!currentUser) return [];

  const contacts = await DB.getForUser(STORES.contacts, currentUser.id);
  const activeContacts = getActiveContacts(contacts);
  const suggestions = [];

  // Contacts due for follow-up
  const overdue = activeContacts.filter(c => c.nextFollowUpDate && isOverdue(c.nextFollowUpDate));
  overdue.sort((a, b) => new Date(a.nextFollowUpDate) - new Date(b.nextFollowUpDate));
  for (const c of overdue.slice(0, 3)) {
    suggestions.push({
      type: 'follow-up',
      title: `Follow up with ${c.fullName}`,
      description: `${formatFutureRelative(c.nextFollowUpDate)}`,
      contactId: c.id,
      urgency: 'high',
    });
  }

  // Contacts not contacted in >30 days
  const stale = activeContacts.filter(c => {
    if (!c.lastContactDate) return c.createdAt && daysUntil(c.createdAt) < -14;
    return daysUntil(c.lastContactDate) < -30;
  }).filter(c => !overdue.includes(c));

  for (const c of stale.slice(0, 3)) {
    const days = c.lastContactDate ? Math.abs(daysUntil(c.lastContactDate)) : 'never';
    suggestions.push({
      type: 'reconnect',
      title: `Reconnect with ${c.fullName}`,
      description: `Last contacted: ${days === 'never' ? 'never' : days + ' days ago'}`,
      contactId: c.id,
      urgency: 'medium',
    });
  }

  // People from the same company as recent contacts
  const calls = await DB.getForUser(STORES.calls, currentUser.id);
  const recentCalls = sortByDate(calls, 'date').slice(0, 5);
  const recentCompanyIds = new Set();
  for (const call of recentCalls) {
    const contact = activeContacts.find(c => c.id === call.contactId);
    if (contact && contact.companyId) recentCompanyIds.add(contact.companyId);
  }

  for (const companyId of recentCompanyIds) {
    const sameCompany = activeContacts.filter(c => c.companyId === companyId);
    if (sameCompany.length > 1) {
      const notRecentlyContacted = sameCompany.filter(c =>
        !c.lastContactDate || daysUntil(c.lastContactDate) < -14
      );
      for (const c of notRecentlyContacted.slice(0, 1)) {
        suggestions.push({
          type: 'same-company',
          title: `Also at same company: ${c.fullName}`,
          description: c.title || '',
          contactId: c.id,
          urgency: 'low',
        });
      }
    }
  }

  return suggestions;
}
