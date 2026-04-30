/* ============================================
   Nexus CRM — Daily To Do's Floating Panel
   ============================================
   Mechanically identical to the Log Call panel:
   draggable, minimizable, persists across navigation.

   Two tabs:
     Today    — add/edit/check-off tasks + pulled-in
                deal tasks, reminders, call follow-ups
     This Week — completed tasks grouped by day (Mon–Sun)
   ============================================ */

let _todoMinimized   = false;
let _todoActiveTab   = 'today';   // 'today' | 'week'
let _todoSelectedDate = new Date();

// ─── Date helpers ─────────────────────────────────────────────────────────────

function _todoDateStr(d) {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function _todoPrettyDate(d) {
  const todayStr = _todoDateStr(new Date());
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  const ds = _todoDateStr(d);
  if (ds === todayStr)           return 'Today';
  if (ds === _todoDateStr(yd))   return 'Yesterday';
  if (ds === _todoDateStr(tm))   return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Start of current ISO week (Monday)
function _todoWeekStart(ref) {
  const d = new Date(ref);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Open / close / minimize ──────────────────────────────────────────────────

function openTodoPanel() {
  _todoSelectedDate = new Date();
  _todoMinimized    = false;
  _todoActiveTab    = 'today';

  const panel = document.getElementById('todo-floating-panel');
  if (!panel) return;
  panel.style.display = 'flex';

  const body    = document.getElementById('todo-panel-body');
  const dateNav = document.getElementById('todo-date-nav');
  const minBtn  = document.getElementById('todo-minimize-btn');
  if (body)    body.style.display = '';
  if (dateNav) dateNav.style.display = '';
  if (minBtn)  minBtn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>';

  _todoInitDrag();
  renderTodoPanelContent();
}

function closeTodoPanel() {
  const panel = document.getElementById('todo-floating-panel');
  if (panel) panel.style.display = 'none';
  _todoMinimized = false;
}

function _todoToggleMinimize() {
  _todoMinimized = !_todoMinimized;
  const body    = document.getElementById('todo-panel-body');
  const dateNav = document.getElementById('todo-date-nav');
  const minBtn  = document.getElementById('todo-minimize-btn');
  if (body)    body.style.display = _todoMinimized ? 'none' : '';
  if (dateNav) dateNav.style.display = _todoMinimized ? 'none' : '';
  if (minBtn)  minBtn.innerHTML = _todoMinimized
    ? '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8l8 8 8-8"/></svg>'
    : '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>';
}

// ─── Date navigation ──────────────────────────────────────────────────────────

function navigateTodoDate(delta) {
  const d = new Date(_todoSelectedDate);
  d.setDate(d.getDate() + delta);
  _todoSelectedDate = d;
  renderTodoPanelContent();
}

// ─── Drag ────────────────────────────────────────────────────────────────────

function _todoInitDrag() {
  const panel  = document.getElementById('todo-floating-panel');
  const handle = document.getElementById('todo-drag-handle');
  if (!panel || !handle || handle._todoDragInit) return;
  handle._todoDragInit = true;

  let dragging = false, ox = 0, oy = 0;

  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('span[id]')) return;
    const rect = panel.getBoundingClientRect();
    panel.style.right  = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left   = rect.left + 'px';
    panel.style.top    = rect.top  + 'px';
    ox = e.clientX - rect.left;
    oy = e.clientY - rect.top;
    dragging = true;
    handle.classList.add('todo-dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const maxX = Math.max(0, window.innerWidth  - panel.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - 48);
    panel.style.left = Math.max(0, Math.min(maxX, e.clientX - ox)) + 'px';
    panel.style.top  = Math.max(0, Math.min(maxY, e.clientY - oy)) + 'px';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    handle.classList.remove('todo-dragging');
  });
}

// ─── Badge ────────────────────────────────────────────────────────────────────

async function refreshTodoBadge() {
  if (!currentUser) return;
  const todayStr = _todoDateStr(new Date());
  try {
    const [todos, dealTasks, reminders] = await Promise.all([
      DB.getForUser(STORES.todos, currentUser.id).catch(() => []),
      DB.getForUser(STORES.dealTasks, currentUser.id).catch(() => []),
      DB.getForUser(STORES.reminders, currentUser.id).catch(() => []),
    ]);
    const n = todos.filter(t => t.date === todayStr && !t.done).length
            + dealTasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate.slice(0,10) <= todayStr).length
            + reminders.filter(r => (r.status === 'pending' || r.status === 'snoozed') && r.dueDate && r.dueDate.slice(0,10) <= todayStr).length;
    const badge = document.getElementById('todo-badge');
    if (badge) {
      badge.textContent = n > 99 ? '99+' : String(n || '');
      badge.classList.toggle('hidden', n === 0);
    }
  } catch (_) {}
}

