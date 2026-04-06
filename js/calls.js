/* ============================================
   Nexus CRM — Calls / Networking Call Workflow
   ============================================ */

async function renderCalls() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto">${renderLoadingSkeleton(5)}</div>`;

  const [calls, contacts, companies] = await Promise.all([
    DB.getForUser(STORES.calls, currentUser.id),
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.companies, currentUser.id),
  ]);

  const contactMap = {};
  contacts.filter(c => !c.archived).forEach(c => contactMap[c.id] = c);
  const companyMap = {};
  companies.forEach(c => companyMap[c.id] = c);
  const sortedCalls = sortByDate(calls, 'date');

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      ${renderPageHeader('Calls', `${calls.length} calls logged`, `
        <button onclick="openNewCallModal()" class="btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Call
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
            const contact = contactMap[call.contactId];
            const company = contact ? companyMap[contact.companyId] : null;
            return `
              <div class="card">
                <div class="flex items-start gap-4">
                  ${contact ? renderAvatar(contact.fullName, contact.photoUrl, 'md', contact.linkedInUrl) : '<div class="avatar avatar-md">?</div>'}
                  <div class="flex-1 min-w-0">
                    <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                      <span class="font-medium ${contact ? 'cursor-pointer hover:text-brand-600' : ''}" ${contact ? `onclick="viewContact('${contact.id}')"` : ''}>${contact ? escapeHtml(contact.fullName) : 'Unknown Contact'}</span>
                      ${company ? `<span class="text-sm text-surface-500">${escapeHtml(company.name)}</span>` : ''}
                      <span class="text-sm text-surface-400">${formatDateTime(call.date)}</span>
                      ${call.duration ? `<span class="text-xs text-surface-400">${call.duration} min</span>` : ''}
                    </div>
                    ${call.outcome ? `<div class="mb-2"><span class="badge badge-blue">${escapeHtml(call.outcome)}</span></div>` : ''}
                    ${call.notes ? `<p class="text-sm text-surface-600 dark:text-surface-400 whitespace-pre-wrap">${escapeHtml(call.notes)}</p>` : ''}
                    ${call.nextSteps ? `<p class="text-sm mt-2"><span class="font-medium text-surface-700 dark:text-surface-300">Next steps:</span> ${escapeHtml(call.nextSteps)}</p>` : ''}
                    ${call.followUpDate ? `<p class="text-xs text-surface-500 mt-2">Follow-up: ${formatDate(call.followUpDate)}</p>` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

async function openNewCallModal(preselectedContactId = null) {
  const contacts = await DB.getForUser(STORES.contacts, currentUser.id);
  const activeContacts = contacts.filter(c => !c.archived).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  const now = new Date();
  const defaultFollowUp = addDays(now, settings?.defaultFollowUpDays || 14);

  openModal(`
    <div class="p-6">
      <h2 class="text-lg font-semibold mb-1">Log Call</h2>
      <p class="text-sm text-surface-500 mb-6">Record a networking call and schedule follow-up</p>
      <form id="new-call-form" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Contact *</label>
            <select id="call-contact" required class="input-field">
              <option value="">Select a contact</option>
              ${activeContacts.map(c => `<option value="${c.id}" ${preselectedContactId === c.id ? 'selected' : ''}>${escapeHtml(c.fullName)}</option>`).join('')}
            </select>
            <button type="button" onclick="closeModal(); openNewContactModal()" class="text-xs text-brand-600 hover:text-brand-700 mt-1">+ Create new contact</button>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Date & Time</label>
            <input type="datetime-local" id="call-date" class="input-field" value="${toInputDateTime(now.toISOString())}" />
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Duration (minutes)</label>
            <input type="number" id="call-duration" class="input-field" placeholder="30" min="1" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Outcome</label>
            <select id="call-outcome" class="input-field">
              <option value="">Select outcome</option>
              <option value="Great call">Great call</option>
              <option value="Good conversation">Good conversation</option>
              <option value="Needs follow-up">Needs follow-up</option>
              <option value="Left voicemail">Left voicemail</option>
              <option value="No answer">No answer</option>
              <option value="Intro made">Intro made</option>
              <option value="Meeting scheduled">Meeting scheduled</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Notes</label>
          <textarea id="call-notes" class="input-field" rows="6" placeholder="Key topics discussed, insights, takeaways…"></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Next Steps</label>
          <textarea id="call-next-steps" class="input-field" rows="2" placeholder="Action items, introductions to make, info to send…"></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Follow-up Date</label>
          <input type="date" id="call-followup" class="input-field" value="${toInputDate(defaultFollowUp)}" />
          <p class="text-xs text-surface-400 mt-1">Sets the contact's next follow-up date automatically</p>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
          <button type="submit" class="btn-primary">Save Call</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('new-call-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveNewCall();
  });
}

async function saveNewCall() {
  const contactId = document.getElementById('call-contact').value;
  if (!contactId) { showToast('Please select a contact', 'error'); return; }

  const callDate = document.getElementById('call-date').value;
  const notes = document.getElementById('call-notes').value.trim();
  const nextSteps = document.getElementById('call-next-steps').value.trim();
  const followUpDate = document.getElementById('call-followup').value;
  const outcome = document.getElementById('call-outcome').value;
  const duration = document.getElementById('call-duration').value;

  // Save call
  const call = await DB.add(STORES.calls, {
    userId: currentUser.id,
    contactId,
    date: callDate ? new Date(callDate).toISOString() : new Date().toISOString(),
    duration: duration ? parseInt(duration) : null,
    outcome,
    notes,
    nextSteps,
    followUpDate: followUpDate ? new Date(followUpDate).toISOString() : null,
  });

  // Update contact: last contacted + next follow-up
  const contact = await DB.get(STORES.contacts, contactId);
  if (contact) {
    contact.lastContactDate = call.date;
    if (followUpDate) {
      contact.nextFollowUpDate = new Date(followUpDate).toISOString();
    }
    await DB.put(STORES.contacts, contact);
  }

  // Save notes as a note too
  if (notes) {
    await DB.add(STORES.notes, {
      userId: currentUser.id,
      contactId,
      callId: call.id,
      content: notes,
      cleanedContent: null,
    });
  }

  // Create follow-up reminder
  if (followUpDate) {
    await DB.add(STORES.reminders, {
      userId: currentUser.id,
      contactId,
      type: 'one-time',
      title: `Follow up with ${contact ? contact.fullName : 'contact'}`,
      description: nextSteps || `Follow up after call on ${formatDate(call.date)}`,
      dueDate: new Date(followUpDate).toISOString(),
      status: 'pending',
      recurring: false,
      cadenceDays: null,
    });
  }

  // Log activity
  await DB.add(STORES.activities, {
    userId: currentUser.id,
    contactId,
    type: 'call',
    title: 'Call logged',
    description: outcome || truncate(notes, 60) || 'Networking call',
    timestamp: call.date,
  });

  closeModal();
  showToast('Call logged successfully', 'success');

  // Refresh current page
  const currentPage = document.querySelector('.nav-item.active')?.dataset?.page;
  if (currentPage === 'calls') {
    renderCalls();
  } else if (currentPage === 'dashboard') {
    renderDashboard();
  } else {
    viewContact(contactId);
  }
}
