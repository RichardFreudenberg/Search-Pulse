/* ============================================
   Nexus CRM — Email Template Library
   ============================================ */

/* ─── Module state ──────────────────────────────────────────────────────────── */
let _etFilter              = 'all';
let _etSearch              = '';
let _etTab                 = 'built-in'; // 'built-in' | 'custom'
let _etCurrentPreviewTemplate = null;   // avoids JSON.stringify in onclick attrs
let _etEditingTemplateId   = null;      // avoids JSON.stringify in onclick attrs

/* ─── Built-in templates ─────────────────────────────────────────────────────── */
const BUILTIN_EMAIL_TEMPLATES = [
  // ── Outreach ──
  {
    id: 'bi-outreach-cold',
    category: 'Outreach',
    name: 'First Touch — Cold Owner',
    subject: 'Potential Interest in {{Company Name}}',
    body: `Dear {{Owner Name}},

My name is {{Your Name}}, and I am a search fund entrepreneur actively looking to acquire and operate a great business in the {{Industry}} space.

I came across {{Company Name}} and was impressed by {{specific detail about their business}}. The work you have built over the years is exactly the kind of business I have been looking for — one with a strong reputation, loyal customers, and a team that clearly takes pride in what they do.

I am reaching out because I am in the early stages of exploring an acquisition, and I would love to have a brief, no-pressure conversation to learn more about your business and share a bit about my background and vision.

My focus is on acquiring one great business and running it for the long term — not flipping it or cutting it apart. I have {{Your Background, e.g. an MBA from HBS and 5 years of operational experience}} and am backed by experienced investors who share that same long-term philosophy.

If you are open to a 20-minute call, I would be grateful for your time. There is absolutely no obligation, and your privacy will be fully respected.

Warm regards,
{{Your Name}}
{{Your Phone}}
{{Your Email}}`,
  },
  {
    id: 'bi-outreach-warm',
    category: 'Outreach',
    name: 'First Touch — Warm (via Referral)',
    subject: 'Introduction via {{Referral Name}}',
    body: `Dear {{Owner Name}},

{{Referral Name}} suggested I reach out to you — I hope that context is helpful as you read this note.

My name is {{Your Name}}, and I am a search fund entrepreneur looking to acquire and operate a business in the {{Industry}} sector. {{Referral Name}} spoke highly of you and thought our conversation could be worthwhile for both of us.

I have been following {{Company Name}} with genuine interest and believe you have built something special. I am not a financial buyer looking to flip a business — I am looking for one great company to run for the long haul, and {{Company Name}} fits the profile I have been searching for.

I would be grateful for even a brief call to introduce myself and learn more about your perspective. Completely no pressure.

Best,
{{Your Name}}
{{Your Phone}}`,
  },
  {
    id: 'bi-outreach-followup1',
    category: 'Outreach',
    name: 'Follow-up #1 — 7 Days',
    subject: 'Following up — {{Company Name}}',
    body: `Dear {{Owner Name}},

I wanted to follow up on my note from last week about a potential conversation regarding {{Company Name}}.

I completely understand if the timing is not right or if this is not something you are considering. I just wanted to make sure my message did not slip through the cracks.

If there is any interest in a quick, informal call, I am happy to work around your schedule. If not, no worries at all — I wish you and your team continued success.

Best,
{{Your Name}}`,
  },
  {
    id: 'bi-outreach-followup2',
    category: 'Outreach',
    name: 'Follow-up #2 — 14 Days (New Angle)',
    subject: 'One more thought — {{Company Name}}',
    body: `Dear {{Owner Name}},

I am reaching out one more time, and I promise to keep it brief.

I have been doing a lot of research on the {{Industry}} space, and {{Company Name}} consistently comes up as a well-regarded operator. That kind of reputation is rare and hard to build — and it is exactly what I am looking for in an acquisition.

I wanted to share that I am not a private equity firm or a financial buyer. I am an individual who wants to buy one business, run it, and grow it — while honoring everything you have built, including your employees and your customers.

If there is ever a moment where you would consider a conversation, my door is always open.

Respectfully,
{{Your Name}}
{{Your Phone}}`,
  },
  {
    id: 'bi-outreach-followup3',
    category: 'Outreach',
    name: 'Follow-up #3 — 30 Days (Final)',
    subject: 'Last note — {{Company Name}}',
    body: `Dear {{Owner Name}},

I will make this my last message so I do not overstay my welcome.

I have reached out a couple of times about a potential conversation regarding {{Company Name}}. I genuinely admire what you have built, and I believe there could be a real fit if the timing is ever right for you.

If you ever want to explore what a transition might look like — on your timeline, your terms — I hope you will keep me in mind. I am not going anywhere.

I wish you and your team all the best.

Sincerely,
{{Your Name}}
{{Your Email}}
{{Your Phone}}`,
  },

  // ── Engagement ──
  {
    id: 'bi-thank-you-call',
    category: 'Engagement',
    name: 'Thank You After First Call',
    subject: 'Great speaking with you — next steps',
    body: `Dear {{Owner Name}},

Thank you so much for taking the time to speak with me today. It was a genuine pleasure to learn more about {{Company Name}} and the story behind it.

A few things that really stood out to me from our conversation:
- {{Key takeaway 1}}
- {{Key takeaway 2}}
- {{Key takeaway 3}}

I am more excited than ever about the possibility of working together. As a next step, I would love to {{proposed next step, e.g. schedule a follow-up call / visit your facility / send over an NDA}}.

Please do not hesitate to reach out with any questions. I look forward to continuing our conversation.

Best regards,
{{Your Name}}`,
  },
  {
    id: 'bi-nda-request',
    category: 'Engagement',
    name: 'NDA Request',
    subject: 'NDA for {{Company Name}} — Keeping Things Confidential',
    body: `Dear {{Owner Name}},

Thank you again for our conversation. I am excited about the possibility of moving forward.

To allow us to exchange more detailed information about {{Company Name}} in a protected way, I would like to propose we sign a mutual Non-Disclosure Agreement (NDA). This protects both of us and allows for a more open and productive dialogue.

I have attached a standard NDA for your review. Please feel free to have your attorney look it over. If you have your own preferred form, I am happy to use that instead.

Once the NDA is in place, I would love to review any financial information and operational details you feel comfortable sharing, at whatever level of detail makes sense for you.

Looking forward to taking the next step together.

Best,
{{Your Name}}`,
  },
  {
    id: 'bi-cim-request',
    category: 'Engagement',
    name: 'CIM / Info Package Request',
    subject: 'Request for Information — {{Company Name}}',
    body: `Dear {{Owner Name}} / {{Broker Name}},

Thank you for the initial overview of {{Company Name}}. Based on what I have learned, I am very interested in exploring this opportunity further.

Could you please share the Confidential Information Memorandum (CIM) or any financial package you have prepared? I am specifically interested in:

- Historical financials (P&L, revenue breakdown) for the last 3 years
- Customer concentration and contract details
- Key employee overview
- Any existing liens, leases, or contracts of note

I will treat all information with strict confidentiality and look forward to a thorough review.

Best regards,
{{Your Name}}`,
  },
  {
    id: 'bi-meeting-confirm',
    category: 'Engagement',
    name: 'Meeting Confirmation',
    subject: 'Confirmed: Our call on {{Date}} at {{Time}}',
    body: `Dear {{Owner Name}},

Just confirming our call scheduled for {{Date}} at {{Time}} {{Timezone}}.

I plan to dial in at {{Phone Number / Video Link}}. Please let me know if anything changes on your end.

I am looking forward to continuing our conversation. See you then!

Best,
{{Your Name}}`,
  },
  {
    id: 'bi-reschedule',
    category: 'Engagement',
    name: 'Reschedule Request',
    subject: 'Rescheduling our {{Date}} call — apologies',
    body: `Dear {{Owner Name}},

I apologize for the short notice, but something has come up and I need to reschedule our call that was set for {{Date}} at {{Time}}.

I am sorry for any inconvenience. Could we find another time that works for you? I am available:
- {{Option 1}}
- {{Option 2}}
- {{Option 3}}

Please let me know what works best and I will send a calendar invite right away.

Again, I sincerely apologize for the inconvenience.

Best,
{{Your Name}}`,
  },

  // ── Broker ──
  {
    id: 'bi-broker-intro',
    category: 'Broker',
    name: 'Broker Introduction',
    subject: 'Introduction — Search Fund Buyer',
    body: `Dear {{Broker Name}},

My name is {{Your Name}}, and I am a search fund entrepreneur actively looking to acquire a small-to-medium-sized business to operate for the long term.

My acquisition criteria:
- Revenue: {{Revenue Range, e.g. $2M–$15M}}
- EBITDA: {{EBITDA Range, e.g. $500K–$3M}}
- Industries: {{Industries of Interest}}
- Geography: {{Preferred Geography}}
- Structure: Clean acquisition, no earnout preferred; open to seller note

I am a serious, well-capitalized buyer with experienced investors and a committed timeline. I move quickly, communicate clearly, and close what I start.

I would love to be on your radar for any listings that match this profile. Would you be open to a brief call to introduce ourselves?

Best regards,
{{Your Name}}
{{Your Email}}
{{Your Phone}}`,
  },
  {
    id: 'bi-broker-deal',
    category: 'Broker',
    name: 'Broker — Specific Deal Inquiry',
    subject: 'Interest in {{Listing Name / Industry}} — {{Location}}',
    body: `Dear {{Broker Name}},

I came across your listing for {{Listing Name}} and I am very interested in learning more.

Based on the information available, this appears to be an excellent fit with my acquisition criteria — particularly the {{revenue profile / industry / location / other factor}}.

Could you please send over the CIM or any available financial package? I have signed NDAs with similar brokers and can return one to you quickly.

A bit about me: I am a search fund entrepreneur with {{background summary}} and am backed by {{investors / HBS search fund program}}. I am a serious buyer with a fast decision-making process.

Looking forward to connecting.

Best,
{{Your Name}}
{{Your Phone}}`,
  },
  {
    id: 'bi-broker-feedback',
    category: 'Broker',
    name: 'Broker — Deal Pass (with Feedback)',
    subject: 'Passing on {{Company Name}} — Thank You',
    body: `Dear {{Broker Name}},

Thank you for sharing the information on {{Company Name}}. I appreciate the time you invested in walking me through the opportunity.

After careful review, I have decided to pass on this one. The primary reasons are:
- {{Reason 1, e.g. customer concentration too high}}
- {{Reason 2, e.g. EBITDA multiple above our range}}

This in no way reflects negatively on the business — it is simply not the right fit for our specific criteria at this time.

I genuinely hope we can work together on a future listing that fits better. Please do keep me in mind — I remain very active in the market and can move quickly when the right opportunity comes along.

Best regards,
{{Your Name}}`,
  },

  // ── Deal Process ──
  {
    id: 'bi-loi-intent',
    category: 'Deal Process',
    name: 'LOI Intent Signal',
    subject: 'Expression of Interest — {{Company Name}}',
    body: `Dear {{Owner Name}},

Following our recent conversations and review of the materials you have shared, I wanted to formally express my strong interest in acquiring {{Company Name}}.

Based on my understanding of the business, I believe we are aligned on the fundamentals. I am currently working with my advisors to prepare a formal Letter of Intent (LOI), which I expect to have ready by {{Target Date}}.

The LOI will outline:
- A proposed purchase price range of {{Price Range}}
- Proposed deal structure ({{equity / debt / seller note breakdown}})
- A 30–45 day exclusivity period to complete due diligence
- A target closing date of {{Estimated Close Date}}

I want to reiterate my commitment to this process and to treating you and your team with the respect you deserve. I am excited about the prospect of being the next steward of this business.

Please let me know if you have any questions before I send the formal LOI.

Best regards,
{{Your Name}}`,
  },
  {
    id: 'bi-loi-submission',
    category: 'Deal Process',
    name: 'LOI Submission Cover Note',
    subject: 'Letter of Intent — {{Company Name}}',
    body: `Dear {{Owner Name}},

Please find attached our Letter of Intent to acquire {{Company Name}}.

Key terms are summarized below for your reference:
- Purchase Price: {{Purchase Price}}
- Structure: {{e.g. $X equity, $X SBA loan, $X seller note}}
- Exclusivity Period: 45 days from execution
- Proposed Close: {{Estimated Close Date}}
- Conditions: Subject to satisfactory due diligence and financing

We have worked hard to put forward a fair and clean offer that reflects both the value you have built and our confidence in the business going forward.

We hope you will give this your serious consideration. We are prepared to move quickly and are committed to a smooth, respectful process for you, your employees, and your customers.

Please do not hesitate to call me directly at {{Your Phone}} with any questions.

With appreciation,
{{Your Name}}`,
  },

  // ── Investor Relations ──
  {
    id: 'bi-lp-monthly',
    category: 'Investor Relations',
    name: 'LP Monthly Update',
    subject: '{{Month}} Search Update — {{Your Name}}',
    body: `Dear Investors,

Here is my monthly update for {{Month}} {{Year}}.

DEAL PIPELINE
- Active deals under review: {{N}}
- New opportunities sourced this month: {{N}}
- Passed on: {{N}}
- Notable deal: {{Brief description of most interesting deal}}

OUTREACH ACTIVITY
- Letters sent: {{N}}
- Responses received: {{N}} ({{Reply Rate}}% reply rate)
- Calls / meetings held: {{N}}

FOCUS FOR NEXT MONTH
{{2–3 sentences on what you are focused on}}

ASKS
{{Any specific asks — introductions, feedback, etc.}}

As always, thank you for your continued support and guidance. Please do not hesitate to reach out with questions or introductions.

Best,
{{Your Name}}`,
  },
  {
    id: 'bi-lp-quarterly',
    category: 'Investor Relations',
    name: 'LP Quarterly Update',
    subject: 'Q{{Quarter}} {{Year}} Search Fund Update — {{Your Name}}',
    body: `Dear Investors,

I hope this note finds you well. Below is my quarterly update for Q{{Quarter}} {{Year}}.

EXECUTIVE SUMMARY
{{2–3 sentence overview of the quarter}}

SEARCH METRICS
- Total outreach letters sent (quarter): {{N}}
- Response rate: {{N}}%
- Meetings / calls held: {{N}}
- LOIs submitted: {{N}}
- Deals currently in active diligence: {{N}}

PIPELINE HIGHLIGHTS
{{Deal 1}}: {{Brief description and current status}}
{{Deal 2}}: {{Brief description and current status}}

MARKET OBSERVATIONS
{{2–3 observations about deal flow, seller sentiment, valuations, competition}}

NEXT QUARTER PRIORITIES
1. {{Priority 1}}
2. {{Priority 2}}
3. {{Priority 3}}

FINANCIALS
Search fund expenses to date: \${{Amount}}
Runway remaining: {{Months}} months

Thank you for your continued support. I welcome any introductions, feedback, or guidance you may have.

Warm regards,
{{Your Name}}`,
  },
];