// ─── Tab switcher ─────────────────────────────────────────────────────────────

function switchTodoTab(tab) {
  _todoActiveTab = tab;
  renderTodoPanelContent();
}

// ─── Main render ──────────────────────────────────────────────────────────────

async function renderTodoPanelContent() {
  const body      = document.getElementById('todo-panel-body');
  const dateLabel = document.getElementById('todo-panel-date');
  if (!body) return;

  const dateStr = _todoDateStr(_todoSelectedDate);
  if (dateLabel) dateLabel.textContent = _todoPrettyDate(_todoSelectedDate);

  // Skeleton
  body.innerHTML = `
    <div class="p-4 space-y-2.5">
      ${[1,2,3,4].map(() => `<div class="h-9 rounded-lg bg-surface-100 dark:bg-surface-800 animate-pulse"></div>`).join('')}
    </div>`;

  try {
    if (_todoActiveTab === 'week') {
      await _renderWeekTab(body);
    } else {
      await _renderTodayTab(body, dateStr);
    }
  } catch (err) {
    console.error('[Todos]', err);
    body.innerHTML = `<div class="p-4 text-sm text-red-500">Failed to load — please refresh.<br><span class="text-xs text-surface-400">${escapeHtml(err.message)}</span></div>`;
  }

  refreshTodoBadge();
}

// ─── Today tab ───────────────────────────────────────────────────────────────

