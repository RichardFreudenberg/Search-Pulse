/* ============================================
   Nexus CRM — Native Meeting Recorder
   v1 — Web Speech API + MediaRecorder + Whisper fallback + AI summary
   ============================================ */

// ── State constants ──────────────────────────────────────────────
const MR_STATE = {
  IDLE:         'idle',
  REQUESTING:   'requesting',
  RECORDING:    'recording',
  PAUSED:       'paused',
  STOPPING:     'stopping',
  TRANSCRIBING: 'transcribing',
  PROCESSING:   'processing',
  REVIEW:       'review',
  ERROR:        'error',
};

// ── Module state ─────────────────────────────────────────────────
let _mrState        = MR_STATE.IDLE;
let _mrSession      = null;   // current MeetingSession object
let _mrRecognition  = null;   // SpeechRecognition instance
let _mrMediaRec     = null;   // MediaRecorder instance
let _mrStream       = null;   // MediaStream
let _mrAudioChunks  = [];     // audio blobs for Whisper fallback
let _mrSegments     = [];     // [{id, startMs, endMs, text, isFinal, confidence}]
let _mrSegCounter   = 0;
let _mrLiveText     = '';     // current interim transcript text
let _mrStartTime    = null;   // Date when recording began
let _mrPausedMs     = 0;      // total ms spent paused
let _mrPauseStart   = null;   // Date when last pause began
let _mrTimerInterval= null;
let _mrAutosaveTimer= null;
let _mrDealId       = null;   // optional deal to link to
let _mrContactIds   = [];
let _mrSelectedDeviceId = localStorage.getItem('pulse_mr_device_id') || ''; // persisted mic choice
let _mrLanguage     = localStorage.getItem('pulse_mr_lang') || 'en-US';   // persisted language
let _mrContextInfo  = ''; // contact/company/deal names injected into transcript AI
let _mrMinimized    = false; // floating panel collapsed state

// Supported recognition languages
const MR_LANGUAGES = [
  { code: 'en-US', label: 'English (US)',  flag: '🇺🇸' },
  { code: 'en-GB', label: 'English (UK)',  flag: '🇬🇧' },
  { code: 'de-DE', label: 'Deutsch (DE)',  flag: '🇩🇪' },
  { code: 'de-AT', label: 'Deutsch (AT)',  flag: '🇦🇹' },
  { code: 'de-CH', label: 'Deutsch (CH)',  flag: '🇨🇭' },
];

// ── Open recorder modal ──────────────────────────────────────────

async function openMeetingRecorder(options = {}) {
  _mrDealId     = options.dealId     || null;
  _mrContactIds = options.contactIds || [];

  // Pre-fetch deals & contacts for the link pickers
  const [deals, contacts] = await Promise.all([
    DB.getForUser(STORES.deals,    currentUser.id),
    DB.getForUser(STORES.contacts, currentUser.id),
  ]);
  const activeDeals    = deals.filter(d => d.status !== 'archived');
  const activeContacts = getActiveContacts ? getActiveContacts(contacts) : contacts.filter(c => !c.archived);

  // Build context string for transcript AI (contact/company/deal names help Whisper & correction)
  const preContact = activeContacts.find(c => _mrContactIds.includes(c.id));
  const preDeal    = activeDeals.find(d => d.id === _mrDealId);
  _mrContextInfo = [
    preContact ? preContact.fullName : '',
    preContact?.company || '',
    preDeal ? preDeal.name : '',
  ].filter(Boolean).join(', ');

  // Inject recorder UI into the floating panel body
  const panelBody = document.getElementById('mr-panel-body');
  if (panelBody) panelBody.innerHTML = _mrBuildRecorderHtml(activeDeals, activeContacts, options);

  _mrShowPanel();
  _mrInitDrag();
  _mrRenderState();

  // Populate microphone picker after panel renders
  setTimeout(() => _mrPopulateDevicePicker(activeContacts, activeDeals), 150);
}

function _mrBuildRecorderHtml(deals, contacts, options) {
  const dealOptions = deals.map(d =>
    `<option value="${d.id}" ${_mrDealId === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`
  ).join('');

  const contactOptions = contacts.map(c =>
    `<option value="${c.id}">${escapeHtml(c.fullName)}</option>`
  ).join('');

  // Note: the drag handle (with mr-rec-dot, mr-state-badge, mr-timer, mr-speech-badge)
  // lives permanently in index.html — only the body content is injected here.
  return `
<div class="p-4 flex flex-col gap-3">
  <!-- Settings row -->
  <div id="mr-settings-row" class="flex flex-wrap gap-2">
    <div class="flex-1 min-w-[140px]">
      <label class="label">Meeting Title</label>
      <input id="mr-title" type="text" class="input" placeholder="e.g. Intro call with CEO" value="${escapeHtml(options.title || '')}">
    </div>
    <div class="w-36">
      <label class="label">Link to Deal</label>
      <select id="mr-deal-id" class="input">
        <option value="">— None —</option>
        ${dealOptions}
      </select>
    </div>
    <div class="w-36">
      <label class="label">Contact</label>
      <select id="mr-contact-id" class="input">
        <option value="">— None —</option>
        ${contactOptions}
      </select>
    </div>
    <div class="w-36 flex-shrink-0">
      <label class="label">Language</label>
      <select id="mr-language" class="input" onchange="_mrSetLanguage(this.value)">
        ${MR_LANGUAGES.map(l => `<option value="${l.code}" ${_mrLanguage === l.code ? 'selected' : ''}>${l.flag} ${l.label}</option>`).join('')}
      </select>
    </div>
  </div>

  <!-- Main panel: transcript | notes -->
  <div class="flex gap-3" style="min-height:190px;">
    <!-- Left: live transcript -->
    <div class="flex-1 flex flex-col min-w-0">
      <p class="text-xs font-medium text-surface-500 uppercase tracking-wide mb-1.5">Live Transcript</p>
      <div id="mr-transcript-body" class="flex-1 overflow-y-auto rounded border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-3 text-sm space-y-2" style="height:190px;">
        <p id="mr-transcript-placeholder" class="text-surface-400 italic text-center mt-6">Start recording to see live transcript…</p>
        <div id="mr-transcript-lines"></div>
        <p id="mr-live-text" class="text-surface-400 italic"></p>
      </div>
    </div>

    <!-- Right: user notes -->
    <div style="width:160px;" class="flex flex-col flex-shrink-0">
      <div class="flex items-center justify-between mb-1.5">
        <p class="text-xs font-medium text-surface-500 uppercase tracking-wide">Notes</p>
        <div class="flex gap-0.5">
          ${['!','?','→','⚠'].map(t => `<button onclick="mrInsertTag('${t}')" class="text-xs px-1 py-0.5 rounded bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-500">${t}</button>`).join('')}
        </div>
      </div>
      <textarea id="mr-notes" class="flex-1 input resize-none text-sm" style="height:190px;" placeholder="Quick notes…"></textarea>
    </div>
  </div>

  <!-- Error / status message -->
  <div id="mr-error-msg" class="hidden p-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"></div>

  <!-- Controls -->
  <div id="mr-controls" class="flex items-center justify-between">
    <div class="flex gap-2" id="mr-action-btns">
      <button id="mr-btn-start" onclick="mrStart()" class="btn-primary flex items-center gap-2">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>
        Start Recording
      </button>
      <button id="mr-btn-pause" onclick="mrPause()" class="btn-secondary hidden">Pause</button>
      <button id="mr-btn-resume" onclick="mrResume()" class="btn-secondary hidden">Resume</button>
      <button id="mr-btn-stop" onclick="mrStop()" class="hidden px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-medium">Stop & Process</button>
    </div>
    <button onclick="mrDiscardAndClose()" class="btn-ghost text-surface-500 text-sm">Discard</button>
  </div>
</div>`;
}

