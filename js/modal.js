/* ============================================
   Nexus CRM — Modal System
   ============================================ */

// Optional guard: set to a function that returns a warning string to block modal close,
// or falsy to allow. Cleared automatically on a successful closeModal().
let _modalCloseGuard = null;

function setModalCloseGuard(guardFn) {
  _modalCloseGuard = guardFn;
}

function openModal(contentHtmlOrTitle, optionsOrContent = {}) {
  // Support two calling conventions:
  // openModal(html, options?)  — original
  // openModal(title, html)     — used by deal modules (title becomes an h2 header)
  let contentHtml, options;
  if (typeof optionsOrContent === 'string') {
    contentHtml = `<div class="px-6 pt-6 pb-2 border-b border-surface-200 dark:border-surface-800"><h2 class="text-lg font-semibold">${escapeHtml(contentHtmlOrTitle)}</h2></div>${optionsOrContent}`;
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