async function _renderTodayTab(body, dateStr) {
  const isToday = dateStr === _todoDateStr(new Date());

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

  const dayTodos = manualTodos
    .filter(t => t.date === dateStr)
    .sort((a, b) => { if (a.done !== b.done) return a.done ? 1 : -1; return new Date(a.createdAt) - new Date(b.createdAt); });
  const pending = dayTodos.filter(t => !t.done);
  const done    = dayTodos.filter(t =>  t.done);

  const dueDealTasks = dealTasks
    .filter(t => t.status !== 'done' && t.dueDate && t.dueDate.slice(0,10) <= dateStr)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const dueReminders = reminders
    .filter(r => (r.status === 'pending' || r.status === 'snoozed') && r.dueDate && r.dueDate.slice(0,10) <= dateStr)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const dueCallFollowUps = calls
    .filter(c => c.followUpDate && (c.nextSteps || (c.tasks && c.tasks.length)) && c.followUpDate.slice(0,10) <= dateStr)
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))
    .slice(0, 10);

  const totalPending = pending.length + dueDealTasks.length + dueReminders.length + dueCallFollowUps.length;

  let html = `
    <!-- Tab bar -->
    <div class="flex border-b border-surface-200 dark:border-surface-700 flex-shrink-0">
      <button onclick="switchTodoTab('today')" class="flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${_todoActiveTab==='today' ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-surface-400 hover:text-surface-600 dark:hover:text-surface-300'}">Today</button>
      <button onclick="switchTodoTab('week')"  class="flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${_todoActiveTab==='week'  ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-surface-400 hover:text-surface-600 dark:hover:text-surface-300'}">This Week</button>
    </div>

    <!-- Quick-add -->
    <div class="px-3 pt-3 pb-2 border-b border-surface-100 dark:border-surface-800">
      <div class="flex gap-2">
        <input type="text" id="todo-quick-add"
          class="flex-1 text-sm px-2.5 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700
                 bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-brand-500
                 placeholder-surface-400 dark:placeholder-surface-600"
          placeholder="Add a task${isToday ? '' : ' for ' + escapeHtml(_todoPrettyDate(_todoSelectedDate))}…"
          onkeydown="if(event.key==='Enter'){event.preventDefault();_addManualTodo();}" />
        <button onclick="_addManualTodo()"
          class="px-2.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold
                 transition-colors flex-shrink-0 flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          Add
        </button>
      </div>
    </div>`;

  // All-clear
  if (totalPending === 0 && pending.length === 0) {
    html += `
      <div class="flex flex-col items-center justify-center py-10 px-4 text-center">
        <div class="w-11 h-11 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mb-3">
          <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <p class="text-sm font-semibold text-surface-700 dark:text-surface-300">All clear${isToday ? ' for today' : ''}!</p>
        <p class="text-xs text-surface-400 mt-1">Add a task above to get started.</p>
      </div>`;
  }

  // ── My Tasks ──────────────────────────────────────────────────────────────
  if (pending.length > 0) {
    html += `<div class="px-3 pt-3">
      <p class="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-1.5">My Tasks</p>
      <div class="space-y-0.5">
        ${pending.map(t => _renderEditableTask(t)).join('')}
      </div>
    </div>`;
  }

  // ── Deal Tasks ────────────────────────────────────────────────────────────
  if (dueDealTasks.length > 0) {
    html += `<div class="px-3 pt-3">
      <p class="text-[10px] font-semibold text-orange-500 uppercase tracking-wider mb-1.5">Deal Tasks · ${dueDealTasks.length}</p>
      <div class="space-y-0.5">
        ${dueDealTasks.map(t => _renderDealTaskRow(t, dealMap[t.dealId], dateStr)).join('')}
      </div>
    </div>`;
  }

  // ── Reminders ─────────────────────────────────────────────────────────────
  if (dueReminders.length > 0) {
    html += `<div class="px-3 pt-3">
      <p class="text-[10px] font-semibold text-purple-500 uppercase tracking-wider mb-1.5">Reminders · ${dueReminders.length}</p>
      <div class="space-y-0.5">
        ${dueReminders.map(r => _renderReminderRow(r, contactMap[r.contactId], dateStr)).join('')}
      </div>
    </div>`;
  }

  // ── Call Follow-ups ───────────────────────────────────────────────────────
  if (dueCallFollowUps.length > 0) {
    html += `<div class="px-3 pt-3">
      <p class="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1.5">Call Follow-ups · ${dueCallFollowUps.length}</p>
      <div class="space-y-0.5">
        ${dueCallFollowUps.map(c => _renderCallFollowUpRow(c, contactMap[c.contactId], dateStr)).join('')}
      </div>
    </div>`;
  }

  // ── Completed (collapsible) ───────────────────────────────────────────────
  if (done.length > 0) {
    html += `
      <div class="px-3 pt-3">
        <details class="group">
          <summary class="flex items-center gap-1.5 text-[10px] font-semibold text-surface-400 uppercase tracking-wider cursor-pointer list-none select-none hover:text-surface-500">
            <svg class="w-2.5 h-2.5 transition-transform group-open:rotate-90 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            Done · ${done.length}
          </summary>
          <div class="mt-1.5 space-y-0.5">
            ${done.map(t => _renderEditableTask(t)).join('')}
          </div>
        </details>
      </div>`;
  }

  html += `<div class="h-4"></div>`;
  body.innerHTML = html;
  setTimeout(() => document.getElementById('todo-quick-add')?.focus(), 30);
}

// ─── This Week tab ────────────────────────────────────────────────────────────

