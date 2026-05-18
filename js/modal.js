/* ============================================
   Nexus CRM — Modal System
   ============================================ */

// Optional guard: set to a function that returns a warning string to block modal close,
// or falsy to allow. Cleared automatically on a successful closeModal().
let _modalCloseGuard = null;

function setModalCloseGuard(guardFn) {
  _modalCloseGuard = guardFn;
}

function openModal(contentHtmlOrTitle, optionsOrContent = {}, buttonsArr = null) {
  // Support three calling conventions:
  // openModal(html, options?)              — original (deal modules, confirm dialogs)
  // openModal(title, html)                 — 2-arg with title header
  // openModal(title, html, buttons[])      — 3-arg with title header + rendered footer buttons
  //   buttons[]: [{ label, onclick, class?, id? }, ...]
  let contentHtml, options;
  if (typeof optionsOrContent === 'string') {
    // 2nd arg is a string → title + body + optional footer buttons
    const headerHtml = `<div class="px-6 pt-5 pb-3 border-b border-surface-200 dark:border-surface-800 flex items-center justify-between">
      <h2 class="text-base font-semibold">${escapeHtml(contentHtmlOrTitle)}</h2>
      <button onclick="closeModal()" class="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>`;
    const footerHtml = (buttonsArr && buttonsArr.length > 0)
      ? `<div class="px-6 py-4 border-t border-surface-200 dark:border-surface-800 flex justify-end gap-3 flex-shrink-0">
          ${buttonsArr.map(b =>
            `<button ${b.id ? `id="${b.id}"` : ''} onclick="${b.onclick}" class="${b.class || 'btn-secondary'}">${b.label}</button>`
          ).join('')}
        </div>`
      : '';
    contentHtml = headerHtml + optionsOrContent + footerHtml;
    options = {};
  } else {
    contentHtml = contentHtmlOrTitle;
    options = optionsOrContent;
  }
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  const size = options.wide ? '4xl' : options.small ? 'md' : '2xl';
  content.className = `bg-white dark:bg-surface-900 rounded shadow-2xl max-w-${size} w-full max-h-[90vh] overflow-y-auto animate-slide-up`;

  content.innerHTML = contentHtml;
  overlay.classList.remove('hidden');
  overlay.classList.add('show');

  // Close on overlay click
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal();
  };

  // Close on Escape
  document.addEventListener('keydown', handleModalEscape);
}

function closeModal(force = false) {
  // Check close guard (e.g. active recording) — guard can be bypassed with force=true
  if (!force && _modalCloseGuard) {
    const msg = _modalCloseGuard();
    if (msg) {
      if (typeof showToast === 'function') showToast(msg, 'error');
      // Briefly shake the modal to signal it cannot be dismissed
      const content = document.getElementById('modal-content');
      if (content) {
        content.style.animation = 'none';
        content.offsetHeight; // reflow
        content.style.animation = 'modalShake 0.35s ease';
        setTimeout(() => { content.style.animation = ''; }, 400);
      }
      return; // blocked
    }
  }
  // Clear guard on intentional close
  _modalCloseGuard = null;
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('hidden');
  overlay.classList.remove('show');
  document.removeEventListener('keydown', handleModalEscape);
  // Clean up company picker dropdown if it was portaled to body
  if (typeof cpClose === 'function') cpClose();
  // Close any orphaned sub-dialogs spawned by the modal (e.g. the
  // "Create New Company" full-form dialog). Otherwise they remain on
  // screen after the parent modal disappears.
  const subDialogs = [
    'create-company-dlg',
    // Add other known sub-dialog IDs here as new ones are introduced
  ];
  subDialogs.forEach(id => {
    const dlg = document.getElementById(id);
    if (dlg) {
      try { if (typeof dlg.close === 'function' && dlg.open) dlg.close(); } catch (_) {}
      dlg.remove();
    }
  });
}

function handleModalEscape(e) {
  if (e.key === 'Escape') closeModal(); // guard will block if recording
}

function confirmDialog(title, message, onConfirm) {
  openModal(`
    <div class="p-6">
      <h3 class="text-lg font-semibold mb-2">${escapeHtml(title)}</h3>
      <p class="text-surface-600 dark:text-surface-400 text-sm mb-6">${escapeHtml(message)}</p>
      <div class="flex justify-end gap-3">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button id="confirm-action-btn" class="btn-danger">Confirm</button>
      </div>
    </div>
  `, { small: true });

  document.getElementById('confirm-action-btn').onclick = () => {
    closeModal();
    onConfirm();
  };
}
