/* ============================================
   Nexus CRM — Sourcing Page  (v3 — Outreach Tracker)
   ============================================ */

/* ─── Module state ──────────────────────────────────────────────────────────── */
let _sourcingFilter = 'all';

/* ─── Status definitions ─────────────────────────────────────────────────────── */
const CAMPAIGN_STATUSES = {
  draft:             { label: 'Draft',       pill: 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300' },
  sent:              { label: 'Sent',        pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  replied:           { label: 'Replied',     pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  meeting_scheduled: { label: 'Meeting Set', pill: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  converted:         { label: 'Converted',   pill: 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400' },
  passed:            { label: 'Passed',      pill: 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400' },
};

/* ─── renderSourcing ────────────────────────────────────────────────────────── */
async function renderSourcing() {
  const container = document.getElementById('page-content');
  if (!container) return;

  let campaigns = [];
  try {
    const all = await DB.getForUser(STORES.sourcingCampaigns, currentUser.id);
    campaigns = (all || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (_) {}

  container.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
    ${renderPageHeader('Sourcing', 'Outreach tracker & AI letter writer')}

    <div id="sourcing-stats-row">
      ${_sourcingStatsHtml(campaigns)}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">

      <!-- LEFT: Campaign Pipeline (2/3 width) -->
      <div class="lg:col-span-2 space-y-6">
        <div id="sourcing-campaigns-section">
          ${_sourcingCampaignsHtml(campaigns)}
        </div>
      </div>

      <!-- RIGHT: Letter Writer + Tips (1/3 width) -->
      <div class="space-y-6">

        <!-- Outreach Letter Writer -->
        <div class="card">
          <div class="mb-4">
            <h2 class="text-base font-semibold">Outreach Letter Writer</h2>
            <p class="text-sm text-surface-500 mt-0.5">AI-generated personalized acquisition inquiry letter</p>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium mb-1">Target Company Name</label>
              <input id="sl-company-name" type="text" class="input-field text-sm" placeholder="Acme Plumbing Services"/>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Industry / Sector</label>
              <input id="sl-sector" type="text" class="input-field text-sm" placeholder="HVAC, Software, Healthcare…"/>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium mb-1">Company Size</label>
                <select id="sl-company-size" class="input-field text-sm">
                  <option value="Under $1M revenue">Under $1M rev</option>
                  <option value="$1M-$5M" selected>$1M–$5M rev</option>
                  <option value="$5M-$10M">$5M–$10M rev</option>
                  <option value="$10M-$25M">$10M–$25M rev</option>
                  <option value="$25M+">$25M+ rev</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium mb-1">Likely Reason to Sell</label>
                <select id="sl-sell-reason" class="input-field text-sm">
                  <option value="Retirement">Retirement</option>
                  <option value="No succession plan">No succession</option>
                  <option value="Owner burnout">Burnout</option>
                  <option value="Growth capital needed">Growth capital</option>
                  <option value="Unknown" selected>Unknown</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Your Background</label>
              <textarea id="sl-background" class="input-field text-sm" rows="2"
                placeholder="HBS MBA, 5 yrs operations, acquiring in the Northeast…"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium mb-1">Tone</label>
                <select id="sl-tone" class="input-field text-sm">
                  <option value="Warm and personal">Warm &amp; personal</option>
                  <option value="Professional and direct">Professional</option>
                  <option value="Formal">Formal</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium mb-1">Referral <span class="text-surface-400 font-normal">(opt.)</span></label>
                <input id="sl-referral" type="text" class="input-field text-sm" placeholder="e.g. via John Smith"/>
              </div>
            </div>

            <div class="flex justify-end pt-1">
              <button id="sl-generate-btn" onclick="generateOutreachLetter()" class="btn-primary btn-sm w-full">
                Generate Letter
              </button>
            </div>
          </div>

          <div id="sourcing-letter-output" class="hidden mt-5 pt-5 border-t border-surface-200 dark:border-surface-700"></div>
        </div>

        <!-- Tips -->
        <div class="card">
          <h2 class="text-sm font-semibold mb-3">Tips &amp; Strategies</h2>
          <ul class="space-y-2.5">
            ${[
              { icon: '✉️', text: 'Be personal: reference something specific about their business' },
              { icon: '🙌', text: "Lead with respect: acknowledge their life's work" },
              { icon: '🎯', text: 'Be clear: state your intentions up front' },
              { icon: '📞', text: 'Make it easy: offer a no-pressure call' },
              { icon: '🔄', text: 'Follow up: 80% of deals come from persistence' },
            ].map(t => `
              <li class="flex items-start gap-2 text-xs text-surface-600 dark:text-surface-400">
                <span class="shrink-0">${t.icon}</span>
                <span>${escapeHtml(t.text)}</span>
              </li>
            `).join('')}
          </ul>
        </div>

        <!-- Funnel -->
        <div id="sourcing-funnel-section">
          ${_sourcingFunnelHtml(campaigns)}
        </div>

      </div><!-- /RIGHT -->

    </div>
  </div>`;
}

/* ─── Stats row ─────────────────────────────────────────────────────────────── */
function _sourcingStatsHtml(campaigns) {
  const total    = campaigns.length;
  const sent     = campaigns.filter(c => c.status !== 'draft').length;
  const replied  = campaigns.filter(c => ['replied', 'meeting_scheduled', 'converted'].includes(c.status)).length;
  const meetings = campaigns.filter(c => ['meeting_scheduled', 'converted'].includes(c.status)).length;
  const replyRate = sent > 0 ? Math.round(replied / sent * 100) : 0;

  const stat = (label, value, sub, accent) => `
    <div class="card py-4 text-center">
      <p class="text-2xl font-bold ${accent || 'text-surface-900 dark:text-white'}">${value}</p>
      <p class="text-xs font-medium text-surface-500 mt-0.5">${label}</p>
      ${sub ? `<p class="text-xs text-surface-400 mt-0.5">${sub}</p>` : ''}
    </div>`;

  return `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
      ${stat('Total Outreaches', total, total === 0 ? 'Get started →' : '')}
      ${stat('Letters Sent', sent, total > 0 ? `${Math.round(sent / Math.max(total, 1) * 100)}% of total` : '', 'text-blue-600 dark:text-blue-400')}
      ${stat('Reply Rate', `${replyRate}%`, replied > 0 ? `${replied} repl${replied === 1 ? 'y' : 'ies'}` : 'No replies yet', replyRate >= 10 ? 'text-emerald-600 dark:text-emerald-400' : 'text-surface-900 dark:text-white')}
      ${stat('Meetings Set', meetings, meetings > 0 ? `${Math.round(meetings / Math.max(replied, 1) * 100)}% of replies` : '', meetings > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-surface-900 dark:text-white')}
    </div>`;
}

/* ─── Conversion funnel ──────────────────────────────────────────────────────── */
function _sourcingFunnelHtml(campaigns) {
  if (campaigns.length === 0) return '';
  const total     = campaigns.length;
  const sent      = campaigns.filter(c => c.status !== 'draft').length;
  const replied   = campaigns.filter(c => ['replied', 'meeting_scheduled', 'converted'].includes(c.status)).length;
  const meetings  = campaigns.filter(c => ['meeting_scheduled', 'converted'].includes(c.status)).length;
  const converted = campaigns.filter(c => c.status === 'converted').length;

  const step = (label, n, color) => {
    const pct = total > 0 ? Math.round(n / total * 100) : 0;
    return `
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="text-surface-600 dark:text-surface-400">${label}</span>
          <span class="font-semibold">${n}</span>
        </div>
        <div class="w-full bg-surface-100 dark:bg-surface-700 rounded-full h-1.5">
          <div class="h-1.5 rounded-full ${color} transition-all" style="width: ${pct}%"></div>
        </div>
      </div>`;
  };

  return `
    <div class="card">
      <h3 class="text-sm font-semibold mb-3">Conversion Funnel</h3>
      <div class="space-y-2.5">
        ${step('Outreaches', total, 'bg-surface-400')}
        ${step('Sent', sent, 'bg-blue-500')}
        ${step('Replied', replied, 'bg-emerald-500')}
        ${step('Meetings', meetings, 'bg-violet-500')}
        ${step('Converted', converted, 'bg-brand-500')}
      </div>
    </div>`;
}

/* ─── Campaign list HTML ─────────────────────────────────────────────────────── */
function _sourcingCampaignsHtml(campaigns) {
  const filtered = _sourcingFilter === 'all'
    ? campaigns
    : campaigns.filter(c => c.status === _sourcingFilter);

  // Count per status for chips
  const counts = { all: campaigns.length };
  Object.keys(CAMPAIGN_STATUSES).forEach(s => {
    counts[s] = campaigns.filter(c => c.status === s).length;
  });

  const filterOptions = [
    { key: 'all', label: 'All' },
    ...Object.entries(CAMPAIGN_STATUSES)
      .filter(([k]) => counts[k] > 0)
      .map(([k, v]) => ({ key: k, label: v.label })),
  ];

  const chips = filterOptions.map(f => {
    const active = _sourcingFilter === f.key;
    return `<button onclick="_sourcingSetFilter('${f.key}')"
      class="px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600'
      }">
      ${escapeHtml(f.label)}${f.key !== 'all' ? ` <span class="opacity-60 ml-0.5">${counts[f.key]}</span>` : ` <span class="opacity-60 ml-0.5">${counts.all}</span>`}
    </button>`;
  }).join('');

  if (filtered.length === 0) {
    const isEmpty = campaigns.length === 0;
    return `
      <div class="card">
        <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 class="text-base font-semibold">Outreach Pipeline</h2>
          <div class="flex gap-1.5 flex-wrap">${chips}</div>
        </div>
        <div class="py-12 text-center">
          <svg class="w-12 h-12 mx-auto text-surface-300 dark:text-surface-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <p class="text-sm font-medium text-surface-600 dark:text-surface-400">
            ${isEmpty ? 'No outreach campaigns yet' : 'No campaigns match this filter'}
          </p>
          <p class="text-xs text-surface-400 mt-1">
            ${isEmpty ? 'Generate a letter on the right and save it to start tracking' : 'Try "All" to see every campaign'}
          </p>
        </div>
      </div>`;
  }

  const cards = filtered.map(c => _sourcingCampaignCardHtml(c)).join('');

  return `
    <div class="card">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 class="text-base font-semibold">
          Outreach Pipeline
          ${_sourcingFilter !== 'all' ? `<span class="text-surface-400 font-normal text-sm">(${filtered.length} filtered)</span>` : `<span class="text-surface-400 font-normal text-sm">(${filtered.length})</span>`}
        </h2>
        <div class="flex gap-1.5 flex-wrap">${chips}</div>
      </div>
      <div class="space-y-3">${cards}</div>
    </div>`;
}

/* ─── Single campaign card ───────────────────────────────────────────────────── */
function _sourcingCampaignCardHtml(c) {
  const cfg = CAMPAIGN_STATUSES[c.status] || CAMPAIGN_STATUSES.draft;
  const fmtDate = iso => iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const fmtShort = iso => iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  const createdLabel = fmtDate(c.createdAt);

  // "Sent X days ago" warning for overdue follow-ups
  let stalePill = '';
  if (c.status === 'sent' && c.sentAt) {
    const days = Math.floor((Date.now() - new Date(c.sentAt)) / 86400000);
    if (days >= 14) {
      stalePill = `<span class="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
        ${days}d since sent
      </span>`;
    } else if (days > 0) {
      stalePill = `<span class="text-[11px] text-surface-400">${days}d since sent</span>`;
    }
  }

  // Mini timeline
  const steps = [];
  steps.push({ label: 'Created', date: fmtShort(c.createdAt) });
  if (c.sentAt)      steps.push({ label: 'Sent',      date: fmtShort(c.sentAt) });
  if (c.repliedAt)   steps.push({ label: 'Replied',   date: fmtShort(c.repliedAt) });
  if (c.meetingAt)   steps.push({ label: 'Meeting',   date: fmtShort(c.meetingAt) });
  if (c.convertedAt) steps.push({ label: 'Converted', date: fmtShort(c.convertedAt) });

  const timeline = steps.length > 1 ? `
    <div class="flex items-start gap-0 mt-2.5 mb-1">
      ${steps.map((s, i) => `
        <div class="flex items-center gap-0 min-w-0">
          ${i > 0 ? '<div class="h-px w-6 bg-surface-200 dark:bg-surface-700 self-center shrink-0 mt-px"></div>' : ''}
          <div class="text-center shrink-0">
            <div class="w-2 h-2 rounded-full bg-brand-500 mx-auto mb-0.5"></div>
            <p class="text-[10px] font-medium text-surface-600 dark:text-surface-400 whitespace-nowrap">${escapeHtml(s.label)}</p>
            <p class="text-[10px] text-surface-400 whitespace-nowrap">${escapeHtml(s.date)}</p>
          </div>
        </div>
      `).join('')}
    </div>` : '';

  // Reply preview
  const replies = c.replies || [];
  const lastReply = replies[replies.length - 1] || null;
  const replyPreview = lastReply ? `
    <div class="mt-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30">
      <div class="flex items-center gap-2 mb-0.5">
        <span class="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          ${lastReply.sentiment === 'positive' ? '😊' : lastReply.sentiment === 'neutral' ? '😐' : '😞'} Reply logged
        </span>
        <span class="text-[10px] text-surface-400">${escapeHtml(lastReply.date || '')}</span>
        ${replies.length > 1 ? `<span class="text-[10px] text-surface-400">+${replies.length - 1} more</span>` : ''}
      </div>
      ${lastReply.content ? `<p class="text-xs text-surface-600 dark:text-surface-400 line-clamp-2">${escapeHtml(lastReply.content.slice(0, 160))}${lastReply.content.length > 160 ? '…' : ''}</p>` : ''}
    </div>` : '';

  // Contextual action buttons
  let primaryBtn = '', secondaryBtns = '', destructiveBtn = '';
  if (c.status === 'draft') {
    primaryBtn     = `<button onclick="markCampaignSent('${c.id}')" class="btn-primary btn-sm">Mark Sent</button>`;
    secondaryBtns  = `<button onclick="openCampaignDetailModal('${c.id}')" class="btn-secondary btn-sm">View Letter</button>`;
    destructiveBtn = `<button onclick="_sourcingDeleteCampaign('${c.id}')" class="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 px-1 py-1">Delete</button>`;
  } else if (c.status === 'sent') {
    primaryBtn     = `<button onclick="openLogReplyModal('${c.id}')" class="btn-primary btn-sm">Log Reply</button>`;
    secondaryBtns  = `<button onclick="_sourcingScheduleFollowUp('${c.id}')" class="btn-secondary btn-sm">Schedule Follow-up</button>
                      <button onclick="openCampaignDetailModal('${c.id}')" class="btn-secondary btn-sm">View</button>`;
    destructiveBtn = `<button onclick="_sourcingDeleteCampaign('${c.id}')" class="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 px-1 py-1">Delete</button>`;
  } else if (c.status === 'replied') {
    primaryBtn     = `<button onclick="openConvertToDealModal('${c.id}')" class="btn-primary btn-sm">Convert to Deal</button>`;
    secondaryBtns  = `<button onclick="markCampaignMeeting('${c.id}')" class="btn-secondary btn-sm">Mark Meeting Set</button>
                      <button onclick="openCampaignDetailModal('${c.id}')" class="btn-secondary btn-sm">View</button>`;
    destructiveBtn = `<button onclick="markCampaignPassed('${c.id}')" class="text-xs text-surface-400 hover:text-red-500 dark:hover:text-red-400 px-1 py-1">Pass</button>`;
  } else if (c.status === 'meeting_scheduled') {
    primaryBtn     = `<button onclick="openConvertToDealModal('${c.id}')" class="btn-primary btn-sm">Convert to Deal</button>`;
    secondaryBtns  = `<button onclick="openLogReplyModal('${c.id}')" class="btn-secondary btn-sm">Log Note</button>
                      <button onclick="openCampaignDetailModal('${c.id}')" class="btn-secondary btn-sm">View</button>`;
    destructiveBtn = `<button onclick="markCampaignPassed('${c.id}')" class="text-xs text-surface-400 hover:text-red-500 dark:hover:text-red-400 px-1 py-1">Pass</button>`;
  } else if (c.status === 'converted') {
    primaryBtn    = `<button onclick="openCampaignDetailModal('${c.id}')" class="btn-secondary btn-sm">View Details</button>`;
    secondaryBtns = c.linkedDealId
      ? `<button onclick="navigate('deals')" class="btn-primary btn-sm">Open Deal</button>` : '';
  } else if (c.status === 'passed') {
    primaryBtn     = `<button onclick="_sourcingReopenCampaign('${c.id}')" class="btn-secondary btn-sm">Reopen</button>`;
    secondaryBtns  = `<button onclick="openCampaignDetailModal('${c.id}')" class="btn-secondary btn-sm">View</button>`;
    destructiveBtn = `<button onclick="_sourcingDeleteCampaign('${c.id}')" class="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 px-1 py-1">Delete</button>`;
  }

  return `
    <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4
      hover:border-surface-300 dark:hover:border-surface-600 transition-colors"
      id="campaign-${escapeHtml(c.id)}">

      <!-- Header row -->
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="text-sm font-semibold text-surface-900 dark:text-white">
              ${escapeHtml(c.companyName || 'Unnamed Company')}
            </h3>
            <span class="badge ${cfg.pill} shrink-0 text-[11px]">${cfg.label}</span>
            ${stalePill}
          </div>
          ${c.sector ? `<p class="text-xs text-surface-500 mt-0.5">${escapeHtml(c.sector)}</p>` : ''}
        </div>
        <p class="text-xs text-surface-400 shrink-0 mt-0.5 whitespace-nowrap">${createdLabel}</p>
      </div>

      ${timeline}
      ${replyPreview}

      <!-- Actions -->
      <div class="flex items-center gap-2 mt-3 flex-wrap">
        ${primaryBtn}
        ${secondaryBtns}
        ${destructiveBtn}
      </div>
    </div>`;
}

/* ─── Filter setter ──────────────────────────────────────────────────────────── */
async function _sourcingSetFilter(filter) {
  _sourcingFilter = filter;
  await _sourcingRefresh();
}

/* ─── Mark as Sent ──────────────────────────────────────────────────────────── */
async function markCampaignSent(campaignId) {
  try {
    const c = await DB.get(STORES.sourcingCampaigns, campaignId);
    if (!c) return;
    c.status = 'sent';
    c.sentAt = new Date().toISOString();
    await DB.put(STORES.sourcingCampaigns, c);
    await _sourcingAutoFollowUp(c);
    await _sourcingRefresh();
    showToast('Marked as sent — follow-up reminder created for 7 days from now', 'success');
  } catch (err) {
    showToast('Could not update: ' + err.message, 'error');
  }
}

/* ─── Auto follow-up reminder ────────────────────────────────────────────────── */
async function _sourcingAutoFollowUp(c) {
  try {
    const followUpDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    await DB.add(STORES.activities, {
      id: generateId(),
      userId: currentUser.id,
      contactId: c.linkedContactId || null,
      type: 'reminder',
      title: `Follow up: ${c.companyName}`,
      description: `Outreach letter sent on ${new Date(c.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Check in if no reply yet.`,
      dueDate: followUpDate,
      campaignId: c.id,
      createdAt: new Date().toISOString(),
    });
  } catch (_) {}
}

/* ─── Schedule Manual Follow-up ─────────────────────────────────────────────── */
async function _sourcingScheduleFollowUp(campaignId) {
  try {
    const c = await DB.get(STORES.sourcingCampaigns, campaignId);
    if (!c) return;
    const defaultDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    openModal(`
      <h3 class="text-base font-semibold mb-1">Schedule Follow-up</h3>
      <p class="text-sm text-surface-500 mb-4">Create a reminder to follow up with <strong class="text-surface-900 dark:text-white">${escapeHtml(c.companyName)}</strong>.</p>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Follow-up Date</label>
          <input type="date" id="fu-date" class="input-field" value="${defaultDate}"/>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Note <span class="text-surface-400 font-normal">(optional)</span></label>
          <textarea id="fu-note" class="input-field" rows="2"
            placeholder="e.g. Second touch — try a different angle…"></textarea>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-5">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="_sourcingSaveFollowUp('${campaignId}')" class="btn-primary">Create Reminder</button>
      </div>
    `, { small: true });
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function _sourcingSaveFollowUp(campaignId) {
  const date = document.getElementById('fu-date')?.value;
  const note = (document.getElementById('fu-note')?.value || '').trim();
  if (!date) { showToast('Please pick a date', 'error'); return; }
  try {
    const c = await DB.get(STORES.sourcingCampaigns, campaignId);
    await DB.add(STORES.activities, {
      id: generateId(),
      userId: currentUser.id,
      contactId: c?.linkedContactId || null,
      type: 'reminder',
      title: `Follow up: ${c?.companyName || ''}`,
      description: note || `Follow-up for outreach to ${c?.companyName || ''}`,
      dueDate: date,
      campaignId,
      createdAt: new Date().toISOString(),
    });
    closeModal();
    showToast('Reminder created', 'success');
  } catch (err) {
    showToast('Could not create reminder: ' + err.message, 'error');
  }
}

/* ─── Log Reply ─────────────────────────────────────────────────────────────── */
async function openLogReplyModal(campaignId) {
  try {
    const c = await DB.get(STORES.sourcingCampaigns, campaignId);
    if (!c) return;
    const today = new Date().toISOString().split('T')[0];
    openModal(`
      <h3 class="text-base font-semibold mb-1">Log Reply</h3>
      <p class="text-sm text-surface-500 mb-4">Record the owner's response from <strong class="text-surface-900 dark:text-white">${escapeHtml(c.companyName)}</strong>.</p>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Reply Date</label>
          <input type="date" id="reply-date" class="input-field" value="${today}"/>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Reply Content <span class="text-surface-400 font-normal">(optional)</span></label>
          <textarea id="reply-content" class="input-field" rows="4"
            placeholder="Paste or summarize what the owner said…"></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">Sentiment</label>
          <div class="grid grid-cols-3 gap-2">
            <label class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-surface-200
              dark:border-surface-700 cursor-pointer hover:border-brand-400 transition-colors
              has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:has-[:checked]:bg-brand-900/20">
              <input type="radio" name="reply-sentiment" value="positive" checked class="sr-only"/>
              <span class="text-xl">😊</span>
              <span class="text-xs font-medium">Positive</span>
            </label>
            <label class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-surface-200
              dark:border-surface-700 cursor-pointer hover:border-brand-400 transition-colors
              has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:has-[:checked]:bg-brand-900/20">
              <input type="radio" name="reply-sentiment" value="neutral" class="sr-only"/>
              <span class="text-xl">😐</span>
              <span class="text-xs font-medium">Neutral</span>
            </label>
            <label class="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-surface-200
              dark:border-surface-700 cursor-pointer hover:border-brand-400 transition-colors
              has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:has-[:checked]:bg-brand-900/20">
              <input type="radio" name="reply-sentiment" value="negative" class="sr-only"/>
              <span class="text-xl">😞</span>
              <span class="text-xs font-medium">Negative</span>
            </label>
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-5">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="saveReplyLog('${campaignId}')" class="btn-primary">Save Reply</button>
      </div>
    `, { small: true });
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function saveReplyLog(campaignId) {
  const date      = document.getElementById('reply-date')?.value;
  const content   = (document.getElementById('reply-content')?.value || '').trim();
  const sentiment = document.querySelector('input[name="reply-sentiment"]:checked')?.value || 'positive';
  if (!date) { showToast('Please pick a date', 'error'); return; }
  try {
    const c = await DB.get(STORES.sourcingCampaigns, campaignId);
    if (!c) return;
    c.replies   = c.replies || [];
    c.replies.push({ date, content, sentiment, loggedAt: new Date().toISOString() });
    c.status    = 'replied';
    c.repliedAt = date + 'T00:00:00.000Z';
    await DB.put(STORES.sourcingCampaigns, c);
    closeModal();
    await _sourcingRefresh();
    showToast('Reply logged — status updated to Replied 🎉', 'success');
  } catch (err) {
    showToast('Could not save reply: ' + err.message, 'error');
  }
}

/* ─── Mark Meeting Scheduled ─────────────────────────────────────────────────── */
async function markCampaignMeeting(campaignId) {
  try {
    const c = await DB.get(STORES.sourcingCampaigns, campaignId);
    if (!c) return;
    c.status    = 'meeting_scheduled';
    c.meetingAt = new Date().toISOString();
    await DB.put(STORES.sourcingCampaigns, c);
    await _sourcingRefresh();
    showToast('Meeting scheduled — excellent work! 🤝', 'success');
  } catch (err) {
    showToast('Could not update: ' + err.message, 'error');
  }
}

/* ─── Convert to Deal ────────────────────────────────────────────────────────── */
async function openConvertToDealModal(campaignId) {
  try {
    const c = await DB.get(STORES.sourcingCampaigns, campaignId);
    if (!c) return;
    openModal(`
      <h3 class="text-base font-semibold mb-1">Convert to Deal</h3>
      <p class="text-sm text-surface-500 mb-4">Create a deal from your outreach to <strong class="text-surface-900 dark:text-white">${escapeHtml(c.companyName)}</strong>.</p>
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">Deal / Company Name</label>
          <input type="text" id="ctd-name" class="input-field" value="${escapeHtml(c.companyName || '')}"/>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">Industry</label>
            <input type="text" id="ctd-industry" class="input-field" value="${escapeHtml(c.sector || '')}" placeholder="e.g. HVAC"/>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Starting Stage</label>
            <select id="ctd-stage" class="input-field">
              <option value="initial_contact" selected>Initial Contact</option>
              <option value="nda_signed">NDA Signed</option>
              <option value="loi">LOI</option>
              <option value="due_diligence">Due Diligence</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Contact Name <span class="text-surface-400 font-normal">(optional — creates a contact)</span></label>
          <input type="text" id="ctd-contact" class="input-field" placeholder="e.g. John Smith (owner)"/>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Asking Price <span class="text-surface-400 font-normal">(optional)</span></label>
          <input type="number" id="ctd-price" class="input-field" placeholder="e.g. 2500000" min="0"/>
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-5">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="convertCampaignToDeal('${campaignId}')" class="btn-primary">Create Deal</button>
      </div>
    `, { small: true });
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function convertCampaignToDeal(campaignId) {
  const name        = (document.getElementById('ctd-name')?.value || '').trim();
  const industry    = (document.getElementById('ctd-industry')?.value || '').trim();
  const stage       = document.getElementById('ctd-stage')?.value || 'initial_contact';
  const contactName = (document.getElementById('ctd-contact')?.value || '').trim();
  const askingPrice = parseFloat(document.getElementById('ctd-price')?.value || '') || null;

  if (!name) { showToast('Please enter a deal name', 'error'); return; }

  try {
    const c = await DB.get(STORES.sourcingCampaigns, campaignId);
    if (!c) return;

    // Create contact if name provided and none linked yet
    let contactId = c.linkedContactId || null;
    if (contactName && !contactId) {
      const parts = contactName.trim().split(/\s+/);
      contactId = generateId();
      await DB.add(STORES.contacts, {
        id: contactId,
        userId: currentUser.id,
        firstName: parts[0] || contactName,
        lastName: parts.slice(1).join(' ') || '',
        company: name,
        title: 'Owner',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Create deal
    const dealId = generateId();
    const now = new Date().toISOString();
    await DB.add(STORES.deals, {
      id: dealId,
      userId: currentUser.id,
      name,
      industry,
      stage,
      contactId: contactId || null,
      askingPrice,
      status: 'active',
      notes: c.letterText
        ? `Converted from sourcing campaign on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.\n\n--- Original outreach letter ---\n${c.letterText}`
        : `Converted from sourcing campaign on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
      createdAt: now,
      updatedAt: now,
      stageEnteredAt: now,
    });

    // Update campaign status
    c.status      = 'converted';
    c.convertedAt = now;
    c.linkedDealId = dealId;
    if (contactId && !c.linkedContactId) c.linkedContactId = contactId;
    await DB.put(STORES.sourcingCampaigns, c);

    closeModal();
    await _sourcingRefresh();
    showToast('Deal created! Navigating to deals…', 'success');
    setTimeout(() => navigate('deals'), 1200);
  } catch (err) {
    showToast('Could not create deal: ' + err.message, 'error');
  }
}

/* ─── Pass ───────────────────────────────────────────────────────────────────── */
async function markCampaignPassed(campaignId) {
  if (!confirm('Mark this company as passed? You can always reopen it later.')) return;
  try {
    const c = await DB.get(STORES.sourcingCampaigns, campaignId);
    if (!c) return;
    c.status   = 'passed';
    c.passedAt = new Date().toISOString();
    await DB.put(STORES.sourcingCampaigns, c);
    await _sourcingRefresh();
    showToast('Marked as passed', 'success');
  } catch (err) {
    showToast('Could not update: ' + err.message, 'error');
  }
}

/* ─── Reopen ─────────────────────────────────────────────────────────────────── */
async function _sourcingReopenCampaign(campaignId) {
  try {
    const c = await DB.get(STORES.sourcingCampaigns, campaignId);
    if (!c) return;
    c.status = c.sentAt ? 'sent' : 'draft';
    delete c.passedAt;
    await DB.put(STORES.sourcingCampaigns, c);
    await _sourcingRefresh();
    showToast('Campaign reopened', 'success');
  } catch (err) {
    showToast('Could not reopen: ' + err.message, 'error');
  }
}

/* ─── Campaign Detail Modal ──────────────────────────────────────────────────── */
async function openCampaignDetailModal(campaignId) {
  try {
    const c = await DB.get(STORES.sourcingCampaigns, campaignId);
    if (!c) return;
    const cfg = CAMPAIGN_STATUSES[c.status] || CAMPAIGN_STATUSES.draft;

    const letterHtml = c.letterText
      ? `<div class="bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700
            rounded-xl p-4 text-sm leading-relaxed text-surface-800 dark:text-surface-200 whitespace-pre-wrap mb-4"
            style="font-family: Georgia, 'Times New Roman', serif; max-height: 300px; overflow-y: auto;">${escapeHtml(c.letterText)}</div>`
      : '<p class="text-sm text-surface-400 italic mb-4">No letter text saved.</p>';

    const replies = c.replies || [];
    const repliesHtml = replies.length > 0 ? `
      <h4 class="text-sm font-semibold mb-2">Reply History (${replies.length})</h4>
      <div class="space-y-2 mb-4">
        ${replies.map(r => `
          <div class="p-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold capitalize">
                ${r.sentiment === 'positive' ? '😊' : r.sentiment === 'neutral' ? '😐' : '😞'} ${escapeHtml(r.sentiment || 'positive')} reply
              </span>
              <span class="text-xs text-surface-400">${escapeHtml(r.date || '')}</span>
            </div>
            ${r.content ? `<p class="text-xs text-surface-600 dark:text-surface-400 leading-relaxed">${escapeHtml(r.content)}</p>` : '<p class="text-xs text-surface-400 italic">No content recorded.</p>'}
          </div>
        `).join('')}
      </div>` : '';

    openModal(`
      <div class="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 class="text-base font-semibold">${escapeHtml(c.companyName || 'Campaign')}</h3>
          ${c.sector ? `<p class="text-xs text-surface-500 mt-0.5">${escapeHtml(c.sector)}</p>` : ''}
        </div>
        <span class="badge ${cfg.pill} shrink-0">${cfg.label}</span>
      </div>
      <h4 class="text-sm font-semibold mb-2">Outreach Letter</h4>
      ${letterHtml}
      ${repliesHtml}
      <div class="flex justify-between gap-2">
        <button onclick="_sourcingCopyLetter(${JSON.stringify(c.letterText || '')})" class="btn-secondary btn-sm">Copy Letter</button>
        <button onclick="closeModal()" class="btn-primary btn-sm">Close</button>
      </div>
    `);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

/* ─── Page-wide refresh ──────────────────────────────────────────────────────── */
async function _sourcingRefresh() {
  let campaigns = [];
  try {
    const all = await DB.getForUser(STORES.sourcingCampaigns, currentUser.id);
    campaigns = (all || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (_) {}

  const statsEl    = document.getElementById('sourcing-stats-row');
  const campaignEl = document.getElementById('sourcing-campaigns-section');
  const funnelEl   = document.getElementById('sourcing-funnel-section');

  if (statsEl)    statsEl.innerHTML    = _sourcingStatsHtml(campaigns);
  if (campaignEl) campaignEl.innerHTML = _sourcingCampaignsHtml(campaigns);
  if (funnelEl)   funnelEl.innerHTML   = _sourcingFunnelHtml(campaigns);
}

/* ─── generateOutreachLetter ────────────────────────────────────────────────── */
async function generateOutreachLetter() {
  const companyName = (document.getElementById('sl-company-name')?.value || '').trim();
  const sector      = (document.getElementById('sl-sector')?.value || '').trim();
  const companySize = document.getElementById('sl-company-size')?.value || '';
  const sellReason  = document.getElementById('sl-sell-reason')?.value || '';
  const background  = (document.getElementById('sl-background')?.value || '').trim();
  const tone        = document.getElementById('sl-tone')?.value || 'Warm and personal';
  const referral    = (document.getElementById('sl-referral')?.value || '').trim();

  const btn = document.getElementById('sl-generate-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

  const outputArea = document.getElementById('sourcing-letter-output');
  if (outputArea) {
    outputArea.classList.remove('hidden');
    outputArea.innerHTML = `
      <div class="flex items-center gap-3 py-4 text-surface-500">
        <div class="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full shrink-0"></div>
        <span class="text-sm">Writing your letter…</span>
      </div>`;
  }

  let userPrompt = `Write an acquisition inquiry letter with the following details:\n\n`;
  if (companyName)  userPrompt += `Target Company: ${companyName}\n`;
  if (sector)       userPrompt += `Industry/Sector: ${sector}\n`;
  if (companySize)  userPrompt += `Company Size: ${companySize}\n`;
  if (sellReason)   userPrompt += `Reason Owner Might Sell: ${sellReason}\n`;
  if (background)   userPrompt += `My Background: ${background}\n`;
  if (tone)         userPrompt += `Tone: ${tone}\n`;
  if (referral)     userPrompt += `Referral/Connection: ${referral}\n`;

  // Try to research the company to personalize
  if (companyName) {
    if (btn) btn.textContent = 'Researching company…';
    try {
      const results = await webSearch(`"${companyName}" ${sector} owner history background`, { maxResults: 3 });
      if (results && results.length > 0) {
        userPrompt += '\n\nPublicly available information:\n' +
          results.map(r => `- ${r.title}: ${r.snippet}`).join('\n');
      }
    } catch (_) {}
    if (btn) btn.textContent = 'Generating…';
  }

  const systemPrompt =
    'You are an expert acquisition entrepreneur coach helping a Search Fund entrepreneur write a first-touch ' +
    'acquisition inquiry letter. The letter should be warm, genuine, respectful of the owner\'s life work, and ' +
    'clearly state the searcher\'s intent to acquire and operate the business. Do NOT use corporate buzzwords. ' +
    'Write in first person. Max 350 words. Do not include [placeholder] brackets in the output — use realistic ' +
    'placeholder names only where absolutely necessary and note them with (customize this). ' +
    'Use any specific company details provided to personalize the letter.';

  try {
    const letterText = await callAI(systemPrompt, userPrompt, 800, 0.6);
    if (outputArea) {
      outputArea.innerHTML = _sourcingLetterOutputHtml(letterText, companyName, sector);
    }
  } catch (err) {
    if (outputArea) {
      outputArea.innerHTML = `
        <div class="p-4 bg-red-50 dark:bg-red-900/15 rounded-xl">
          <p class="text-sm text-red-600 dark:text-red-400">Failed to generate letter: ${escapeHtml(err.message)}</p>
        </div>`;
    }
    showToast('Generation failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Letter'; }
  }
}

/* ─── Letter output HTML ─────────────────────────────────────────────────────── */
function _sourcingLetterOutputHtml(letterText, companyName, sector) {
  const escaped = escapeHtml(letterText).replace(/\n/g, '<br>');
  return `
    <div>
      <h3 class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-3">Generated Letter</h3>
      <div class="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-4
        text-sm leading-relaxed text-surface-800 dark:text-surface-200 mb-4"
        style="font-family: Georgia, 'Times New Roman', serif; max-height: 280px; overflow-y: auto;"
      >${escaped}</div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary btn-sm" onclick="_sourcingCopyLetter(${JSON.stringify(letterText)})">
          Copy Letter
        </button>
        <button class="btn-secondary btn-sm" onclick="generateOutreachLetter()">
          Regenerate
        </button>
        <button class="btn-primary btn-sm"
          onclick="_sourcingSaveCampaign(${JSON.stringify(letterText)}, ${JSON.stringify(companyName)}, ${JSON.stringify(sector)})">
          Save to Pipeline
        </button>
      </div>
    </div>`;
}

/* ─── Copy letter ────────────────────────────────────────────────────────────── */
function _sourcingCopyLetter(text) {
  navigator.clipboard.writeText(text).then(
    ()  => showToast('Letter copied to clipboard', 'success'),
    ()  => showToast('Could not copy — please select and copy manually', 'error')
  );
}

/* ─── Save campaign ──────────────────────────────────────────────────────────── */
async function saveCampaign(letterText) {
  const companyName = (document.getElementById('sl-company-name')?.value || '').trim();
  const sector      = (document.getElementById('sl-sector')?.value || '').trim();
  await _sourcingSaveCampaign(letterText, companyName, sector);
}

async function _sourcingSaveCampaign(letterText, companyName, sector) {
  try {
    await DB.add(STORES.sourcingCampaigns, {
      id: generateId(),
      userId: currentUser.id,
      companyName: companyName || 'Unnamed Company',
      sector: sector || '',
      letterText,
      status: 'draft',
      replies: [],
      createdAt: new Date().toISOString(),
    });
    showToast('Campaign saved to pipeline', 'success');
    await _sourcingRefresh();
    // Collapse letter output
    const out = document.getElementById('sourcing-letter-output');
    if (out) out.classList.add('hidden');
  } catch (err) {
    showToast('Failed to save campaign: ' + err.message, 'error');
  }
}

/* ─── Delete campaign ────────────────────────────────────────────────────────── */
async function _sourcingDeleteCampaign(campaignId) {
  if (!confirm('Permanently delete this campaign and all its reply history?')) return;
  try {
    await DB.delete(STORES.sourcingCampaigns, campaignId);
    await _sourcingRefresh();
    showToast('Campaign deleted', 'success');
  } catch (err) {
    showToast('Could not delete campaign: ' + err.message, 'error');
  }
}

/* ─── Legacy shim: renderCampaignsList ───────────────────────────────────────── */
async function renderCampaignsList() {
  await _sourcingRefresh();
}