async function _renderWeekTab(body) {
  const weekStart = _todoWeekStart(new Date());
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);

  const weekStartStr = _todoDateStr(weekStart);
  const weekEndStr   = _todoDateStr(weekEnd);

  const [manualTodos, dealTasks, deals, reminders, contacts] = await Promise.all([
    DB.getForUser(STORES.todos, currentUser.id).catch(() => []),
    DB.getForUser(STORES.dealTasks, currentUser.id).catch(() => []),
    DB.getForUser(STORES.deals, currentUser.id).catch(() => []),
    DB.getForUser(STORES.reminders, currentUser.id).catch(() => []),
    DB.getForUser(STORES.contacts, currentUser.id).catch(() => []),
  ]);

  const dealMap    = buildMap(deals);
  const contactMap = buildMap(contacts);

  // Manual todos completed this week
  const completedManual = manualTodos.filter(t => {
    if (!t.done) return false;
    const completedOn = t.completedAt ? t.completedAt.slice(0,10) : t.date;
    return completedOn >= weekStartStr && completedOn <= weekEndStr;
  });

  // Deal tasks completed this week
  const completedDealTasks = dealTasks.filter(t => {
    if (t.status !== 'done' || !t.completedAt) return false;
    const d = t.completedAt.slice(0,10);
    return d >= weekStartStr && d <= weekEndStr;
  });

  // Reminders completed this week
  const completedReminders = reminders.filter(r => {
    if (r.status !== 'completed' || !r.completedAt) return false;
    const d = r.completedAt.slice(0,10);
    return d >= weekStartStr && d <= weekEndStr;
  });

  // Group by day (Mon–Sun)
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    days.push(d);
  }

  const totalDone = completedManual.length + completedDealTasks.length + completedReminders.length;

  let html = `
    <!-- Tab bar -->
    <div class="flex border-b border-surface-200 dark:border-surface-700 flex-shrink-0">
      <button onclick="switchTodoTab('today')" class="flex-1 py-2 text-xs font-semibold border-b-2 transition-colors border-transparent text-surface-400 hover:text-surface-600 dark:hover:text-surface-300">Today</button>
      <button onclick="switchTodoTab('week')"  class="flex-1 py-2 text-xs font-semibold border-b-2 transition-colors border-brand-600 text-brand-600 dark:text-brand-400">This Week</button>
    </div>

    <!-- Week header -->
    <div class="px-3 pt-3 pb-2 border-b border-surface-100 dark:border-surface-800">
      <p class="text-xs text-surface-500">
        ${weekStart.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${weekEnd.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
      </p>
      <p class="text-sm font-semibold text-surface-800 dark:text-surface-200 mt-0.5">
        ${totalDone === 0 ? 'Nothing completed yet this week' : `${totalDone} task${totalDone === 1 ? '' : 's'} completed`}
      </p>
    </div>`;

  if (totalDone === 0) {
    html += `
      <div class="flex flex-col items-center justify-center py-10 px-4 text-center">
        <div class="w-11 h-11 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center mb-3">
          <svg class="w-5 h-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"/></svg>
        </div>
        <p class="text-sm text-surface-500">Complete tasks in the Today tab<br>and they'll show up here.</p>
      </div>`;
  } else {
    for (const day of days) {
      const ds = _todoDateStr(day);
      const isToday = ds === _todoDateStr(new Date());
      const isFuture = ds > _todoDateStr(new Date());

      const dayManual    = completedManual.filter(t => (t.completedAt || t.date + 'T00:00:00').slice(0,10) === ds);
      const dayDealTasks = completedDealTasks.filter(t => t.completedAt.slice(0,10) === ds);
      const dayReminders = completedReminders.filter(r => r.completedAt.slice(0,10) === ds);
      const dayTotal     = dayManual.length + dayDealTasks.length + dayReminders.length;

      if (dayTotal === 0 && isFuture) continue; // hide future empty days

      html += `
        <div class="px-3 pt-3">
          <p class="text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${isToday ? 'text-brand-600 dark:text-brand-400' : 'text-surface-400'}">
            ${day.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
            ${isToday ? '<span class="px-1 py-0.5 rounded bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 normal-case tracking-normal font-medium text-[9px]">today</span>' : ''}
            ${dayTotal > 0 ? `<span class="ml-auto text-surface-400 normal-case tracking-normal font-medium">${dayTotal} done</span>` : ''}
          </p>
          ${dayTotal === 0 ? `<p class="text-xs text-surface-400 italic pb-1">Nothing yet</p>` : ''}
          <div class="space-y-0.5">
            ${dayManual.map(t => `
              <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-50 dark:bg-surface-800/50">
                <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span class="text-xs text-surface-600 dark:text-surface-400 line-through flex-1">${escapeHtml(t.text)}</span>
              </div>`).join('')}
            ${dayDealTasks.map(t => `
              <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-orange-50/60 dark:bg-orange-900/10">
                <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span class="text-xs text-surface-600 dark:text-surface-400 line-through flex-1">${escapeHtml(t.title)}</span>
                <span class="text-[9px] px-1 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">Deal</span>
              </div>`).join('')}
            ${dayReminders.map(r => `
              <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-purple-50/60 dark:bg-purple-900/10">
                <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span class="text-xs text-surface-600 dark:text-surface-400 line-through flex-1">${escapeHtml(r.title)}</span>
                <span class="text-[9px] px-1 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">Reminder</span>
              </div>`).join('')}
          </div>
        </div>`;
    }
  }

  html += `<div class="h-4"></div>`;
  body.innerHTML = html;
}

