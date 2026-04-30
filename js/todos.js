/* ============================================
   Nexus CRM — Daily To Do Panel
   ============================================
   Slide-in drawer from the right.
   Sections:
     1. Manual todos for the selected day (Firestore todos store)
     2. Deal tasks due on or before the selected day
     3. Reminders (pending/snoozed) due on or before the selected day
     4. Call follow-ups due on or before the selected day
   ============================================ */

let _todoDrawerOpen = false;
let _todoSelectedDate = new Date(); // local Date for the day being viewed

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Local YYYY-MM-DD for a Date object (no timezone shift). */
function _todoDateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** User-friendly label for the date navigator. */
function _todoPrettyDate(d) {
  const todayStr     = _todoDateStr(new Date());
  const yesterdayD   = new Date(); yesterdayD.setDate(yesterdayD.getDate() - 1);
  const tomorrowD    = new Date(); tomorrowD.setDate(tomorrowD.getDate() + 1);
  const ds = _todoDateStr(d);
  if (ds === todayStr)                    return 'Today';
  if (ds === _todoDateStr(yesterdayD))    return 'Yesterday';
  if (ds === _todoDateStr(tomorrowD))     return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Open / Close ─────────────────────────────────────────────────────────────

function openTodoPanel() {
  _todoDrawerOpen = true;
  _todoSelectedDate = new Date(); // always open on today
  const drawer = document.getElementById('todo-drawer');
  if (!drawer) return;
  drawer.classList.remove('hidden');
  // Allow the display:flex to paint before the CSS transform triggers
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.getElementById('todo-panel')?.classList.remove('translate-x-full');
    });
  });
  renderTodoPanelContent();
}

function closeTodoPanel() {
  _todoDrawerOpen = false;
  const panel  = document.getElementById('todo-panel');
  const drawer = document.getElementById('todo-drawer');
  if (!panel || !drawer) return;
  panel.classList.add('translate-x-full');
  setTimeout(() => drawer.classList.add('hidden'), 300);
}

// ─── Date navigation ──────────────────────────────────────────────────────────

function navigateTodoDate(delta) {
  const d = new Date(_todoSelectedDate);
  d.setDate(d.getDate() + delta);
  _todoSelectedDate = d;
  renderTodoPanelContent();
}

// ─── Badge (count in top-bar button) ─────────────────────────────────────────

async function refreshTodoBadge() {
  if (!currentUser) return;
  const todayStr = _todoDateStr(new Date());
  try {
    const [todos, dealTasks, reminders] = await Promise.all([
      DB.getForUser(STORES.todos, currentUser.id).catch(() => []),
      DB.getForUser(STORES.dealTasks, currentUser.id).catch(() => []),
      DB.getForUser(STORES.reminders, currentUser.id).catch(() => []),
    ]);

    const pendingTodos    = todos.filter(t => t.date === todayStr && !t.done).length;
    const dueDealTasks    = dealTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate.slice(0,10) <= todayStr).length;
    const dueReminders    = reminders.filter(r => (r.status === 'pending' || r.status === 'snoozed') && r.dueDate && r.dueDate.slice(0,10) <= todayStr).length;

    const total = pendingTodos + dueDealTasks + dueReminders;
    const badge = document.getElementById('todo-badge');
    if (badge) {
      badge.textContent = total > 99 ? '99+' : String(total || '');
      badge.classList.toggle('hidden', total === 0);
    }
  } catch (_) {}
}

// ─── Main render ──────────────────────────────────────────────────────────────