// ── Microphone device picker ──────────────────────────────────────

async function _mrPopulateDevicePicker(contacts, deals) {
  const settingsRow = document.getElementById('mr-settings-row');
  if (!settingsRow) return;
  let devices = [];
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    devices = all.filter(d => d.kind === 'audioinput');
  } catch (_) { return; }
  if (devices.length <= 1) return; // no need for picker when only default exists

  const wrap = document.createElement('div');
  wrap.className = 'w-52 flex-shrink-0';
  wrap.innerHTML = `
    <label class="label flex items-center gap-1">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z"/></svg>
      Microphone
    </label>
    <select id="mr-mic-select" class="input" onchange="_mrSelectDevice(this.value)">
      ${devices.map(d => `<option value="${escapeHtml(d.deviceId)}" ${d.deviceId === _mrSelectedDeviceId ? 'selected' : ''}>${escapeHtml(d.label || 'Microphone')}</option>`).join('')}
    </select>`;
  settingsRow.appendChild(wrap);
}

function _mrSelectDevice(deviceId) {
  _mrSelectedDeviceId = deviceId;
  localStorage.setItem('pulse_mr_device_id', deviceId);
}

function _mrSetLanguage(code) {
  _mrLanguage = code;
  localStorage.setItem('pulse_mr_lang', code);
  // If recognition is already running, restart it with the new language
  if (_mrRecognition && _mrState === MR_STATE.RECORDING) {
    try { _mrRecognition.stop(); } catch (_) {}
    setTimeout(() => _mrStartSpeechRecognition(), 200);
  }
}

// ── State rendering ──────────────────────────────────────────────

function _mrRenderState() {
  const dot    = document.getElementById('mr-rec-dot');
  const badge  = document.getElementById('mr-state-badge');
  const sbadge = document.getElementById('mr-speech-badge');
  const btnStart  = document.getElementById('mr-btn-start');
  const btnPause  = document.getElementById('mr-btn-pause');
  const btnResume = document.getElementById('mr-btn-resume');
  const btnStop   = document.getElementById('mr-btn-stop');
  const settRow   = document.getElementById('mr-settings-row');

  // Only render if the floating panel is currently visible
  const _mrPanel = document.getElementById('mr-floating-panel');
  if (!_mrPanel || _mrPanel.style.display === 'none') return;

  // Badge text
  const labels = {
    [MR_STATE.IDLE]:         'Ready',
    [MR_STATE.REQUESTING]:   'Requesting mic…',
    [MR_STATE.RECORDING]:    'Recording',
    [MR_STATE.PAUSED]:       'Paused',
    [MR_STATE.STOPPING]:     'Stopping…',
    [MR_STATE.TRANSCRIBING]: 'Transcribing…',
    [MR_STATE.PROCESSING]:   'Processing AI…',
    [MR_STATE.REVIEW]:       'Review',
    [MR_STATE.ERROR]:        'Error',
  };
  badge.textContent = labels[_mrState] || _mrState;

  // Dot color
  const dotColors = {
    [MR_STATE.RECORDING]:    '#ef4444',
    [MR_STATE.PAUSED]:       '#f59e0b',
    [MR_STATE.TRANSCRIBING]: '#3b82f6',
    [MR_STATE.PROCESSING]:   '#8b5cf6',
    [MR_STATE.ERROR]:        '#ef4444',
  };
  if (dot) dot.style.background = dotColors[_mrState] || '#6b7280';
  if (dot && _mrState === MR_STATE.RECORDING) dot.style.animation = 'pulseSoft 1s ease-in-out infinite';
  else if (dot) dot.style.animation = '';

  // Live badge
  if (sbadge) sbadge.classList.toggle('hidden', _mrState !== MR_STATE.RECORDING);

  // Buttons
  if (btnStart)  btnStart.classList.toggle('hidden',  _mrState !== MR_STATE.IDLE && _mrState !== MR_STATE.ERROR);
  if (btnPause)  btnPause.classList.toggle('hidden',  _mrState !== MR_STATE.RECORDING);
  if (btnResume) btnResume.classList.toggle('hidden', _mrState !== MR_STATE.PAUSED);
  if (btnStop)   btnStop.classList.toggle('hidden',   _mrState !== MR_STATE.RECORDING && _mrState !== MR_STATE.PAUSED);

  // Disable settings while recording
  if (settRow) {
    const lock = _mrState !== MR_STATE.IDLE && _mrState !== MR_STATE.ERROR;
    settRow.querySelectorAll('input,select').forEach(el => el.disabled = lock);
  }

  // Spinner overlay for processing states
  _mrShowProcessingOverlay(
    _mrState === MR_STATE.STOPPING ||
    _mrState === MR_STATE.TRANSCRIBING ||
    _mrState === MR_STATE.PROCESSING
  );
}

