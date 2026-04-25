/* ============================================
   Nexus CRM — Reminders & Follow-ups
   ============================================ */

async function renderReminders() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto">${renderLoadingSkeleton(5)}</div>`;

  const [reminders, contacts, companies] = await Promise.all([
    DB.getForUser(STORES.reminders, currentUser.id),
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.companies, currentUser.id),
  ]);

  const contactMap = buildMap(contacts);
  const companyMap = buildMap(companies);

  const active = reminders.filter(r => r.status === 'pending' || r.status === 'snoozed');
  const completed = reminders.filter(r => r.status === 'completed');
  const dismissed = reminders.filter(r => r.status === 'dismissed');

  const overdue = active.filter(r => isOverdue(r.dueDate));
  const today = active.filter(r => isDueToday(r.dueDate));
  const upcoming = active.filter(r => !isOverdue(r.dueDate) && !isDueToday(r.dueDate));

  overdue.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  today.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  upcoming.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      ${renderPageHeader('Reminders', `${active.length} active reminders`, `
        <button onclick="openNewReminderModal()" class="btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Reminder
        </button>
      `)}

      <!-- Overdue -->
      ${overdue.length > 0 ? `
        <div class="mb-6">
          <h2 class="text-sm font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-3">Overdue (${overdue.length})</h2>
          <div class="space-y-3">
            ${overdue.map(r => renderReminderItem(r, contactMap[r.contactId])).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Due Today -->
      ${today.length > 0 ? `
        <div class="mb-6">
          <h2 class="text-sm font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider mb-3">Due Today (${today.length})</h2>
          <div class="space-y-3">
            ${today.map(r => renderReminderItem(r, contactMap[r.contactId])).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Upcoming -->
      ${upcoming.length > 0 ? `
        <div class="mb-6">
          <h2 class="text-sm font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wider mb-3">Upcoming (${upcoming.length})</h2>
          <div class="space-y-3">
            ${upcoming.map(r => renderReminderItem(r, contactMap[r.contactId])).join('')}
          </div>
        </div>
      ` : ''}

      ${active.length === 0 ? renderEmptyState(
        '<svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>',
        'No active reminders',
        'Reminders are created automatically when you log calls with follow-up dates',
        '<button onclick="openNewReminderModal()" class="btn-primary">Create Reminder</button>'
      ) : ''}

      <!-- Completed -->
      ${completed.length > 0 ? `
        <details class="mt-8">
          <summary class="text-sm font-medium text-surface-500 cursor-pointer hover:text-surface-700 dark:hover:text-surface-300">
            Completed (${completed.length})
          </summary>
          <div class="space-y-3 mt-3">
            ${completed.slice(0, 10).map(r => renderReminderItem(r, contactMap[r.contactId], true)).join('')}
          </div>
        </details>
      ` : ''}
    </div>
  `;
}

function renderReminderItem(reminder, contact, isCompleted = false) {
  const urgencyClass = isCompleted ? 'opacity-60' :
    isOverdue(reminder.dueDate) ? 'border-l-2 border-red-500' :
    isDueToday(reminder.dueDate) ? 'border-l-2 border-yellow-500' : '';

  return `
    <div class="card ${urgencyClass}">
      <div class="flex items-start gap-3">
        ${contact ? renderAvatar(contact.fullName, contact.photoUrl, 'sm', contact.linkedInUrl) : '<div class="avatar avatar-sm bg-surface-200">?</div>'}
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h3 class="text-sm font-medium ${isCompleted ? 'line-through' : ''}">${escapeHtml(reminder.title)}</h3>
              ${contact ? `<p class="text-xs text-surface-500 cursor-pointer hover:text-brand-600" onclick="viewContact('${contact.id}')">${escapeHtml(contact.fullName)}</p>` : ''}
            </div>
            <span class="text-xs text-surface-500 whitespace-nowrap ${isOverdue(reminder.dueDate) && !isCompleted ? 'text-red-600 dark:text-red-400 font-medium' : ''}">
              ${formatFutureRelative(reminder.dueDate)}
            </span>
          </div>
          ${reminder.description ? `<p class="text-xs text-surface-500 mt-1">${escapeHtml(reminder.description)}</p>` : ''}
          ${reminder.recurring ? `<span class="badge badge-teal mt-2">Recurring every ${reminder.cadenceDays} days</span>` : ''}
        </div>
        ${!isCompleted ? `
          <div class="flex items-center gap-1">
            <button onclick="completeReminder('${reminder.id}')" class="btn-ghost btn-xs text-green-600" title="Mark complete">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </button>
            <button onclick="snoozeReminder('${reminder.id}')" class="btn-ghost btn-xs" title="Snooze 3 days">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            <button onclick="dismissReminder('${reminder.id}')" class="btn-ghost btn-xs text-red-500" title="Dismiss">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

async function openNewReminderModal(preselectedContactId = null) {
  const contacts = await DB.getForUser(STORES.contacts, currentUser.id);
  const activeContacts = getActiveContacts(contacts).sort((a, b) => a.fullName.localeCompare(b.fullName));

  openModal(`
    <div class="p-6">
      <h2 class="text-lg font-semibold mb-6">New Reminder</h2>
      <form id="new-reminder-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Contact</label>
          <select id="reminder-contact" class="input-field">
            <option value="">General reminder (no contact)</option>
            ${activeContacts.map(c => `<option value="${c.id}" ${preselectedContactId === c.id ? 'selected' : ''}>${escapeHtml(c.fullName)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Title *</label>
          <input type="text" id="reminder-title" required class="input-field" placeholder="Follow up with Jane about intro" />
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Description</label>
          <textarea id="reminder-description" class="input-field" rows="2" placeholder="Additional context…"></textarea>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Due Date *</label>
            <input type="date" id="reminder-due" required class="input-field" value="${toInputDate(addDays(new Date(), 7))}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Type</label>
            <select id="reminder-type" class="input-field" onchange="toggleRecurring(this.value)">
              <option value="one-time">One-time</option>
              <option value="recurring">Recurring</option>
            </select>
          </div>
        </div>
        <div id="recurring-options" class="hidden">
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Repeat every (days)</label>
          <input type="number" id="reminder-cadence" class="input-field" placeholder="14" min="1" />
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
          <button type="submit" class="btn-primary">Create Reminder</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('new-reminder-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const contactId = document.getElementById('reminder-contact').value || null;
    const isRecurring = document.getElementById('reminder-type').value === 'recurring';

    await DB.add(STORES.reminders, {
      userId: currentUser.id,
      contactId,
      title: document.getElementById('reminder-title').value.trim(),
      description: document.getElementById('reminder-description').value.trim(),
      dueDate: new Date(document.getElementById('reminder-due').value).toISOString(),
      type: isRecurring ? 'recurring' : 'one-time',
      status: 'pending',
      recurring: isRecurring,
      cadenceDays: isRecurring ? parseInt(document.getElementById('reminder-cadence').value) || 14 : null,
    });

    // Update contact follow-up date if linked
    if (contactId) {
      const contact = await DB.get(STORES.contacts, contactId);
      if (contact) {
        const dueDate = new Date(document.getElementById('reminder-due').value).toISOString();
        if (!contact.nextFollowUpDate || new Date(dueDate) < new Date(contact.nextFollowUpDate)) {
          contact.nextFollowUpDate = dueDate;
          await DB.put(STORES.contacts, contact);
        }
      }
    }

    closeModal();
    showToast('Reminder created', 'success');
    renderReminders();
  });
}

function toggleRecurring(value) {
  const el = document.getElementById('recurring-options');
  el.classList.toggle('hidden', value !== 'recurring');
}

async function completeReminder(reminderId) {
  const reminder = await DB.get(STORES.reminders, reminderId);
  if (!reminder) return;

  if (reminder.recurring && reminder.cadenceDays) {
    // Create next occurrence
    const nextDue = addDays(new Date(), reminder.cadenceDays);
    await DB.add(STORES.reminders, {
      userId: reminder.userId,
      contactId: reminder.contactId,
      title: reminder.title,
      description: reminder.description,
      dueDate: nextDue,
      type: 'recurring',
      status: 'pending',
      recurring: true,
      cadenceDays: reminder.cadenceDays,
    });

    // Update contact follow-up
    if (reminder.contactId) {
      const contact = await DB.get(STORES.contacts, reminder.contactId);
      if (contact) {
        contact.nextFollowUpDate = nextDue;
        await DB.put(STORES.contacts, contact);
      }
    }
  }

  reminder.status = 'completed';
  reminder.completedAt = new Date().toISOString();
  await DB.put(STORES.reminders, reminder);

  // Log activity
  if (reminder.contactId) {
    await DB.add(STORES.activities, {
      userId: currentUser.id,
      contactId: reminder.contactId,
      type: 'reminder',
      title: 'Reminder completed',
      description: reminder.title,
      timestamp: new Date().toISOString(),
    });
  }

  showToast('Reminder completed', 'success');
  renderReminders();
  checkReminders();
}

async function snoozeReminder(reminderId) {
  const reminder = await DB.get(STORES.reminders, reminderId);
  if (!reminder) return;

  reminder.dueDate = addDays(new Date(), 3);
  reminder.status = 'snoozed';
  await DB.put(STORES.reminders, reminder);

  showToast('Snoozed for 3 days', 'info');
  renderReminders();
  checkReminders();
}

async function dismissReminder(reminderId) {
  const reminder = await DB.get(STORES.reminders, reminderId);
  if (!reminder) return;

  reminder.status = 'dismissed';
  await DB.put(STORES.reminders, reminder);

  showToast('Reminder dismissed', 'info');
  renderReminders();
}

// ─────────────────────────────────────────────────────────────
// Bell / Notifications panel
// Reads directly from STORES.reminders — no derived table.
// ─────────────────────────────────────────────────────────────

/**
 * Update the badge count on the bell icon.
 * Badge = active reminders due within the next 7 days.
 */
async function checkReminders() {
  if (!currentUser) return;

  const reminders = await DB.getForUser(STORES.reminders, currentUser.id);
  const active = reminders.filter(r => r.status === 'pending' || r.status === 'snoozed');

  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const badgeCount = active.filter(r => r.dueDate && new Date(r.dueDate) <= sevenDaysFromNow).length;

  const badge   = document.getElementById('reminder-badge');
  const notifDot = document.getElementById('notif-dot');
  if (badge && notifDot) {
    if (badgeCount > 0) {
      badge.textContent = badgeCount;
      badge.classList.remove('hidden');
      notifDot.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
      notifDot.classList.add('hidden');
    }
  }

  // If the panel is open, refresh its content too
  const panel = document.getElementById('notifications-panel');
  if (panel && panel.classList.contains('open')) {
    await renderNotificationsList();
  }
}

/**
 * Render the reminders panel body directly from STORES.reminders.
 * Groups: Overdue → Due Today → This Week → Later.
 */
async function renderNotificationsList() {
  if (!currentUser) return;
  const container = document.getElementById('notifications-list');
  if (!container) return;

  const [reminders, contacts] = await Promise.all([
    DB.getForUser(STORES.reminders, currentUser.id),
    DB.getForUser(STORES.contacts, currentUser.id),
  ]);
  const contactMap = {};
  contacts.forEach(c => { contactMap[c.id] = c; });

  const active = reminders
    .filter(r => r.status === 'pending' || r.status === 'snoozed')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const now = new Date();
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const weekEnd  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const overdue   = active.filter(r => r.dueDate && new Date(r.dueDate) < now);
  const dueToday  = active.filter(r => r.dueDate && new Date(r.dueDate) >= now && new Date(r.dueDate) <= todayEnd);
  const thisWeek  = active.filter(r => r.dueDate && new Date(r.dueDate) > todayEnd && new Date(r.dueDate) <= weekEnd);
  const later     = active.filter(r => !r.dueDate || new Date(r.dueDate) > weekEnd);

  // Update subtitle
  const sub = document.getElementById('notif-panel-sub');
  if (sub) {
    const urgent = overdue.length + dueToday.length;
    sub.textContent = urgent > 0
      ? `${urgent} need${urgent === 1 ? 's' : ''} attention`
      : active.length > 0
        ? `${active.length} upcoming`
        : 'All clear';
  }

  if (active.length === 0) {
    container.innerHTML = `
      <div class="notif-empty">
        <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"/>
        </svg>
        <p>No upcoming reminders</p>
      </div>`;
    return;
  }

  const renderGroup = (label, items, dotClass) => {
    if (!items.length) return '';
    return `
      <div class="notif-section-label">${label}</div>
      ${items.map(r => {
        const contact = r.contactId ? contactMap[r.contactId] : null;
        const dueStr  = r.dueDate ? _formatDueDate(r.dueDate) : 'No date';
        return `
          <div class="notif-item">
            <div class="notif-item-dot ${dotClass}"></div>
            <div class="notif-item-body">
              <p class="notif-item-title">${escapeHtml(r.title)}</p>
              ${contact ? `<p class="notif-item-contact">${escapeHtml(contact.fullName)}</p>` : ''}
              <p class="notif-item-meta">${dueStr}</p>
            </div>
            <button class="notif-item-action" onclick="completeReminderFromPanel('${r.id}')">Done</button>
          </div>`;
      }).join('')}`;
  };

  container.innerHTML =
    renderGroup('Overdue',   overdue,  'overdue')  +
    renderGroup('Due today', dueToday, 'today')    +
    renderGroup('This week', thisWeek, 'upcoming') +
    renderGroup('Later',     later,    'upcoming');
}

/** Format a due date relative to today for the panel. */
function _formatDueDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d - now;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < -1)  return `${Math.abs(diffDays)} days overdue`;
  if (diffDays === -1) return 'Overdue since yesterday';
  if (diffDays < 0)   return 'Overdue today';
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays < 7)   return `Due in ${diffDays} days`;
  return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/** Mark a reminder done directly from the panel. */
async function completeReminderFromPanel(reminderId) {
  const reminder = await DB.get(STORES.reminders, reminderId);
  if (!reminder) return;
  reminder.status = 'completed';
  await DB.put(STORES.reminders, reminder);
  showToast('Reminder marked done', 'success');
  await checkReminders();
}

/** Open / close the notifications panel. */
function toggleNotifications() {
  const panel = document.getElementById('notifications-panel');
  if (!panel) return;

  const isOpen = panel.classList.contains('open');
  let backdrop = document.getElementById('notif-backdrop');

  if (!isOpen) {
    // ── Open ──
    // Ensure backdrop exists
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'notif-backdrop';
      backdrop.addEventListener('click', toggleNotifications);
      document.body.appendChild(backdrop);
    }
    backdrop.classList.add('visible');
    panel.classList.add('open');
    if (currentUser) renderNotificationsList();
  } else {
    // ── Close ──
    panel.classList.remove('open');
    if (backdrop) backdrop.classList.remove('visible');
  }
}

// Periodically check reminders
setInterval(() => {
  if (currentUser) checkReminders();
}, 60000); // Every minute
