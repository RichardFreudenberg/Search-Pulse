/* ============================================
   Nexus CRM — Calls / Networking Call Workflow
   ============================================ */

// Module-level state for the multi-participant call modal
let _callParticipants = [];   // [{id, name}]
let _callTasks = [];          // [{uid, text, assignedToId, assignedToName, dueDate}]
let _callAllContacts = [];    // cache for picker search
let _callTaskCounter = 0;     // uid generator
let _callPickerOutsideHandler = null; // dedup outside-click listener
let _callDealId = null;       // selected deal ID when logging a call (optional)

// ── Inline recorder state (embedded in Log Call modal) ────────────
let _callRecState        = 'idle';  // idle | recording | paused | processing | review
let _callRecRecognition  = null;
let _callRecMediaRec     = null;
let _callRecStream       = null;
let _callRecAudioChunks  = [];
let _callRecSegments     = [];
let _callRecSegCounter   = 0;
let _callRecStartTime    = null;
let _callRecPausedMs     = 0;
let _callRecPauseStart   = null;
let _callRecTimerInt     = null;
let _callRecSession      = null;   // {rawTranscript, userNotes, aiSummary, aiStructuredNote}
let _callRecContextInfo  = '';     // contact/deal names injected into Whisper + AI correction
let _callRecLang         = localStorage.getItem('pulse_call_rec_lang') || 'en-US'; // persisted language

// ── Render Calls List ────────────────────────────────────────────

