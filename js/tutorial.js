/* ============================================
   Pulse CRM — Onboarding Tutorial
   ============================================ */

const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    icon: '👋',
    title: 'Welcome to Pulse!',
    body: "We've loaded sample contacts, calls, reminders, and an acquisition deal so you can explore right away. This quick tour walks you through the key features — takes about 90 seconds.",
    target: null,
    nav: null,
    wide: true,
  },
  {
    id: 'dashboard',
    icon: '📊',
    title: 'Your Dashboard',
    body: 'A real-time snapshot of your network health — overdue follow-ups, upcoming reminders, recent calls, and relationship stage breakdown across all your contacts.',
    target: '[data-page="dashboard"]',
    nav: 'dashboard',
  },
  {
    id: 'contacts',
    icon: '👥',
    title: 'Contacts',
    body: 'Every person in your network lives here. Track relationship stage (New intro → Warm relationship), last contact date, and next follow-up. Color-coded health indicators flag stale relationships.',
    target: '[data-page="contacts"]',
    nav: 'contacts',
  },
  {
    id: 'calls',
    icon: '📞',
    title: 'Call Log',
    body: 'Log every networking conversation with notes, outcome, and next steps. Click "Edit" on any call and use the AI ✨ Clean Notes button to auto-format your raw notes into structured bullet points.',
    target: '[data-page="calls"]',
    nav: 'calls',
  },
  {
    id: 'reminders',
    icon: '🔔',
    title: 'Reminders',
    body: 'Set follow-up reminders so no relationship goes cold. The red badge in the sidebar shows how many are due this week — so you always know what needs attention today.',
    target: '[data-page="reminders"]',
    nav: 'reminders',
  },
  {
    id: 'deals',
    icon: '🏢',
    title: 'Deal Pipeline',
    body: "Track acquisition targets from first look to close. We've seeded a sample deal in Due Diligence — explore the DD checklist, document vault, deal scoring, and stage history.",
    target: '[data-page="deals"]',
    nav: 'deals',
  },
  {
    id: 'settings',
    icon: '✨',
    title: 'Unlock AI Features',
    body: 'Add your OpenAI API key in Settings to unlock the AI chat assistant, smart notes cleanup, and enhanced networking suggestions. Takes 30 seconds to set up.',
    target: '[data-page="settings"]',
    nav: 'settings',
  },
  {
    id: 'done',
    icon: '🎉',
    title: "You're all set!",
    body: "Ready to build your real network? Delete the sample data and start fresh with your own contacts — or keep it around as a reference while you get comfortable.",
    target: null,
    nav: 'dashboard',
    wide: true,
    isFinal: true,
  },
];

let _tutStep = 0;
let _tutActive = false;

// ── Public API ───────────────────────────────────────────────────────

function startTutorial() {
  if (_tutActive) return;
  _tutActive = true;
  _tutStep = 0;
  _buildTutorialDOM();
  _goToStep(0);
}

function tutorialNext() {
  if (_tutStep < TUTORIAL_STEPS.length - 1) {
    _goToStep(_tutStep + 1);
  }
}

function tutorialBack() {
  if (_tutStep > 0) {
    _goToStep(_tutStep - 1);
  }
}

function tutorialSkip() {
  // Jump straight to the final "clear data?" step
  _goToStep(TUTORIAL_STEPS.length - 1);
}

function finishTutorial(shouldClearData) {
  _tutActive = false;
  if (currentUser) {
    localStorage.removeItem('pulse_show_tutorial_' + currentUser.id);
  }
  _destroyTutorialDOM();

  if (shouldClearData) {
    clearDemoData().then(() => {
      navigate('dashboard');
      showToast("Sample data cleared — you're starting fresh!", 'success');
    }).catch(() => {
      navigate('dashboard');
      showToast('Could not clear all sample data', 'error');
    });
  } else {
    navigate('dashboard');
    showToast('Tour complete! Sample data is still here for reference.', 'info');
  }
}