async function renderTodoPanelContent() {
  const body    = document.getElementById('todo-panel-body');
  const dateLabel = document.getElementById('todo-panel-date');
  if (!body) return;

  const dateStr = _todoDateStr(_todoSelectedDate);
  const isToday = dateStr === _todoDateStr(new Date());
  if (dateLabel) dateLabel.textContent = _todoPrettyDate(_todoSelectedDate);

  // Skeleton
  body.innerHTML = `
    <div class="p-4 space-y-3">
      ${[1,2,3,4,5].map(() =>
        `<div class="h-10 rounded-lg bg-surface-100 dark:bg-surface-800 animate-pulse"></div>`
      ).join('')}
    </div>`;

  try {
    const [manualTodos, dealTasks, deals, reminders, contacts, calls] = await Promise.all([
      DB.getForUser(STORES.todos, currentUser.id).catch(() => []),
      DB.getForUser(STORES.dealTasks, currentUser.id).catch(() => []),
      DB.getForUser(STORES.deals, currentUser.id).catch(() => []),
      DB.getForUser(STORES.reminders, currentUser.id).catch(() => []),
      DB.getForUser(STORES.contacts, currentUser.id).catch(() => []),
      DB.getForUser(STORES.calls, currentUser.id).catch(() => []),
    ]);

    const dealMap    = buildMap(deals);
    const contactMap = buildMap(contacts);

    // ── Filter data for selected date ────────────────────────────────────────

    const dayTodos = manualTodos
      .filter(t => t.date === dateStr)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
    const pendingTodos = dayTodos.filter(t => !t.done);
    const doneTodos    = dayTodos.filter(t =>  t.done);

    const dueDealTasks = dealTasks
      .filter(t => t.status !== 'done' && t.dueDate && t.dueDate.slice(0,10) <= dateStr)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    const dueReminders = reminders
      .filter(r => (r.status === 'pending' || r.status === 'snoozed') && r.dueDate && r.dueDate.slice(0,10) <= dateStr)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    const dueCallFollowUps = calls
      .filter(c => {
        if (!c.followUpDate) return false;
        if (!c.nextSteps && !(c.tasks && c.tasks.length)) return false;
        return c.followUpDate.slice(0,10) <= dateStr;
      })
      .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))
      .slice(0, 12);

    const totalItems = pendingTodos.length + dueDealTasks.length + dueReminders.length + dueCallFollowUps.length;

    // ── Build HTML ────────────────────────────────────────────────────────────
    let html = '';

    // Quick-add input (always visible at top)
    html += `
      <div class="px-4 pt-4 pb-3 border-b border-surface-100 dark:border-surface-800 flex-shrink-0">
        <div class="flex gap-2">
          <input type="text" id="todo-quick-add"
            class="flex-1 text-sm px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700
                   bg-surface-50 dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500
                   placeholder-surface-400 dark:placeholder-surface-600"
            placeholder="Add a task for ${escapeHtml(isToday ? 'today' : _todoPrettyDate(_todoSelectedDate))}…"
            onkeydown="if(event.key==='Enter')_addManualTodo()" />
          <button onclick="_addManualTodo()"
            class="px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium
                   transition-colors flex-shrink-0 flex items-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Add
          </button>
        </div>
      </div>`;

    // All-clear state
    if (totalItems === 0 && pendingTodos.length === 0) {
      html += `
        <div class="flex flex-col items-center justify-center py-16 text-center px-6">
          <div class="w-14 h-14 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-4">
            <svg class="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <p class="text-sm font-semibold text-surface-700 dark:text-surface-300">All clear${isToday ? ' for today' : ''}!</p>
          <p class="text-xs text-surface-400 mt-1">No tasks, reminders, or follow-ups due.</p>
          <p class="text-xs text-surface-400 mt-0.5">Use the input above to add a task.</p>
        </div>`;
    }

    // ── Section: My Tasks ────────────────────────────────────────────────────
    if (pendingTodos.length > 0) {
      html += `
        <div class="px-4 pt-5">
          <p class="text-xs font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">
            My Tasks
            <span class="ml-1 px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-500 dark:text-surface-400 normal-case tracking-normal font-medium">${pendingTodos.length}</span>
          </p>
          <div class="space-y-1">
            ${pendingTodos.map(t => _renderManualTodoItem(t)).join('')}
          </div>
        </div>`;
    }

    // ── Section: Deal Tasks ──────────────────────────────────────────────────
    if (dueDealTasks.length > 0) {
      html += `
        <div class="px-4 pt-5">
          <p class="text-xs font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">
            Deal Tasks
            <span class="ml-1 px-1.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 normal-case tracking-normal font-medium">${dueDealTasks.length}</span>
          </p>
          <div class="space-y-1">
            ${dueDealTasks.map(t => _renderDealTaskTodoItem(t, dealMap[t.dealId], dateStr)).join('')}
          </div>
        </div>`;
    }

    // ── Section: Reminders ───────────────────────────────────────────────────
    if (dueReminders.length > 0) {
      html += `
        <div class="px-4 pt-5">
          <p class="text-xs font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">
            Reminders
            <span class="ml-1 px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 normal-case tracking-normal font-medium">${dueReminders.length}</span>
          </p>
          <div class="space-y-1">
            ${dueReminders.map(r => _renderReminderTodoItem(r, contactMap[r.contactId], dateStr)).join('')}
          </div>
        </div>`;
    }

    // ── Section: Call Follow-ups ─────────────────────────────────────────────
    if (dueCallFollowUps.length > 0) {
      html += `
        <div class="px-4 pt-5">
          <p class="text-xs font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">
            Call Follow-ups
            <span class="ml-1 px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 normal-case tracking-normal font-medium">${dueCallFollowUps.length}</span>
          </p>
          <div class="space-y-1">
            ${dueCallFollowUps.map(c => _renderCallFollowUpTodoItem(c, contactMap[c.contactId], dateStr)).join('')}
          </div>
        </div>`;
    }

    // ── Section: Completed (collapsible) ────────────────────────────────────
    if (doneTodos.length > 0) {
      html += `
        <div class="px-4 pt-5">
          <details class="group">
            <summary class="flex items-center gap-1.5 text-xs font-semibold text-surface-400 uppercase tracking-wider cursor-pointer list-none select-none hover:text-surface-500">
              <svg class="w-3 h-3 transition-transform group-open:rotate-90 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
              Completed
              <span class="ml-0.5 px-1.5 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-500 normal-case tracking-normal font-medium">${doneTodos.length}</span>
            </summary>
            <div class="mt-2 space-y-1">
              ${doneTodos.map(t => _renderManualTodoItem(t)).join('')}
            </div>
          </details>
        </div>`;
    }

    html += `<div class="h-8"></div>`; // bottom padding

    body.innerHTML = html;

    // Focus quick-add
    setTimeout(() => document.getElementById('todo-quick-add')?.focus(), 50);

  } catch (err) {
    console.error('[Todos] renderTodoPanelContent failed:', err);
    body.innerHTML = `
      <div class="p-6 text-sm text-red-500 text-center">
        Failed to load tasks — please refresh.
        <p class="text-xs text-surface-400 mt-1">${escapeHtml(err.message)}</p>
      </div>`;
  }

  refreshTodoBadge();
}

