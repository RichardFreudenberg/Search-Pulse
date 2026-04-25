/* ============================================
   Nexus CRM — Broker & Intermediary Tracker
   ============================================ */

/* ─── Module state ──────────────────────────────────────────────────────────── */
let _brokerFilter   = 'all'; // 'all' | 'active' | 'inactive'
let _brokerSearch   = '';
let _brokerEditingId = null; // for safe modal save onclick

/* ─── renderBrokers ──────────────────────────────────────────────────────────── */
async function renderBrokers() {
  const container = document.getElementById('page-content');
  if (!container) return;

  let brokers = [];
  try {
    const all = await DB.getForUser(STORES.brokers, currentUser.id);
    brokers = (all || []).sort((a, b) => {
      // Sort: most recently contacted first, then by name
      const aLast = a.lastContactDate || a.createdAt || '';
      const bLast = b.lastContactDate || b.createdAt || '';
      return bLast > aLast ? 1 : bLast < aLast ? -1 : 0;
    });
  } catch (_) {}

  container.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
    ${renderPageHeader('Brokers', 'Track your M&A broker & intermediary relationships')}

    <div id="brokers-stats-row">
      ${_brokersStatsHtml(brokers)}
    </div>

    <div class="mt-6" id="brokers-main">
      ${_brokersMainHtml(brokers)}
    </div>
  </div>`;
}

/* ─── Stats row ─────────────────────────────────────────────────────────────── */
function _brokersStatsHtml(brokers) {
  const total   = brokers.length;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const active  = brokers.filter(b => b.lastContactDate && b.lastContactDate >= thirtyDaysAgo).length;
  const inactive = total - active;
  const dealsIntroduced = brokers.reduce((sum, b) => sum + (b.dealsIntroduced || 0), 0);

  const stat = (label, value, sub) => `
    <div class="card py-4 text-center">
      <p class="text-2xl font-bold text-surface-900 dark:text-white">${value}</p>
      <p class="text-xs font-medium text-surface-500 mt-0.5">${label}</p>
      ${sub ? `<p class="text-xs text-surface-400 mt-0.5">${sub}</p>` : ''}
    </div>`;

  return `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
      ${stat('Total Brokers', total, '')}
      ${stat('Active (30d)', active, active > 0 ? 'contacted recently' : 'no recent contact')}
      ${stat('Need Attention', inactive, inactive > 0 ? 'not contacted in 30d' : 'all up to date')}
      ${stat('Deals Introduced', dealsIntroduced, dealsIntroduced > 0 ? 'across all brokers' : 'log deals to track')}
    </div>`;
}

/* ─── Main broker list ───────────────────────────────────────────────────────── */
function _brokersMainHtml(brokers) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const filtered = brokers.filter(b => {
    const isActive = b.lastContactDate && b.lastContactDate >= thirtyDaysAgo;
    const matchStatus = _brokerFilter === 'all'
      || (_brokerFilter === 'active'   && isActive)
      || (_brokerFilter === 'inactive' && !isActive);
    const matchSearch = !_brokerSearch
      || (b.name || '').toLowerCase().includes(_brokerSearch.toLowerCase())
      || (b.firm || '').toLowerCase().includes(_brokerSearch.toLowerCase())
      || (b.specialties || '').toLowerCase().includes(_brokerSearch.toLowerCase());
    return matchStatus && matchSearch;
  });

  const filterBtn = (key, label, count) => `
    <button onclick="_brokerSetFilter('${key}')"
      class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
        _brokerFilter === key
          ? 'bg-brand-600 text-white shadow-sm'
          : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600'
      }">
      ${label} <span class="opacity-60 ml-0.5">${count}</span>
    </button>`;

  const activeCount   = brokers.filter(b => b.lastContactDate && b.lastContactDate >= thirtyDaysAgo).length;
  const inactiveCount = brokers.length - activeCount;

  const chips = `
    ${filterBtn('all', 'All', brokers.length)}
    ${filterBtn('active', 'Active', activeCount)}
    ${filterBtn('inactive', 'Need Attention', inactiveCount)}
  `;

  const emptyState = brokers.length === 0 ? `
    <div class="py-16 text-center">
      <svg class="w-12 h-12 mx-auto text-surface-300 dark:text-surface-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
      </svg>
      <p class="text-sm font-medium text-surface-600 dark:text-surface-400">No brokers added yet</p>
      <p class="text-xs text-surface-400 mt-1 mb-4">Add your first M&amp;A broker to start tracking deal flow</p>
      <button onclick="openAddBrokerModal()" class="btn-primary">Add First Broker</button>
    </div>` : filtered.length === 0 ? `
    <div class="py-12 text-center">
      <p class="text-sm text-surface-500">No brokers match this filter.</p>
      <button onclick="_brokerSetFilter('all')" class="text-sm text-brand-600 mt-2">Clear filter</button>
    </div>` : `
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      ${filtered.map(b => _brokerCardHtml(b, thirtyDaysAgo)).join('')}
    </div>`;

  return `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
          </svg>
          <input type="text" placeholder="Search brokers…" value="${escapeHtml(_brokerSearch)}"
            oninput="_brokerSetSearch(this.value)"
            class="input-field pl-9 text-sm w-56"/>
        </div>
        <div class="flex gap-1.5">${chips}</div>
      </div>
      <button onclick="openAddBrokerModal()" class="btn-primary btn-sm shrink-0">+ Add Broker</button>
    </div>
    ${emptyState}`;
}

/* ─── Single broker card ─────────────────────────────────────────────────────── */
function _brokerCardHtml(b, thirtyDaysAgo) {
  const isActive = b.lastContactDate && b.lastContactDate >= thirtyDaysAgo;
  const daysSince = b.lastContactDate
    ? Math.floor((Date.now() - new Date(b.lastContactDate)) / 86400000)
    : null;

  const statusPill = isActive
    ? '<span class="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[11px]">Active</span>'
    : daysSince !== null
      ? `<span class="badge bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[11px]">${daysSince}d ago</span>`
      : '<span class="badge bg-surface-100 text-surface-500 dark:bg-surface-700 text-[11px]">Not contacted</span>';

  // Relationship rating stars
  const stars = (n, max = 5) => Array.from({ length: max }, (_, i) =>
    `<svg class="w-3.5 h-3.5 ${i < n ? 'text-amber-400' : 'text-surface-200 dark:text-surface-700'}" fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
    </svg>`).join('');

  // Specialties as chips
  const specialties = (b.specialties || '').split(',').map(s => s.trim()).filter(Boolean);
  const specChips = specialties.slice(0, 3).map(s =>
    `<span class="px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-[11px] text-surface-600 dark:text-surface-400">${escapeHtml(s)}</span>`
  ).join('');

  const initials = ((b.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2)).toUpperCase();

  return `
    <div class="card flex flex-col hover:border-surface-300 dark:hover:border-surface-600 transition-colors" id="broker-${escapeHtml(b.id)}">

      <!-- Header -->
      <div class="flex items-start gap-3 mb-3">
        <div class="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400
          flex items-center justify-center text-sm font-bold shrink-0">
          ${escapeHtml(initials)}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-surface-900 dark:text-white truncate">${escapeHtml(b.name || 'Unknown')}</h3>
              ${b.firm ? `<p class="text-xs text-surface-500 truncate">${escapeHtml(b.firm)}</p>` : ''}
            </div>
            ${statusPill}
          </div>
        </div>
      </div>

      <!-- Rating -->
      ${b.relationshipRating ? `
        <div class="flex items-center gap-1.5 mb-2">
          <div class="flex">${stars(b.relationshipRating)}</div>
          <span class="text-[11px] text-surface-400">relationship</span>
        </div>` : ''}

      <!-- Meta -->
      <div class="space-y-1 mb-3 text-xs text-surface-500">
        ${b.email ? `<div class="flex items-center gap-1.5 truncate"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg><span class="truncate">${escapeHtml(b.email)}</span></div>` : ''}
        ${b.phone ? `<div class="flex items-center gap-1.5"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>${escapeHtml(b.phone)}</div>` : ''}
        ${b.location ? `<div class="flex items-center gap-1.5"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>${escapeHtml(b.location)}</div>` : ''}
        ${b.dealsIntroduced ? `<div class="flex items-center gap-1.5"><svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"/></svg>${b.dealsIntroduced} deal${b.dealsIntroduced !== 1 ? 's' : ''} introduced</div>` : ''}
      </div>

      <!-- Specialties -->
      ${specChips ? `<div class="flex gap-1.5 flex-wrap mb-3">${specChips}</div>` : ''}

      <!-- Notes preview -->
      ${b.notes ? `<p class="text-xs text-surface-500 italic line-clamp-2 mb-3">"${escapeHtml(b.notes.slice(0, 100))}${b.notes.length > 100 ? '…' : ''}"</p>` : ''}

      <!-- Actions -->
      <div class="flex gap-2 mt-auto pt-1">
        <button onclick="openLogBrokerContactModal('${b.id}')" class="btn-primary btn-sm flex-1">Log Contact</button>
        <button onclick="openBrokerAIOutreachModal('${b.id}')"
          class="btn-secondary btn-sm flex items-center gap-1"
          title="AI: draft a re-engagement message">
          <svg class="w-3.5 h-3.5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
          </svg>
          AI
        </button>
        <button onclick="openEditBrokerModal('${b.id}')" class="btn-secondary btn-sm">Edit</button>
        <button onclick="_brokerDelete('${b.id}')" class="text-red-500 hover:text-red-700 text-xs px-1">✕</button>
      </div>
    </div>`;
}

/* ─── Add / Edit Broker Modal ────────────────────────────────────────────────── */
async function openAddBrokerModal() {
  _openBrokerFormModal(null);
}

async function openEditBrokerModal(brokerId) {
  const b = await DB.get(STORES.brokers, brokerId);
  if (!b) return;
  _openBrokerFormModal(b);
}

function _openBrokerFormModal(b) {
  _brokerEditingId = b?.id || null;
  const isEdit = !!b;
  const starPicker = (name, current) => {
    return Array.from({ length: 5 }, (_, i) => `
      <label class="cursor-pointer">
        <input type="radio" name="${name}" value="${i + 1}" class="sr-only" ${current === i + 1 ? 'checked' : ''}/>
        <svg class="w-6 h-6 transition-colors ${i < (current || 0) ? 'text-amber-400' : 'text-surface-300 dark:text-surface-600'} hover:text-amber-400"
          fill="currentColor" viewBox="0 0 20 20"
          onclick="this.closest('.star-row').querySelectorAll('svg').forEach((el,j)=>el.classList.toggle('text-amber-400',j<=${i})||el.classList.toggle('text-surface-300',j>${i}))">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
        </svg>
      </label>`).join('');
  };

  openModal(`
    <h3 class="text-base font-semibold mb-4">${isEdit ? 'Edit Broker' : 'Add Broker'}</h3>
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium mb-1">Name <span class="text-red-500">*</span></label>
          <input type="text" id="br-name" class="input-field" placeholder="Jane Smith" value="${escapeHtml(b?.name || '')}"/>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Firm</label>
          <input type="text" id="br-firm" class="input-field" placeholder="Sunbelt Business Advisors" value="${escapeHtml(b?.firm || '')}"/>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium mb-1">Email</label>
          <input type="email" id="br-email" class="input-field" placeholder="jane@example.com" value="${escapeHtml(b?.email || '')}"/>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Phone</label>
          <input type="tel" id="br-phone" class="input-field" placeholder="+1 (555) 000-0000" value="${escapeHtml(b?.phone || '')}"/>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium mb-1">Location</label>
          <input type="text" id="br-location" class="input-field" placeholder="Boston, MA" value="${escapeHtml(b?.location || '')}"/>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Deals Introduced</label>
          <input type="number" id="br-deals" class="input-field" min="0" placeholder="0" value="${b?.dealsIntroduced ?? ''}"/>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Specialty Industries <span class="text-surface-400 font-normal">(comma-separated)</span></label>
        <input type="text" id="br-specialties" class="input-field" placeholder="HVAC, Plumbing, Industrial Services" value="${escapeHtml(b?.specialties || '')}"/>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Relationship Rating</label>
        <div class="star-row flex gap-1">${starPicker('br-rating', b?.relationshipRating || 0)}</div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Notes</label>
        <textarea id="br-notes" class="input-field" rows="3" placeholder="How you met, best time to call, deal preferences…">${escapeHtml(b?.notes || '')}</textarea>
      </div>
    </div>
    <div class="flex justify-end gap-2 mt-5">
      <button onclick="closeModal()" class="btn-secondary">Cancel</button>
      <button onclick="saveBroker(_brokerEditingId)" class="btn-primary">${isEdit ? 'Save Changes' : 'Add Broker'}</button>
    </div>
  `);
}

async function saveBroker(existingId = null) {
  const name         = (document.getElementById('br-name')?.value || '').trim();
  const firm         = (document.getElementById('br-firm')?.value || '').trim();
  const email        = (document.getElementById('br-email')?.value || '').trim();
  const phone        = (document.getElementById('br-phone')?.value || '').trim();
  const location     = (document.getElementById('br-location')?.value || '').trim();
  const dealsIntro   = parseInt(document.getElementById('br-deals')?.value || '0') || 0;
  const specialties  = (document.getElementById('br-specialties')?.value || '').trim();
  const notes        = (document.getElementById('br-notes')?.value || '').trim();
  const ratingInput  = document.querySelector('input[name="br-rating"]:checked');
  const rating       = ratingInput ? parseInt(ratingInput.value) : 0;

  if (!name) { showToast('Please enter a name', 'error'); return; }

  const now = new Date().toISOString();
  try {
    if (existingId) {
      const existing = await DB.get(STORES.brokers, existingId);
      if (!existing) return;
      await DB.put(STORES.brokers, {
        ...existing, name, firm, email, phone, location,
        dealsIntroduced: dealsIntro, specialties, notes,
        relationshipRating: rating, updatedAt: now,
      });
      showToast('Broker updated', 'success');
    } else {
      await DB.add(STORES.brokers, {
        id: generateId(),
        userId: currentUser.id,
        name, firm, email, phone, location,
        dealsIntroduced: dealsIntro, specialties, notes,
        relationshipRating: rating,
        createdAt: now, updatedAt: now,
      });
      showToast('Broker added', 'success');
    }
    closeModal();
    await _brokersRefresh();
  } catch (err) {
    showToast('Could not save: ' + err.message, 'error');
  }
}

/* ─── Log Contact Modal ──────────────────────────────────────────────────────── */
async function openLogBrokerContactModal(brokerId) {
  const b = await DB.get(STORES.brokers, brokerId);
  if (!b) return;
  const today = new Date().toISOString().split('T')[0];

  openModal(`
    <h3 class="text-base font-semibold mb-1">Log Contact</h3>
    <p class="text-sm text-surface-500 mb-4">Record an interaction with <strong class="text-surface-900 dark:text-white">${escapeHtml(b.name)}</strong>${b.firm ? ` at ${escapeHtml(b.firm)}` : ''}.</p>
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium mb-1">Contact Date</label>
          <input type="date" id="lbc-date" class="input-field" value="${today}"/>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Channel</label>
          <select id="lbc-channel" class="input-field">
            <option value="call">Phone Call</option>
            <option value="email">Email</option>
            <option value="meeting">In-Person Meeting</option>
            <option value="text">Text / WhatsApp</option>
            <option value="conference">Conference / Event</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Notes <span class="text-surface-400 font-normal">(optional)</span></label>
        <textarea id="lbc-notes" class="input-field" rows="3"
          placeholder="What did you discuss? Any deals mentioned? Next steps?"></textarea>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Next Follow-up Date <span class="text-surface-400 font-normal">(optional)</span></label>
        <input type="date" id="lbc-followup" class="input-field"
          value="${new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]}"/>
      </div>
    </div>
    <div class="flex justify-end gap-2 mt-5">
      <button onclick="closeModal()" class="btn-secondary">Cancel</button>
      <button onclick="saveLogBrokerContact('${brokerId}')" class="btn-primary">Save</button>
    </div>
  `, { small: true });
}

async function saveLogBrokerContact(brokerId) {
  const date     = document.getElementById('lbc-date')?.value;
  const channel  = document.getElementById('lbc-channel')?.value || 'call';
  const notes    = (document.getElementById('lbc-notes')?.value || '').trim();
  const followup = document.getElementById('lbc-followup')?.value || '';

  if (!date) { showToast('Please pick a date', 'error'); return; }

  try {
    const b = await DB.get(STORES.brokers, brokerId);
    if (!b) return;

    // Update last contact date
    b.lastContactDate     = date;
    b.nextFollowUpDate    = followup || null;
    b.contactLog          = b.contactLog || [];
    b.contactLog.unshift({ date, channel, notes, loggedAt: new Date().toISOString() });
    b.updatedAt           = new Date().toISOString();
    await DB.put(STORES.brokers, b);

    // Optionally create a reminder activity
    if (followup) {
      await DB.add(STORES.activities, {
        id: generateId(),
        userId: currentUser.id,
        contactId: null,
        type: 'reminder',
        title: `Follow up with ${b.name}${b.firm ? ` (${b.firm})` : ''}`,
        description: notes || `Broker follow-up — last spoke ${new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        dueDate: followup,
        brokerId: b.id,
        createdAt: new Date().toISOString(),
      });
    }

    closeModal();
    await _brokersRefresh();
    showToast('Contact logged' + (followup ? ' — follow-up reminder created' : ''), 'success');
  } catch (err) {
    showToast('Could not save: ' + err.message, 'error');
  }
}