// ─── Row renderers ────────────────────────────────────────────────────────────

function _renderEditableTask(todo) {
  const done = todo.done;
  return `
    <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/60 group transition-colors" data-todo-id="${todo.id}">
      <button onclick="_toggleManualTodo('${todo.id}')" class="flex-shrink-0 transition-colors" title="${done ? 'Mark incomplete' : 'Mark done'}">
        ${done
          ? `<svg class="w-4.5 h-4.5 w-[18px] h-[18px] text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
          : `<svg class="w-[18px] h-[18px] text-surface-300 hover:text-brand-500 dark:text-surface-600 dark:hover:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.5"/></svg>`}
      </button>
      <span
        class="flex-1 text-sm leading-snug todo-task-text ${done ? 'line-through text-surface-400 dark:text-surface-600' : 'text-surface-800 dark:text-surface-200'}"
        contenteditable="${done ? 'false' : 'true'}"
        spellcheck="false"
        onblur="_saveTaskEdit('${todo.id}', this)"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}if(event.key==='Escape'){this.textContent='${todo.text.replace(/'/g,"\\'")}';this.blur();}"
        title="${done ? '' : 'Click to edit'}"
      >${escapeHtml(todo.text)}</span>
      <button onclick="_deleteManualTodo('${todo.id}')"
        class="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-surface-300 hover:text-red-500 dark:text-surface-600 dark:hover:text-red-400 transition-all"
        title="Delete">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>`;
}

function _renderDealTaskRow(task, deal, dateStr) {
  const overdue = task.dueDate.slice(0,10) < dateStr;
  return `
    <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg ${overdue ? 'bg-red-50/40 dark:bg-red-900/10' : 'hover:bg-surface-50 dark:hover:bg-surface-800/60'} transition-colors group">
      <button onclick="_completeDealTaskFromTodo('${task.id}')" class="flex-shrink-0" title="Mark done">
        <svg class="w-[18px] h-[18px] text-surface-300 hover:text-brand-500 dark:text-surface-600 dark:hover:text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.5"/></svg>
      </button>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-surface-800 dark:text-surface-200 truncate">${escapeHtml(task.title)}</p>
        ${deal ? `<button onclick="closeTodoPanel();navigate('deals');" class="text-[10px] text-brand-500 hover:underline leading-none">${escapeHtml(deal.name)}</button>` : ''}
      </div>
      ${overdue ? `<span class="text-[9px] text-red-500 font-semibold flex-shrink-0">OD</span>` : ''}
      <span class="text-[9px] px-1 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 flex-shrink-0">Deal</span>
    </div>`;
}

function _renderReminderRow(reminder, contact, dateStr) {
  const overdue = reminder.dueDate.slice(0,10) < dateStr;
  return `
    <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg ${overdue ? 'bg-red-50/40 dark:bg-red-900/10' : 'hover:bg-surface-50 dark:hover:bg-surface-800/60'} transition-colors group">
      <button onclick="_completeReminderFromTodo('${reminder.id}')" class="flex-shrink-0" title="Mark done">
        <svg class="w-[18px] h-[18px] text-surface-300 hover:text-green-500 dark:text-surface-600 dark:hover:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="1.5"/></svg>
      </button>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-surface-800 dark:text-surface-200 truncate">${escapeHtml(reminder.title)}</p>
        ${contact ? `<button onclick="closeTodoPanel();viewContact('${contact.id}');" class="text-[10px] text-brand-500 hover:underline leading-none">${escapeHtml(contact.fullName)}</button>` : ''}
      </div>
      ${overdue ? `<span class="text-[9px] text-red-500 font-semibold flex-shrink-0">OD</span>` : ''}
      <span class="text-[9px] px-1 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex-shrink-0">Reminder</span>
    </div>`;
}

function _renderCallFollowUpRow(call, contact, dateStr) {
  const overdue = call.followUpDate.slice(0,10) < dateStr;
  const text = (call.nextSteps || (call.tasks || []).map(t => t.text).join('; ') || 'Follow up');
  return `
    <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg ${overdue ? 'bg-red-50/40 dark:bg-red-900/10' : 'hover:bg-surface-50 dark:hover:bg-surface-800/60'} transition-colors group">
      <div class="flex-shrink-0 w-[18px] flex items-center justify-center">
        <svg class="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-surface-800 dark:text-surface-200 truncate">${escapeHtml(text.slice(0, 80))}</p>
        ${contact ? `<button onclick="closeTodoPanel();viewContact('${contact.id}');" class="text-[10px] text-brand-500 hover:underline leading-none">Re: ${escapeHtml(contact.fullName)}</button>` : ''}
      </div>
      ${overdue ? `<span class="text-[9px] text-red-500 font-semibold flex-shrink-0">OD</span>` : ''}
      <span class="text-[9px] px-1 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex-shrink-0">Call</span>
    </div>`;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

async function _addManualTodo() {
  const input = document.getElementById('todo-quick-add');
  const text  = (input?.value || '').trim();
  if (!text) { input?.focus(); return; }
  input.value = '';
  input.disabled = true;
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
  } finally {
    input.disabled = false;
    input.focus();
  }
  renderTodoPanelContent();
}

async function _saveTaskEdit(id, el) {
  const newText = (el.textContent || '').trim();
  if (!newText) {
    // Empty → restore old text
    const todo = await DB.get(STORES.todos, id).catch(() => null);
    if (todo) el.textContent = todo.text;
    return;
  }
  await DB.put(STORES.todos, { id, text: newText, userId: currentUser.id }).catch(() => {});
  // No full re-render needed — just let the blur settle
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

async function _completeDealTaskFromTodo(taskId) {
  const task = await DB.get(STORES.dealTasks, taskId);
  if (!task) return;
  await DB.put(STORES.dealTasks, { ...task, status: 'done', completedAt: new Date().toISOString() }).catch(() => {});
  showToast('Task done ✓', 'success');
  renderTodoPanelContent();
}

async function _completeReminderFromTodo(reminderId) {
  const r = await DB.get(STORES.reminders, reminderId);
  if (!r) return;
  if (r.recurring && r.cadenceDays) {
    const next = new Date(r.dueDate);
    next.setDate(next.getDate() + Number(r.cadenceDays));
    await DB.put(STORES.reminders, { ...r, dueDate: next.toISOString() }).catch(() => {});
  } else {
    await DB.put(STORES.reminders, { ...r, status: 'completed', completedAt: new Date().toISOString() }).catch(() => {});
  }
  showToast('Reminder done ✓', 'success');
  renderTodoPanelContent();
  if (typeof checkReminders === 'function') checkReminders();
}