async function renderCalls() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto">${renderLoadingSkeleton(5)}</div>`;

  const [calls, contacts, companies, deals] = await Promise.all([
    DB.getForUser(STORES.calls, currentUser.id),
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.companies, currentUser.id),
    DB.getForUser(STORES.deals, currentUser.id),
  ]);

  const contactMap = buildMap(getActiveContacts(contacts));
  const companyMap = buildMap(companies);
  const dealMap = buildMap(deals);
  const sortedCalls = sortByDate(calls, 'date');

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      ${renderPageHeader('Calls', `${calls.length} calls logged`, `
        <button onclick="openMeetingRecorder()" class="btn-secondary flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
          Record Meeting
        </button>
        <button onclick="openNewCallModal()" class="btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Log Call
        </button>
      `)}

      ${sortedCalls.length === 0 ? renderEmptyState(
        '<svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>',
        'No calls logged yet',
        'Log your networking calls to track conversations and follow-ups',
        '<button onclick="openNewCallModal()" class="btn-primary">Log Your First Call</button>'
      ) : `
        <div class="space-y-4">
          ${sortedCalls.map(call => {
            const participantIds = call.participantIds || (call.contactId ? [call.contactId] : []);
            const participants = participantIds.map(id => contactMap[id]).filter(Boolean);
            const primaryContact = participants[0];
            const company = primaryContact ? companyMap[primaryContact.companyId] : null;
            return `
              <div class="card">
                <div class="flex items-start gap-4">
                  <div class="flex -space-x-2 flex-shrink-0">
                    ${participants.length > 0
                      ? participants.slice(0, 4).map(p =>
                          `<div class="ring-2 ring-white dark:ring-surface-900 rounded-full">${renderAvatar(p.fullName, p.photoUrl, 'md', p.linkedInUrl)}</div>`
                        ).join('')
                      : '<div class="avatar avatar-md">?</div>'}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                      <span class="font-medium">
                        ${participants.length > 1
                          ? participants.map(p =>
                              `<span class="cursor-pointer hover:text-brand-600" onclick="viewContact('${p.id}')">${escapeHtml(p.fullName)}</span>`
                            ).join(', ')
                          : primaryContact
                            ? `<span class="cursor-pointer hover:text-brand-600" onclick="viewContact('${primaryContact.id}')">${escapeHtml(primaryContact.fullName)}</span>`
                            : 'Unknown Contact'}
                      </span>
                      ${company ? `<span class="text-sm text-surface-500">${escapeHtml(company.name)}</span>` : ''}
                      <span class="text-sm text-surface-400">${formatDateTime(call.date)}</span>
                      ${call.duration ? `<span class="text-xs text-surface-400">${call.duration} min</span>` : ''}
                    </div>
                    ${call.outcome ? `<div class="mb-2"><span class="badge badge-blue">${escapeHtml(call.outcome)}</span>${call.dealId && dealMap[call.dealId] ? `<span class="badge ml-1" style="background:rgba(124,92,252,0.1);color:#7C5CFC;border:1px solid rgba(124,92,252,0.25)">${escapeHtml(dealMap[call.dealId].name)}</span>` : ''}</div>` : (call.dealId && dealMap[call.dealId] ? `<div class="mb-2"><span class="badge" style="background:rgba(124,92,252,0.1);color:#7C5CFC;border:1px solid rgba(124,92,252,0.25)">${escapeHtml(dealMap[call.dealId].name)}</span></div>` : '')}
                    ${call.notes ? `<p class="text-sm text-surface-600 dark:text-surface-400 whitespace-pre-wrap">${escapeHtml(call.notes)}</p>` : ''}
                    ${call.nextSteps ? `<p class="text-sm mt-2"><span class="font-medium text-surface-700 dark:text-surface-300">Next steps:</span> ${escapeHtml(call.nextSteps)}</p>` : ''}
                    ${call.tasks && call.tasks.length > 0 ? `
                      <div class="mt-3 pt-3 border-t border-surface-100 dark:border-surface-800 space-y-1.5">
                        <p class="text-xs font-medium text-surface-500 uppercase tracking-wide mb-2">Action Items</p>
                        ${call.tasks.map(t => `
                          <div class="flex items-start gap-2 text-sm">
                            <svg class="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span class="text-surface-700 dark:text-surface-300 flex-1">${escapeHtml(t.text)}</span>
                            ${t.assignedToName ? `<span class="text-xs text-surface-400 whitespace-nowrap">&rarr; ${escapeHtml(t.assignedToName)}</span>` : ''}
                            ${t.dueDate ? `<span class="text-xs text-surface-400 whitespace-nowrap">${formatDate(t.dueDate)}</span>` : ''}
                          </div>
                        `).join('')}
                      </div>
                    ` : ''}
                    ${call.followUpDate ? `<p class="text-xs text-surface-500 mt-2">Follow-up: ${formatDate(call.followUpDate)}</p>` : ''}
                  </div>
                  <button onclick="openEditCallModal('${call.id}')" title="Edit call"
                    class="flex-shrink-0 p-1.5 text-surface-400 hover:text-brand-600 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

// ── Multi-Participant Picker ──────────────────────────────────────

function callPickerFilter(val) {
  const results = document.getElementById('call-participant-results');
  if (!results) return;
  const q = (val || '').trim().toLowerCase();
  if (!q) { results.classList.add('hidden'); return; }
  const already = new Set(_callParticipants.map(p => p.id));
  const filtered = _callAllContacts.filter(c => !already.has(c.id) && c.fullName.toLowerCase().includes(q)).slice(0, 8);
  if (filtered.length === 0) { results.classList.add('hidden'); return; }
  results.innerHTML = filtered.map(c => `
    <button type="button" data-cpid="${c.id}" data-cpname="${escapeHtml(c.fullName)}"
      onclick="callPickerAdd(this.dataset.cpid, this.dataset.cpname)"
      class="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-800 flex items-center gap-3">
      ${renderAvatar(c.fullName, c.photoUrl, 'sm')}
      <span class="flex-1 font-medium">${escapeHtml(c.fullName)}</span>
      ${c.title ? `<span class="text-xs text-surface-400 truncate max-w-[120px]">${escapeHtml(c.title)}</span>` : ''}
    </button>
  `).join('');
  results.classList.remove('hidden');
}

function callPickerAdd(id, name) {
  if (_callParticipants.find(p => p.id === id)) return;
  _callParticipants.push({ id, name });
  const search = document.getElementById('call-participant-search');
  const results = document.getElementById('call-participant-results');
  if (search) search.value = '';
  if (results) results.classList.add('hidden');
  callPickerRender();
  callTaskRender(); // update assign-to dropdowns
}

function callPickerRemove(id) {
  _callParticipants = _callParticipants.filter(p => p.id !== id);
  // Clear assignment on any tasks assigned to this person
  _callTasks.forEach(t => { if (t.assignedToId === id) { t.assignedToId = ''; t.assignedToName = ''; } });
  callPickerRender();
  callTaskRender();
}

function callPickerRender() {
  const tags = document.getElementById('call-participants-tags');
  if (!tags) return;
  if (_callParticipants.length === 0) {
    tags.innerHTML = '<span class="text-xs text-surface-400 italic">No participants yet — search above to add</span>';
    return;
  }
  tags.innerHTML = _callParticipants.map(p => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 text-sm border border-brand-200 dark:border-brand-700 rounded">
      ${escapeHtml(p.name)}
      <button type="button" data-remove-id="${p.id}" onclick="callPickerRemove(this.dataset.removeId)"
        class="hover:text-red-500 transition-colors ml-0.5" title="Remove">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  `).join('');
}

// ── Task Management ───────────────────────────────────────────────

function callTaskAdd() {
  const uid = 'task-' + (++_callTaskCounter);
  _callTasks.push({ uid, text: '', assignedToId: '', assignedToName: '', dueDate: '' });
  callTaskRender();
  // Focus the new task text input
  setTimeout(() => {
    const inputs = document.querySelectorAll('#call-tasks-list .task-text-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 30);
}

function callTaskRemove(uid) {
  _callTasks = _callTasks.filter(t => t.uid !== uid);
  callTaskRender();
}

function _callParticipantOptions(selectedId) {
  return [
    `<option value=""${!selectedId ? ' selected' : ''}>Assign to&hellip;</option>`,
    `<option value="self"${selectedId === 'self' ? ' selected' : ''}>Myself</option>`,
    ..._callParticipants.map(p =>
      `<option value="${p.id}"${selectedId === p.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`
    ),
  ].join('');
}

function callTaskRender() {
  const list = document.getElementById('call-tasks-list');
  if (!list) return;
  if (_callTasks.length === 0) {
    list.innerHTML = '<p class="text-xs text-surface-400 py-1 italic">No action items. Click "+ Add Task" to assign tasks from this call.</p>';
    return;
  }
  list.innerHTML = _callTasks.map(task => `
    <div class="flex items-center gap-2 flex-wrap sm:flex-nowrap" id="task-row-${task.uid}">
      <input type="text" class="input-field flex-1 min-w-0 task-text-input"
        placeholder="Action item description…"
        value="${escapeHtml(task.text)}"
        data-task-uid="${task.uid}" />
      <select class="input-field task-assign-select flex-shrink-0" style="width:140px" data-task-uid="${task.uid}">
        ${_callParticipantOptions(task.assignedToId)}
      </select>
      <input type="date" class="input-field task-due-input flex-shrink-0" style="width:130px"
        value="${task.dueDate}" data-task-uid="${task.uid}" />
      <button type="button" data-remove-task="${task.uid}" onclick="callTaskRemove(this.dataset.removeTask)"
        class="flex-shrink-0 p-1.5 text-surface-400 hover:text-red-500 transition-colors" title="Remove task">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  `).join('');
}

// Event delegation for task input changes (attached once after modal opens)
function _callTasksWireEvents() {
  const form = document.getElementById('new-call-form');
  if (!form) return;
  form.addEventListener('input', (e) => {
    const uid = e.target.dataset.taskUid;
    if (!uid) return;
    const task = _callTasks.find(t => t.uid === uid);
    if (!task) return;
    if (e.target.classList.contains('task-text-input')) task.text = e.target.value;
    if (e.target.classList.contains('task-due-input')) task.dueDate = e.target.value;
  });
  form.addEventListener('change', (e) => {
    const uid = e.target.dataset.taskUid;
    if (!uid) return;
    const task = _callTasks.find(t => t.uid === uid);
    if (!task) return;
    if (e.target.classList.contains('task-assign-select')) {
      task.assignedToId = e.target.value;
      const sel = e.target;
      task.assignedToName = task.assignedToId === '' ? '' :
        (task.assignedToId === 'self' ? 'Myself' : sel.options[sel.selectedIndex].text);
    }
  });
}

// ── Shared Call Form HTML ─────────────────────────────────────────

const CALL_OUTCOMES = ['Great call', 'Good conversation', 'Needs follow-up', 'Left voicemail', 'No answer', 'Intro made', 'Meeting scheduled'];

function _callFormHtml(defaults = {}) {
  return `
    <div>
      <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-2">
        Participants <span class="text-red-500">*</span>
      </label>
      <div id="call-participants-tags" class="flex flex-wrap gap-2 mb-2 min-h-[28px]">
        <span class="text-xs text-surface-400 italic">No participants yet — search below to add</span>
      </div>
      <div class="relative">
        <input id="call-participant-search" type="text" class="input-field"
          placeholder="Search contacts to add to this call…"
          oninput="callPickerFilter(this.value)" onfocus="callPickerFilter(this.value)" autocomplete="off" />
        <div id="call-participant-results"
          class="hidden absolute z-50 w-full bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded shadow-lg mt-1 max-h-48 overflow-y-auto">
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Date &amp; Time</label>
        <input type="datetime-local" id="call-date" class="input-field" value="${defaults.date || ''}" />
      </div>
      <div>
        <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Duration (min)</label>
        <input type="number" id="call-duration" class="input-field" placeholder="30" min="1" value="${defaults.duration || ''}" />
      </div>
      <div>
        <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Outcome</label>
        <select id="call-outcome" class="input-field">
          <option value="">Select outcome</option>
          ${CALL_OUTCOMES.map(o => `<option value="${o}"${defaults.outcome === o ? ' selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>
    </div>

    <div>
      <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">
        Link to Deal <span class="text-xs font-normal text-surface-400">(optional)</span>
      </label>
      <select id="call-deal-id" class="input-field">
        <option value="">— No deal —</option>
      </select>
      <p class="text-xs text-surface-400 mt-1">This call will also appear in the selected deal's Calls tab.</p>
    </div>

    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="block text-sm font-medium text-surface-600 dark:text-surface-400">Notes</label>
        <div class="flex items-center gap-2">
          <button type="button" id="call-rec-toggle-btn" onclick="callRecToggle()"
            class="btn-ghost btn-sm flex items-center gap-1.5 text-red-500" style="font-size:0.75rem">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/>
            </svg>
            Record
          </button>
          <button type="button" id="clean-call-notes-btn" onclick="cleanCallNotes()"
            class="btn-ghost btn-sm text-brand-600 flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/>
            </svg>
            Clean Notes
          </button>
        </div>
      </div>

      <!-- Inline recorder panel (4 states: idle / recording+paused / processing / review) -->
      <div id="call-rec-panel" class="hidden mb-2 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden bg-surface-50 dark:bg-surface-800/50">

        <!-- STATE: idle -->
        <div id="call-rec-idle" class="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-surface-300"></div>
            <span class="text-sm text-surface-500">Record your meeting directly — live transcript + AI summary</span>
          </div>
          <div class="flex items-center gap-2">
            <select id="call-rec-lang-select" onchange="callRecSetLang(this.value)"
              class="text-xs border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1.5 bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
              title="Recording language">
              <option value="en-US"  ${_callRecLang==='en-US'  ?'selected':''}>🇺🇸 EN</option>
              <option value="en-GB"  ${_callRecLang==='en-GB'  ?'selected':''}>🇬🇧 EN</option>
              <option value="de-DE"  ${_callRecLang==='de-DE'  ?'selected':''}>🇩🇪 DE</option>
              <option value="de-AT"  ${_callRecLang==='de-AT'  ?'selected':''}>🇦🇹 DE</option>
              <option value="de-CH"  ${_callRecLang==='de-CH'  ?'selected':''}>🇨🇭 DE</option>
            </select>
            <button type="button" onclick="callRecStart()"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors">
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>
              Start Recording
            </button>
          </div>
        </div>

        <!-- STATE: recording / paused -->
        <div id="call-rec-active" class="hidden">
          <div class="flex gap-3 p-3" style="min-height:180px">
            <!-- live transcript -->
            <div class="flex-1 flex flex-col min-w-0">
              <div class="flex items-center justify-between mb-1">
                <p class="text-xs font-medium text-surface-500">Live Transcript</p>
                <span id="call-rec-live-badge" class="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">● Live</span>
              </div>
              <div id="call-rec-transcript" class="flex-1 overflow-y-auto text-sm bg-white dark:bg-surface-900 rounded border border-surface-200 dark:border-surface-700 p-2 leading-relaxed" style="max-height:150px">
                <p id="call-rec-transcript-ph" class="text-surface-400 italic text-xs">Transcript will appear here as you speak…</p>
              </div>
              <p id="call-rec-live-text" class="text-xs text-surface-400 italic mt-1 min-h-[1rem]"></p>
            </div>
            <!-- quick notes side panel -->
            <div class="w-36 flex flex-col flex-shrink-0">
              <div class="flex items-center justify-between mb-1">
                <p class="text-xs font-medium text-surface-500">Notes</p>
                <div class="flex gap-0.5">
                  ${['!','?','→','⚠'].map(t => `<button type="button" onclick="callRecInsertTag('${t}')" class="text-xs px-1 rounded bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 text-surface-500">${t}</button>`).join('')}
                </div>
              </div>
              <textarea id="call-rec-notes" class="flex-1 input-field text-xs resize-none" style="min-height:140px" placeholder="! important&#10;? question&#10;→ action&#10;⚠ risk"></textarea>
            </div>
          </div>
          <!-- controls bar -->
          <div class="px-3 pb-3 flex items-center justify-between border-t border-surface-100 dark:border-surface-700 pt-2">
            <div class="flex items-center gap-2">
              <div id="call-rec-dot" class="w-2.5 h-2.5 rounded-full bg-red-500" style="animation:pulseSoft 1s ease-in-out infinite"></div>
              <span id="call-rec-timer" class="text-sm font-mono text-surface-500">00:00</span>
            </div>
            <div class="flex gap-2">
              <button type="button" id="call-rec-pause-btn" onclick="callRecPause()" class="btn-ghost btn-sm text-xs">Pause</button>
              <button type="button" id="call-rec-resume-btn" onclick="callRecResume()" class="btn-ghost btn-sm text-xs hidden">Resume</button>
              <button type="button" onclick="callRecStop()" class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors">Stop &amp; Process</button>
              <button type="button" onclick="callRecCancel()" class="btn-ghost btn-sm text-xs text-surface-400">Discard</button>
            </div>
          </div>
        </div>

        <!-- STATE: processing -->
        <div id="call-rec-processing" class="hidden px-4 py-5 flex items-center justify-center gap-3">
          <svg class="animate-spin w-5 h-5 text-brand-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <span class="text-sm text-surface-500">Generating AI summary…</span>
        </div>

        <!-- STATE: review -->
        <div id="call-rec-review" class="hidden">
          <div class="px-3 pt-3 pb-1 flex items-center justify-between">
            <span class="flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Meeting Recorded
            </span>
            <button type="button" onclick="callRecReset()" class="text-xs text-surface-400 hover:text-surface-600 transition-colors">Record again ↺</button>
          </div>
          <div id="call-rec-review-content" class="px-3 py-2 space-y-2 max-h-48 overflow-y-auto text-sm"></div>
          <div class="px-3 pb-3 pt-1 flex items-center justify-between border-t border-surface-100 dark:border-surface-700 mt-2">
            <p class="text-xs text-surface-400">Action items will be added as tasks</p>
            <button type="button" onclick="callRecApply()" class="btn-primary btn-sm text-xs">Apply to Notes ↓</button>
          </div>
        </div>

      </div><!-- /call-rec-panel -->

      <textarea id="call-notes" class="input-field" rows="5"
        placeholder="Key topics discussed, insights, takeaways…">${escapeHtml(defaults.notes || '')}</textarea>
    </div>

    <div>
      <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Next Steps</label>
      <textarea id="call-next-steps" class="input-field" rows="2"
        placeholder="Action items, introductions to make, info to send…">${escapeHtml(defaults.nextSteps || '')}</textarea>
    </div>

    <div>
      <div class="flex items-center justify-between mb-2">
        <label class="block text-sm font-medium text-surface-600 dark:text-surface-400">
          Action Items
          <span class="text-xs font-normal text-surface-400 ml-1">— assign tasks to participants</span>
        </label>
        <button type="button" onclick="callTaskAdd()" class="btn-ghost btn-sm text-brand-600 flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Task
        </button>
      </div>
      <div id="call-tasks-list" class="space-y-2">
        <p class="text-xs text-surface-400 py-1 italic">No action items. Click "+ Add Task" to assign tasks from this call.</p>
      </div>
    </div>

    <div>
      <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Follow-up Date</label>
      <input type="date" id="call-followup" class="input-field" value="${defaults.followUpDate || ''}" />
      <p class="text-xs text-surface-400 mt-1">Sets each participant's next follow-up date automatically</p>
    </div>
  `;
}

// ── Call Logger Floating Panel ─────────────────────────────────────

let _clMinimized = false;

function _clShowPanel(title = 'Log Call') {
  const panel = document.getElementById('cl-floating-panel');
  if (!panel) return;
  panel.style.display = 'flex';
  _clMinimized = false;
  const body = document.getElementById('cl-panel-body');
  if (body) body.style.display = '';
  const titleEl = document.getElementById('cl-panel-title');
  if (titleEl) titleEl.textContent = title;
  const btn = document.getElementById('cl-minimize-btn');
  if (btn) btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>';
}

function _clHidePanel() {
  const panel = document.getElementById('cl-floating-panel');
  if (panel) panel.style.display = 'none';
  if (_callPickerOutsideHandler) {
    document.removeEventListener('click', _callPickerOutsideHandler);
    _callPickerOutsideHandler = null;
  }
}

function _clToggleMinimize() {
  _clMinimized = !_clMinimized;
  const body = document.getElementById('cl-panel-body');
  const btn  = document.getElementById('cl-minimize-btn');
  if (body) body.style.display = _clMinimized ? 'none' : '';
  if (btn) btn.innerHTML = _clMinimized
    ? '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8l8 8 8-8"/></svg>'
    : '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>';
}

function _clRequestClose() {
  if (_callRecState === 'recording' || _callRecState === 'paused') {
    if (!confirm('A recording is in progress — stop and discard it?')) return;
    _callRecCleanup();
  }
  _clHidePanel();
}

function _clInitDrag() {
  const panel  = document.getElementById('cl-floating-panel');
  const handle = document.getElementById('cl-drag-handle');
  if (!panel || !handle || handle._dragInit) return;
  handle._dragInit = true;

  let dragging = false, ox = 0, oy = 0;

  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    panel.style.right  = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left   = rect.left + 'px';
    panel.style.top    = rect.top  + 'px';
    ox = e.clientX - rect.left;
    oy = e.clientY - rect.top;
    dragging = true;
    handle.classList.add('cl-dragging');
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
    handle.classList.remove('cl-dragging');
  });
}

function _openCallModal(title, subtitle, submitHandler, defaults = {}) {
  // Inject the form into the floating panel body
  const body = document.getElementById('cl-panel-body');
  if (body) {
    body.innerHTML = `
      <div class="p-5">
        <p class="text-sm text-surface-500 mb-5">${subtitle}</p>
        <form id="new-call-form" class="space-y-5" autocomplete="off">
          ${_callFormHtml(defaults)}
          <div class="flex justify-end gap-3 pt-3 border-t border-surface-100 dark:border-surface-800">
            <button type="button" onclick="_clRequestClose()" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">Save Call</button>
          </div>
        </form>
      </div>`;
    _clShowPanel(title);
    _clInitDrag();
  } else {
    // Fallback: regular modal if floating panel not in DOM
    openModal(`
      <div class="p-6">
        <h2 class="text-lg font-semibold mb-1">${title}</h2>
        <p class="text-sm text-surface-500 mb-6">${subtitle}</p>
        <form id="new-call-form" class="space-y-5" autocomplete="off">
          ${_callFormHtml(defaults)}
          <div class="flex justify-end gap-3 pt-3 border-t border-surface-100 dark:border-surface-800">
            <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">Save Call</button>
          </div>
        </form>
      </div>
    `, { wide: true });
  }

  callPickerRender();
  callTaskRender();
  _callTasksWireEvents();

  if (_callPickerOutsideHandler) document.removeEventListener('click', _callPickerOutsideHandler);
  _callPickerOutsideHandler = (e) => {
    const results = document.getElementById('call-participant-results');
    const search = document.getElementById('call-participant-search');
    if (!results) { document.removeEventListener('click', _callPickerOutsideHandler); return; }
    if (!results.contains(e.target) && e.target !== search) results.classList.add('hidden');
  };
  document.addEventListener('click', _callPickerOutsideHandler);

  document.getElementById('new-call-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitHandler();
  });
}

// ── Inline recorder (embedded in Log Call modal) ──────────────────

function _callRecSetState(state) {
  _callRecState = state;
  const idle       = document.getElementById('call-rec-idle');
  const active     = document.getElementById('call-rec-active');
  const processing = document.getElementById('call-rec-processing');
  const review     = document.getElementById('call-rec-review');
  if (!idle) return;
  idle.classList.toggle('hidden',       state !== 'idle');
  active.classList.toggle('hidden',     state !== 'recording' && state !== 'paused');
  processing.classList.toggle('hidden', state !== 'processing');
  review.classList.toggle('hidden',     state !== 'review');

  // Pause / resume buttons
  const pauseBtn  = document.getElementById('call-rec-pause-btn');
  const resumeBtn = document.getElementById('call-rec-resume-btn');
  const dot       = document.getElementById('call-rec-dot');
  const liveBadge = document.getElementById('call-rec-live-badge');
  if (pauseBtn)  pauseBtn.classList.toggle('hidden',  state !== 'recording');
  if (resumeBtn) resumeBtn.classList.toggle('hidden', state !== 'paused');
  if (dot) {
    dot.style.background = state === 'paused' ? '#f59e0b' : '#ef4444';
    dot.style.animation  = state === 'recording' ? 'pulseSoft 1s ease-in-out infinite' : 'none';
  }
  if (liveBadge) liveBadge.classList.toggle('hidden', state !== 'recording');
}

function callRecToggle() {
  const panel = document.getElementById('call-rec-panel');
  if (!panel) return;
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (opening && _callRecState === 'idle') {
    _callRecSetState('idle');
  }
  // Update toggle button label
  const btn = document.getElementById('call-rec-toggle-btn');
  if (btn) btn.style.opacity = opening ? '1' : '0.6';
}

async function callRecStart() {
  _callRecState = 'requesting';

  // Build context from selected call participants for Whisper prompt + AI correction
  const participantNames = _callParticipants.map(p => p.name).filter(Boolean);
  _callRecContextInfo = participantNames.length
    ? `Call with: ${participantNames.join(', ')}. Search fund investor call.`
    : 'Search fund investor call.';

  try {
    // Share the persisted device selection with the meeting recorder
    const deviceId = localStorage.getItem('pulse_mr_device_id') || '';
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 48000 },
      channelCount: 1,
    };
    if (deviceId) audioConstraints.deviceId = { exact: deviceId };
    _callRecStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
  } catch (_) {
    // Fallback to default mic if chosen device fails (e.g. headphones disconnected)
    try {
      _callRecStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (err) {
      showToast('Microphone access denied — please allow mic access in your browser.', 'error');
      _callRecSetState('idle');
      return;
    }
  }

  // Reset state
  _callRecSegments    = [];
  _callRecSegCounter  = 0;
  _callRecAudioChunks = [];
  _callRecStartTime   = new Date();
  _callRecPausedMs    = 0;
  _callRecPauseStart  = null;
  _callRecSession     = null;

  // Clear transcript placeholder
  const ph = document.getElementById('call-rec-transcript-ph');
  if (ph) ph.remove();

  // MediaRecorder for Whisper fallback
  try {
    _callRecMediaRec = new MediaRecorder(_callRecStream);
    _callRecMediaRec.ondataavailable = e => { if (e.data.size > 0) _callRecAudioChunks.push(e.data); };
    _callRecMediaRec.start(5000);
  } catch (_) {}

  // Web Speech API
  _callRecStartSpeech();

  _callRecSetState('recording');

  // Timer
  _callRecTimerInt = setInterval(() => {
    const el = document.getElementById('call-rec-timer');
    if (!el) { clearInterval(_callRecTimerInt); return; }
    const elapsed = _callRecElapsedMs();
    const secs = Math.floor(elapsed / 1000);
    el.textContent = String(Math.floor(secs / 60)).padStart(2,'0') + ':' + String(secs % 60).padStart(2,'0');
  }, 500);
}

function _callRecElapsedMs() {
  if (!_callRecStartTime) return 0;
  const now = Date.now();
  const paused = _callRecPauseStart ? (now - _callRecPauseStart.getTime()) : 0;
  return now - _callRecStartTime.getTime() - _callRecPausedMs - paused;
}

function callRecSetLang(code) {
  _callRecLang = code;
  localStorage.setItem('pulse_call_rec_lang', code);
}

function _callRecStartSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  _callRecRecognition = new SR();
  _callRecRecognition.continuous      = true;
  _callRecRecognition.interimResults  = true;
  _callRecRecognition.maxAlternatives = 3; // pick the most confident result
  _callRecRecognition.lang            = _callRecLang;

  _callRecRecognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        // Choose the alternative with the highest confidence
        let bestText = res[0].transcript;
        let bestConf = res[0].confidence || 0;
        for (let a = 1; a < res.length; a++) {
          if ((res[a].confidence || 0) > bestConf) {
            bestConf = res[a].confidence;
            bestText = res[a].transcript;
          }
        }
        const text = bestText.trim();
        if (text) _callRecAppendSegment(text);
        _callRecRenderLive('');
      } else {
        _callRecRenderLive(res[0].transcript);
      }
    }
  };
  _callRecRecognition.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'audio-capture') return;
    if (_callRecState === 'recording') setTimeout(() => { try { _callRecRecognition.start(); } catch(_) {} }, 200);
  };
  _callRecRecognition.onend = () => {
    if (_callRecState === 'recording') setTimeout(() => { try { _callRecRecognition.start(); } catch(_) {} }, 100);
  };
  try { _callRecRecognition.start(); } catch(_) {}
}

