/* ============================================================
   Pulse — Deal Rejection / Pass Reason Log  (Feature 3)
   Lets the searcher capture WHY they passed on a deal via
   typing or voice transcription.  The AI learns from these
   notes across all deals to improve fit recommendations.
   ============================================================ */

let _rejVoiceRecog = null;
let _rejRecording  = false;

async function renderDealRejectionTab(dealId) {
  const deal  = await DB.get(STORES.deals, dealId);
  const notes = await DB.getAll(STORES.dealNotes);
  const rejectionNotes = notes
    .filter(n => n.dealId === dealId && n.userId === currentUser.id && n.type === 'rejection_reason')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return `
    <div class="space-y-6">
      <!-- Input area -->
      <div class="card p-5">
        <h3 class="text-sm font-semibold mb-1">Why would you pass on this deal?</h3>
        <p class="text-xs text-surface-400 mb-3">
          Capture your concerns now — type them or use voice. The AI uses these notes across all
          your passed deals to better understand your criteria and sharpen future recommendations.
        </p>

        <textarea id="rejection-text" rows="4" class="input-field w-full text-sm"
          placeholder="e.g. Customer concentration too high — top 3 customers = 70% of revenue. Owner asking 6.5x but business is declining. Sector too capital-intensive for our fund size…"></textarea>

        <!-- Voice recording -->
        <div class="flex items-center gap-3 mt-3 flex-wrap">
          <button id="rejection-voice-btn" onclick="toggleRejectionVoice()"
                  class="btn-secondary btn-sm flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/>
            </svg>
            <span id="rejection-voice-label">🎙 Speak your reasons</span>
          </button>
          <span id="rejection-voice-status" class="text-xs text-surface-400 hidden">Listening… speak now</span>

          <button onclick="saveRejectionNote('${dealId}')"
                  class="btn-primary btn-sm ml-auto flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"/>
            </svg>
            Save Note
          </button>
        </div>
      </div>

      <!-- Saved notes -->
      ${rejectionNotes.length > 0 ? `
        <div>
          <h3 class="text-sm font-semibold mb-3">Saved Pass Reasons (${rejectionNotes.length})</h3>
          <div class="space-y-3">
            ${rejectionNotes.map(n => `
              <div class="card p-4">
                <div class="flex justify-between items-start gap-2 mb-2">
                  <span class="text-xs text-surface-400">${formatRelative(n.createdAt)}</span>
                  <button onclick="deleteRejectionNote('${n.id}', '${dealId}')"
                          class="text-xs text-surface-400 hover:text-red-500 transition-colors">Delete</button>
                </div>
                <p class="text-sm text-surface-700 dark:text-surface-300 leading-relaxed whitespace-pre-wrap">${escapeHtml(n.content)}</p>
              </div>
            `).join('')}
          </div>
        </div>
      ` : `
        <div class="card p-6 text-center">
          <p class="text-sm text-surface-400">No pass reasons recorded yet. Add your first note above.</p>
        </div>
      `}

      <!-- AI Pattern Insights across all deals -->
      <div class="card p-5">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="text-sm font-semibold">AI: What You Consistently Avoid</h3>
            <p class="text-xs text-surface-400 mt-0.5">Patterns the AI has learned from ALL your rejection notes across every deal</p>
          </div>
          <button onclick="loadRejectionInsights('${dealId}')" id="rejection-insights-btn"
                  class="btn-secondary btn-sm">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
            </svg>
            Analyse Patterns
          </button>
        </div>
        <div id="rejection-insights-area">
          <p class="text-xs text-surface-400 italic">Click "Analyse Patterns" to see what the AI has learned from your pass reasons across all deals.</p>
        </div>
      </div>
    </div>
  `;
}