function _mrShowProcessingOverlay(show) {
  let overlay = document.getElementById('mr-processing-overlay');
  if (show && !overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mr-processing-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.4);z-index:10;display:flex;align-items:center;justify-content:center;border-radius:0.5rem;';
    overlay.innerHTML = `<div class="text-center text-white">
      <div class="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-3"></div>
      <p id="mr-processing-msg" class="text-sm font-medium">${
        _mrState === MR_STATE.TRANSCRIBING ? 'Transcribing audio…' : 'Generating AI summary…'
      }</p>
    </div>`;
    const modalContent = document.getElementById('mr-panel-body') || document.getElementById('modal-content');
    if (modalContent) { modalContent.style.position = 'relative'; modalContent.appendChild(overlay); }
  } else if (!show && overlay) {
    overlay.remove();
  }
}

// ── Timer ────────────────────────────────────────────────────────

function _mrStartTimer() {
  _mrTimerInterval = setInterval(() => {
    const timerEl = document.getElementById('mr-timer');
    if (!timerEl) { clearInterval(_mrTimerInterval); return; }
    const elapsed = _mrGetElapsedMs();
    const secs  = Math.floor(elapsed / 1000);
    const mm    = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss    = String(secs % 60).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;
  }, 500);
}

function _mrStopTimer() {
  if (_mrTimerInterval) { clearInterval(_mrTimerInterval); _mrTimerInterval = null; }
}

function _mrGetElapsedMs() {
  if (!_mrStartTime) return 0;
  const now = Date.now();
  const paused = _mrPauseStart ? (now - _mrPauseStart.getTime()) : 0;
  return now - _mrStartTime.getTime() - _mrPausedMs - paused;
}

// ── Autosave ─────────────────────────────────────────────────────

function _mrStartAutosave() {
  _mrAutosaveTimer = setInterval(() => {
    if (_mrSession) _mrAutosave();
  }, 30000); // every 30s
}

async function _mrAutosave() {
  if (!_mrSession) return;
  try {
    _mrSession.userNotes         = (document.getElementById('mr-notes') || {}).value || _mrSession.userNotes || '';
    _mrSession.rawTranscript     = _mrGetFullTranscript();
    _mrSession.transcriptSegments= _mrSegments.slice();
    _mrSession.updatedAt         = new Date().toISOString();
    await DB.put(STORES.meetingSessions, _mrSession);
  } catch (_) {}
}

// ── Start recording ──────────────────────────────────────────────

async function mrStart() {
  _mrSetState(MR_STATE.REQUESTING);

  try {
    // Use the user's chosen device with high-quality audio constraints
    // echoCancellation + noiseSuppression help capture clear audio through headphones
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 48000 },
      channelCount: 1,
    };
    if (_mrSelectedDeviceId) audioConstraints.deviceId = { exact: _mrSelectedDeviceId };
    _mrStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
  } catch (err) {
    // If exact device failed (e.g. headphones unplugged), fall back to default
    try {
      _mrStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (err2) {
      _mrSetError(`Microphone access denied: ${err2.message}. Please allow microphone access in your browser.`);
      return;
    }
  }

  // Initialise session
  const title   = (document.getElementById('mr-title')     || {}).value?.trim() || 'Untitled Meeting';
  const dealId  = (document.getElementById('mr-deal-id')   || {}).value || _mrDealId || null;
  const contactId = (document.getElementById('mr-contact-id') || {}).value || null;

  // Update context string with current form selections (used by Whisper prompt + AI correction)
  if (!_mrContextInfo && (title || contactId || dealId)) {
    _mrContextInfo = [title !== 'Untitled Meeting' ? title : '', contactId ? 'Search fund investor call' : ''].filter(Boolean).join(' — ');
  }

  _mrSegments    = [];
  _mrSegCounter  = 0;
  _mrAudioChunks = [];
  _mrLiveText    = '';
  _mrStartTime   = new Date();
  _mrPausedMs    = 0;
  _mrPauseStart  = null;

  _mrSession = {
    id: generateId(),
    userId: currentUser.id,
    title,
    date: _mrStartTime.toISOString(),
    duration: 0,
    status: 'recording',
    language: _mrLanguage,
    dealId,
    contactIds: contactId ? [contactId] : _mrContactIds,
    rawTranscript: '',
    transcriptSegments: [],
    userNotes: '',
    aiSummary: null,
    aiStructuredNote: null,
    finalNote: '',
    callId: null,
    processedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await DB.add(STORES.meetingSessions, _mrSession);
  } catch (_) {}

  // Clear placeholder
  const ph = document.getElementById('mr-transcript-placeholder');
  if (ph) ph.remove();

  // Start MediaRecorder for audio backup (Whisper fallback)
  try {
    _mrMediaRec = new MediaRecorder(_mrStream);
    _mrMediaRec.ondataavailable = e => { if (e.data.size > 0) _mrAudioChunks.push(e.data); };
    _mrMediaRec.start(5000); // collect in 5s chunks
  } catch (_) {
    // MediaRecorder not available — that's OK, we'll rely on SpeechRecognition
  }

  // Start Web Speech API live transcription
  _mrStartSpeechRecognition();

  _mrSetState(MR_STATE.RECORDING);
  _mrStartTimer();
  _mrStartAutosave();
}

// ── Speech Recognition ───────────────────────────────────────────