/* ─── Delete ─────────────────────────────────────────────────────────────────── */
async function _brokerDelete(brokerId) {
  if (!confirm('Delete this broker? This cannot be undone.')) return;
  try {
    await DB.delete(STORES.brokers, brokerId);
    await _brokersRefresh();
    showToast('Broker deleted', 'success');
  } catch (err) {
    showToast('Could not delete: ' + err.message, 'error');
  }
}

/* ─── Filter / search helpers ────────────────────────────────────────────────── */
function _brokerSetFilter(filter) {
  _brokerFilter = filter;
  _brokersRefresh();
}

function _brokerSetSearch(val) {
  _brokerSearch = val;
  _brokersRefresh();
}

/* ─── AI: Suggest Re-engagement Outreach ────────────────────────────────────── */
async function openBrokerAIOutreachModal(brokerId) {
  const b = await DB.get(STORES.brokers, brokerId);
  if (!b) return;

  openModal(`
    <div class="flex items-start gap-3 mb-4">
      <div class="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center shrink-0">
        <svg class="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
        </svg>
      </div>
      <div>
        <h3 class="text-base font-semibold">AI Outreach Draft</h3>
        <p class="text-xs text-surface-500 mt-0.5">Generate a re-engagement email for <strong>${escapeHtml(b.name)}</strong>${b.firm ? ` at ${escapeHtml(b.firm)}` : ''}</p>
      </div>
    </div>

    <div class="space-y-3 mb-4">
      <div>
        <label class="block text-sm font-medium mb-1">Context <span class="text-surface-400 font-normal">(optional)</span></label>
        <textarea id="brai-context" class="input-field text-sm" rows="2"
          placeholder="e.g. Haven't spoken in 60 days, looking for HVAC businesses in the Southeast, $1M–$3M EBITDA"></textarea>
      </div>
    </div>

    <div id="brai-result" class="hidden bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-700 p-4 mb-4">
      <p class="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">Draft Email</p>
      <div id="brai-text" class="text-sm text-surface-700 dark:text-surface-300 leading-relaxed whitespace-pre-wrap font-mono"></div>
    </div>

    <div class="flex justify-end gap-2">
      <button onclick="closeModal()" class="btn-secondary">Close</button>
      <button id="brai-copy-btn" class="hidden btn-secondary btn-sm" onclick="_brokerAICopyDraft()">Copy Draft</button>
      <button id="brai-gen-btn" onclick="_brokerAIGenerate('${b.id}')" class="btn-primary">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
        </svg>
        Generate Draft
      </button>
    </div>
  `);
}