async function clearDemoData() {
  if (!currentUser) return;
  const uid = currentUser.id;

  const demoStores = [
    STORES.contacts, STORES.companies, STORES.calls,
    STORES.notes, STORES.activities, STORES.reminders,
    STORES.deals, STORES.dealHistory, STORES.dealDocuments,
    STORES.dealNotes, STORES.dealTasks,
  ];

  for (const store of demoStores) {
    try {
      const all = await DB.getAll(store);
      const toDelete = all.filter(r => r.userId === uid && r.isDemo === true);
      for (const r of toDelete) {
        await DB.delete(store, r.id).catch(() => {});
      }
    } catch (_) { /* store might not exist in older DBs */ }
  }
}

// ── DOM management ────────────────────────────────────────────────────

function _buildTutorialDOM() {
  _destroyTutorialDOM();

  // Dim overlay — only active during center-modal steps
  const overlay = document.createElement('div');
  overlay.id = 'tut-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:8997',
    'background:rgba(0,0,0,0)', 'transition:background 0.3s',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(overlay);

  // Spotlight ring — box-shadow creates the dim effect around it
  const spot = document.createElement('div');
  spot.id = 'tut-spotlight';
  spot.style.cssText = [
    'position:fixed', 'z-index:8998', 'border-radius:10px',
    'pointer-events:none', 'opacity:0',
    'transition:top 0.35s cubic-bezier(.4,0,.2,1),left 0.35s cubic-bezier(.4,0,.2,1)',
    'transition:width 0.35s cubic-bezier(.4,0,.2,1),height 0.35s cubic-bezier(.4,0,.2,1)',
    'transition:opacity 0.35s ease,box-shadow 0.35s ease',
  ].join(';');
  document.body.appendChild(spot);

  // Tutorial card
  const card = document.createElement('div');
  card.id = 'tut-card';
  card.style.cssText = 'position:fixed;z-index:9000;';
  document.body.appendChild(card);
}