function _mrStartSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return; // fallback to Whisper only

  _mrRecognition = new SR();
  _mrRecognition.continuous      = true;
  _mrRecognition.interimResults  = true;
  _mrRecognition.maxAlternatives = 3; // request multiple alternatives so we can pick the best
  _mrRecognition.lang            = _mrLanguage;

  _mrRecognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        // Pick the alternative with the highest confidence score
        let bestText = result[0].transcript;
        let bestConf = result[0].confidence || 0;
        for (let a = 1; a < result.length; a++) {
          if ((result[a].confidence || 0) > bestConf) {
            bestConf = result[a].confidence;
            bestText = result[a].transcript;
          }
        }
        const text = bestText.trim();
        if (text) {
          _mrAppendSegment(text, true, bestConf);
          _mrRenderLiveText('');
        }
      } else {
        interim += result[0].transcript;
      }
    }
    if (interim) _mrRenderLiveText(interim);
  };

  _mrRecognition.onerror = (event) => {
    if (event.error === 'no-speech') return; // benign — silence during the call
    if (event.error === 'not-allowed') {
      _mrSetError('Microphone access was revoked. Please reload and allow microphone access.');
      return;
    }
    if (event.error === 'audio-capture') {
      // Device disconnected mid-recording — try to recover
      if (_mrState === MR_STATE.RECORDING) {
        setTimeout(() => { try { _mrRecognition.start(); } catch(_) {} }, 500);
      }
      return;
    }
    // Other errors: try restarting
    if (_mrState === MR_STATE.RECORDING) {
      setTimeout(() => { try { _mrRecognition.start(); } catch(_) {} }, 200);
    }
  };

  _mrRecognition.onend = () => {
    // Browser auto-stops after ~60s of continuous mode — restart if still recording
    if (_mrState === MR_STATE.RECORDING) {
      setTimeout(() => { try { _mrRecognition.start(); } catch(_) {} }, 100);
    }
  };

  try { _mrRecognition.start(); } catch (_) {}
}

function _mrAppendSegment(text, isFinal, confidence = 1) {
  const startMs = _mrGetElapsedMs();
  const seg = {
    id: ++_mrSegCounter,
    startMs,
    endMs: startMs,
    text,
    isFinal,
    confidence,
  };
  _mrSegments.push(seg);
  _mrRenderTranscriptLine(seg);
}

function _mrRenderTranscriptLine(seg) {
  const container = document.getElementById('mr-transcript-lines');
  if (!container) return;
  const ms  = seg.startMs;
  const mm  = String(Math.floor(ms / 60000)).padStart(2, '0');
  const ss  = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const div = document.createElement('div');
  div.id = `mr-seg-${seg.id}`;
  div.className = 'text-sm leading-relaxed';
  div.innerHTML = `<span class="text-xs text-surface-400 font-mono mr-2">${mm}:${ss}</span><span>${escapeHtml(seg.text)}</span>`;
  container.appendChild(div);
  // Auto-scroll
  const body = document.getElementById('mr-transcript-body');
  if (body) body.scrollTop = body.scrollHeight;
}

function _mrRenderLiveText(text) {
  const el = document.getElementById('mr-live-text');
  if (!el) return;
  el.textContent = text;
  el.className = text ? 'text-sm text-surface-400 italic' : '';
}

function _mrGetFullTranscript() {
  return _mrSegments.filter(s => s.isFinal).map(s => s.text).join(' ');
}

// ── Pause / Resume ───────────────────────────────────────────────

function mrPause() {
  if (_mrState !== MR_STATE.RECORDING) return;
  _mrPauseStart = new Date();
  if (_mrRecognition) try { _mrRecognition.stop(); } catch (_) {}
  if (_mrMediaRec && _mrMediaRec.state === 'recording') _mrMediaRec.pause();
  _mrStopTimer();
  _mrSetState(MR_STATE.PAUSED);
}

function mrResume() {
  if (_mrState !== MR_STATE.PAUSED) return;
  if (_mrPauseStart) {
    _mrPausedMs += Date.now() - _mrPauseStart.getTime();
    _mrPauseStart = null;
  }
  if (_mrMediaRec && _mrMediaRec.state === 'paused') _mrMediaRec.resume();
  _mrStartSpeechRecognition();
  _mrStartTimer();
  _mrSetState(MR_STATE.RECORDING);
}

// ── Stop & Process ───────────────────────────────────────────────

async function mrStop() {
  if (_mrState !== MR_STATE.RECORDING && _mrState !== MR_STATE.PAUSED) return;
  _mrSetState(MR_STATE.STOPPING);
  _mrStopTimer();

  // Stop recognition
  if (_mrRecognition) { try { _mrRecognition.stop(); } catch (_) {} _mrRecognition = null; }

  // Stop MediaRecorder and collect audio
  let audioBlob = null;
  if (_mrMediaRec && (_mrMediaRec.state === 'recording' || _mrMediaRec.state === 'paused')) {
    audioBlob = await new Promise(resolve => {
      _mrMediaRec.onstop = () => {
        resolve(_mrAudioChunks.length > 0 ? new Blob(_mrAudioChunks, { type: 'audio/webm' }) : null);
      };
      _mrMediaRec.stop();
    });
  }

  // Stop mic stream
  if (_mrStream) { _mrStream.getTracks().forEach(t => t.stop()); _mrStream = null; }

  // Clear autosave
  if (_mrAutosaveTimer) { clearInterval(_mrAutosaveTimer); _mrAutosaveTimer = null; }

  // Capture user notes
  const userNotes = (document.getElementById('mr-notes') || {}).value || '';
  const duration  = Math.round(_mrGetElapsedMs() / 60000 * 10) / 10; // minutes, 1dp

  // ── Transcript enhancement pipeline ─────────────────────────────
  let transcript = _mrGetFullTranscript();
  const settings  = await DB.get(STORES.settings, currentUser.id) || {};
  const openAiKey = settings.openAiApiKey || settings.openaiApiKey || '';

  // Step 1: Whisper fallback — use when Web Speech captured fewer than 40 words
  // (Web Speech can miss a lot when audio quality is poor or through headphones)
  if (audioBlob && openAiKey && transcript.split(/\s+/).filter(Boolean).length < 40) {
    _mrSetState(MR_STATE.TRANSCRIBING);
    try {
      const whisperText = await _mrWhisperTranscribe(audioBlob, openAiKey, _mrContextInfo);
      if (whisperText && whisperText.length > transcript.length) {
        // Whisper produced more content — use it (keep speech-rec segments for timestamps)
        _mrSegments.push({ id: ++_mrSegCounter, startMs: 0, endMs: 0, text: whisperText, isFinal: true, confidence: 0.95 });
        transcript = _mrGetFullTranscript();
      }
    } catch (_) {}
  }

  // Step 2: AI correction — fix garbled words using contact/deal context
  if (transcript && openAiKey) {
    _mrSetState(MR_STATE.TRANSCRIBING);
    try {
      const corrected = await _mrCorrectTranscript(transcript, _mrContextInfo);
      if (corrected && corrected !== transcript) {
        // Replace last segment with corrected version (preserves timestamps on earlier segs)
        _mrSegments.push({ id: ++_mrSegCounter, startMs: 0, endMs: 0, text: '[Corrected] ' + corrected, isFinal: true, confidence: 1 });
        transcript = corrected;
      }
    } catch (_) {}
  }

  const finalTranscript = transcript || _mrGetFullTranscript();

  // AI processing
  _mrSetState(MR_STATE.PROCESSING);
  let aiSummary        = null;
  let aiStructuredNote = null;

  try {
    [aiSummary, aiStructuredNote] = await Promise.all([
      _mrGenerateSummary(finalTranscript, userNotes),
      _mrGenerateStructuredNote(finalTranscript, userNotes),
    ]);
  } catch (_) {}

  // Save session
  const finalNote = _mrBuildDefaultFinalNote({ title: _mrSession.title, date: _mrSession.date, duration, aiSummary, aiStructuredNote, userNotes, rawTranscript: finalTranscript });

  Object.assign(_mrSession, {
    duration,
    status:              'completed',
    rawTranscript:       finalTranscript,
    transcriptSegments:  _mrSegments.slice(),
    userNotes,
    aiSummary,
    aiStructuredNote,
    finalNote,
    processedAt:         new Date().toISOString(),
    updatedAt:           new Date().toISOString(),
  });

  try { await DB.put(STORES.meetingSessions, _mrSession); } catch (_) {}

  _mrSetState(MR_STATE.REVIEW);
  _mrRenderReview();
}

