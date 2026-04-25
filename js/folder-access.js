/* ==============================================
   Pulse CRM — Local Folder Access
   -----------------------------------------------
   Assigns a local computer folder to a deal.
   All files in that folder are automatically
   available to every AI feature (fit score,
   diligence, NDA review, Q&A, etc.).

   Uses the browser File System Access API
   (Chrome / Edge). Folder handles are persisted
   in IndexedDB so the link survives page reloads;
   the browser asks to re-grant permission once
   per session (a Chrome security requirement).
   ============================================== */

// ── Session-level handle cache ──────────────────
// Handles retrieved from IDB are cached here so
// we don't hit IDB on every file read.
const _folderHandles = new Map(); // dealId → FileSystemDirectoryHandle

// ── Supported file types ────────────────────────
const FOLDER_FILE_TYPES = {
  pdf:  { ext: ['.pdf'],              label: 'PDF',       icon: '📄', priority: 0 },
  xlsx: { ext: ['.xlsx', '.xls'],     label: 'Excel',     icon: '📊', priority: 1 },
  csv:  { ext: ['.csv'],              label: 'CSV',       icon: '📋', priority: 2 },
  docx: { ext: ['.docx', '.doc'],     label: 'Word',      icon: '📃', priority: 3 },
  txt:  { ext: ['.txt', '.md'],       label: 'Text',      icon: '📝', priority: 4 },
};

function _fileTypeFor(filename) {
  const lower = filename.toLowerCase();
  for (const [key, info] of Object.entries(FOLDER_FILE_TYPES)) {
    if (info.ext.some(e => lower.endsWith(e))) return { key, ...info };
  }
  return null;
}

function _fmtBytes(bytes) {
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(1) + ' MB';
  if (bytes >= 1_000)     return Math.round(bytes / 1_000) + ' KB';
  return bytes + ' B';
}

// ── IndexedDB helpers ───────────────────────────
async function _folderSave(record) {
  // FileSystemDirectoryHandle is structured-cloneable → safe to store in IDB
  await DB.put(STORES.dealFolders, { ...record, updatedAt: new Date().toISOString() });
}

async function _folderLoad(dealId) {
  try { return await DB.get(STORES.dealFolders, dealId); } catch { return null; }
}

async function _folderDelete(dealId) {
  try { await DB.delete(STORES.dealFolders, dealId); } catch { /* silent */ }
}

// ── Permission helpers ──────────────────────────
async function _checkPermission(handle) {
  try {
    let perm = await handle.queryPermission({ mode: 'read' });
    if (perm === 'prompt') perm = await handle.requestPermission({ mode: 'read' });
    return perm === 'granted';
  } catch { return false; }
}

// ── Public API ──────────────────────────────────

/**
 * Open the native folder picker and link the chosen folder to a deal.
 * Returns true on success, false if cancelled or unsupported.
 */
async function folderPick(dealId) {
  if (!('showDirectoryPicker' in window)) {
    showToast('Folder access requires Chrome or Edge. Safari / Firefox not yet supported.', 'error');
    return false;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read', id: 'pulse-deal-folder' });
    _folderHandles.set(dealId, handle);

    // Count supported files
    let fileCount = 0;
    for await (const [name, entry] of handle) {
      if (entry.kind === 'file' && _fileTypeFor(name)) fileCount++;
    }

    await _folderSave({
      id: dealId,          // keyPath — one record per deal
      dealId,
      userId: currentUser.id,
      folderName: handle.name,
      fileCount,
      linkedAt: new Date().toISOString(),
      handle,              // IDB structured clone preserves the handle
    });

    showToast(`Linked "${handle.name}" — ${fileCount} file${fileCount !== 1 ? 's' : ''} ready for AI.`, 'success');
    return true;
  } catch (e) {
    if (e.name !== 'AbortError') showToast('Could not access folder: ' + e.message, 'error');
    return false;
  }
}

/**
 * Get the (permission-checked) handle for a deal's linked folder.
 * Returns null if no folder is linked or permission was denied.
 */