async function _brokerAIGenerate(brokerId) {
  const b = await DB.get(STORES.brokers, brokerId);
  if (!b) return;

  const context = (document.getElementById('brai-context')?.value || '').trim();
  const genBtn  = document.getElementById('brai-gen-btn');
  const result  = document.getElementById('brai-result');
  const textEl  = document.getElementById('brai-text');
  const copyBtn = document.getElementById('brai-copy-btn');

  if (genBtn) { genBtn.disabled = true; genBtn.textContent = 'Generating…'; }

  const lastContact = b.lastContactDate
    ? new Date(b.lastContactDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'unknown';

  const systemPrompt = `You are a search fund investor writing a brief, professional re-engagement email to an M&A broker.
Write in first person, warm but not sycophantic, concise (under 150 words), no subject line needed.
Focus on rekindling the relationship and reminding them of your acquisition criteria.
Do not use generic filler phrases. Be specific and genuine.`;

  const userPrompt = `Write a re-engagement email to my broker contact:
Name: ${b.name}${b.firm ? `\nFirm: ${b.firm}` : ''}
Last contacted: ${lastContact}
Specialties: ${b.specialties || 'general M&A'}
${b.notes ? `Notes about this broker: ${b.notes}` : ''}
${context ? `Additional context: ${context}` : ''}

I am a search fund entrepreneur. Keep it brief and genuine.`;

  try {
    const draft = await callAI(systemPrompt, userPrompt, 400, 0.7);
    if (textEl) textEl.textContent = draft;
    if (result)  result.classList.remove('hidden');
    if (copyBtn) copyBtn.classList.remove('hidden');
  } catch (err) {
    showToast('AI generation failed: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    if (genBtn) { genBtn.disabled = false; genBtn.innerHTML = 'Regenerate'; }
  }
}

function _brokerAICopyDraft() {
  const text = document.getElementById('brai-text')?.textContent || '';
  navigator.clipboard.writeText(text).then(
    () => showToast('Draft copied to clipboard!', 'success'),
    () => showToast('Copy failed — please select manually', 'error')
  );
}

/* ─── Refresh ────────────────────────────────────────────────────────────────── */
async function _brokersRefresh() {
  let brokers = [];
  try {
    const all = await DB.getForUser(STORES.brokers, currentUser.id);
    brokers = (all || []).sort((a, b) => {
      const aL = a.lastContactDate || a.createdAt || '';
      const bL = b.lastContactDate || b.createdAt || '';
      return bL > aL ? 1 : bL < aL ? -1 : 0;
    });
  } catch (_) {}

  const statsEl = document.getElementById('brokers-stats-row');
  const mainEl  = document.getElementById('brokers-main');
  if (statsEl) statsEl.innerHTML = _brokersStatsHtml(brokers);
  if (mainEl)  mainEl.innerHTML  = _brokersMainHtml(brokers);
}
