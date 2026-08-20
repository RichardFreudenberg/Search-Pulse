/* ============================================================
   Pulse — Deal Calendar
   ============================================================
   Monthly calendar of deadlines, offer dates, presentations, etc.
   You define your own colour-coded categories (e.g. "Management
   Presentation") and add dated events under them — optionally linked
   to a deal — so all events of a type share one colour.

   Storage:
     • Events   → STORES.calendarEvents  { id, title, date (YYYY-MM-DD),
                    categoryId, dealId?, notes?, time? }
     • Categories → settings.calendarCategories  [{ id, name, color }]
   ============================================================ */

const CAL_PALETTE = ['#6366f1', '#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#a855f7', '#64748b'];
const CAL_DEFAULT_CATEGORIES = [
  { id: 'c_mgmt',    name: 'Management Presentation', color: '#6366f1' },
  { id: 'c_offer',   name: 'Offer Deadline',          color: '#ef4444' },
  { id: 'c_loi',     name: 'LOI Deadline',            color: '#f59e0b' },
  { id: 'c_dd',      name: 'Diligence Deadline',      color: '#06b6d4' },
  { id: 'c_meeting', name: 'Meeting / Call',          color: '#22c55e' },
  { id: 'c_other',   name: 'Other',                   color: '#64748b' },
];

let _calMonth = null;           // Date = first of the viewed month
let _calCategories = [];
let _calHidden = new Set();     // category ids toggled off in the legend

// ── Pure helpers (unit-tested) ───────────────────────────────
function _calDateStr(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** 42 cells (6 weeks, Monday-start) covering the given month. */
function _calMonthGrid(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const dow = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setDate(1 - dow);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ date: d, dateStr: _calDateStr(d), inMonth: d.getMonth() === monthDate.getMonth() });
  }
  return cells;
}

/** Map of dateStr → sorted events. */
function _calEventsByDate(events) {
  const map = {};
  (events || []).forEach(e => {
    if (!e.date) return;
    (map[e.date] = map[e.date] || []).push(e);
  });
  Object.values(map).forEach(list => list.sort((a, b) => (a.time || '').localeCompare(b.time || '') || (a.title || '').localeCompare(b.title || '')));
  return map;
}

function _calCatById(id) { return _calCategories.find(c => c.id === id) || { name: 'Uncategorised', color: '#94a3b8' }; }

/** Upcoming events from today forward, filtered by hidden categories. */
function _calUpcoming(events, hidden, limit = 8) {
  const today = _calDateStr(new Date());
  return (events || [])
    .filter(e => e.date && e.date >= today && !(hidden && hidden.has(e.categoryId)))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
    .slice(0, limit);
}

// ── Render ───────────────────────────────────────────────────
let _calTarget = 'page-content';  // container the calendar paints into (page or a dashboard tab)

async function renderCalendar() {
  _calTarget = 'page-content';
  const el = document.getElementById('page-content');
  if (el) el.innerHTML = `<div class="p-4 lg:p-8 max-w-6xl mx-auto">${renderLoadingSkeleton(4)}</div>`;
  await _calLoadAndPaint();
}

// Embedded variant for the dashboard "Calendar" tab (paints into #dash-calendar).
async function renderDashCalendar() {
  _calTarget = 'dash-calendar';
  await _calLoadAndPaint();
}