// ── Whisper ──────────────────────────────────────────────────────

async function _mrWhisperTranscribe(audioBlob, openAiKey, contextInfo = '') {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');
  formData.append('response_format', 'text');

  // Prompt primes Whisper with domain vocabulary so it guesses unclear words correctly
  const contextBase = 'Search fund investor call. Topics: business acquisition, EBITDA, revenue, SDE, multiple, due diligence, LOI, earnout, seller financing, management team, search fund, ETA, proprietary deal, broker, intermediary.';
  const prompt = contextInfo ? `${contextInfo}. ${contextBase}` : contextBase;
  formData.append('prompt', prompt);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey}` },
    body: formData,
  });

  if (!response.ok) throw new Error(`Whisper API error ${response.status}`);
  // response_format=text returns plain text directly
  const text = await response.text();
  return text.trim();
}

// Helper: get human-readable language label for AI prompts
function _mrLangLabel(langCode) {
  const lang = MR_LANGUAGES.find(l => l.code === langCode);
  return lang ? lang.label : langCode;
}

// AI-powered transcript correction: fixes garbled words using call context
// langOverride allows callers from other modules (e.g. calls.js) to pass their own language code
async function _mrCorrectTranscript(rawTranscript, contextInfo, langOverride = null) {
  if (!rawTranscript || rawTranscript.trim().length < 30) return rawTranscript;
  try {
    const ctx  = contextInfo || 'Search fund investor call';
    const lang = langOverride || _mrSession?.language || _mrLanguage;
    const isGerman = lang.startsWith('de');
    const germanTerms = isGerman
      ? ' (3) German M&A finance terms the recognizer commonly mishears: "EBITDA", "KPI", "LOI", "Due Diligence", "Kaufpreis", "Umsatz", "Jahresabschluss", "Eigenkapital", "Fremdkapital", "GmbH", "GmbH & Co. KG", "Gewinn", "Verlust".'
      : ' (3) Correct business/finance terms the speech recognizer commonly mishears (e.g. "EBITA" → "EBITDA", "SDV" → "SDE", "multiple" misheard as "multi-pull").';
    const corrected = await callAI(
      `You are a transcript editor for a private equity search fund. The transcript language is ${_mrLangLabel(lang)}. Fix speech recognition errors using the provided context. Rules: (1) Preserve all content and meaning exactly. (2) Only fix words that are clearly garbled or misheard — do not rephrase.${germanTerms} (4) Fix run-on sentences caused by missing punctuation. (5) Return only the corrected transcript — no commentary.`,
      `Context: ${ctx}\n\nFix speech recognition errors in this ${_mrLangLabel(lang)} transcript:\n\n${rawTranscript.slice(0, 8000)}`,
      Math.min(Math.ceil(rawTranscript.length * 1.1), 2500),
      0.1
    );
    return corrected?.trim() || rawTranscript;
  } catch (_) {
    return rawTranscript;
  }
}

// ── AI Processing ────────────────────────────────────────────────

async function _mrGenerateSummary(transcript, userNotes, langOverride = null) {
  if (!transcript && !userNotes) return null;
  const lang = langOverride || _mrSession?.language || _mrLanguage;
  const langNote = lang.startsWith('de') ? ' The transcript may be in German — understand it fully and write the summary in English.' : '';
  const content = [transcript, userNotes].filter(Boolean).join('\n\n---\nUser notes:\n');
  const result = await callAI(
    `You are an expert meeting summarizer for a search fund investor. Be concise and actionable.${langNote}`,
    `Summarize this meeting in 5-8 crisp bullet points. Focus on: key insights, decisions made, red flags, and next steps.\n\nMeeting content:\n${content}`,
    600, 0.2
  );
  return result;
}

async function _mrGenerateStructuredNote(transcript, userNotes, langOverride = null) {
  if (!transcript && !userNotes) return null;
  const lang = langOverride || _mrSession?.language || _mrLanguage;
  const langNote = lang.startsWith('de') ? ' The transcript may be in German — understand it and return all field values in English.' : '';
  const content = [transcript, userNotes].filter(Boolean).join('\n\n---\nUser notes:\n');
  const raw = await callAI(
    `You are an expert meeting analyst for a search fund investor. Return ONLY valid JSON — no markdown, no code blocks.${langNote}`,
    `Analyze this meeting and return a JSON object with these fields:
- title: string (short descriptive title)
- themes: string[] (2-4 main topics discussed)
- keyTakeaways: string[] (3-5 most important points)
- decisions: string[] (decisions made, or [])
- risks: string[] (red flags or concerns, or [])
- actionItems: string[] (concrete next steps with owners if mentioned)
- openQuestions: string[] (questions raised but not answered)
- followUps: string[] (things to follow up on)
- keyQuotes: string[] (1-2 notable verbatim quotes, or [])
- sentiment: "positive"|"neutral"|"cautious"|"negative"