// ─── Item renderers ───────────────────────────────────────────────────────────

function _renderManualTodoItem(todo) {
  const done = todo.done;
  return `
    <div class="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/60 group transition-colors">
      <button onclick="_toggleManualTodo('${todo.id}')" class="mt-0.5 flex-shrink-0 transition-colors" title="${done ? 'Mark incomplete' : 'Mark done'}">
        ${done
          ? `<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
          : `<svg class="w-5 h-5 text-surface-300 hover:text-brand-500 dark:text-surface-600 dark:hover:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.5"/></svg>`
        }
      </button>
      <span class="flex-1 text-sm leading-snug pt-0.5 ${done ? 'line-through text-surface-400 dark:text-surface-600' : 'text-surface-800 dark:text-surface-200'}">${escapeHtml(todo.text)}</span>
      <button onclick="_deleteManualTodo('${todo.id}')"
        class="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-surface-300 hover:text-red-500 dark:text-surface-600 dark:hover:text-red-400 transition-all"
        title="Delete">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>`;
}

function _renderDealTaskTodoItem(task, deal, dateStr) {
  const overdue = task.dueDate.slice(0,10) < dateStr;
  return `
    <div class="flex items-start gap-2.5 px-2 py-2 rounded-lg ${overdue ? 'bg-red-50/40 dark:bg-red-900/10' : 'hover:bg-surface-50 dark:hover:bg-surface-800/60'} transition-colors">
      <button onclick="_completeDealTaskFromTodo('${task.id}')" class="mt-0.5 flex-shrink-0 transition-colors" title="Mark done">
        <svg class="w-5 h-5 text-surface-300 hover:text-brand-500 dark:text-surface-600 dark:hover:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.5"/></svg>
      </button>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-surface-800 dark:text-surface-200 leading-snug">${escapeHtml(task.title)}</p>
        <div class="flex items-center gap-2 mt-0.5 flex-wrap">
          ${deal
            ? `<button onclick="closeTodoPanel();navigate('deals');" class="text-xs text-brand-500 hover:underline">${escapeHtml(deal.name)}</button>`
            : ''}
          ${overdue
            ? `<span class="text-xs text-red-500 font-medium">Overdue · ${new Date(task.dueDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>`
            : task.dueDate
              ? `<span class="text-xs text-surface-400">Due ${new Date(task.dueDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>`
              : ''}
        </div>
      </div>
      <span class="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-medium">Deal</span>
    </div>`;
}

function _renderReminderTodoItem(reminder, contact, dateStr) {
  const overdue = reminder.dueDate.slice(0,10) < dateStr;
  return `
    <div class="flex items-start gap-2.5 px-2 py-2 rounded-lg ${overdue ? 'bg-red-50/40 dark:bg-red-900/10' : 'hover:bg-surface-50 dark:hover:bg-surface-800/60'} transition-colors">
      <button onclick="_completeReminderFromTodo('${reminder.id}')" class="mt-0.5 flex-shrink-0 transition-colors" title="Mark done">
        <svg class="w-5 h-5 text-surface-300 hover:text-green-500 dark:text-surface-600 dark:hover:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.5"/></svg>
      </button>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-surface-800 dark:text-surface-200 leading-snug">${escapeHtml(reminder.title)}</p>
        <div class="flex items-center gap-2 mt-0.5 flex-wrap">
          ${contact
            ? `<button onclick="closeTodoPanel();viewContact('${contact.id}');" class="text-xs text-brand-500 hover:underline">${escapeHtml(contact.fullName)}</button>`
            : ''}
          ${overdue
            ? `<span class="text-xs text-red-500 font-medium">Overdue · ${new Date(reminder.dueDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>`
            : reminder.dueDate
              ? `<span class="text-xs text-surface-400">Due ${new Date(reminder.dueDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>`
              : ''}
        </div>
      </div>
      <span class="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 font-medium">Reminder</span>
    </div>`;
}

function _renderCallFollowUpTodoItem(call, contact, dateStr) {
  const overdue = call.followUpDate.slice(0,10) < dateStr;
  const text = call.nextSteps
    ? call.nextSteps
    : (call.tasks && call.tasks.length ? call.tasks.map(t => t.text).join('; ') : 'Follow up');
  return `
    <div class="flex items-start gap-2.5 px-2 py-2 rounded-lg ${overdue ? 'bg-red-50/40 dark:bg-red-900/10' : 'hover:bg-surface-50 dark:hover:bg-surface-800/60'} transition-colors">
      <div class="mt-0.5 flex-shrink-0 w-5 h-5 flex items-center justify-center">
        <svg class="w-4 h-4 text-blue-400 dark:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/>
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-surface-800 dark:text-surface-200 leading-snug line-clamp-2">${escapeHtml(text)}</p>
        <div class="flex items-center gap-2 mt-0.5 flex-wrap">
          ${contact
            ? `<button onclick="closeTodoPanel();viewContact('${contact.id}');" class="text-xs text-brand-500 hover:underline">Re: ${escapeHtml(contact.fullName)}</button>`
            : ''}
          ${overdue
            ? `<span class="text-xs text-red-500 font-medium">Overdue · ${new Date(call.followUpDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>`
            : call.followUpDate
              ? `<span class="text-xs text-surface-400">Due ${new Date(call.followUpDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>`
              : ''}
        </div>
      </div>
      <span class="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium">Call</span>
    </div>`;
}

// ─── CRUD — Manual Todos ──────────────────────────────────────────────────────

async function _addManualTodo() {
  const input = document.getElementById('todo-quick-add');
  const text  = (input?.value || '').trim();
  if (!text) { input?.focus(); return; }

  // Optimistic: clear input immediately for fast feel
  input.value = '';
  input.setAttribute('disabled', 'true');

  try {
    await DB.add(STORES.todos, {
      userId:    currentUser.id,
      text,
      date:      _todoDateStr(_todoSelectedDate),
      done:      false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    showToast('Could not save task', 'error');
    console.error('[Todos] add failed:', err);
  } finally {
    input.removeAttribute('disabled');
  }

  renderTodoPanelContent();
}

async function _toggleManualTodo(id) {
  const todo = await DB.get(STORES.todos, id);
  if (!todo) return;
  await DB.put(STORES.todos, {
    ...todo,
    done:        !todo.done,
    completedAt: !todo.done ? new Date().toISOString() : null,
  }).catch(() => {});
  renderTodoPanelContent();
}

async function _deleteManualTodo(id) {
  await DB.delete(STORES.todos, id).catch(() => {});
  renderTodoPanelContent();
  refreshTodoBadge();
}

// ─── CRUD — Deal Tasks & Reminders (from panel) ───────────────────────────────

async function _completeDealTaskFromTodo(taskId) {
  const task = await DB.get(STORES.dealTasks, taskId);
  if (!task) return;
  await DB.put(STORES.dealTasks, { ...task, status: 'done', completedAt: new Date().toISOString() }).catch(() => {});
  showToast('Task completed ✓', 'success');
  renderTodoPanelContent();
}

async function _completeReminderFromTodo(reminderId) {
  const reminder = await DB.get(STORES.reminders, reminderId);
  if (!reminder) return;

  if (reminder.recurring && reminder.cadenceDays) {
    // Advance recurring reminder to next occurrence
    const next = new Date(reminder.dueDate);
    next.setDate(next.getDate() + Number(reminder.cadenceDays));
    await DB.put(STORES.reminders, { ...reminder, dueDate: next.toISOString() }).catch(() => {});
  } else {
    await DB.put(STORES.reminders, { ...reminder, status: 'completed', completedAt: new Date().toISOString() }).catch(() => {});
  }

  showToast('Reminder done ✓', 'success');
  renderTodoPanelContent();
  if (typeof checkReminders === 'function') checkReminders(); // update bell badge
}