async function _calLoadAndPaint() {
  if (!_calMonth) { const n = new Date(); _calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
  const [events, settings, deals] = await Promise.all([
    DB.getForUser(STORES.calendarEvents, currentUser.id).catch(() => []),
    DB.get(STORES.settings, `settings_${currentUser.id}`).catch(() => null),
    DB.getForUser(STORES.deals, currentUser.id).catch(() => []),
  ]);
  _calCategories = (settings && Array.isArray(settings.calendarCategories) && settings.calendarCategories.length) ? settings.calendarCategories : CAL_DEFAULT_CATEGORIES;
  window._calEvents = events;
  window._calDeals = deals;
  _calPaint(events);
}

function _calPaint(events) {
  const pageContent = document.getElementById(_calTarget);
  if (!pageContent) return;
  const _embedded = _calTarget !== 'page-content';
  const cells = _calMonthGrid(_calMonth);
  const byDate = _calEventsByDate(events);
  const todayStr = _calDateStr(new Date());
  const monthLabel = _calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dealMap = typeof buildMap === 'function' ? buildMap(window._calDeals || []) : {};

  const chip = (e) => {
    const cat = _calCatById(e.categoryId);
    if (_calHidden.has(e.categoryId)) return '';
    const deal = e.dealId && dealMap[e.dealId] ? dealMap[e.dealId] : null;
    const label = escapeHtml(e.title || cat.name) + (deal ? ` · ${escapeHtml(deal.name)}` : '');
    return `<button onclick="event.stopPropagation(); openCalEventModal('${e.id}')" title="${label}"
      class="w-full text-left truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight mb-0.5"
      style="background:${cat.color}22; color:${cat.color};">${e.time ? `<span class="opacity-70">${escapeHtml(e.time)}</span> ` : ''}${label}</button>`;
  };

  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const _navRow = `
      <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div class="flex items-center gap-2">
          <button onclick="calNavMonth(-1)" class="btn-ghost btn-sm p-1.5" title="Previous month"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg></button>
          <div class="text-base font-semibold w-40 text-center">${monthLabel}</div>
          <button onclick="calNavMonth(1)" class="btn-ghost btn-sm p-1.5" title="Next month"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg></button>
          <button onclick="calToday()" class="btn-secondary btn-sm ml-1">Today</button>
          <button onclick="openCalEventModal(null, '${todayStr}')" class="btn-primary btn-sm ml-1">+ Add</button>
          <button onclick="openCalCategories()" class="btn-secondary btn-sm">Categories</button>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          ${_calCategories.map(c => `
            <button onclick="calToggleCategory('${c.id}')" class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition-opacity ${_calHidden.has(c.id) ? 'opacity-40' : ''}"
              style="border-color:${c.color}55; color:${c.color}; background:${c.color}14;">
              <span class="w-2 h-2 rounded-full" style="background:${c.color}"></span>${escapeHtml(c.name)}
            </button>`).join('')}
        </div>
      </div>`;

  const _grid = `
      <div class="card p-0 overflow-hidden">
        <div class="grid grid-cols-7 border-b border-surface-200 dark:border-surface-700">
          ${dow.map(d => `<div class="px-2 py-2 text-[11px] font-semibold text-surface-400 text-center uppercase tracking-wide">${d}</div>`).join('')}
        </div>
        <div class="grid grid-cols-7">
          ${cells.map((cell, i) => {
            const evs = byDate[cell.dateStr] || [];
            const visible = evs.filter(e => !_calHidden.has(e.categoryId));
            const isToday = cell.dateStr === todayStr;
            return `
              <div onclick="openCalEventModal(null, '${cell.dateStr}')"
                class="min-h-[92px] border-b border-r border-surface-100 dark:border-surface-800 p-1.5 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-800/40 transition-colors ${cell.inMonth ? '' : 'bg-surface-50/50 dark:bg-surface-900/40'} ${(i + 1) % 7 === 0 ? '!border-r-0' : ''}">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-semibold ${isToday ? 'w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center' : cell.inMonth ? 'text-surface-600 dark:text-surface-300' : 'text-surface-300 dark:text-surface-600'}">${cell.date.getDate()}</span>
                </div>
                ${visible.slice(0, 3).map(chip).join('')}
                ${visible.length > 3 ? `<div class="text-[10px] text-surface-400 pl-1">+${visible.length - 3} more</div>` : ''}
              </div>`;
          }).join('')}
        </div>
      </div>`;

  const _upcoming = `
      <div class="card mt-6">
        <h3 class="text-sm font-semibold mb-3">Upcoming</h3>
        ${(() => {
          const up = _calUpcoming(events, _calHidden, 8);
          if (!up.length) return '<p class="text-sm text-surface-400">Nothing scheduled ahead. Click a day or “Add event”.</p>';
          return `<div class="divide-y divide-surface-100 dark:divide-surface-800 -mb-1">
            ${up.map(e => {
              const cat = _calCatById(e.categoryId);
              const deal = e.dealId && dealMap[e.dealId] ? dealMap[e.dealId] : null;
              const d = new Date(e.date + 'T00:00:00');
              return `<button onclick="openCalEventModal('${e.id}')" class="w-full flex items-center gap-3 py-2.5 text-left hover:bg-surface-50 dark:hover:bg-surface-800/40 rounded-lg px-1 -mx-1">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${cat.color}"></span>
                <div class="w-14 flex-shrink-0 text-center">
                  <div class="text-[10px] text-surface-400 uppercase">${d.toLocaleDateString('en-US', { month: 'short' })}</div>
                  <div class="text-lg font-bold leading-none">${d.getDate()}</div>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium truncate">${escapeHtml(e.title || cat.name)}</div>
                  <div class="text-xs text-surface-500 truncate">${escapeHtml(cat.name)}${deal ? ' · ' + escapeHtml(deal.name) : ''}${e.time ? ' · ' + escapeHtml(e.time) : ''}</div>
                </div>
              </button>`;
            }).join('')}
          </div>`;
        })()}
      </div>`;

  const _body = _navRow + _grid + _upcoming;
  pageContent.innerHTML = _embedded
    ? _body
    : `<div class="p-4 lg:p-8 max-w-6xl mx-auto animate-fade-in">${renderPageHeader('Calendar', 'Deadlines, offer dates, presentations — colour-coded by category', '')}${_body}</div>`;
}

// ── Month navigation ─────────────────────────────────────────
function calNavMonth(delta) { _calMonth = new Date(_calMonth.getFullYear(), _calMonth.getMonth() + delta, 1); _calPaint(window._calEvents || []); }
function calToday() { const n = new Date(); _calMonth = new Date(n.getFullYear(), n.getMonth(), 1); _calPaint(window._calEvents || []); }
function calToggleCategory(id) { if (_calHidden.has(id)) _calHidden.delete(id); else _calHidden.add(id); _calPaint(window._calEvents || []); }

// ── Event modal ──────────────────────────────────────────────
function openCalEventModal(eventId, prefillDate) {
  const ev = eventId ? (window._calEvents || []).find(e => e.id === eventId) : null;
  const cats = _calCategories.length ? _calCategories : CAL_DEFAULT_CATEGORIES;
  const deals = (window._calDeals || []).filter(d => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const date = ev ? ev.date : (prefillDate || _calDateStr(new Date()));
  openModal(ev ? 'Edit Event' : 'Add Event', `
    <div class="p-6 space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">Title *</label>
        <input type="text" id="cal-title" class="input-field" value="${ev ? escapeHtml(ev.title || '') : ''}" placeholder="e.g. Management Presentation" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Category</label>
          <select id="cal-category" class="input-field">
            ${cats.map(c => `<option value="${c.id}" ${ev && ev.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Date *</label>
          <input type="date" id="cal-date" class="input-field" value="${date}" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Time <span class="text-xs font-normal text-surface-400">(optional)</span></label>
          <input type="time" id="cal-time" class="input-field" value="${ev ? (ev.time || '') : ''}" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Deal <span class="text-xs font-normal text-surface-400">(optional)</span></label>
          <select id="cal-deal" class="input-field">
            <option value="">— None —</option>
            ${deals.map(d => `<option value="${d.id}" ${ev && ev.dealId === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Notes <span class="text-xs font-normal text-surface-400">(optional)</span></label>
        <textarea id="cal-notes" class="input-field" rows="2" placeholder="Details…">${ev ? escapeHtml(ev.notes || '') : ''}</textarea>
      </div>
      <div class="flex justify-between items-center pt-4 border-t border-surface-200 dark:border-surface-800">
        ${ev ? `<button onclick="deleteCalEvent('${ev.id}')" class="btn-ghost btn-sm text-red-500">Delete</button>` : '<span></span>'}
        <div class="flex gap-3">
          <button onclick="closeModal()" class="btn-secondary">Cancel</button>
          <button onclick="saveCalEvent(${ev ? `'${ev.id}'` : 'null'})" class="btn-primary">Save</button>
        </div>
      </div>
    </div>
  `);
  setTimeout(() => document.getElementById('cal-title')?.focus(), 40);
}

async function saveCalEvent(eventId) {
  const title = (document.getElementById('cal-title')?.value || '').trim();
  const date = document.getElementById('cal-date')?.value || '';
  if (!title) { showToast('Enter a title', 'warning'); document.getElementById('cal-title')?.focus(); return; }
  if (!date) { showToast('Pick a date', 'warning'); return; }
  const rec = {
    userId: currentUser.id,
    title,
    date,
    time: document.getElementById('cal-time')?.value || '',
    categoryId: document.getElementById('cal-category')?.value || (_calCategories[0] && _calCategories[0].id) || 'c_other',
    dealId: document.getElementById('cal-deal')?.value || null,
    notes: (document.getElementById('cal-notes')?.value || '').trim(),
  };
  if (eventId && eventId !== 'null') { rec.id = eventId; await DB.put(STORES.calendarEvents, rec); }
  else { await DB.add(STORES.calendarEvents, rec); }
  closeModal();
  showToast('Event saved', 'success');
  _calLoadAndPaint();
}

async function deleteCalEvent(eventId) {
  await DB.delete(STORES.calendarEvents, eventId).catch(() => {});
  closeModal();
  showToast('Event removed', 'info');
  _calLoadAndPaint();
}

// ── Category management ──────────────────────────────────────
function openCalCategories() {
  const cats = _calCategories.length ? _calCategories : CAL_DEFAULT_CATEGORIES;
  openModal('Event Categories', `
    <div class="p-6 space-y-4">
      <p class="text-sm text-surface-500">Create colour-coded categories (e.g. “Management Presentation”). Every event in a category shows in its colour.</p>
      <div id="cal-cat-list" class="space-y-2">
        ${cats.map(c => `
          <div class="flex items-center gap-2" data-cat-id="${c.id}">
            <input type="color" value="${c.color}" onchange="_calSetCategoryColor('${c.id}', this.value)" class="w-8 h-8 rounded cursor-pointer border border-surface-200 dark:border-surface-700 p-0.5 bg-transparent" title="Change colour" />
            <input type="text" value="${escapeHtml(c.name)}" onchange="_calRenameCategory('${c.id}', this.value)" class="input-field flex-1 text-sm" />
            <button onclick="_calDeleteCategory('${c.id}')" class="btn-ghost btn-sm text-surface-400 hover:text-red-500 flex-shrink-0" title="Delete category">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>`).join('')}
      </div>
      <div class="flex gap-2 pt-2 border-t border-surface-200 dark:border-surface-800">
        <input type="text" id="cal-new-cat" class="input-field flex-1 text-sm" placeholder="New category name…"
          onkeydown="if(event.key==='Enter'){event.preventDefault();_calAddCategory();}" />
        <button onclick="_calAddCategory()" class="btn-primary btn-sm flex-shrink-0">Add</button>
      </div>
      <div class="flex justify-end pt-2">
        <button onclick="closeModal(); _calLoadAndPaint()" class="btn-secondary">Done</button>
      </div>
    </div>
  `);
}

async function _calPersistCategories() {
  const id = `settings_${currentUser.id}`;
  let s = await DB.get(STORES.settings, id).catch(() => null);
  if (!s) s = { id, userId: currentUser.id };
  s.calendarCategories = _calCategories;
  await DB.put(STORES.settings, s);
}
async function _calAddCategory() {
  const el = document.getElementById('cal-new-cat');
  const name = (el?.value || '').trim();
  if (!name) { el?.focus(); return; }
  if (!_calCategories.length) _calCategories = [...CAL_DEFAULT_CATEGORIES];
  const color = CAL_PALETTE[_calCategories.length % CAL_PALETTE.length];
  _calCategories.push({ id: 'cc' + Date.now().toString(36) + Math.floor(Math.random() * 1000), name, color });
  await _calPersistCategories();
  openCalCategories();
}
async function _calRenameCategory(id, name) {
  const c = _calCategories.find(x => x.id === id); if (!c) return;
  c.name = (name || '').trim() || c.name;
  await _calPersistCategories();
}
async function _calSetCategoryColor(id, color) {
  const c = _calCategories.find(x => x.id === id); if (!c) return;
  c.color = color;
  await _calPersistCategories();
}
async function _calDeleteCategory(id) {
  _calCategories = _calCategories.filter(x => x.id !== id);
  if (!_calCategories.length) _calCategories = [{ id: 'c_other', name: 'Other', color: '#64748b' }];
  await _calPersistCategories();
  openCalCategories();
}

// ── Compact "Upcoming Deadlines" card for the dashboards ─────
function calCategoriesFrom(settings) {
  return (settings && Array.isArray(settings.calendarCategories) && settings.calendarCategories.length) ? settings.calendarCategories : CAL_DEFAULT_CATEGORIES;
}

function _upcomingDeadlinesHtml(events, cats, deals, limit = 6) {
  const catById = id => (cats || []).find(c => c.id === id) || { name: 'Uncategorised', color: '#94a3b8' };
  const dealMap = typeof buildMap === 'function' ? buildMap(deals || []) : {};
  const up = _calUpcoming(events, null, limit);
  const head = `<div class="flex items-center justify-between mb-3">
      <div class="card-title">Upcoming Deadlines</div>
      <button onclick="navigate('calendar')" class="text-xs font-medium text-brand-600 hover:underline">Open calendar &rarr;</button>
    </div>`;
  if (!up.length) {
    return `<div class="card">${head}<p class="text-sm text-surface-400">Nothing scheduled. <button onclick="navigate('calendar')" class="text-brand-600 hover:underline">Add a deadline</button>.</p></div>`;
  }
  return `<div class="card">${head}
    <div class="divide-y divide-surface-100 dark:divide-surface-800 -mb-1">
      ${up.map(e => {
        const cat = catById(e.categoryId);
        const deal = e.dealId && dealMap[e.dealId] ? dealMap[e.dealId] : null;
        const d = new Date(e.date + 'T00:00:00');
        return `<button onclick="navigate('calendar')" class="w-full flex items-center gap-3 py-2.5 text-left hover:bg-surface-50 dark:hover:bg-surface-800/40 rounded-lg px-1 -mx-1">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${cat.color}"></span>
          <div class="w-12 flex-shrink-0 text-center">
            <div class="text-[10px] text-surface-400 uppercase">${d.toLocaleDateString('en-US', { month: 'short' })}</div>
            <div class="text-base font-bold leading-none">${d.getDate()}</div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium truncate">${escapeHtml(e.title || cat.name)}</div>
            <div class="text-xs text-surface-500 truncate">${escapeHtml(cat.name)}${deal ? ' &middot; ' + escapeHtml(deal.name) : ''}${e.time ? ' &middot; ' + escapeHtml(e.time) : ''}</div>
          </div>
        </button>`;
      }).join('')}
    </div>
  </div>`;
}