/* ─── Custom template storage (localStorage) ─────────────────────────────────── */
function _etCustomKey() {
  return `pulse_email_templates_${currentUser?.id || 'default'}`;
}

function _etLoadCustom() {
  try {
    return JSON.parse(localStorage.getItem(_etCustomKey()) || '[]');
  } catch (_) { return []; }
}

function _etSaveCustom(templates) {
  localStorage.setItem(_etCustomKey(), JSON.stringify(templates));
}

/* ─── renderEmailTemplates ───────────────────────────────────────────────────── */
async function renderEmailTemplates() {
  const container = document.getElementById('page-content');
  if (!container) return;

  const custom    = _etLoadCustom();
  const allBuiltIn = BUILTIN_EMAIL_TEMPLATES;
  const categories = [...new Set(allBuiltIn.map(t => t.category))];

  container.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
    ${renderPageHeader('Email Templates', 'Ready-to-use templates for every stage of your search')}

    <!-- Tab strip -->
    <div class="flex gap-1 border-b border-surface-200 dark:border-surface-800 mb-6">
      <button onclick="_etSwitchTab('built-in')" id="et-tab-builtin"
        class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${_etTab === 'built-in' ? 'border-brand-600 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}">
        Built-in Templates <span class="ml-1.5 text-xs opacity-60">${allBuiltIn.length}</span>
      </button>
      <button onclick="_etSwitchTab('custom')" id="et-tab-custom"
        class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${_etTab === 'custom' ? 'border-brand-600 text-brand-600' : 'border-transparent text-surface-500 hover:text-surface-700'}">
        My Templates <span class="ml-1.5 text-xs opacity-60">${custom.length}</span>
      </button>
    </div>

    <div id="et-content">
      ${_etTab === 'built-in' ? _etBuiltInHtml(allBuiltIn, categories) : _etCustomHtml(custom)}
    </div>
  </div>`;
}

/* ─── Built-in templates panel ───────────────────────────────────────────────── */
function _etBuiltInHtml(templates, categories) {
  const filtered = templates.filter(t => {
    const matchCat    = _etFilter === 'all' || t.category === _etFilter;
    const matchSearch = !_etSearch || t.name.toLowerCase().includes(_etSearch.toLowerCase())
                      || t.subject.toLowerCase().includes(_etSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  const chips = [{ key: 'all', label: 'All' }, ...categories.map(c => ({ key: c, label: c }))].map(f => `
    <button onclick="_etSetFilter('${escapeHtml(f.key)}')"
      class="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
        _etFilter === f.key
          ? 'bg-brand-600 text-white'
          : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600'
      }">${escapeHtml(f.label)}</button>
  `).join('');

  const cards = filtered.map(t => _etBuiltInCard(t)).join('');

  return `
    <div class="flex flex-col sm:flex-row gap-3 mb-5">
      <div class="relative flex-1 max-w-sm">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
        </svg>
        <input type="text" placeholder="Search templates…" value="${escapeHtml(_etSearch)}"
          oninput="_etSetSearch(this.value)"
          class="input-field pl-9 text-sm"/>
      </div>
      <div class="flex gap-1.5 flex-wrap">${chips}</div>
    </div>

    ${filtered.length === 0 ? `
      <div class="py-16 text-center">
        <p class="text-sm text-surface-500">No templates match your filter.</p>
        <button onclick="_etSetFilter('all');_etSetSearch('')" class="text-sm text-brand-600 mt-2">Clear filters</button>
      </div>
    ` : `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${cards}</div>`}
  `;
}

function _etBuiltInCard(t) {
  const categoryColors = {
    'Outreach':          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'Engagement':        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    'Broker':            'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    'Deal Process':      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    'Investor Relations':'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400',
  };
  const catClass = categoryColors[t.category] || 'bg-surface-100 text-surface-600';
  const bodyPreview = t.body.replace(/\n/g, ' ').slice(0, 120) + '…';

  return `
    <div class="card flex flex-col hover:border-surface-300 dark:hover:border-surface-600 transition-colors">
      <div class="flex items-start justify-between gap-2 mb-2">
        <h3 class="text-sm font-semibold text-surface-900 dark:text-white leading-snug">${escapeHtml(t.name)}</h3>
        <span class="badge ${catClass} shrink-0 text-[11px]">${escapeHtml(t.category)}</span>
      </div>
      <p class="text-[11px] font-medium text-surface-500 mb-1.5">Subject: <span class="text-surface-700 dark:text-surface-300">${escapeHtml(t.subject)}</span></p>
      <p class="text-xs text-surface-500 leading-relaxed flex-1 mb-4 line-clamp-3">${escapeHtml(bodyPreview)}</p>
      <div class="flex gap-2 mt-auto">
        <button onclick="_etPreview('${escapeHtml(t.id)}')" class="btn-secondary btn-sm flex-1">Preview</button>
        <button onclick="_etCopyTemplate('${escapeHtml(t.id)}')" class="btn-primary btn-sm flex-1">Copy</button>
      </div>
    </div>`;
}

/* ─── Custom templates panel ─────────────────────────────────────────────────── */
function _etCustomHtml(custom) {
  if (custom.length === 0) {
    return `
      <div class="py-16 text-center">
        <svg class="w-12 h-12 mx-auto text-surface-300 dark:text-surface-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p class="text-sm font-medium text-surface-600 dark:text-surface-400">No custom templates yet</p>
        <p class="text-xs text-surface-400 mt-1 mb-4">Save your own templates to reuse them across deals and outreach</p>
        <button onclick="openCreateTemplateModal()" class="btn-primary btn-sm">Create First Template</button>
      </div>`;
  }

  return `
    <div class="flex justify-between items-center mb-4">
      <p class="text-sm text-surface-600">${custom.length} custom template${custom.length !== 1 ? 's' : ''}</p>
      <button onclick="openCreateTemplateModal()" class="btn-primary btn-sm">+ New Template</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      ${custom.map(t => _etCustomCard(t)).join('')}
    </div>`;
}

function _etCustomCard(t) {
  const bodyPreview = (t.body || '').replace(/\n/g, ' ').slice(0, 120) + '…';
  return `
    <div class="card flex flex-col hover:border-surface-300 dark:hover:border-surface-600 transition-colors">
      <div class="flex items-start justify-between gap-2 mb-2">
        <h3 class="text-sm font-semibold text-surface-900 dark:text-white leading-snug">${escapeHtml(t.name || 'Untitled')}</h3>
        ${t.category ? `<span class="badge bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300 shrink-0 text-[11px]">${escapeHtml(t.category)}</span>` : ''}
      </div>
      ${t.subject ? `<p class="text-[11px] font-medium text-surface-500 mb-1.5">Subject: <span class="text-surface-700 dark:text-surface-300">${escapeHtml(t.subject)}</span></p>` : ''}
      <p class="text-xs text-surface-500 leading-relaxed flex-1 mb-4 line-clamp-3">${escapeHtml(bodyPreview)}</p>
      <div class="flex gap-2 mt-auto">
        <button onclick="_etPreviewCustom('${escapeHtml(t.id)}')" class="btn-secondary btn-sm flex-1">Preview</button>
        <button onclick="_etCopyCustom('${escapeHtml(t.id)}')" class="btn-primary btn-sm flex-1">Copy</button>
        <button onclick="_etDeleteCustom('${escapeHtml(t.id)}')" class="text-red-500 hover:text-red-700 text-xs px-1">Delete</button>
      </div>
    </div>`;
}

/* ─── Preview modal ──────────────────────────────────────────────────────────── */
function _etPreview(templateId) {
  const t = BUILTIN_EMAIL_TEMPLATES.find(t => t.id === templateId);
  if (!t) return;
  _etOpenPreviewModal(t);
}

function _etPreviewCustom(templateId) {
  const custom = _etLoadCustom();
  const t = custom.find(t => t.id === templateId);
  if (!t) return;
  _etOpenPreviewModal(t);
}

function _etOpenPreviewModal(t) {
  _etCurrentPreviewTemplate = t; // store ref so onclick buttons don't need JSON.stringify

  const bodyHtml = escapeHtml(t.body || '').replace(/\n/g, '<br>').replace(
    /\{\{([^}]+)\}\}/g,
    '<mark class="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-0.5 rounded not-italic">{{$1}}</mark>'
  );

  // Count placeholders for AI customise hint
  const placeholders = [...(t.body || '').matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]);
  const hasPlaceholders = placeholders.length > 0;

  openModal(`
    <div class="flex items-start justify-between gap-3 mb-4">
      <div>
        <h3 class="text-base font-semibold">${escapeHtml(t.name)}</h3>
        ${t.category ? `<span class="text-xs text-surface-500">${escapeHtml(t.category)}</span>` : ''}
      </div>
      ${hasPlaceholders ? `<span class="badge bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[11px] shrink-0">${placeholders.length} placeholder${placeholders.length !== 1 ? 's' : ''}</span>` : ''}
    </div>

    <div class="bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-700 p-4 mb-4">
      <p class="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-1">Subject</p>
      <p class="text-sm font-medium text-surface-800 dark:text-surface-200">${escapeHtml(t.subject || '')}</p>
    </div>

    <div class="bg-surface-50 dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-700 p-4 mb-4 max-h-64 overflow-y-auto">
      <p class="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">Body</p>
      <div class="text-sm text-surface-700 dark:text-surface-300 leading-relaxed" style="font-family: Georgia, serif;">${bodyHtml}</div>
    </div>

    <!-- AI customise section -->
    ${hasPlaceholders ? `
    <div class="rounded-xl border border-brand-200 dark:border-brand-800/40 bg-brand-50 dark:bg-brand-900/10 p-3 mb-4">
      <div class="flex items-start gap-2 mb-2">
        <svg class="w-4 h-4 text-brand-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
        </svg>
        <div class="flex-1">
          <p class="text-xs font-semibold text-brand-700 dark:text-brand-400">AI Customize</p>
          <p class="text-[11px] text-brand-600 dark:text-brand-500 mt-0.5">Fill in placeholders automatically using AI</p>
        </div>
      </div>
      <input type="text" id="et-ai-context" class="input-field text-sm mb-2"
        placeholder="e.g. Smith Brothers Plumbing, HVAC company in Atlanta, $2M revenue"/>
      <button onclick="_etAICustomize()" class="btn-primary btn-sm w-full">Fill Placeholders with AI</button>
    </div>` : ''}

    <p class="text-xs text-surface-400 mb-4">
      <span class="text-amber-600 dark:text-amber-400 font-medium">Highlighted text</span> = placeholder to customize before sending.
    </p>

    <div class="flex justify-end gap-2">
      <button onclick="closeModal()" class="btn-secondary">Close</button>
      <button onclick="_etCopyCurrentTemplate()" class="btn-primary">Copy to Clipboard</button>
    </div>
  `);
}

function _etCopyCurrentTemplate() {
  if (!_etCurrentPreviewTemplate) return;
  _etCopyFromModal(_etCurrentPreviewTemplate.subject || '', _etCurrentPreviewTemplate.body || '');
}

async function _etAICustomize() {
  const t = _etCurrentPreviewTemplate;
  if (!t) return;
  const context = (document.getElementById('et-ai-context')?.value || '').trim();
  if (!context) { showToast('Please describe the company or contact first', 'error'); return; }

  const btn = document.querySelector('button[onclick="_etAICustomize()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Customizing…'; }

  // Extract placeholder names
  const placeholders = [...(t.body || '').matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]);
  const subPlaceholders = [...(t.subject || '').matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1]);
  const allPlaceholders = [...new Set([...subPlaceholders, ...placeholders])];

  const systemPrompt = `You are a search fund entrepreneur assistant. Given a context description and a list of email template placeholders, provide a JSON object with suggested values for each placeholder. Values should be concise, professional, and realistic based on the context. Return ONLY valid JSON with no markdown or explanation.`;

  const userPrompt = `Context: ${context}
Template name: ${t.name}
Placeholders to fill: ${allPlaceholders.map(p => `"{{${p}}}"`).join(', ')}
Return a JSON object like: {"placeholder name": "suggested value", ...}`;

  try {
    const raw = await callAI(systemPrompt, userPrompt, 600, 0.5);
    let vals;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      vals = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch (_) {
      throw new Error('AI returned invalid JSON — try rephrasing the context');
    }

    // Apply values to subject + body
    const applyVals = str => str.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      const val = vals[key] || vals[key.toLowerCase()] || `{{${key}}}`;
      return val;
    });

    const newSubject = applyVals(t.subject || '');
    const newBody    = applyVals(t.body || '');

    // Update the preview display
    const bodyContainer = document.querySelector('[style*="Georgia"]');
    if (bodyContainer) {
      bodyContainer.innerHTML = escapeHtml(newBody).replace(/\n/g, '<br>').replace(
        /\{\{([^}]+)\}\}/g,
        '<mark class="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-0.5 rounded">{{$1}}</mark>'
      );
    }

    // Update subject display
    const subEl = document.querySelector('.text-sm.font-medium.text-surface-800');
    if (subEl) subEl.textContent = newSubject;

    // Store customised version for copy
    _etCurrentPreviewTemplate = { ...t, subject: newSubject, body: newBody };
    showToast('Placeholders filled — review and copy!', 'success');
  } catch (err) {
    showToast('AI customize failed: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Fill Placeholders with AI'; }
  }
}

function _etCopyFromModal(subject, body) {
  const full = subject ? `Subject: ${subject}\n\n${body}` : body;
  navigator.clipboard.writeText(full).then(
    () => { showToast('Template copied! Paste into your email client.', 'success'); closeModal(); },
    () => showToast('Copy failed — please select and copy manually', 'error')
  );
}

/* ─── Copy helpers ───────────────────────────────────────────────────────────── */
function _etCopyTemplate(templateId) {
  const t = BUILTIN_EMAIL_TEMPLATES.find(t => t.id === templateId);
  if (!t) return;
  const full = t.subject ? `Subject: ${t.subject}\n\n${t.body}` : t.body;
  navigator.clipboard.writeText(full).then(
    () => showToast('Template copied to clipboard!', 'success'),
    () => showToast('Copy failed — try Preview → Copy instead', 'error')
  );
}

function _etCopyCustom(templateId) {
  const custom = _etLoadCustom();
  const t = custom.find(t => t.id === templateId);
  if (!t) return;
  const full = t.subject ? `Subject: ${t.subject}\n\n${t.body}` : t.body;
  navigator.clipboard.writeText(full).then(
    () => showToast('Template copied to clipboard!', 'success'),
    () => showToast('Copy failed', 'error')
  );
}

/* ─── Create / Edit custom template ─────────────────────────────────────────── */
function openCreateTemplateModal(existingId = null) {
  _etEditingTemplateId = existingId; // store for safe onclick
  const custom = _etLoadCustom();
  const existing = existingId ? custom.find(t => t.id === existingId) : null;

  openModal(`
    <h3 class="text-base font-semibold mb-4">${existing ? 'Edit Template' : 'Create Template'}</h3>
    <div class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium mb-1">Template Name <span class="text-red-500">*</span></label>
          <input type="text" id="ct-name" class="input-field" placeholder="e.g. My Follow-up #1"
            value="${escapeHtml(existing?.name || '')}"/>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Category</label>
          <input type="text" id="ct-category" class="input-field" placeholder="e.g. Outreach"
            value="${escapeHtml(existing?.category || '')}"/>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Subject Line</label>
        <input type="text" id="ct-subject" class="input-field" placeholder="e.g. Following up on {{Company Name}}"
          value="${escapeHtml(existing?.subject || '')}"/>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Body <span class="text-red-500">*</span></label>
        <textarea id="ct-body" class="input-field font-mono text-xs" rows="10"
          placeholder="Write your template here. Use {{Placeholder}} for parts to customize.">${escapeHtml(existing?.body || '')}</textarea>
        <p class="text-[11px] text-surface-400 mt-1">Tip: use {{Placeholder}} format for parts you'll customize per recipient.</p>
      </div>
    </div>
    <div class="flex justify-end gap-2 mt-5">
      <button onclick="closeModal()" class="btn-secondary">Cancel</button>
      <button onclick="saveCustomTemplate(_etEditingTemplateId)" class="btn-primary">${existing ? 'Save Changes' : 'Save Template'}</button>
    </div>
  `);
}

function saveCustomTemplate(existingId = null) {
  const name    = (document.getElementById('ct-name')?.value || '').trim();
  const category = (document.getElementById('ct-category')?.value || '').trim();
  const subject = (document.getElementById('ct-subject')?.value || '').trim();
  const body    = (document.getElementById('ct-body')?.value || '').trim();

  if (!name) { showToast('Please enter a template name', 'error'); return; }
  if (!body) { showToast('Please enter a body', 'error'); return; }

  const custom = _etLoadCustom();
  if (existingId) {
    const idx = custom.findIndex(t => t.id === existingId);
    if (idx >= 0) {
      custom[idx] = { ...custom[idx], name, category, subject, body, updatedAt: new Date().toISOString() };
    }
  } else {
    custom.push({ id: generateId(), name, category, subject, body, createdAt: new Date().toISOString() });
  }
  _etSaveCustom(custom);
  closeModal();
  showToast('Template saved', 'success');
  renderEmailTemplates(); // re-render page
}

function _etDeleteCustom(templateId) {
  if (!confirm('Delete this template?')) return;
  const custom = _etLoadCustom().filter(t => t.id !== templateId);
  _etSaveCustom(custom);
  showToast('Template deleted', 'success');
  renderEmailTemplates();
}

/* ─── Filter / search / tab helpers ─────────────────────────────────────────── */
function _etSetFilter(filter) {
  _etFilter = filter;
  _etRefreshContent();
}

function _etSetSearch(val) {
  _etSearch = val;
  _etRefreshContent();
}

function _etSwitchTab(tab) {
  _etTab = tab;
  _etFilter = 'all';
  _etSearch = '';
  renderEmailTemplates();
}

function _etRefreshContent() {
  const el = document.getElementById('et-content');
  if (!el) return;
  const custom    = _etLoadCustom();
  const allBuiltIn = BUILTIN_EMAIL_TEMPLATES;
  const categories = [...new Set(allBuiltIn.map(t => t.category))];
  el.innerHTML = _etTab === 'built-in' ? _etBuiltInHtml(allBuiltIn, categories) : _etCustomHtml(custom);
}
