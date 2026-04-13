/* ============================================
   Pulse — Email BCC Logging
   ============================================ */

// Unique BCC email for this user (generated locally)
function getBccEmail(userId) {
  // In production, this would be a real email like log-{userId}@pulsecrm.io
  // For local mode, we simulate with a generated address
  const hash = userId.substring(0, 8);
  return `log-${hash}@pulsecrm.app`;
}

// Render the email logging settings card
function renderEmailLogCard(settings) {
  const bccEmail = getBccEmail(currentUser.id);
  return `
    <div class="card mb-6">
      <div class="flex items-center gap-3 mb-4">
        <svg class="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
        <h2 class="text-base font-semibold">Email Logging (BCC)</h2>
      </div>
      <p class="text-xs text-surface-500 mb-4">BCC this address in your emails to automatically log conversations with contacts in Pulse.</p>

      <div class="bg-surface-50 dark:bg-surface-800/50 rounded p-4 mb-4">
        <label class="block text-xs font-medium text-surface-500 mb-1.5">Your BCC Address</label>
        <div class="flex items-center gap-2">
          <code class="flex-1 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 text-sm font-mono select-all">${escapeHtml(bccEmail)}</code>
          <button onclick="copyBccEmail()" class="btn-secondary btn-sm whitespace-nowrap" id="copy-bcc-btn">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
            Copy
          </button>
        </div>
      </div>

      <div class="bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800 rounded p-3 mb-4">
        <p class="text-xs text-blue-700 dark:text-blue-300"><strong>How it works:</strong> Add this email to the BCC field when emailing a contact. The tool will match the recipient to your contact list, log the interaction, and create a short summary.</p>
      </div>

      <!-- Manual Email Log Entry (for local mode) -->
      <div class="border-t border-surface-200 dark:border-surface-800 pt-4 mt-4">
        <h3 class="text-sm font-medium mb-3">Log an Email Manually</h3>
        <p class="text-xs text-surface-500 mb-3">Since BCC auto-logging requires a backend, you can paste email content here to log it.</p>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-surface-500 mb-1">Recipient Email</label>
            <input type="email" id="email-log-recipient" class="input-field text-sm" placeholder="contact@company.com" />
          </div>
          <div>
            <label class="block text-xs font-medium text-surface-500 mb-1">Subject</label>
            <input type="text" id="email-log-subject" class="input-field text-sm" placeholder="Email subject line" />
          </div>
          <div>
            <label class="block text-xs font-medium text-surface-500 mb-1">Email Body (paste full text)</label>
            <textarea id="email-log-body" class="input-field text-sm" rows="4" placeholder="Paste the email content here..."></textarea>
          </div>
          <button onclick="processEmailLog()" class="btn-primary btn-sm w-full">Log Email & Generate Summary</button>
        </div>
      </div>
    </div>
  `;
}

async function copyBccEmail() {
  const bccEmail = getBccEmail(currentUser.id);
  try {
    await navigator.clipboard.writeText(bccEmail);
    const btn = document.getElementById('copy-bcc-btn');
    if (btn) {
      btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 12.75l6 6 9-13.5" /></svg> Copied';
      setTimeout(() => {
        btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg> Copy';
      }, 2000);
    }
    showToast('BCC email copied to clipboard', 'success');
  } catch {
    showToast('Could not copy — select and copy manually', 'warning');
  }
}

async function processEmailLog() {
  const recipientEmail = document.getElementById('email-log-recipient').value.trim();
  const subject = document.getElementById('email-log-subject').value.trim();
  const body = document.getElementById('email-log-body').value.trim();

  if (!recipientEmail) { showToast('Enter recipient email', 'warning'); return; }
  if (!body) { showToast('Paste the email body', 'warning'); return; }

  // Find matching contact by email
  const contacts = await DB.getForUser(STORES.contacts, currentUser.id);
  let matchedContact = contacts.find(c => c.email && c.email.toLowerCase() === recipientEmail.toLowerCase());

  // Try matching by name in the email
  if (!matchedContact) {
    const recipientName = recipientEmail.split('@')[0].replace(/[._]/g, ' ');
    matchedContact = contacts.find(c => {
      const contactName = c.fullName.toLowerCase();
      return contactName.includes(recipientName.toLowerCase()) || recipientName.toLowerCase().includes(contactName.split(' ')[0].toLowerCase());
    });
  }

  // Generate summary
  const summary = generateEmailSummary(subject, body);

  // Log the interaction
  if (matchedContact) {
    // Create a note with the email summary
    await DB.add(STORES.notes, {
      userId: currentUser.id,
      contactId: matchedContact.id,
      callId: null,
      content: `[Email] ${subject}\n\nSummary:\n${summary}\n\n---\nFull email logged on ${new Date().toLocaleDateString()}`,
      cleanedContent: null,
    });

    // Update last contact date
    matchedContact.lastContactDate = new Date().toISOString();
    await DB.put(STORES.contacts, matchedContact);

    // Log activity
    await DB.add(STORES.activities, {
      userId: currentUser.id,
      contactId: matchedContact.id,
      type: 'note',
      title: 'Email logged',
      description: `Re: ${subject} — ${summary}`,
      timestamp: new Date().toISOString(),
    });

    showToast(`Email logged for ${matchedContact.fullName}`, 'success');
  } else {
    // No matching contact — offer to create one
    showToast(`No matching contact found for ${recipientEmail}. Create a contact first, then log again.`, 'warning');
    return;
  }

  // Clear form
  document.getElementById('email-log-recipient').value = '';
  document.getElementById('email-log-subject').value = '';
  document.getElementById('email-log-body').value = '';
}

function generateEmailSummary(subject, body) {
  // Local summarization: extract key sentences
  const sentences = body.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 200);

  // Score sentences by keyword relevance
  const keywords = ['discuss', 'follow', 'meet', 'call', 'schedule', 'share', 'send', 'agree', 'decide', 'plan',
    'introduce', 'connect', 'opportunity', 'deal', 'acquisition', 'investment', 'next step', 'action'];

  const scored = sentences.map(s => {
    const lower = s.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 2;
    }
    // Boost action items
    if (lower.startsWith('i will') || lower.startsWith('we will') || lower.startsWith('please') || lower.startsWith('let')) score += 3;
    return { text: s, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const topSentences = scored.slice(0, 2).map(s => s.text);

  if (topSentences.length === 0) {
    return `Email regarding: ${subject || 'No subject'}`;
  }

  return topSentences.map(s => `- ${s}`).join('\n');
}