function _destroyTutorialDOM() {
  ['tut-overlay', 'tut-spotlight', 'tut-card'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}

// ── Step rendering ────────────────────────────────────────────────────

function _goToStep(idx) {
  _tutStep = idx;
  const step = TUTORIAL_STEPS[idx];
  if (step.nav) navigate(step.nav);
  // Delay so the page can paint before we measure element positions
  setTimeout(() => _renderStep(idx), 120);
}

function _renderStep(idx) {
  const step = TUTORIAL_STEPS[idx];
  const total = TUTORIAL_STEPS.length;

  const overlay = document.getElementById('tut-overlay');
  const spot    = document.getElementById('tut-spotlight');
  const card    = document.getElementById('tut-card');
  if (!overlay || !spot || !card) return;

  const targetEl = step.target ? document.querySelector(step.target) : null;

  // ── Spotlight + overlay ──────────────────────────────────
  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const pad = 7;

    spot.style.opacity = '1';
    spot.style.top    = (rect.top  - pad) + 'px';
    spot.style.left   = (rect.left - pad) + 'px';
    spot.style.width  = (rect.width  + pad * 2) + 'px';
    spot.style.height = (rect.height + pad * 2) + 'px';
    spot.style.border = '2px solid #4F46E5';
    spot.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.45), 0 0 0 5px rgba(79,70,229,0.25)';

    overlay.style.background = 'rgba(0,0,0,0)';
    overlay.style.pointerEvents = 'none';

    _positionCard(card, rect, step.wide);
  } else {
    spot.style.opacity = '0';
    spot.style.boxShadow = 'none';
    spot.style.border = 'none';

    overlay.style.background = 'rgba(0,0,0,0.55)';
    overlay.style.pointerEvents = 'auto';

    // Center card
    const w = step.wide ? 460 : 380;
    card.style.cssText = `
      position:fixed; z-index:9000;
      top:50%; left:50%;
      transform:translate(-50%,-50%);
      width:min(${w}px, calc(100vw - 32px));
    `;
  }

  // ── Build card HTML ──────────────────────────────────────
  const pct = Math.round(((idx + 1) / total) * 100);
  const isFirst = idx === 0;
  const isFinal = !!step.isFinal;

  const dots = Array.from({ length: total }, (_, i) => {
    const active = i === idx ? '#4F46E5' : (i < idx ? '#a5b4fc' : '#e2e8f0');
    return `<div style="width:7px;height:7px;border-radius:50%;background:${active};transition:background 0.25s;flex-shrink:0;"></div>`;
  }).join('');

  card.innerHTML = `
    <div class="bg-white dark:bg-surface-900 rounded-2xl shadow-2xl border border-surface-200 dark:border-surface-700 overflow-hidden">

      <!-- Progress bar -->
      <div style="height:3px;background:#e2e8f0 dark:background:#334155;">
        <div style="height:100%;width:${pct}%;background:#4F46E5;transition:width 0.35s ease;border-radius:0 2px 2px 0;"></div>
      </div>

      <div class="p-5">
        <!-- Icon + title + body -->
        <div class="flex items-start gap-3 mb-1">
          <span style="font-size:26px;line-height:1.2;flex-shrink:0;">${step.icon}</span>
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-bold text-surface-900 dark:text-surface-100 leading-snug">${step.title}</h2>
            <p class="text-sm text-surface-500 dark:text-surface-400 mt-1.5 leading-relaxed">${step.body}</p>
          </div>
          <button
            onclick="tutorialSkip()"
            title="Skip tour"
            style="flex-shrink:0;padding:3px;border-radius:6px;color:#94a3b8;cursor:pointer;background:transparent;border:none;"
            onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='transparent'">
            <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        ${isFinal ? `
          <!-- Final step: clear data CTA -->
          <div class="flex flex-col gap-2 mt-4">
            <button onclick="finishTutorial(true)" class="btn-primary w-full flex items-center justify-center gap-2 text-sm">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
              Clear Sample Data &amp; Start Fresh
            </button>
            <button onclick="finishTutorial(false)" class="btn-secondary w-full text-sm">
              Keep Sample Data for Now
            </button>
          </div>
        ` : `
          <!-- Navigation -->
          <div class="flex items-center justify-between mt-4">
            <span style="font-size:11px;color:#94a3b8;">${idx + 1} / ${total}</span>
            <div class="flex items-center gap-2">
              ${!isFirst ? `
                <button onclick="tutorialBack()" class="btn-secondary btn-sm">← Back</button>
              ` : ''}
              <button onclick="tutorialNext()" class="btn-primary btn-sm">
                ${isFirst ? 'Start Tour →' : (idx === total - 2 ? 'Finish →' : 'Next →')}
              </button>
            </div>
          </div>
        `}

        <!-- Dot progress -->
        <div style="display:flex;justify-content:center;align-items:center;gap:5px;margin-top:${isFinal ? '14px' : '14px'};">
          ${dots}
        </div>
      </div>
    </div>
  `;
}

// ── Card positioning (next to spotlight target) ───────────────────────

function _positionCard(card, targetRect, wide) {
  const cardW = wide ? 400 : 340;
  const margin = 14;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(cardW, vw - 32);

  card.style.transform = '';
  card.style.width = w + 'px';

  // Try right of target
  let left = targetRect.right + margin;
  let top  = targetRect.top;

  // Overflow right → try left of target
  if (left + w > vw - margin) {
    left = targetRect.left - w - margin;
  }

  // Still overflows → center horizontally, place below
  if (left < margin) {
    left = Math.max(margin, (vw - w) / 2);
    top  = targetRect.bottom + margin;
  }

  // Clamp vertically
  const estH = 240;
  if (top + estH > vh - margin) top = Math.max(margin, vh - estH - margin);
  if (top < margin) top = margin;

  card.style.left = left + 'px';
  card.style.top  = top + 'px';
}

// Expose globals
window.startTutorial   = startTutorial;
window.tutorialNext    = tutorialNext;
window.tutorialBack    = tutorialBack;
window.tutorialSkip    = tutorialSkip;
window.finishTutorial  = finishTutorial;
window.clearDemoData   = clearDemoData;
