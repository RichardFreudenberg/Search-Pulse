/* ============================================================
   Pulse — "Today" daily cockpit (landing page)
   ============================================================
   One focused screen that batches everything needing action today:
     • Your tasks (free-form to-dos + deal tasks)
     • Emails awaiting your reply (from the Outlook sync)
     • Follow-ups & reminders that are due
     • Stay-in-touch: relationships past their cadence
   with one-click Complete / Snooze / Open / Draft-reply actions.

   Reuses the existing `todos` store + reminders/dealTasks/calls data,
   and the cadence helpers from relationships.js.
   ============================================================ */

let _todayCache = null;

function _tdyDateStr(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

async function renderToday() {
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-4xl mx-auto">${renderLoadingSkeleton(5)}</div>`;

  const [todos, contacts, companies, reminders, calls, deals, dealTasks, settings] = await Promise.all([
    DB.getForUser(STORES.todos, currentUser.id).catch(() => []),
    DB.getForUser(STORES.contacts, currentUser.id).catch(() => []),
    DB.getForUser(STORES.companies, currentUser.id).catch(() => []),
    DB.getForUser(STORES.reminders, currentUser.id).catch(() => []),
    DB.getForUser(STORES.calls, currentUser.id).catch(() => []),
    DB.getForUser(STORES.deals, currentUser.id).catch(() => []),
    DB.getForUser(STORES.dealTasks, currentUser.id).catch(() => []),
    DB.get(STORES.settings, `settings_${currentUser.id}`).catch(() => null),
  ]);
  if (typeof applyCadenceSettings === 'function') applyCadenceSettings(settings);

  _todayCache = { todos, contacts, companies, reminders, calls, deals, dealTasks };
  _todayPaint();
}

function _todayPaint(focusInput) {
  const pageContent = document.getElementById('page-content');
  if (!pageContent) return;
  if (!_todayCache) { renderToday(); return; }
  const { todos, contacts, companies, reminders, calls, deals, dealTasks } = _todayCache;

  const today = _tdyDateStr(new Date());
  const activeContacts = getActiveContacts(contacts);
  const contactMap = buildMap(contacts);
  const companyMap = buildMap(companies);
  const dealMap    = buildMap(deals);

  // ── Tasks ──
  const openTodos = todos.filter(t => !t.done && (!t.date || t.date <= today))
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const dueDealTasks = dealTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate.slice(0, 10) <= today)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  // ── Replies due (emails awaiting you) ──
  const replyDue = activeContacts.filter(c => c.emailStats && c.emailStats.awaiting === 'you')
    .sort((a, b) => new Date(a.emailStats.lastInboundAt || 0) - new Date(b.emailStats.lastInboundAt || 0));

  // ── Follow-ups & reminders ──
  const followUps = activeContacts.filter(c => c.nextFollowUpDate && c.nextFollowUpDate.slice(0, 10) <= today)
    .sort((a, b) => new Date(a.nextFollowUpDate) - new Date(b.nextFollowUpDate));
  const dueReminders = reminders.filter(r => (r.status === 'pending' || r.status === 'snoozed') && r.dueDate && r.dueDate.slice(0, 10) <= today)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const dueCallFollowUps = calls.filter(c => c.followUpDate && (c.nextSteps || (c.tasks && c.tasks.length)) && c.followUpDate.slice(0, 10) <= today)
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate)).slice(0, 15);

  // ── Stay in touch (cadence-due) — minus anyone already surfaced above ──
  const cadenceDue = (typeof getCadenceDueContacts === 'function') ? getCadenceDueContacts(activeContacts) : [];
  const skip = new Set([...replyDue, ...followUps].map(c => c.id));
  const touchDue = cadenceDue.filter(c => !skip.has(c.id)).slice(0, 25);

  const totalOpen = openTodos.length + dueDealTasks.length + replyDue.length + followUps.length + dueReminders.length + dueCallFollowUps.length + touchDue.length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateLong = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Lane helper ──
  const lane = (title, count, color, icon, body) => !body ? '' : `
    <div class="card mb-5">
      <div class="flex items-center gap-2 mb-3">
        <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-${color}-100 dark:bg-${color}-900/30 text-${color}-600">${icon}</span>
        <h2 class="text-sm font-bold">${title}</h2>
        <span class="text-xs text-surface-400">${count}</span>
      </div>
      ${body}
    </div>`;

  const tasksBody = `
    <div class="flex gap-2 mb-3">
      <input type="text" id="today-task-input" class="search-field !pl-3" placeholder="Add a task and press Enter…"
        onkeydown="if(event.key==='Enter'){event.preventDefault();todayAddTask();}" />
      <button onclick="todayAddTask()" class="btn-primary btn-sm flex-shrink-0">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15"/></svg>Add
      </button>
    </div>
    ${(openTodos.length + dueDealTasks.length) === 0
      ? `<p class="text-sm text-surface-400 py-2">No open tasks. Add one above.</p>`
      : `<div class="divide-y divide-surface-100 dark:divide-surface-800 -mb-1">
          ${openTodos.map(_todayTodoRow).join('')}
          ${dueDealTasks.map(t => _todayDealTaskRow(t, dealMap[t.dealId])).join('')}
        </div>`}`;

  const replyBody = replyDue.length ? `<div class="divide-y divide-surface-100 dark:divide-surface-800 -mb-1">
      ${replyDue.map(c => _todayReplyRow(c, companyMap[c.companyId])).join('')}</div>` : '';

  const followBody = (followUps.length + dueReminders.length + dueCallFollowUps.length) ? `<div class="divide-y divide-surface-100 dark:divide-surface-800 -mb-1">
      ${followUps.map(c => _todayFollowUpRow(c, companyMap[c.companyId])).join('')}
      ${dueReminders.map(r => _todayReminderRow(r, contactMap[r.contactId])).join('')}
      ${dueCallFollowUps.map(c => _todayCallRow(c, contactMap[c.contactId])).join('')}
    </div>` : '';

  const touchBody = touchDue.length ? `<div class="divide-y divide-surface-100 dark:divide-surface-800 -mb-1">
      ${touchDue.map(c => _todayTouchRow(c, companyMap[c.companyId])).join('')}</div>` : '';

  const ico = {
    task:   '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    reply:  '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>',
    follow: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    touch:  '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.023 9.348h4.992V4.356M3.985 19.644V14.65h4.992m-9.97-3.348a8.001 8.001 0 0115.357-2M3.985 14.65a8.001 8.001 0 0015.357 2"/></svg>',
  };

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-4xl mx-auto animate-fade-in">
      <div class="mb-6">
        <h1 class="text-2xl font-bold tracking-tight">${greeting}</h1>
        <p class="text-sm text-surface-500 mt-0.5">${dateLong} · ${totalOpen === 0 ? 'you’re all caught up 🎉' : `${totalOpen} thing${totalOpen === 1 ? '' : 's'} need your attention`}</p>
      </div>

      ${lane('Your tasks', openTodos.length + dueDealTasks.length, 'brand', ico.task, tasksBody)}
      ${lane('Reply to', replyDue.length, 'red', ico.reply, replyBody)}
      ${lane('Follow up', followUps.length + dueReminders.length + dueCallFollowUps.length, 'purple', ico.follow, followBody)}
      ${lane('Stay in touch', touchDue.length, 'amber', ico.touch, touchBody)}

      ${totalOpen === 0 ? `
        <div class="card text-center py-12">
          <div class="w-12 h-12 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-3">
            <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <p class="text-sm font-semibold">All clear for today</p>
          <p class="text-xs text-surface-400 mt-1">Nothing due. Add a task above or check your <button onclick="navigate('contacts')" class="text-brand-600 hover:underline">relationships</button>.</p>
        </div>` : ''}
    </div>`;

  if (focusInput) { const i = document.getElementById('today-task-input'); if (i) i.focus(); }
}

// ── Row renderers ────────────────────────────────────────────
function _todayActionBtn(onclick, label, cls) {
  return `<button onclick="event.stopPropagation(); ${onclick}" class="btn-ghost btn-xs ${cls || 'text-surface-500'} flex-shrink-0">${label}</button>`;
}

function _todayTodoRow(t) {
  return `
    <div class="flex items-center gap-3 py-2.5 group">
      <button onclick="todayToggleTodo('${t.id}')" title="Mark done" class="flex-shrink-0 text-surface-300 hover:text-green-500 dark:text-surface-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.5"/></svg>
      </button>
      <span class="flex-1 text-sm">${escapeHtml(t.text || '')}</span>
      <button onclick="todayDeleteTodo('${t.id}')" title="Delete" class="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-surface-300 hover:text-red-500 transition-all">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>`;
}

function _todayDealTaskRow(t, deal) {
  return `
    <div class="flex items-center gap-3 py-2.5">
      <button onclick="todayCompleteDealTask('${t.id}')" title="Mark done" class="flex-shrink-0 text-surface-300 hover:text-green-500 dark:text-surface-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.5"/></svg>
      </button>
      <div class="min-w-0 flex-1">
        <p class="text-sm truncate">${escapeHtml(t.title || 'Task')}</p>
        ${deal ? `<button onclick="viewDeal('${deal.id}')" class="text-[11px] text-brand-500 hover:underline">${escapeHtml(deal.name)}</button>` : ''}
      </div>
      <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex-shrink-0">Deal</span>
    </div>`;
}

function _todayReplyRow(c, company) {
  const subj = c.emailStats && c.emailStats.lastSubject ? c.emailStats.lastSubject : '';
  const when = c.emailStats && c.emailStats.lastInboundAt ? (typeof formatRelative === 'function' ? formatRelative(c.emailStats.lastInboundAt) : '') : '';
  return `
    <div class="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/50 rounded-lg px-1 -mx-1" onclick="viewContact('${c.id}')">
      ${typeof renderAvatar === 'function' ? renderAvatar(c.fullName, c.photoUrl, 'sm', c.linkedInUrl) : ''}
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(c.fullName)}${company ? ` <span class="text-surface-400 font-normal">· ${escapeHtml(company.name)}</span>` : ''}</div>
        <div class="text-xs text-surface-500 truncate">${subj ? escapeHtml(subj) : 'Awaiting your reply'}${when ? ` · ${when}` : ''}</div>
      </div>
      ${_todayActionBtn(`outlookEmailAI('${c.id}','draft')`, 'Draft reply', 'text-brand-600')}
    </div>`;
}

function _todayFollowUpRow(c, company) {
  const od = typeof isOverdue === 'function' ? isOverdue(c.nextFollowUpDate) : false;
  const when = typeof formatFutureRelative === 'function' ? formatFutureRelative(c.nextFollowUpDate) : '';
  return `
    <div class="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/50 rounded-lg px-1 -mx-1" onclick="viewContact('${c.id}')">
      ${typeof renderAvatar === 'function' ? renderAvatar(c.fullName, c.photoUrl, 'sm', c.linkedInUrl) : ''}
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(c.fullName)}${company ? ` <span class="text-surface-400 font-normal">· ${escapeHtml(company.name)}</span>` : ''}</div>
        <div class="text-xs truncate ${od ? 'text-red-600 dark:text-red-400' : 'text-surface-500'}">Follow-up ${od ? 'overdue' : 'due'}${when ? ` · ${when}` : ''}</div>
      </div>
      ${_todayActionBtn(`todayDoneFollowUp('${c.id}')`, 'Done', 'text-green-600')}
      ${_todayActionBtn(`todaySnoozeFollowUp('${c.id}')`, 'Snooze')}
    </div>`;
}

function _todayReminderRow(r, contact) {
  const od = typeof isOverdue === 'function' ? isOverdue(r.dueDate) : false;
  return `
    <div class="flex items-center gap-3 py-2.5">
      <span class="flex-shrink-0 w-2 h-2 rounded-full ${od ? 'bg-red-500' : 'bg-purple-400'}"></span>
      <div class="min-w-0 flex-1">
        <p class="text-sm truncate">${escapeHtml(r.title || 'Reminder')}</p>
        ${contact ? `<button onclick="viewContact('${contact.id}')" class="text-[11px] text-brand-500 hover:underline">${escapeHtml(contact.fullName)}</button>` : ''}
      </div>
      ${_todayActionBtn(`todayCompleteReminder('${r.id}')`, 'Done', 'text-green-600')}
      ${_todayActionBtn(`todaySnoozeReminder('${r.id}')`, 'Snooze')}
    </div>`;
}

function _todayCallRow(call, contact) {
  const text = (call.nextSteps || (call.tasks || []).map(t => t.text).join('; ') || 'Follow up from call');
  return `
    <div class="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/50 rounded-lg px-1 -mx-1" ${contact ? `onclick="viewContact('${contact.id}')"` : ''}>
      <span class="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400"></span>
      <div class="min-w-0 flex-1">
        <p class="text-sm truncate">${escapeHtml(text.slice(0, 90))}</p>
        ${contact ? `<span class="text-[11px] text-surface-400">Re: ${escapeHtml(contact.fullName)}</span>` : ''}
      </div>
      <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex-shrink-0">Call</span>
    </div>`;
}

function _todayTouchRow(c, company) {
  const last = c.lastContactDate ? (typeof formatRelative === 'function' ? formatRelative(c.lastContactDate) : '') : 'never';
  return `
    <div class="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/50 rounded-lg px-1 -mx-1" onclick="viewContact('${c.id}')">
      ${typeof renderAvatar === 'function' ? renderAvatar(c.fullName, c.photoUrl, 'sm', c.linkedInUrl) : ''}
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium truncate">${escapeHtml(c.fullName)}</span>
          ${typeof renderBucketBadge === 'function' ? renderBucketBadge(getContactBucket(c)) : ''}
        </div>
        <div class="text-xs text-surface-500 truncate">${company ? escapeHtml(company.name) + ' · ' : ''}Last contact ${last}</div>
      </div>
      ${_todayActionBtn(`openNewCallModal('${c.id}')`, 'Log call', 'text-brand-600')}
      ${_todayActionBtn(`todaySnoozeTouch('${c.id}')`, 'Snooze')}
    </div>`;
}

// ── Actions ──────────────────────────────────────────────────
async function todayAddTask() {
  const input = document.getElementById('today-task-input');
  const text = (input?.value || '').trim();
  if (!text) { input?.focus(); return; }
  if (input) input.value = '';
  try {
    await DB.add(STORES.todos, { userId: currentUser.id, text, date: _tdyDateStr(new Date()), done: false, createdAt: new Date().toISOString() });
    if (_todayCache) _todayCache.todos.push({ id: 'tmp', text, date: _tdyDateStr(new Date()), done: false, createdAt: new Date().toISOString() });
  } catch (_) { showToast('Could not save task', 'error'); }
  await renderToday();
  const i = document.getElementById('today-task-input'); if (i) i.focus();
}

async function todayToggleTodo(id) {
  const t = await DB.get(STORES.todos, id);
  if (t) await DB.put(STORES.todos, { ...t, done: true, completedAt: new Date().toISOString() }).catch(() => {});
  showToast('Done ✓', 'success');
  renderToday();
}

async function todayDeleteTodo(id) {
  await DB.delete(STORES.todos, id).catch(() => {});
  renderToday();
}

async function todayCompleteDealTask(id) {
  const t = await DB.get(STORES.dealTasks, id);
  if (t) await DB.put(STORES.dealTasks, { ...t, status: 'done', completedAt: new Date().toISOString() }).catch(() => {});
  showToast('Task done ✓', 'success');
  renderToday();
}

async function todayCompleteReminder(id) {
  const r = await DB.get(STORES.reminders, id);
  if (!r) return;
  if (r.recurring && r.cadenceDays) {
    const next = new Date(r.dueDate); next.setDate(next.getDate() + Number(r.cadenceDays));
    await DB.put(STORES.reminders, { ...r, dueDate: next.toISOString() }).catch(() => {});
  } else {
    await DB.put(STORES.reminders, { ...r, status: 'completed', completedAt: new Date().toISOString() }).catch(() => {});
  }
  showToast('Reminder done ✓', 'success');
  renderToday();
  if (typeof checkReminders === 'function') checkReminders();
}

async function todaySnoozeReminder(id) {
  const r = await DB.get(STORES.reminders, id);
  if (!r) return;
  const next = new Date(); next.setDate(next.getDate() + 3);
  await DB.put(STORES.reminders, { ...r, dueDate: next.toISOString(), status: 'snoozed' }).catch(() => {});
  showToast('Snoozed 3 days', 'info');
  renderToday();
  if (typeof checkReminders === 'function') checkReminders();
}

async function todayDoneFollowUp(contactId) {
  const c = await DB.get(STORES.contacts, contactId);
  if (c) await DB.put(STORES.contacts, { ...c, nextFollowUpDate: null }).catch(() => {});
  showToast('Follow-up cleared ✓', 'success');
  renderToday();
}

async function todaySnoozeFollowUp(contactId, days = 3) {
  const c = await DB.get(STORES.contacts, contactId);
  if (!c) return;
  const next = new Date(); next.setDate(next.getDate() + days);
  await DB.put(STORES.contacts, { ...c, nextFollowUpDate: next.toISOString() }).catch(() => {});
  showToast(`Snoozed ${days} days`, 'info');
  renderToday();
}

async function todaySnoozeTouch(contactId, days = 7) {
  const c = await DB.get(STORES.contacts, contactId);
  if (!c) return;
  const next = new Date(); next.setDate(next.getDate() + days);
  await DB.put(STORES.contacts, { ...c, cadenceSnoozeUntil: next.toISOString() }).catch(() => {});
  showToast(`Snoozed ${days} days`, 'info');
  renderToday();
}