Meeting content:\n${content}`,
    900, 0.2
  );

  try {
    // Strip any markdown fences in case the model added them
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(clean);
  } catch (_) {
    return { title: '', themes: [], keyTakeaways: [raw], decisions: [], risks: [], actionItems: [], openQuestions: [], followUps: [], keyQuotes: [], sentiment: 'neutral' };
  }
}

// ── Insert quick tag ─────────────────────────────────────────────

function mrInsertTag(tag) {
  const ta = document.getElementById('mr-notes');
  if (!ta) return;
  const pos = ta.selectionStart;
  const val = ta.value;
  ta.value = val.substring(0, pos) + tag + ' ' + val.substring(pos);
  ta.selectionStart = ta.selectionEnd = pos + tag.length + 1;
  ta.focus();
}

// ── Review UI ────────────────────────────────────────────────────

function _mrRenderReview() {
  const body = document.getElementById('mr-panel-body');
  if (!body || !_mrSession) return;
  body.innerHTML = _mrBuildReviewHtml();
  _mrShowReviewTab('summary');
}

function _mrBuildReviewHtml() {
  const s = _mrSession;
  const mm = String(Math.floor((s.duration || 0))).padStart(2,'0');
  const dateStr = s.date ? new Date(s.date).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }) : '—';

  return `
<div class="p-6" style="min-height:520px;display:flex;flex-direction:column;">
  <!-- Header -->
  <div class="flex items-start justify-between mb-4 flex-shrink-0">
    <div>
      <h2 class="text-lg font-semibold">${escapeHtml(s.title || 'Untitled Meeting')}</h2>
      <p class="text-sm text-surface-500">${dateStr} · ${mm} min</p>
    </div>
    <div class="flex gap-2">
      <button onclick="mrSaveSession()" class="btn-primary">Save as Call</button>
      <button onclick="mrDiscardAndClose()" class="btn-ghost text-surface-500">Discard</button>
    </div>
  </div>

  <!-- Tab nav -->
  <div class="flex gap-1 border-b border-surface-200 dark:border-surface-700 mb-4 flex-shrink-0">
    ${['summary','transcript','notes','final'].map(t => `
      <button id="mr-tab-${t}" onclick="mrShowReviewTab('${t}')" class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300">
        ${{ summary:'AI Summary', transcript:'Transcript', notes:'Your Notes', final:'Final Note' }[t]}
      </button>`).join('')}
  </div>

  <!-- Tab content -->
  <div id="mr-tab-content" class="flex-1 overflow-y-auto"></div>
