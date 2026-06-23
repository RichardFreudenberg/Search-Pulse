/* ============================================================
   Pulse — Saved Smart Views
   ============================================================
   Save the current filter + sort + view-mode of any list as a named
   view, then recall it in one click. Works across the Contacts,
   Companies, and Broker lists via a small adapter registry, so every
   list gets the exact same control and behaviour.

   Storage: settings.savedViews = { contacts:[], companies:[], brokers:[] }
   Each view: { id, name, state }  (state shape is list-specific).
   ============================================================ */

let _savedViews = null;            // cache: { listKey: [ {id,name,state} ] }
let _savedViewsLoaded = false;

/** Adapter registry — each list tells us how to read/apply/repaint its state. */
const _VIEW_ADAPTERS = {};
function registerViewAdapter(key, adapter) { _VIEW_ADAPTERS[key] = adapter; }

// Built-in adapters (all reference the lists' module-global filter state).
registerViewAdapter('contacts', {
  getState: () => ({ filters: { ...contactsFilters }, viewMode: contactsViewMode }),
  applyState: (st) => {
    contactsFilters = Object.assign({ stage: '', tag: '', search: '', sort: 'name', bucket: '', quick: '', group: 'bucket' }, st.filters || {});
    if (st.viewMode) contactsViewMode = st.viewMode;
    if (typeof contactsRenderLimit !== 'undefined' && typeof CONTACTS_PAGE_SIZE !== 'undefined') contactsRenderLimit = CONTACTS_PAGE_SIZE;
  },
  repaint: () => _contactsPaint(),
});

registerViewAdapter('companies', {
  getState: () => ({ search: companiesSearch, sort: companiesSort, industry: companiesIndustry }),
  applyState: (st) => { companiesSearch = st.search || ''; companiesSort = st.sort || 'name'; companiesIndustry = st.industry || ''; },
  repaint: () => _companiesPaint(),
});

registerViewAdapter('brokers', {
  getState: () => ({ search: _brokerSearch, sort: _brokerSort, filter: _brokerFilter, view: _brokerView }),
  applyState: (st) => {
    _brokerSearch = st.search || ''; _brokerSort = st.sort || 'recent'; _brokerFilter = st.filter || 'all';
    if (st.view) { _brokerView = st.view; try { localStorage.setItem('pulse_broker_view', _brokerView); } catch (_) {} }
  },
  repaint: () => _brokerFirmsRefresh(),
});

// ── Load / persist ───────────────────────────────────────────
async function ensureSavedViewsLoaded() {
  if (_savedViewsLoaded) return _savedViews;
  try {
    const s = await DB.get(STORES.settings, `settings_${currentUser.id}`);
    _savedViews = (s && s.savedViews) || {};
  } catch (_) { _savedViews = {}; }
  _savedViewsLoaded = true;
  return _savedViews;
}

/** Reuse an already-loaded settings doc (avoids a second read). */
function setSavedViewsFromSettings(settings) {
  _savedViews = (settings && settings.savedViews) || {};
  _savedViewsLoaded = true;
}

function getSavedViews(listKey) { return (_savedViews && _savedViews[listKey]) || []; }

async function _persistSavedViews() {
  const id = `settings_${currentUser.id}`;
  let s = await DB.get(STORES.settings, id);
  if (!s) s = { id, userId: currentUser.id };
  s.savedViews = _savedViews || {};
  await DB.put(STORES.settings, s);
}

function _viewStateEquals(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
}

// ── Render ───────────────────────────────────────────────────
/** A compact "Views:" bar with saved-view pills + a Save button. */
function renderViewsBar(listKey) {
  const adapter = _VIEW_ADAPTERS[listKey];
  if (!adapter) return '';
  const views = getSavedViews(listKey);
  let activeId = null;
  try { const cur = adapter.getState(); const m = views.find(v => _viewStateEquals(v.state, cur)); activeId = m ? m.id : null; } catch (_) {}

  const pills = views.map(v => {
    const active = v.id === activeId;
    return `<span class="inline-flex items-center rounded-full text-xs font-medium transition-colors ${active
      ? 'bg-brand-600 text-white'
      : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700'}">
      <button onclick="applyView('${listKey}','${v.id}')" class="pl-3 pr-1 py-1.5 max-w-[180px] truncate" title="${escapeHtml(v.name)}">${escapeHtml(v.name)}</button>
      <button onclick="deleteView('${listKey}','${v.id}')" title="Delete view" class="pr-2.5 pl-1 py-1.5 ${active ? 'text-white/70 hover:text-white' : 'text-surface-400 hover:text-red-500'}">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </span>`;
  }).join('');

  return `
    <div class="flex items-center gap-1.5 flex-wrap mb-3">
      ${views.length ? '<span class="text-xs font-medium text-surface-400 mr-0.5">Views</span>' : ''}
      ${pills}
      <button onclick="saveCurrentView('${listKey}')" title="Save the current filters & sort as a named view"
        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border border-dashed border-surface-300 dark:border-surface-600 text-surface-500 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        Save view
      </button>
    </div>`;
}

// ── Actions ──────────────────────────────────────────────────
function applyView(listKey, id) {
  const adapter = _VIEW_ADAPTERS[listKey];
  const v = getSavedViews(listKey).find(x => x.id === id);
  if (!adapter || !v) return;
  try { adapter.applyState(JSON.parse(JSON.stringify(v.state))); } catch (_) { return; }
  adapter.repaint();
}

async function saveCurrentView(listKey) {
  const adapter = _VIEW_ADAPTERS[listKey];
  if (!adapter) return;
  const name = (window.prompt('Name this view (e.g. "Investors gone quiet")') || '').trim();
  if (!name) return;
  if (!_savedViews) _savedViews = {};
  if (!_savedViews[listKey]) _savedViews[listKey] = [];
  // Replace if a view with the same name exists, else add.
  const state = adapter.getState();
  const existing = _savedViews[listKey].find(v => v.name.toLowerCase() === name.toLowerCase());
  if (existing) { existing.state = state; }
  else _savedViews[listKey].push({ id: 'v' + Date.now().toString(36) + Math.floor(Math.random() * 1000), name, state });
  try { await _persistSavedViews(); showToast(existing ? 'View updated' : 'View saved', 'success'); }
  catch (_) { showToast('Could not save view', 'error'); }
  adapter.repaint();
}

function deleteView(listKey, id) {
  if (!_savedViews || !_savedViews[listKey]) return;
  _savedViews[listKey] = _savedViews[listKey].filter(v => v.id !== id);
  _persistSavedViews().then(() => { showToast('View deleted', 'info'); }).catch(() => {});
  const adapter = _VIEW_ADAPTERS[listKey];
  if (adapter) adapter.repaint();
}
