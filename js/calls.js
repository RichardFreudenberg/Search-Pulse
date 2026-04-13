/* ============================================
   Nexus CRM — Calls / Networking Call Workflow
   ============================================ */

// Module-level state for the multi-participant call modal
let _callParticipants = [];   // [{id, name}]
let _callTasks = [];          // [{uid, text, assignedToId, assignedToName, dueDate}]
let _callAllContacts = [];    // cache for picker search
let _callTaskCounter = 0;     // uid generator
let _callPickerOutsideHandler = null; // dedup outside-click listener

// ── Render Calls List ────────────────────────────────────────────

async function renderCalls() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto">${renderLoadingSkeleton(5)}</div>`;

  const [calls, contacts, companies] = await Promise.all([
    DB.getForUser(STORES.calls, currentUser.id),
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.companies, currentUser.id),
  ]);

  const contactMap = buildMap(getActiveContacts(contacts));
  const companyMap = buildMap(companies);
  const sortedCalls = sortByDate(calls, 'date');

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      ${renderPageHeader('Calls', `${calls.length} calls logged`, `
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
                    ${call.outcome ? `<div class="mb-2"><span class="badge badge-blue">${escapeHtml(call.outcome)}</span></div>` : ''}
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
      <div class="flex items-center justify-between mb-1">
        <label class="block text-sm font-medium text-surface-600 dark:text-surface-400">Notes</label>
        <button type="button" id="clean-call-notes-btn" onclick="cleanCallNotes()"
          class="btn-ghost btn-sm text-brand-600 flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/>
          </svg>
          Clean Notes
        </button>
      </div>
      <div id="call-notes-area">
        <textarea id="call-notes" class="input-field" rows="5"
          placeholder="Key topics discussed, insights, takeaways…">${escapeHtml(defaults.notes || '')}</textarea>
      </div>
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

function _openCallModal(title, subtitle, submitHandler, defaults = {}) {
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

// ── Open New Call Modal ───────────────────────────────────────────

async function openNewCallModal(preselectedContactId = null) {
  _callParticipants = [];
  _callTasks = [];
  _callTaskCounter = 0;

  const contacts = await DB.getForUser(STORES.contacts, currentUser.id);
  _callAllContacts = getActiveContacts(contacts).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  const now = new Date();
  const defaultFollowUp = addDays(now, settings?.defaultFollowUpDays || 14);

  if (preselectedContactId) {
    const contact = _callAllContacts.find(c => c.id === preselectedContactId);
    if (contact) _callParticipants.push({ id: contact.id, name: contact.fullName });
  }

  _openCallModal(
    'Log Call',
    'Record a networking call with one or multiple people and assign action items',
    saveNewCall,
    { date: toInputDateTime(now.toISOString()), followUpDate: toInputDate(defaultFollowUp) }
  );
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

  const primaryId = _callParticipants[0].id;
  const participantIds = _callParticipants.map(p => p.id);

  // Save the call record
  const call = await DB.add(STORES.calls, {
    userId: currentUser.id,
    contactId: primaryId,
    participantIds,
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
  });

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
  if (_callPickerOutsideHandler) {
    document.removeEventListener('click', _callPickerOutsideHandler);
    _callPickerOutsideHandler = null;
  }

  closeModal();
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

  const contacts = await DB.getForUser(STORES.contacts, currentUser.id);
  _callAllContacts = getActiveContacts(contacts).sort((a, b) => a.fullName.localeCompare(b.fullName));

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

  // Update the call record in place
  call.contactId = primaryId;
  call.participantIds = _callParticipants.map(p => p.id);
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

  // Cleanup picker listener
  if (_callPickerOutsideHandler) {
    document.removeEventListener('click', _callPickerOutsideHandler);
    _callPickerOutsideHandler = null;
  }

  closeModal();
  showToast('Call updated', 'success');
  renderCalls();
}