</div>`;
}

function mrShowReviewTab(tab) {
  // Highlight active tab
  ['summary','transcript','notes','final'].forEach(t => {
    const btn = document.getElementById(`mr-tab-${t}`);
    if (!btn) return;
    if (t === tab) {
      btn.classList.add('border-brand-600','text-brand-600','dark:text-brand-400');
      btn.classList.remove('border-transparent','text-surface-500');
    } else {
      btn.classList.remove('border-brand-600','text-brand-600','dark:text-brand-400');
      btn.classList.add('border-transparent','text-surface-500');
    }
  });

  const container = document.getElementById('mr-tab-content');
  if (!container || !_mrSession) return;

  switch (tab) {
    case 'summary':    container.innerHTML = _mrBuildSummaryTab(_mrSession);    break;
    case 'transcript': container.innerHTML = _mrBuildTranscriptTab(_mrSession); break;
    case 'notes':      container.innerHTML = _mrBuildNotesTab(_mrSession);      break;
    case 'final':      container.innerHTML = _mrBuildFinalTab(_mrSession);      break;
  }
}

// Keep public alias matching summary
const _mrShowReviewTab = mrShowReviewTab;

function _mrBuildSummaryTab(s) {
  if (!s.aiStructuredNote && !s.aiSummary) {
    return `<div class="text-surface-400 italic text-center py-12">No AI summary available — no API key configured in Settings.</div>`;
  }
  const n = s.aiStructuredNote || {};

  const section = (title, items, cls = '') => {
    if (!items || items.length === 0) return '';
    return `<div class="mb-4">
      <p class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">${title}</p>
      <ul class="space-y-1.5">${items.map(item => `<li class="flex gap-2 text-sm ${cls}"><span class="flex-shrink-0 mt-0.5">•</span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>
    </div>`;
  };

  const sentimentColor = { positive:'text-green-600', neutral:'text-surface-500', cautious:'text-amber-600', negative:'text-red-600' };

  return `<div class="space-y-4">
    ${n.sentiment ? `<div class="flex items-center gap-2"><span class="text-xs font-semibold uppercase tracking-wide text-surface-500">Sentiment</span><span class="text-sm font-medium ${sentimentColor[n.sentiment] || ''}">${n.sentiment}</span></div>` : ''}
    ${n.themes && n.themes.length ? `<div class="flex flex-wrap gap-2 mb-2">${n.themes.map(t => `<span class="badge badge-blue">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    ${section('Key Takeaways', n.keyTakeaways)}
    ${section('Decisions', n.decisions)}
    ${section('Action Items', n.actionItems, 'text-brand-600 dark:text-brand-400')}
    ${section('Risks / Red Flags', n.risks, 'text-red-600 dark:text-red-400')}
    ${section('Open Questions', n.openQuestions)}
    ${section('Follow-ups', n.followUps)}
    ${n.keyQuotes && n.keyQuotes.length ? `<div class="mb-4"><p class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">Key Quotes</p>${n.keyQuotes.map(q => `<blockquote class="border-l-2 border-surface-300 dark:border-surface-600 pl-3 text-sm text-surface-600 dark:text-surface-400 italic my-1">${escapeHtml(q)}</blockquote>`).join('')}</div>` : ''}
    ${!n.keyTakeaways && s.aiSummary ? `<div class="text-sm whitespace-pre-wrap leading-relaxed">${escapeHtml(s.aiSummary)}</div>` : ''}
  </div>`;
}

function _mrBuildTranscriptTab(s) {
  const segs = s.transcriptSegments || [];
  if (segs.length === 0 && !s.rawTranscript) {
    return `<div class="text-surface-400 italic text-center py-12">No transcript captured.</div>`;
  }
  if (segs.length > 0) {
    return `<div class="space-y-2">${segs.filter(sg => sg.isFinal).map(sg => {
      const mm = String(Math.floor(sg.startMs / 60000)).padStart(2,'0');
      const ss = String(Math.floor((sg.startMs % 60000) / 1000)).padStart(2,'0');
      return `<div class="flex gap-3 text-sm"><span class="text-xs text-surface-400 font-mono flex-shrink-0 mt-0.5">${mm}:${ss}</span><span class="leading-relaxed">${escapeHtml(sg.text)}</span></div>`;
    }).join('')}</div>`;
  }
  return `<div class="text-sm whitespace-pre-wrap leading-relaxed">${escapeHtml(s.rawTranscript)}</div>`;
}

function _mrBuildNotesTab(s) {
  const notes = s.userNotes || '';
  if (!notes) return `<div class="text-surface-400 italic text-center py-12">No notes captured during recording.</div>`;
  // Highlight tags
  const html = escapeHtml(notes)
    .replace(/(!)\s/g, '<span class="font-semibold text-amber-600">$1</span> ')
    .replace(/(\?)\s/g, '<span class="font-semibold text-blue-600">$1</span> ')
    .replace(/(→)\s/g, '<span class="font-semibold text-brand-600">$1</span> ')
    .replace(/(⚠)\s/g, '<span class="font-semibold text-red-600">$1</span> ');
  return `<div class="text-sm whitespace-pre-wrap leading-relaxed">${html}</div>`;
}

function _mrBuildFinalTab(s) {
  return `<div class="flex flex-col h-full gap-3">
    <p class="text-xs text-surface-500">Edit your final meeting note below — this is what gets saved to the call record.</p>
    <textarea id="mr-final-note" class="input resize-none flex-1 text-sm font-mono" style="min-height:320px;">${escapeHtml(s.finalNote || '')}</textarea>
    <button onclick="mrUpdateFinalNote()" class="btn-secondary self-end">Save Draft</button>
  </div>`;
}

function _mrBuildDefaultFinalNote(s) {
  const dateStr = s.date ? new Date(s.date).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' }) : '';
  const n = s.aiStructuredNote || {};
  const lines = [];
  lines.push(`# ${s.title || 'Meeting Note'}`);
  lines.push(`**Date:** ${dateStr}  **Duration:** ${s.duration || '—'} min`);
  lines.push('');
  if (n.keyTakeaways && n.keyTakeaways.length) {
    lines.push('## Key Takeaways');
    n.keyTakeaways.forEach(t => lines.push(`- ${t}`));
    lines.push('');
  } else if (s.aiSummary) {
    lines.push('## Summary');
    lines.push(s.aiSummary);
    lines.push('');
  }
  if (n.actionItems && n.actionItems.length) {
    lines.push('## Action Items');
    n.actionItems.forEach(a => lines.push(`- [ ] ${a}`));
    lines.push('');
  }
  if (n.risks && n.risks.length) {
    lines.push('## Risks / Red Flags');
    n.risks.forEach(r => lines.push(`- ${r}`));
    lines.push('');
  }
  if (s.userNotes) {
    lines.push('## Notes');
    lines.push(s.userNotes);
  }
  return lines.join('\n');
}

async function mrUpdateFinalNote() {
  const ta = document.getElementById('mr-final-note');
  if (!ta || !_mrSession) return;
  _mrSession.finalNote = ta.value;
  _mrSession.updatedAt = new Date().toISOString();
  try { await DB.put(STORES.meetingSessions, _mrSession); showToast('Draft saved', 'success'); } catch(_) {}
}

// ── Save as Call ─────────────────────────────────────────────────

async function mrSaveSession() {
  if (!_mrSession) return;

  // Capture any edits to the final note
  const finalNoteEl = document.getElementById('mr-final-note');
  if (finalNoteEl) _mrSession.finalNote = finalNoteEl.value;

  // Build a STORES.calls record so the session appears in Calls tab + Deal Calls
  const n = _mrSession.aiStructuredNote || {};
  const callRecord = {
    id: generateId(),
    userId:        currentUser.id,
    participantIds: _mrSession.contactIds || [],
    contactId:     (_mrSession.contactIds || [])[0] || null,
    dealId:        _mrSession.dealId || null,
    date:          _mrSession.date,
    duration:      Math.round((_mrSession.duration || 0)),
    outcome:       'Meeting',
    notes:         _mrSession.finalNote || _mrSession.rawTranscript || '',
    title:         _mrSession.title,
    source:        'recorded',
    rawTranscript: _mrSession.rawTranscript,
    granolaNotes:  _mrSession.userNotes,
    aiSummary:     _mrSession.aiSummary,
    cleanedNotes:  _mrSession.finalNote,
    keyInsights:   n.keyTakeaways || [],
    actionItems:   n.actionItems  || [],
    redFlags:      n.risks        || [],
    positiveSignals: [],
    nextMeetingContext: (n.followUps || []).join('; '),
    processedAt:   _mrSession.processedAt,
    createdAt:     new Date().toISOString(),
    updatedAt:     new Date().toISOString(),
  };

  try {
    await DB.add(STORES.calls, callRecord);
    _mrSession.callId    = callRecord.id;
    _mrSession.status    = 'saved';
    _mrSession.updatedAt = new Date().toISOString();
    await DB.put(STORES.meetingSessions, _mrSession);
  } catch (err) {
    showToast('Error saving call: ' + err.message, 'error');
    return;
  }

  // Log to deal history if linked
  if (_mrSession.dealId && typeof logDealHistory === 'function') {
    try { await logDealHistory(_mrSession.dealId, 'call_logged', { callId: callRecord.id, title: _mrSession.title, source: 'recorded' }); } catch (_) {}
  }

  showToast('Meeting saved as call record ✓', 'success');
  _mrHidePanel();
  _mrReset();

  // Refresh current page if on Calls
  if (typeof currentPage !== 'undefined' && currentPage === 'calls') renderCalls();
}

// ── Discard ──────────────────────────────────────────────────────

async function mrDiscardAndClose() {
  _mrCleanupResources();
  if (_mrSession) {
    try { await DB.delete(STORES.meetingSessions, _mrSession.id); } catch (_) {}
  }
  _mrReset();
  _mrHidePanel();
}

function _mrCleanupResources() {
  _mrStopTimer();
  if (_mrAutosaveTimer) { clearInterval(_mrAutosaveTimer); _mrAutosaveTimer = null; }
  if (_mrRecognition)   { try { _mrRecognition.stop(); } catch(_) {} _mrRecognition = null; }
  if (_mrMediaRec && _mrMediaRec.state !== 'inactive') { try { _mrMediaRec.stop(); } catch(_) {} }
  if (_mrStream)        { _mrStream.getTracks().forEach(t => t.stop()); _mrStream = null; }
}

function _mrReset() {
  _mrState       = MR_STATE.IDLE;
  _mrSession     = null;
  _mrSegments    = [];
  _mrSegCounter  = 0;
  _mrAudioChunks = [];
  _mrLiveText    = '';
  _mrStartTime   = null;
  _mrPausedMs    = 0;
  _mrPauseStart  = null;
  _mrDealId      = null;
  _mrContactIds  = [];
}

// ── Helpers ──────────────────────────────────────────────────────

function _mrSetState(state) {
  _mrState = state;
  _mrRenderState();
}

function _mrSetError(msg) {
  _mrCleanupResources();
  _mrState = MR_STATE.ERROR;
  _mrRenderState();
  const errEl = document.getElementById('mr-error-msg');
  if (errEl) { errEl.textContent = msg; errEl.classList.remove('hidden'); }
}

// ── History / Past Sessions ──────────────────────────────────────

async function renderMeetingHistory(containerSelector) {
  const container = typeof containerSelector === 'string'
    ? document.querySelector(containerSelector)
    : containerSelector;
  if (!container) return;

  container.innerHTML = '<p class="text-sm text-surface-400">Loading…</p>';
  const sessions = await DB.getForUser(STORES.meetingSessions, currentUser.id);
  const sorted   = sessions.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (sorted.length === 0) {
    container.innerHTML = '<p class="text-sm text-surface-400 italic">No recorded meetings yet.</p>';
    return;
  }

  container.innerHTML = sorted.map(s => {
    const dateStr = s.date ? new Date(s.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
    const dur     = s.duration ? `${Math.round(s.duration)} min` : '';
    const status  = s.status === 'saved' ? '<span class="badge badge-green">Saved</span>' : '<span class="badge">Draft</span>';
    return `<div class="card flex items-center gap-4 cursor-pointer hover:border-brand-300 transition-colors" onclick="mrOpenSession('${s.id}')">
      <div class="flex-1 min-w-0">
        <p class="font-medium truncate">${escapeHtml(s.title || 'Untitled Meeting')}</p>
        <p class="text-sm text-surface-500">${dateStr}${dur ? ' · ' + dur : ''}</p>
      </div>
      ${status}
      <svg class="w-4 h-4 text-surface-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
    </div>`;
  }).join('');
}

async function mrOpenSession(sessionId) {
  const session = await DB.get(STORES.meetingSessions, sessionId);
  if (!session) { showToast('Session not found', 'error'); return; }

  _mrSession = session;
  _mrSegments = session.transcriptSegments || [];
  _mrSegCounter = _mrSegments.length;
  _mrState = MR_STATE.REVIEW;

  const body = document.getElementById('mr-panel-body');
  if (body) body.innerHTML = _mrBuildReviewHtml();
  _mrShowPanel();
  _mrInitDrag();
  _mrShowReviewTab('summary');
}

// ── Floating panel: show / hide / minimize / drag / close ────────

function _mrShowPanel() {
  const panel = document.getElementById('mr-floating-panel');
  if (!panel) return;
  panel.style.display = 'flex';
  _mrMinimized = false;
  const body = document.getElementById('mr-panel-body');
  if (body) body.style.display = '';
  // Reset minimize icon to "–"
  const btn = document.getElementById('mr-minimize-btn');
  if (btn) btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>';
}

function _mrHidePanel() {
  const panel = document.getElementById('mr-floating-panel');
  if (panel) panel.style.display = 'none';
}

function _mrToggleMinimize() {
  _mrMinimized = !_mrMinimized;
  const body = document.getElementById('mr-panel-body');
  const btn  = document.getElementById('mr-minimize-btn');
  if (body) body.style.display = _mrMinimized ? 'none' : '';
  if (btn)  btn.innerHTML = _mrMinimized
    // chevron-down = "restore" when minimized
    ? '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8l8 8 8-8"/></svg>'
    // minus = "minimize" when expanded
    : '<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>';
}

// Close button: if recording is in progress ask for confirmation first
function _mrRequestClose() {
  if (_mrState === MR_STATE.RECORDING || _mrState === MR_STATE.PAUSED) {
    if (!confirm('A recording is in progress. Stop and discard the session?')) return;
  }
  mrDiscardAndClose();
}

// Drag-to-reposition (mouse only; attach once per panel open via _dragInit flag)
function _mrInitDrag() {
  const panel  = document.getElementById('mr-floating-panel');
  const handle = document.getElementById('mr-drag-handle');
  if (!panel || !handle || handle._dragInit) return;
  handle._dragInit = true;

  let dragging = false, ox = 0, oy = 0;

  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return; // buttons inside handle still work normally
    const rect = panel.getBoundingClientRect();
    // Convert right/bottom CSS to left/top so position stays stable during drag
    panel.style.right  = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left   = rect.left + 'px';
    panel.style.top    = rect.top  + 'px';
    ox = e.clientX - rect.left;
    oy = e.clientY - rect.top;
    dragging = true;
    handle.classList.add('mr-dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const maxX = Math.max(0, window.innerWidth  - panel.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - 48); // always keep handle visible
    panel.style.left = Math.max(0, Math.min(maxX, e.clientX - ox)) + 'px';
    panel.style.top  = Math.max(0, Math.min(maxY, e.clientY - oy)) + 'px';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    handle.classList.remove('mr-dragging');
  });
}

async function mrSearch(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase();
  const sessions = await DB.getForUser(STORES.meetingSessions, currentUser.id);
  return sessions.filter(s =>
    (s.title        || '').toLowerCase().includes(q) ||
    (s.rawTranscript|| '').toLowerCase().includes(q) ||
    (s.userNotes    || '').toLowerCase().includes(q) ||
    (s.aiSummary    || '').toLowerCase().includes(q) ||
    (s.finalNote    || '').toLowerCase().includes(q)
  );
}