async function folderGetHandle(dealId) {
  // Try in-session cache first
  let handle = _folderHandles.get(dealId);

  if (!handle) {
    const record = await _folderLoad(dealId);
    if (!record?.handle) return null;
    handle = record.handle;
  }

  const granted = await _checkPermission(handle);
  if (!granted) return null;

  _folderHandles.set(dealId, handle);
  return handle;
}

/**
 * Unlink a folder from a deal.
 */
async function folderUnlink(dealId) {
  _folderHandles.delete(dealId);
  await _folderDelete(dealId);
}

// ── File text extraction ────────────────────────

async function _extractText(fileEntry) {
  const file = await fileEntry.getFile();
  const info = _fileTypeFor(file.name);
  if (!info) return null;

  try {
    if (info.key === 'pdf') {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const pages = [];
      const maxPg = Math.min(pdf.numPages, 100);
      for (let p = 1; p <= maxPg; p++) {
        const pg = await pdf.getPage(p);
        const ct = await pg.getTextContent();
        pages.push(`--- Page ${p} ---\n` + ct.items.map(i => i.str).join(' '));
      }
      return pages.join('\n\n');
    }

    if (info.key === 'xlsx') {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      return wb.SheetNames.map(name => {
        const rows = XLSX.utils.sheet_to_csv(wb.Sheets[name], { defval: '' })
          .split('\n').slice(0, 200).join('\n');
        return `=== Sheet: ${name} ===\n${rows}`;
      }).join('\n\n');
    }

    if (info.key === 'docx') {
      // Best-effort XML text extraction (no mammoth dependency)
      const buf = await file.arrayBuffer();
      const raw = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      const matches = raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      return matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
    }

    // csv / txt / md — plain text
    return await file.text();

  } catch (e) {
    console.warn(`[FolderAccess] Extract failed for ${file.name}:`, e.message);
    return null;
  }
}

/**
 * Scan all files in the deal's folder and return extracted text objects.
 * Same shape as getAllDealDocumentTexts — {name, category, text}.
 */
async function folderGetTexts(dealId) {
  const handle = await folderGetHandle(dealId);
  if (!handle) return [];

  // Map file type → document category (mirrors deal-docs.js priority)
  const typeToCategory = {
    pdf: 'cim', xlsx: 'financials', csv: 'financials', docx: 'other', txt: 'other',
  };

  const files = [];
  for await (const [name, entry] of handle) {
    if (entry.kind !== 'file') continue;
    const info = _fileTypeFor(name);
    if (!info) continue;
    files.push({ name, info, entry });
  }

  // Sort by file type priority
  files.sort((a, b) => a.info.priority - b.info.priority);

  const MAX_CHARS = 50_000;
  let total = 0;
  const result = [];

  for (const { name, info, entry } of files) {
    if (total >= MAX_CHARS) break;
    const text = await _extractText(entry);
    if (!text?.trim()) continue;
    const chunk = text.substring(0, Math.min(12_000, MAX_CHARS - total));
    result.push({ name, category: typeToCategory[info.key] || 'other', text: chunk });
    total += chunk.length;
  }

  return result;
}

// ── UI helpers ──────────────────────────────────

/**
 * Build and return the HTML for the folder section.
 * Injects into #folder-access-wrapper.
 */
async function folderRenderSection(dealId) {
  const wrapper = document.getElementById('folder-access-wrapper');
  if (!wrapper) return;

  // Show spinner while scanning
  wrapper.innerHTML = `<div class="fa-scanning">
    <div class="fa-spinner"></div><span>Scanning folder…</span>
  </div>`;

  const record = await _folderLoad(dealId);

  if (!record) {
    wrapper.innerHTML = _renderEmpty(dealId);
    return;
  }

  const handle = await folderGetHandle(dealId);

  if (!handle) {
    wrapper.innerHTML = _renderNoPermission(dealId, record);
    return;
  }

  // Scan files
  const files = [];
  for await (const [name, entry] of handle) {
    if (entry.kind !== 'file') continue;
    const info = _fileTypeFor(name);
    if (!info) continue;
    const file = await entry.getFile();
    files.push({ name, info, size: file.size, modified: file.lastModified });
  }
  files.sort((a, b) => a.info.priority - b.info.priority || a.name.localeCompare(b.name));

  // Update stored file count
  await _folderSave({ ...record, fileCount: files.length, handle });

  wrapper.innerHTML = _renderLinked(dealId, record, files);
}

