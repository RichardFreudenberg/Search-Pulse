/* ============================================
   Nexus CRM — Sourcing Page
   ============================================ */

/* ─── renderSourcing ────────────────────────────────────────────────────────── */
async function renderSourcing() {
  const container = document.getElementById('page-content');
  if (!container) return;

  container.innerHTML = `
    ${renderPageHeader('Sourcing', 'Find and pursue acquisition targets')}

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- LEFT COLUMN: 2/3 width -->
      <div class="lg:col-span-2 space-y-6">

        <!-- Outreach Letter Writer -->
        <div class="card">
          <div class="mb-4">
            <h2 class="text-base font-semibold">Outreach Letter Writer</h2>
            <p class="text-sm text-surface-500 mt-0.5">AI-generated personalized acquisition inquiry letter</p>
          </div>

          <div class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Target Company Name</label>
                <input
                  id="sl-company-name"
                  type="text"
                  class="input-field"
                  placeholder="Acme Plumbing Services"
                />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Industry / Sector</label>
                <input
                  id="sl-sector"
                  type="text"
                  class="input-field"
                  placeholder="HVAC, Software, Healthcare…"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Company Size</label>
                <select id="sl-company-size" class="input-field">
                  <option value="Under $1M revenue">Under $1M revenue</option>
                  <option value="$1M-$5M" selected>$1M–$5M revenue</option>
                  <option value="$5M-$10M">$5M–$10M revenue</option>
                  <option value="$10M-$25M">$10M–$25M revenue</option>
                  <option value="$25M+">$25M+ revenue</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Reason Owner Might Sell</label>
                <select id="sl-sell-reason" class="input-field">
                  <option value="Retirement">Retirement</option>
                  <option value="No succession plan">No succession plan</option>
                  <option value="Owner burnout">Owner burnout</option>
                  <option value="Growth capital needed">Growth capital needed</option>
                  <option value="Personal circumstances">Personal circumstances</option>
                  <option value="Unknown" selected>Unknown</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium mb-1">Your Background</label>
              <textarea
                id="sl-background"
                class="input-field"
                rows="2"
                placeholder="e.g. HBS MBA, 5 years in operations, looking to acquire and operate in the Northeast…"
              ></textarea>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1">Tone</label>
                <select id="sl-tone" class="input-field">
                  <option value="Warm and personal">Warm &amp; personal</option>
                  <option value="Professional and direct">Professional &amp; direct</option>
                  <option value="Formal">Formal</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Referral / Connection <span class="text-surface-400 font-normal">(optional)</span></label>
                <input
                  id="sl-referral"
                  type="text"
                  class="input-field"
                  placeholder="e.g. referred by John Smith, met at industry conference…"
                />
              </div>
            </div>

            <div class="flex justify-end pt-1">
              <button
                id="sl-generate-btn"
                onclick="generateOutreachLetter()"
                class="btn-primary">
                Generate Letter
              </button>
            </div>
          </div>

          <!-- Letter output — hidden until generation -->
          <div id="sourcing-letter-output" class="hidden mt-6 border-t border-surface-200 dark:border-surface-700 pt-5">
          </div>
        </div>

        <!-- Saved Campaigns -->
        <div id="sourcing-campaigns-section">
          <!-- Populated by renderCampaignsList() -->
        </div>

      </div><!-- /LEFT COLUMN -->

      <!-- RIGHT COLUMN: 1/3 width -->
      <div class="space-y-6">
        <div class="card">
          <h2 class="text-base font-semibold mb-3">Tips &amp; Strategies</h2>
          <ul class="space-y-3">
            ${[
              { icon: '✉️', text: 'Be personal: reference something specific about their business' },
              { icon: '🙌', text: "Lead with respect: acknowledge their life's work" },
              { icon: '🎯', text: 'Be clear: state your intentions up front' },
              { icon: '📞', text: 'Make it easy: offer a no-pressure call' },
              { icon: '🔄', text: 'Follow up: 80% of deals come from persistence' },
            ].map(t => `
              <li class="flex items-start gap-2.5 text-sm text-surface-600 dark:text-surface-400">
                <span class="shrink-0 mt-0.5">${t.icon}</span>
                <span>${escapeHtml(t.text)}</span>
              </li>
            `).join('')}
          </ul>
        </div>

        <div class="card bg-brand-50 dark:bg-brand-900/10 border border-brand-100 dark:border-brand-800/30">
          <h3 class="text-sm font-semibold text-brand-700 dark:text-brand-400 mb-2">What makes a great search?</h3>
          <p class="text-xs text-surface-600 dark:text-surface-400 leading-relaxed">
            The best acquisition prospects are businesses with steady cash flow, an owner who is ready to transition,
            and no obvious successor. Think service businesses, niche B2B, recurring revenue.
          </p>
        </div>
      </div><!-- /RIGHT COLUMN -->

    </div>
  `;

  // Load campaigns into the section
  await renderCampaignsList();
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
  if (btn) {
    btn.disabled    = true;
    btn.textContent = 'Generating…';
  }

  const outputArea = document.getElementById('sourcing-letter-output');
  if (outputArea) {
    outputArea.classList.remove('hidden');
    outputArea.innerHTML = `
      <div class="flex items-center gap-3 py-4 text-surface-500">
        <div class="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full shrink-0"></div>
        <span class="text-sm">Writing your letter…</span>
      </div>
    `;
  }

  let userPrompt = `Write an acquisition inquiry letter with the following details:\n\n`;
  if (companyName)  userPrompt += `Target Company: ${companyName}\n`;
  if (sector)       userPrompt += `Industry/Sector: ${sector}\n`;
  if (companySize)  userPrompt += `Company Size: ${companySize}\n`;
  if (sellReason)   userPrompt += `Reason Owner Might Sell: ${sellReason}\n`;
  if (background)   userPrompt += `My Background: ${background}\n`;
  if (tone)         userPrompt += `Tone: ${tone}\n`;
  if (referral)     userPrompt += `Referral/Connection: ${referral}\n`;

  const systemPrompt =
    'You are an expert acquisition entrepreneur coach helping a Search Fund entrepreneur write a first-touch ' +
    'acquisition inquiry letter. The letter should be warm, genuine, respectful of the owner\'s life work, and ' +
    'clearly state the searcher\'s intent to acquire and operate the business. Do NOT use corporate buzzwords. ' +
    'Write in first person. Max 350 words. Do not include [placeholder] brackets in the output — use realistic ' +
    'placeholder names only where absolutely necessary and note them with (customize this).';

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
        </div>
      `;
    }
    showToast('Generation failed: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled    = false;
      btn.textContent = 'Generate Letter';
    }
  }
}

/* ─── Helper: letter output HTML ───────────────────────────────────────────── */
function _sourcingLetterOutputHtml(letterText, companyName, sector) {
  const escaped = escapeHtml(letterText).replace(/\n/g, '<br>');
  return `
    <div>
      <h3 class="text-sm font-semibold mb-3 text-surface-700 dark:text-surface-300">Generated Letter</h3>
      <div
        class="bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl p-4 text-sm leading-relaxed text-surface-800 dark:text-surface-200 whitespace-pre-wrap mb-4"
        style="font-family: Georgia, 'Times New Roman', serif;"
      >${escaped}</div>
      <div class="flex flex-wrap gap-2">
        <button
          class="btn-secondary text-sm"
          onclick="_sourcingCopyLetter(${JSON.stringify(letterText)})">
          Copy Letter
        </button>
        <button
          class="btn-secondary text-sm"
          onclick="generateOutreachLetter()">
          Regenerate
        </button>
        <button
          class="btn-primary text-sm"
          onclick="_sourcingSaveCampaign(${JSON.stringify(letterText)}, ${JSON.stringify(companyName)}, ${JSON.stringify(sector)})">
          Save Campaign
        </button>
      </div>
    </div>
  `;
}

/* ─── Helper: copy letter ───────────────────────────────────────────────────── */
function _sourcingCopyLetter(text) {
  navigator.clipboard.writeText(text).then(
    () => showToast('Letter copied to clipboard', 'success'),
    () => showToast('Could not copy — please select and copy manually', 'error')
  );
}

/* ─── saveCampaign ──────────────────────────────────────────────────────────── */
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
      createdAt: new Date().toISOString(),
    });
    showToast('Campaign saved', 'success');
    await renderCampaignsList();
  } catch (err) {
    showToast('Failed to save campaign: ' + err.message, 'error');
  }
}

/* ─── renderCampaignsList ───────────────────────────────────────────────────── */
async function renderCampaignsList() {
  const section = document.getElementById('sourcing-campaigns-section');
  if (!section) return;

  let campaigns = [];
  try {
    const all = await DB.getForUser(STORES.sourcingCampaigns, currentUser.id);
    campaigns = (all || []).sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  } catch (_err) {
    campaigns = [];
  }

  if (campaigns.length === 0) {
    section.innerHTML = `
      <div class="card">
        <h2 class="text-base font-semibold mb-3">Saved Campaigns</h2>
        <div class="empty-state py-8">
          <svg class="w-10 h-10 mx-auto text-surface-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <p class="text-sm text-surface-500">No saved campaigns yet.</p>
          <p class="text-xs text-surface-400 mt-1">Generate a letter above and click "Save Campaign" to get started.</p>
        </div>
      </div>
    `;
    return;
  }

  const statusColors = {
    draft:   'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
    sent:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    replied: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };

  const cards = campaigns.map(c => {
    const statusClass = statusColors[c.status] || statusColors.draft;
    const date = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const preview = (c.letterText || '').slice(0, 120).replace(/\n/g, ' ');

    return `
      <div class="card border border-surface-200 dark:border-surface-700" id="campaign-${escapeHtml(c.id)}">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="min-w-0">
            <h3 class="text-sm font-semibold truncate">${escapeHtml(c.companyName || 'Unnamed Company')}</h3>
            ${c.sector ? `<p class="text-xs text-surface-500 truncate">${escapeHtml(c.sector)}</p>` : ''}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="badge ${statusClass}">${escapeHtml(c.status || 'draft')}</span>
          </div>
        </div>
        ${preview ? `<p class="text-xs text-surface-500 line-clamp-2 mb-3">${escapeHtml(preview)}${c.letterText && c.letterText.length > 120 ? '…' : ''}</p>` : ''}
        <div class="flex items-center justify-between">
          <span class="text-xs text-surface-400">${date}</span>
          <div class="flex gap-2">
            <button
              class="btn-secondary text-xs py-1 px-2"
              onclick="_sourcingCopyLetter(${JSON.stringify(c.letterText || '')})">
              Copy Letter
            </button>
            <button
              class="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 px-1"
              onclick="_sourcingDeleteCampaign(${JSON.stringify(c.id)})">
              Delete
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  section.innerHTML = `
    <div class="card">
      <h2 class="text-base font-semibold mb-4">Saved Campaigns <span class="text-surface-400 font-normal text-sm">(${campaigns.length})</span></h2>
      <div class="space-y-3">
        ${cards}
      </div>
    </div>
  `;
}

/* ─── Delete a campaign ─────────────────────────────────────────────────────── */
async function _sourcingDeleteCampaign(campaignId) {
  if (!confirm('Delete this campaign?')) return;
  try {
    await DB.delete(STORES.sourcingCampaigns, campaignId);
    showToast('Campaign deleted', 'success');
    await renderCampaignsList();
  } catch (err) {
    showToast('Could not delete campaign: ' + err.message, 'error');
  }
}