function _callRecAppendSegment(text) {
  const ms = _callRecElapsedMs();
  _callRecSegments.push({ id: ++_callRecSegCounter, startMs: ms, text, isFinal: true });
  const container = document.getElementById('call-rec-transcript');
  if (!container) return;
  const mm = String(Math.floor(ms / 60000)).padStart(2,'0');
  const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2,'0');
  const div = document.createElement('div');
  div.className = 'flex gap-2 text-xs leading-relaxed mb-0.5';
  div.innerHTML = `<span class="text-surface-400 font-mono flex-shrink-0">${mm}:${ss}</span><span>${escapeHtml(text)}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function _callRecRenderLive(text) {
  const el = document.getElementById('call-rec-live-text');
  if (el) el.textContent = text;
}

function callRecInsertTag(tag) {
  const ta = document.getElementById('call-rec-notes');
  if (!ta) return;
  const pos = ta.selectionStart;
  ta.value = ta.value.substring(0, pos) + tag + ' ' + ta.value.substring(pos);
  ta.selectionStart = ta.selectionEnd = pos + tag.length + 1;
  ta.focus();
}

function callRecPause() {
  if (_callRecState !== 'recording') return;
  _callRecPauseStart = new Date();
  if (_callRecRecognition) try { _callRecRecognition.stop(); } catch(_) {}
  if (_callRecMediaRec && _callRecMediaRec.state === 'recording') _callRecMediaRec.pause();
  clearInterval(_callRecTimerInt);
  _callRecSetState('paused');
}

function callRecResume() {
  if (_callRecState !== 'paused') return;
  if (_callRecPauseStart) { _callRecPausedMs += Date.now() - _callRecPauseStart.getTime(); _callRecPauseStart = null; }
  if (_callRecMediaRec && _callRecMediaRec.state === 'paused') _callRecMediaRec.resume();
  _callRecStartSpeech();
  _callRecSetState('recording');
  _callRecTimerInt = setInterval(() => {
    const el = document.getElementById('call-rec-timer');
    if (!el) { clearInterval(_callRecTimerInt); return; }
    const secs = Math.floor(_callRecElapsedMs() / 1000);
    el.textContent = String(Math.floor(secs / 60)).padStart(2,'0') + ':' + String(secs % 60).padStart(2,'0');
  }, 500);
}

async function callRecStop() {
  if (_callRecState !== 'recording' && _callRecState !== 'paused') return;

  clearInterval(_callRecTimerInt);
  if (_callRecRecognition) { try { _callRecRecognition.stop(); } catch(_) {} _callRecRecognition = null; }

  // Collect audio
  let audioBlob = null;
  if (_callRecMediaRec && (_callRecMediaRec.state === 'recording' || _callRecMediaRec.state === 'paused')) {
    audioBlob = await new Promise(resolve => {
      _callRecMediaRec.onstop = () => resolve(_callRecAudioChunks.length ? new Blob(_callRecAudioChunks, { type: 'audio/webm' }) : null);
      _callRecMediaRec.stop();
    });
  }
  if (_callRecStream) { _callRecStream.getTracks().forEach(t => t.stop()); _callRecStream = null; }

  const userNotes    = (document.getElementById('call-rec-notes') || {}).value || '';
  let   transcript   = _callRecSegments.filter(s => s.isFinal).map(s => s.text).join(' ');

  _callRecSetState('processing');

  const settings  = await DB.get(STORES.settings, `settings_${currentUser.id}`) || {};
  const openAiKey = settings.openAiApiKey || settings.openaiApiKey || '';

  // Step 1: Whisper fallback — trigger when fewer than 40 words captured
  if (audioBlob && openAiKey && transcript.split(/\s+/).filter(Boolean).length < 40) {
    try {
      const whisper = await _mrWhisperTranscribe(audioBlob, openAiKey, _callRecContextInfo);
      if (whisper && whisper.length > transcript.length) transcript = whisper;
    } catch (_) {}
  }

  // Step 2: AI transcript correction — fix garbled words using call context
  if (transcript && openAiKey) {
    try {
      const corrected = await _mrCorrectTranscript(transcript, _callRecContextInfo, _callRecLang);
      if (corrected && corrected.trim()) transcript = corrected;
    } catch (_) {}
  }

  // AI processing
  let aiSummary = null, aiStructuredNote = null;
  try {
    [aiSummary, aiStructuredNote] = await Promise.all([
      _mrGenerateSummary(transcript, userNotes, _callRecLang),
      _mrGenerateStructuredNote(transcript, userNotes, _callRecLang),
    ]);
  } catch (_) {}

  _callRecSession = { rawTranscript: transcript, userNotes, aiSummary, aiStructuredNote, segments: _callRecSegments.slice() };

  // Render review
  _callRecRenderReview();
  _callRecSetState('review');
}

function _callRecRenderReview() {
  const container = document.getElementById('call-rec-review-content');
  if (!container || !_callRecSession) return;
  const s = _callRecSession;
  const n = s.aiStructuredNote || {};

  const sentColor = { positive:'text-green-600', neutral:'text-surface-500', cautious:'text-amber-600', negative:'text-red-600' };

  container.innerHTML = `
    ${n.sentiment ? `<div class="flex items-center gap-2 mb-1"><span class="text-xs text-surface-400">Sentiment</span><span class="text-xs font-semibold ${sentColor[n.sentiment] || ''}">${n.sentiment}</span></div>` : ''}
    ${n.keyTakeaways?.length ? `
      <div>
        <p class="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-1">Key Takeaways</p>
        <ul class="space-y-0.5">${n.keyTakeaways.map(t => `<li class="flex gap-1.5 text-xs"><span class="flex-shrink-0 text-surface-400">·</span><span>${escapeHtml(t)}</span></li>`).join('')}</ul>
      </div>` : (s.aiSummary ? `<p class="text-xs leading-relaxed whitespace-pre-wrap">${escapeHtml(s.aiSummary)}</p>` : '')}
    ${n.actionItems?.length ? `
      <div>
        <p class="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-1">Action Items</p>
        <ul class="space-y-0.5">${n.actionItems.map(a => `<li class="flex gap-1.5 text-xs text-brand-600 dark:text-brand-400"><span>→</span><span>${escapeHtml(a)}</span></li>`).join('')}</ul>
      </div>` : ''}
    ${n.risks?.length ? `
      <div>
        <p class="text-xs font-semibold text-red-600 mb-1">⚠ Risks</p>
        <ul class="space-y-0.5">${n.risks.map(r => `<li class="text-xs text-red-600 dark:text-red-400">· ${escapeHtml(r)}</li>`).join('')}</ul>
      </div>` : ''}
    ${!n.keyTakeaways?.length && !s.aiSummary ? `<p class="text-xs text-surface-400 italic">No transcript captured — notes will be used as-is.</p>` : ''}
  `;
}

function callRecApply() {
  if (!_callRecSession) return;
  const s = _callRecSession;
  const n = s.aiStructuredNote || {};

  // Fill notes textarea
  const notesEl = document.getElementById('call-notes');
  if (notesEl) {
    let noteText = '';
    if (n.keyTakeaways?.length) {
      noteText = n.keyTakeaways.map(t => '• ' + t).join('\n');
      if (s.userNotes) noteText += '\n\nNotes:\n' + s.userNotes;
    } else if (s.aiSummary) {
      noteText = s.aiSummary + (s.userNotes ? '\n\nNotes:\n' + s.userNotes : '');
    } else {
      noteText = [s.rawTranscript, s.userNotes].filter(Boolean).join('\n\n');
    }
    notesEl.value = noteText;
  }

  // Add action items as tasks
  const items = n.actionItems || [];
  items.forEach(item => {
    const text = typeof item === 'string' ? item : (item.task || item);
    if (!text?.trim()) return;
    const uid = 'task-' + (++_callTaskCounter);
    _callTasks.push({ uid, text: text.trim(), assignedToId: '', assignedToName: '', dueDate: '' });
  });
  if (items.length) callTaskRender();

  // Fill next steps if empty
  const nsEl = document.getElementById('call-next-steps');
  if (nsEl && !nsEl.value.trim() && n.followUps?.length) {
    nsEl.value = n.followUps.join('; ');
  }

  // Collapse panel
  document.getElementById('call-rec-panel')?.classList.add('hidden');
  showToast('Recording applied — review and save the call', 'success');
}

function callRecCancel() {
  // Stop everything without applying
  clearInterval(_callRecTimerInt);
  if (_callRecRecognition) { try { _callRecRecognition.stop(); } catch(_) {} _callRecRecognition = null; }
  if (_callRecMediaRec && _callRecMediaRec.state !== 'inactive') { try { _callRecMediaRec.stop(); } catch(_) {} }
  if (_callRecStream) { _callRecStream.getTracks().forEach(t => t.stop()); _callRecStream = null; }
  _callRecSession = null;
  _callRecSetState('idle');
  // Clear transcript
  const lines = document.getElementById('call-rec-transcript');
  if (lines) lines.innerHTML = '<p id="call-rec-transcript-ph" class="text-surface-400 italic text-xs">Transcript will appear here as you speak…</p>';
  const live = document.getElementById('call-rec-live-text');
  if (live) live.textContent = '';
}

function callRecReset() {
  callRecCancel();
}

function _callRecCleanup() {
  clearInterval(_callRecTimerInt);
  if (_callRecRecognition) { try { _callRecRecognition.stop(); } catch(_) {} _callRecRecognition = null; }
  if (_callRecMediaRec && _callRecMediaRec.state !== 'inactive') { try { _callRecMediaRec.stop(); } catch(_) {} _callRecMediaRec = null; }
  if (_callRecStream) { _callRecStream.getTracks().forEach(t => t.stop()); _callRecStream = null; }
}

// ── Open New Call Modal ───────────────────────────────────────────

async function openNewCallModal(preselectedContactId = null) {
  _callParticipants = [];
  _callTasks = [];
  _callTaskCounter = 0;
  _callRecCleanup();
  _callRecState   = 'idle';
  _callRecSession = null;
  _callRecSegments = [];
  _callRecSegCounter = 0;
  _callRecAudioChunks = [];

  const contacts = await DB.getForUser(STORES.contacts, currentUser.id);
  _callAllContacts = getActiveContacts(contacts).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  const now = new Date();
  const defaultFollowUp = addDays(now, settings?.defaultFollowUpDays || 14);

  if (preselectedContactId) {
    const contact = _callAllContacts.find(c => c.id === preselectedContactId);
    if (contact) _callParticipants.push({ id: contact.id, name: contact.fullName });
  }

  // Load active deals for the deal selector
  const deals = await DB.getForUser(STORES.deals, currentUser.id);
  const activeDeals = deals.filter(d => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage))
    .sort((a, b) => a.name.localeCompare(b.name));
  _callDealId = null;

  _openCallModal(
    'Log Call',
    'Record a networking call with one or multiple people and assign action items',
    saveNewCall,
    { date: toInputDateTime(now.toISOString()), followUpDate: toInputDate(defaultFollowUp) }
  );

  // Populate deal selector after modal renders
  const dealSel = document.getElementById('call-deal-id');
  if (dealSel && activeDeals.length) {
    activeDeals.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      dealSel.appendChild(opt);
    });
    dealSel.addEventListener('change', () => { _callDealId = dealSel.value || null; });
    // Pre-select if we're in a deal context
    if (typeof currentDealId !== 'undefined' && currentDealId) {
      dealSel.value = currentDealId;
      _callDealId = currentDealId;
    }
  }
}

// ── Save Call ─────────────────────────────────────────────────────

async function saveNewCall() {
  if (_callParticipants.length === 0) {
    showToast('Please add at least one participant', 'error');
    document.getElementById('call-participant-search')?.focus();
    return;
  }

  const callDate = document.getElementById('call-date').value;
  const notes = document.getElementById('call-notes').value.trim();
  const nextSteps = document.getElementById('call-next-steps').value.trim();
  const followUpDate = document.getElementById('call-followup').value;
  const outcome = document.getElementById('call-outcome').value;
  const duration = document.getElementById('call-duration').value;
  const validTasks = _callTasks.filter(t => t.text.trim());
  const dealId = _callDealId || document.getElementById('call-deal-id')?.value || null;

  const primaryId = _callParticipants[0].id;
  const participantIds = _callParticipants.map(p => p.id);

  // Save the call record
  const call = await DB.add(STORES.calls, {
    userId: currentUser.id,
    contactId: primaryId,
    participantIds,
    dealId: dealId || null,
    date: callDate ? new Date(callDate).toISOString() : new Date().toISOString(),
    duration: duration ? parseInt(duration) : null,
    outcome,
    notes,
    nextSteps,
    followUpDate: followUpDate ? new Date(followUpDate).toISOString() : null,
    tasks: validTasks.map(t => ({
      text: t.text.trim(),
      assignedToId: t.assignedToId || null,
      assignedToName: t.assignedToId === 'self' ? 'Myself' : (t.assignedToName || null),
      dueDate: t.dueDate || null,
    })),
    source: 'manual',
  });

  // ── Persist inline recorder data if recording was used ──────
  if (_callRecSession) {
    const rec = _callRecSession;
    const n   = rec.aiStructuredNote || {};
    const patch = {
      ...call,
      rawTranscript:      rec.rawTranscript     || null,
      granolaNotes:       rec.userNotes         || null,
      aiSummary:          rec.aiSummary         || null,
      cleanedNotes:       notes                 || null,
      keyInsights:        n.keyTakeaways        || [],
      actionItems:        (n.actionItems || []).map(a => ({ task: typeof a === 'string' ? a : (a.task || ''), owner: null, dueContext: null })),
      redFlags:           n.risks               || [],
      positiveSignals:    [],
      sellerSentiment:    n.sentiment           || null,
      nextMeetingContext: (n.followUps || []).join('; ') || null,
      source:             'recorded',
      processedAt:        new Date().toISOString(),
    };
    await DB.put(STORES.calls, patch);
  }

  // Update each participant: last contacted + next follow-up
  for (const pid of participantIds) {
    const contact = await DB.get(STORES.contacts, pid);
    if (contact) {
      contact.lastContactDate = call.date;
      if (followUpDate) contact.nextFollowUpDate = new Date(followUpDate).toISOString();
      await DB.put(STORES.contacts, contact);
    }
  }

  // Save notes as a note for primary contact
  if (notes) {
    await DB.add(STORES.notes, {
      userId: currentUser.id,
      contactId: primaryId,
      callId: call.id,
      content: notes,
      cleanedContent: null,
    });
  }

  // Create a single follow-up reminder referencing all participants
  if (followUpDate) {
    const names = _callParticipants.map(p => p.name).join(', ');
    await DB.add(STORES.reminders, {
      userId: currentUser.id,
      contactId: primaryId,
      type: 'one-time',
      title: `Follow up: ${names}`,
      description: nextSteps || `Follow up after call on ${formatDate(call.date)}`,
      dueDate: new Date(followUpDate).toISOString(),
      status: 'pending',
      recurring: false,
      cadenceDays: null,
    });
  }

  // Create a reminder for each action item / task
  for (const task of validTasks) {
    const isAssignedToContact = task.assignedToId && task.assignedToId !== 'self';
    const taskDue = task.dueDate
      ? new Date(task.dueDate).toISOString()
      : followUpDate
        ? new Date(followUpDate).toISOString()
        : new Date(Date.now() + 7 * 86400000).toISOString();

    await DB.add(STORES.reminders, {
      userId: currentUser.id,
      contactId: isAssignedToContact ? task.assignedToId : primaryId,
      type: 'one-time',
      title: task.text.trim(),
      description: isAssignedToContact
        ? `Action item re: ${task.assignedToName} (from call ${formatDate(call.date)})`
        : `Personal action item from call on ${formatDate(call.date)}`,
      dueDate: taskDue,
      status: 'pending',
      recurring: false,
      cadenceDays: null,
    });
  }

  // Log activity for each participant
  for (const p of _callParticipants) {
    await DB.add(STORES.activities, {
      userId: currentUser.id,
      contactId: p.id,
      type: 'call',
      title: 'Call logged',
      description: outcome || truncate(notes, 60) || 'Networking call',
      timestamp: call.date,
    });
  }

  await checkReminders();

  // Cleanup
  _callRecCleanup();
  _clHidePanel();
  showToast('Call logged successfully', 'success');

  const currentPageName = document.querySelector('.nav-item.active')?.dataset?.page;
  if (currentPageName === 'calls') {
    renderCalls();
  } else if (currentPageName === 'dashboard') {
    renderDashboard();
  } else if (_callParticipants.length === 1) {
    viewContact(_callParticipants[0].id);
  } else {
    renderCalls();
  }
}

// ── Edit Call ─────────────────────────────────────────────────────

async function openEditCallModal(callId) {
  const call = await DB.get(STORES.calls, callId);
  if (!call) { showToast('Call not found', 'error'); return; }

  _callParticipants = [];
  _callTasks = [];
  _callTaskCounter = 0;

  const [contacts, deals] = await Promise.all([
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.deals, currentUser.id),
  ]);
  _callAllContacts = getActiveContacts(contacts).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const activeDeals = deals.filter(d => !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage))
    .sort((a, b) => a.name.localeCompare(b.name));
  _callDealId = call.dealId || null;

  // Pre-populate participants (support old single-contactId records too)
  const participantIds = call.participantIds || (call.contactId ? [call.contactId] : []);
  participantIds.forEach(id => {
    const c = _callAllContacts.find(x => x.id === id);
    if (c) _callParticipants.push({ id: c.id, name: c.fullName });
  });

  // Pre-populate tasks
  (call.tasks || []).forEach(t => {
    const uid = 'task-' + (++_callTaskCounter);
    _callTasks.push({
      uid,
      text: t.text || '',
      assignedToId: t.assignedToId || '',
      assignedToName: t.assignedToName || '',
      dueDate: t.dueDate ? toInputDate(t.dueDate) : '',
    });
  });

  _openCallModal(
    'Edit Call',
    'Update the details of this logged call',
    () => saveEditCall(callId),
    {
      date: call.date ? toInputDateTime(call.date) : '',
      duration: call.duration || '',
      outcome: call.outcome || '',
      notes: call.notes || '',
      nextSteps: call.nextSteps || '',
      followUpDate: call.followUpDate ? toInputDate(call.followUpDate) : '',
    }
  );

  // Populate deal selector after modal renders
  const dealSel = document.getElementById('call-deal-id');
  if (dealSel && activeDeals.length) {
    activeDeals.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      dealSel.appendChild(opt);
    });
    dealSel.addEventListener('change', () => { _callDealId = dealSel.value || null; });
    // Pre-select the call's current deal
    if (call.dealId) {
      dealSel.value = call.dealId;
      _callDealId = call.dealId;
    }
  }
}

async function saveEditCall(callId) {
  if (_callParticipants.length === 0) {
    showToast('Please add at least one participant', 'error');
    document.getElementById('call-participant-search')?.focus();
    return;
  }

  const call = await DB.get(STORES.calls, callId);
  if (!call) { showToast('Call not found', 'error'); return; }

  const callDate = document.getElementById('call-date').value;
  const notes = document.getElementById('call-notes').value.trim();
  const nextSteps = document.getElementById('call-next-steps').value.trim();
  const followUpDate = document.getElementById('call-followup').value;
  const outcome = document.getElementById('call-outcome').value;
  const duration = document.getElementById('call-duration').value;
  const validTasks = _callTasks.filter(t => t.text.trim());

  const primaryId = _callParticipants[0].id;
  const dealId = _callDealId || document.getElementById('call-deal-id')?.value || null;

  // Update the call record in place
  call.contactId = primaryId;
  call.participantIds = _callParticipants.map(p => p.id);
  call.dealId = dealId || null;
  call.date = callDate ? new Date(callDate).toISOString() : call.date;
  call.duration = duration ? parseInt(duration) : null;
  call.outcome = outcome;
  call.notes = notes;
  call.nextSteps = nextSteps;
  call.followUpDate = followUpDate ? new Date(followUpDate).toISOString() : null;
  call.tasks = validTasks.map(t => ({
    text: t.text.trim(),
    assignedToId: t.assignedToId || null,
    assignedToName: t.assignedToId === 'self' ? 'Myself' : (t.assignedToName || null),
    dueDate: t.dueDate || null,
  }));

  await DB.put(STORES.calls, call);

  // Update each participant's follow-up date if one was set
  if (followUpDate) {
    for (const pid of call.participantIds) {
      const contact = await DB.get(STORES.contacts, pid);
      if (contact) {
        contact.nextFollowUpDate = new Date(followUpDate).toISOString();
        await DB.put(STORES.contacts, contact);
      }
    }
  }

  _clHidePanel();
  showToast('Call updated', 'success');
  renderCalls();
}