function _renderEmpty(dealId) {
  return `
  <div class="fa-card fa-empty">
    <div class="fa-empty-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    </div>
    <div class="fa-empty-body">
      <div class="fa-empty-title">Link a folder to this deal</div>
      <div class="fa-empty-sub">Assign a local folder (Dropbox, OneDrive, or any local path) and every AI feature — fit score, diligence, NDA review — will automatically read the documents inside it.</div>
    </div>
    <button class="fa-link-btn" onclick="folderPickAndRefresh('${dealId}')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      Link Folder
    </button>
  </div>`;
}

function _renderNoPermission(dealId, record) {
  return `
  <div class="fa-card fa-no-perm">
    <div class="fa-header">
      <div class="fa-folder-info">
        <div class="fa-folder-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <div class="fa-folder-name">${escapeHtml(record.folderName)}</div>
          <div class="fa-folder-meta"><span class="fa-dot inactive"></span> Permission needed this session</div>
        </div>
      </div>
      <button class="fa-action-btn danger" onclick="folderUnlinkConfirm('${dealId}')">Unlink</button>
    </div>
    <div class="fa-perm-banner">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Chrome requires you to re-grant folder access each browser session.
      <button class="fa-grant-btn" onclick="folderGrantAndRefresh('${dealId}')">Grant Access →</button>
    </div>
  </div>`;
}

function _renderLinked(dealId, record, files) {
  const dateStr = new Date(record.linkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fileRows = files.length > 0
    ? files.map(f => `
      <div class="fa-file-row">
        <span class="fa-file-icon">${f.info.icon}</span>
        <span class="fa-file-name">${escapeHtml(f.name)}</span>
        <span class="fa-file-meta">${f.info.label} · ${_fmtBytes(f.size)}</span>
      </div>`).join('')
    : `<div class="fa-file-empty">No supported files yet. Add PDFs, Excel, Word, or text files to the folder.</div>`;

  return `
  <div class="fa-card fa-linked">
    <div class="fa-header">
      <div class="fa-folder-info">
        <div class="fa-folder-icon active">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <div class="fa-folder-name">${escapeHtml(record.folderName)}</div>
          <div class="fa-folder-meta">
            <span class="fa-dot active"></span>
            ${files.length} file${files.length !== 1 ? 's' : ''} · linked ${dateStr} · AI-enabled
          </div>
        </div>
      </div>
      <div class="fa-actions">
        <button class="fa-action-btn" onclick="folderRefresh('${dealId}')" title="Re-scan folder">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
        <button class="fa-action-btn" onclick="folderPickAndRefresh('${dealId}')" title="Link a different folder">Change</button>
        <button class="fa-action-btn danger" onclick="folderUnlinkConfirm('${dealId}')">Unlink</button>
      </div>
    </div>
    <div class="fa-file-list">${fileRows}</div>
  </div>`;
}

// ── onclick handlers (called from inline HTML) ──

async function folderPickAndRefresh(dealId) {
  const ok = await folderPick(dealId);
  if (ok) await folderRenderSection(dealId);
}

async function folderGrantAndRefresh(dealId) {
  const handle = await folderGetHandle(dealId);
  if (handle) {
    showToast('Access granted.', 'success');
    await folderRenderSection(dealId);
  } else {
    showToast('Access denied. Try unlinking and re-linking the folder.', 'error');
  }
}

async function folderRefresh(dealId) {
  await folderRenderSection(dealId);
}

function folderUnlinkConfirm(dealId) {
  confirmDialog(
    'Unlink Folder',
    'This removes the folder link. Your files on disk are untouched.',
    async () => {
      await folderUnlink(dealId);
      showToast('Folder unlinked.', 'info');
      await folderRenderSection(dealId);
    }
  );
}