async function saveRejectionNote(dealId) {
  const textarea = document.getElementById('rejection-text');
  const content  = textarea?.value?.trim();
  if (!content) { showToast('Please enter a reason before saving', 'error'); return; }

  await DB.add(STORES.dealNotes, {
    id:        generateId(),
    dealId,
    userId:    currentUser.id,
    type:      'rejection_reason',
    content,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  showToast('Pass reason saved', 'success');
  switchDealTab('rejection');
}

async function deleteRejectionNote(noteId, dealId) {
  await DB.delete(STORES.dealNotes, noteId);
  showToast('Note deleted', 'info');
  switchDealTab('rejection');
}

function toggleRejectionVoice() {
  if (_rejRecording) {
    _stopRejectionVoice();
  } else {
    _startRejectionVoice();
  }
}

function _startRejectionVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { showToast('Voice input not supported in this browser', 'error'); return; }

  _rejVoiceRecog = new SpeechRecognition();
  _rejVoiceRecog.continuous     = true;
  _rejVoiceRecog.interimResults = true;
  _rejVoiceRecog.lang           = 'en-US';

  const textarea  = document.getElementById('rejection-text');
  const statusEl  = document.getElementById('rejection-voice-status');
  const labelEl   = document.getElementById('rejection-voice-label');
  const btn       = document.getElementById('rejection-voice-btn');
  let   finalText = textarea?.value || '';

  _rejVoiceRecog.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += (finalText ? ' ' : '') + e.results[i][0].transcript;
      else interim = e.results[i][0].transcript;
    }
    if (textarea) textarea.value = finalText + (interim ? ' ' + interim : '');
  };

  _rejVoiceRecog.onerror = () => _stopRejectionVoice();
  _rejVoiceRecog.onend   = () => _stopRejectionVoice();

  _rejVoiceRecog.start();
  _rejRecording = true;

  if (statusEl) statusEl.classList.remove('hidden');
  if (labelEl)  labelEl.textContent = '⏹ Stop recording';
  if (btn)      btn.classList.add('border-red-400', 'text-red-500');
}

function _stopRejectionVoice() {
  if (_rejVoiceRecog) { _rejVoiceRecog.stop(); _rejVoiceRecog = null; }
  _rejRecording = false;
  const statusEl = document.getElementById('rejection-voice-status');
  const labelEl  = document.getElementById('rejection-voice-label');
  const btn      = document.getElementById('rejection-voice-btn');
  if (statusEl) statusEl.classList.add('hidden');
  if (labelEl)  labelEl.textContent = '🎙 Speak your reasons';
  if (btn)      btn.classList.remove('border-red-400', 'text-red-500');
}

async function loadRejectionInsights(currentDealId) {
  const btn  = document.getElementById('rejection-insights-btn');
  const area = document.getElementById('rejection-insights-area');
  if (!area) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Analysing…'; }

  area.innerHTML = `<div class="flex items-center gap-2 py-2">
    <svg class="animate-spin w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
    <span class="text-xs text-surface-500">Reading all your pass reasons across the pipeline…</span>
  </div>`;

  try {
    // Gather all rejection notes across ALL deals for this user
    const allNotes = await DB.getAll(STORES.dealNotes);
    const allDeals = await DB.getAll(STORES.deals);
    const myNotes  = allNotes.filter(n => n.userId === currentUser.id && n.type === 'rejection_reason');

    if (myNotes.length < 2) {
      area.innerHTML = `<p class="text-xs text-surface-400 italic">Add pass reasons on at least 2 deals for the AI to identify patterns.</p>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Analyse Patterns'; }
      return;
    }

    const dealMap = {};
    allDeals.forEach(d => { dealMap[d.id] = d; });

    const corpus = myNotes.map(n => {
      const d = dealMap[n.dealId];
      return `Deal: "${d?.name || 'Unknown'}" (${d?.sector || '?'}, ${d?.stage || '?'})\nReason: ${n.content}`;
    }).join('\n\n---\n\n');

    const currentDeal = allDeals.find(d => d.id === currentDealId);

    const insight = await callAI(
      `You are a search fund advisor analysing a searcher's pattern of passed deals.
Read ALL the pass reasons and extract clear, actionable investment criteria they consistently apply.
Then assess whether the CURRENT DEAL triggers any of those same concerns.
Be direct and specific.`,
      `Here are all the pass reasons recorded across ${myNotes.length} deals:\n\n${corpus}\n\n---\n\nCURRENT DEAL: "${currentDeal?.name}" — ${currentDeal?.sector || 'sector unknown'}, Revenue: ${currentDeal?.revenue ? '$' + currentDeal.revenue.toLocaleString() : 'unknown'}, Stage: ${currentDeal?.stage}\n\nProvide:\n1. **Your Consistent Red Flags** (3-5 bullet points on what you systematically avoid)\n2. **Fit for This Deal** (does this deal show any of those red flags? Be honest)`,
      700, 0.3
    );

    area.innerHTML = `<div class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">${markdownToHtml(insight)}</div>`;
  } catch (err) {
    area.innerHTML = `<p class="text-xs text-red-500">${escapeHtml(err.message)}</p>`;
  }

  if (btn) { btn.disabled = false; btn.innerHTML = `<svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg> Re-analyse`; }
}

// Simple markdown → HTML for the insights panel
function markdownToHtml(md) {
  return md
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<p class="font-semibold mt-3 mb-1">$1</p>')
    .replace(/^[-*]\s+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[pli])(.+)$/gm, '$1');
}
