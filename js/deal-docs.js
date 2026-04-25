/* ============================================
   Nexus CRM — Deal Document Intelligence
   ============================================ */

const DOC_CATEGORIES = [
  { value: 'cim', label: 'CIM / Teaser' },
  { value: 'financials', label: 'Financial Statements' },
  { value: 'tax', label: 'Tax Returns' },
  { value: 'legal', label: 'Legal / Contracts' },
  { value: 'qoe', label: 'Quality of Earnings' },
  { value: 'customer', label: 'Customer Data' },
  { value: 'management', label: 'Management Info' },
  { value: 'model', label: 'Financial Model' },
  { value: 'other', label: 'Other' },
];

const DOC_CATEGORY_ICONS = {
  cim: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>',
  financials: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>',
  tax: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>',
  default: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>',
};

function getDocIcon(category) {
  return DOC_CATEGORY_ICONS[category] || DOC_CATEGORY_ICONS.default;
}

function getDocCategoryLabel(value) {
  const cat = DOC_CATEGORIES.find(c => c.value === value);
  return cat ? cat.label : value;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function openDocUploadModal(dealId) {
  openModal('Upload Document', `
    <div class="p-6 space-y-4">
      <div>
        <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">File</label>
        <input type="file" id="doc-file-input" accept=".pdf,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg,.doc,.docx"
          class="input-field" onchange="onDocFileSelected()" />
        <p class="text-xs text-surface-400 mt-1">Supports PDF, Excel, CSV, images, and text files (max 25MB)</p>
      </div>
      <div>
        <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Category</label>
        <select id="doc-category" class="input-field">
          ${DOC_CATEGORIES.map(c => `<option value="${c.value}">${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </div>
      <div id="doc-preview-area" class="hidden">
        <div class="p-3 bg-surface-50 dark:bg-surface-800 rounded text-sm">
          <div class="flex items-center gap-2">
            <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span id="doc-file-name" class="font-medium"></span>
          </div>
          <span id="doc-file-size" class="text-xs text-surface-400 ml-7"></span>
        </div>
      </div>
      <div class="flex justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-800">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="uploadDealDocument('${dealId}')" class="btn-primary" id="doc-upload-btn" disabled>Upload & Extract</button>
      </div>
    </div>
  `);
}

function onDocFileSelected() {
  const input = document.getElementById('doc-file-input');
  const preview = document.getElementById('doc-preview-area');
  const btn = document.getElementById('doc-upload-btn');

  if (input.files.length > 0) {
    const file = input.files[0];
    document.getElementById('doc-file-name').textContent = file.name;
    document.getElementById('doc-file-size').textContent = formatFileSize(file.size);
    preview.classList.remove('hidden');
    btn.disabled = false;

    // Auto-detect category from filename
    const name = file.name.toLowerCase();
    const catSelect = document.getElementById('doc-category');
    if (name.includes('cim') || name.includes('teaser') || name.includes('overview')) catSelect.value = 'cim';
    else if (name.includes('financial') || name.includes('p&l') || name.includes('income') || name.includes('balance')) catSelect.value = 'financials';
    else if (name.includes('tax')) catSelect.value = 'tax';
    else if (name.includes('contract') || name.includes('legal') || name.includes('nda')) catSelect.value = 'legal';
    else if (name.includes('qoe') || name.includes('quality')) catSelect.value = 'qoe';
    else if (name.includes('model')) catSelect.value = 'model';
  } else {
    preview.classList.add('hidden');
    btn.disabled = true;
  }
}

async function uploadDealDocument(dealId) {
  const input    = document.getElementById('doc-file-input');
  const category = document.getElementById('doc-category').value;

  if (!input.files.length) return showToast('Please select a file', 'error');

  const file = input.files[0];
  if (file.size > 25 * 1024 * 1024) return showToast('File too large (max 25MB)', 'error');

  const btn = document.getElementById('doc-upload-btn');
  btn.disabled    = true;
  btn.textContent = 'Processing…';

  try {
    const base64 = await readFileAsBase64(file);
    const ext    = file.name.split('.').pop().toLowerCase();
    const type   = getDocType(ext);

    const doc = {
      id: generateId(),
      dealId,
      userId: currentUser.id,
      name: file.name,
      type,
      category,
      mimeType: file.type,
      size: file.size,
      data: base64,
      extractedText: null,
      extractedTables: null,
      aiExtractedAt: null,      // set when AI field extraction completes
      uploadedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // ── Text extraction ──────────────────────────────
    try {
      if (type === 'pdf' && typeof pdfjsLib !== 'undefined') {
        btn.textContent = 'Extracting text…';
        doc.extractedText = await extractTextFromPDF(base64);
      } else if (type === 'xlsx' && typeof XLSX !== 'undefined') {
        const result = await extractDataFromSpreadsheet(base64, file.name);
        doc.extractedText = result.text;
        doc.extractedTables = result.tables;
      } else if (['csv', 'txt', 'md'].includes(ext)) {
        doc.extractedText = atob(base64.split(',')[1] || base64);
      }
    } catch (e) {
      console.warn('[Docs] Text extraction failed:', e);
    }

    await DB.put(STORES.dealDocuments, doc);
    await logDealHistory(dealId, 'document_uploaded', {
      documentId: doc.id, name: doc.name, category, extracted: !!doc.extractedText,
    });

    closeModal();
    showToast(`"${file.name}" uploaded${doc.extractedText ? ' — reading with AI…' : ''}`, 'success');

    // ── Auto AI field extraction (non-blocking) ──────
    if (doc.extractedText && doc.extractedText.length > 200) {
      // Fire-and-forget — user sees the docs tab immediately
      _autoExtractFields(doc, dealId);
    }

    // ── Auto financial history extraction for financial/model/qoe docs ──────
    if (['financials', 'model', 'qoe', 'tax'].includes(category) &&
        (doc.extractedText || doc.extractedTables)) {
      _extractFinancialHistory(doc, dealId);
    }

    // Re-render docs tab
    if (typeof currentDealId !== 'undefined' && currentDealId === dealId) {
      switchDealTab('documents');
    }
  } catch (err) {
    showToast('Upload failed: ' + err.message, 'error');
    btn.disabled    = false;
    btn.textContent = 'Upload & Extract';
  }
}

/**
 * Run AI field extraction silently in the background after upload.
 * Shows a progress toast and refreshes the overview on completion.
 */
async function _autoExtractFields(doc, dealId) {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`).catch(() => null);
  if (!settings?.openaiApiKey && !settings?.claudeApiKey) return;

  try {
    const deal = await DB.get(STORES.deals, dealId);
    if (!deal) return;

    const { parsed, appliedCount } = await _runAIExtraction(doc, deal);
    if (!parsed) return;

    if (appliedCount > 0) {
      deal.updatedAt = new Date().toISOString();
      await DB.put(STORES.deals, deal);
      await logDealHistory(dealId, 'field_updated', { fields: `Auto-extracted ${appliedCount} fields from ${doc.name}` });

      // Mark the document as AI-extracted
      doc.aiExtractedAt = new Date().toISOString();
      await DB.put(STORES.dealDocuments, doc);

      showToast(`✓ ${appliedCount} field${appliedCount !== 1 ? 's' : ''} auto-filled from "${doc.name}"`, 'success');

      // Refresh the full deal UI to show new data (including header stats row)
      if (typeof currentDealId !== 'undefined' && currentDealId === dealId) {
        viewDeal(dealId);
      }
    }
  } catch (e) {
    console.warn('[Docs] Auto-extraction failed:', e.message);
    // Silent fail — don't bother the user for background extraction
  }
}

/**
 * Extract multi-year financial history from a document and store it on the deal record.
 * Handles both PDF/text (AI) and spreadsheet (extractedTables) sources.
 */
async function _extractFinancialHistory(doc, dealId) {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`).catch(() => null);
  if (!settings?.openaiApiKey && !settings?.claudeApiKey) return;

  try {
    const deal = await DB.get(STORES.deals, dealId);
    if (!deal) return;

    // Build extraction context — prefer raw table data for spreadsheets
    let context = '';
    if (doc.extractedTables && doc.extractedTables.length > 0) {
      context = doc.extractedTables.slice(0, 4).map(t =>
        `Sheet: ${t.sheet}\n` + t.data.slice(0, 60).map(row => (row || []).join('\t')).join('\n')
      ).join('\n\n').substring(0, 8000);
    } else if (doc.extractedText) {
      context = _buildExtractionContext(doc.extractedText, doc.category).substring(0, 6000);
    }
    if (!context) return;

    const currentYear = new Date().getFullYear();
    const raw = await callAI(
      'You are an expert financial analyst. Extract multi-year financial history from documents. Return ONLY a valid JSON array.',
      `Extract annual financial data from this ${doc.category} document: "${doc.name}".

Return a JSON ARRAY (not an object) of annual data. Include every year you can find. Respond with ONLY the array, no explanation:

[
  {
    "year": 2021,
    "label": "FY2021",
    "revenue": 2100000,
    "ebitda": 420000,
    "ebitdaMargin": 20.0,
    "grossMargin": 52.0,
    "netIncome": null,
    "isProjected": false
  }
]

Rules:
- All dollar amounts as plain numbers (no $, no commas)
- Percentages as plain numbers (20.5 means 20.5%)
- Use null for any metric not found — do NOT invent data
- Mark projected/forecast years with "isProjected": true
- If only TTM/LTM data found with no specific year, use ${currentYear - 1}
- Sort oldest year first

DOCUMENT:
${context}`,
      900, 0.05
    );

    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\[[\s\S]+\]/);
      parsed = m ? JSON.parse(m[0]) : null;
    }
    if (!Array.isArray(parsed) || !parsed.length) return;

    // Filter out entries with no real financial data
    const valid = parsed.filter(h => h.year && (h.revenue != null || h.ebitda != null));
    if (!valid.length) return;

    // Merge with existing history — fill in nulls, never overwrite existing values
    const existing = deal.financialHistory || [];
    const merged = [...existing];
    for (const item of valid) {
      const idx = merged.findIndex(e => e.year === item.year);
      if (idx >= 0) {
        Object.keys(item).forEach(k => {
          if (item[k] != null && merged[idx][k] == null) merged[idx][k] = item[k];
        });
      } else {
        merged.push(item);
      }
    }
    merged.sort((a, b) => a.year - b.year);

    deal.financialHistory = merged;
    deal.updatedAt = new Date().toISOString();
    await DB.put(STORES.deals, deal);

    if (merged.length > 0) {
      showToast(
        `📊 Financial history: ${merged.length} year${merged.length !== 1 ? 's' : ''} of data from "${doc.name}"`,
        'success'
      );
      if (typeof currentDealId !== 'undefined' && currentDealId === dealId) {
        viewDeal(dealId);
      }
    }
  } catch (e) {
    console.warn('[Docs] Financial history extraction failed:', e.message);
  }
}

/**
 * Re-extract financial history from ALL documents for this deal.
 * Called by the "Refresh from Docs" button on the Financials tab.
 */
async function _refreshFinancialHistory(dealId) {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`).catch(() => null);
  if (!settings?.openaiApiKey && !settings?.claudeApiKey) {
    return showToast('Add an AI API key in Settings to extract financial history.', 'error');
  }

  const docs = (await DB.getAllByIndex(STORES.dealDocuments, 'dealId', dealId))
    .filter(d => d.userId === currentUser.id && (d.extractedText || d.extractedTables));

  if (!docs.length) {
    return showToast('No documents with extractable content found. Upload financial statements first.', 'error');
  }

  showToast('Re-extracting financial history from all documents…', 'info');

  // Clear existing history first so we get a clean re-run
  try {
    const deal = await DB.get(STORES.deals, dealId);
    if (deal) { deal.financialHistory = []; await DB.put(STORES.deals, deal); }
  } catch (_) {}

  // Prioritise financial docs, then process all
  const priority = ['financials', 'model', 'qoe', 'tax', 'cim', 'other'];
  docs.sort((a, b) => priority.indexOf(a.category) - priority.indexOf(b.category));

  for (const doc of docs) {
    try { await _extractFinancialHistory(doc, dealId); } catch (_) {}
  }

  if (typeof currentDealId !== 'undefined' && currentDealId === dealId) {
    switchDealTab('financials');
  }
}

/**
 * Open a modal to manually add or edit a single year of financial data.
 */
function _openFinancialHistoryEntry(dealId) {
  const yr = new Date().getFullYear() - 1;
  openModal('Add Financial Year', `
    <div class="p-6 space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Year *</label>
          <input type="number" id="fh-year" class="input-field" value="${yr}" min="1990" max="${yr + 10}" />
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Label <span class="font-normal text-surface-400">(optional)</span></label>
          <input type="text" id="fh-label" class="input-field" placeholder="e.g. FY2023, LTM" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Revenue ($)</label>
          <input type="number" id="fh-revenue" class="input-field" placeholder="e.g. 2500000" />
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">EBITDA ($)</label>
          <input type="number" id="fh-ebitda" class="input-field" placeholder="e.g. 500000" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Gross Margin (%)</label>
          <input type="number" id="fh-gross-margin" class="input-field" placeholder="e.g. 55.2" step="0.1" />
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Net Income ($)</label>
          <input type="number" id="fh-net-income" class="input-field" placeholder="e.g. 200000" />
        </div>
      </div>
      <label class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400 cursor-pointer">
        <input type="checkbox" id="fh-projected" class="rounded" />
        Mark as projected / forecast year
      </label>
      <div class="flex justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-800">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="_saveFinancialHistoryEntry('${dealId}')" class="btn-primary">Save Year</button>
      </div>
    </div>
  `);
}

async function _saveFinancialHistoryEntry(dealId) {
  const year = parseInt(document.getElementById('fh-year')?.value);
  if (!year || year < 1990 || year > 2040) return showToast('Please enter a valid year (1990–2040)', 'error');

  const revenue     = parseFloat(document.getElementById('fh-revenue')?.value)      || null;
  const ebitda      = parseFloat(document.getElementById('fh-ebitda')?.value)       || null;
  const grossMargin = parseFloat(document.getElementById('fh-gross-margin')?.value) || null;
  const netIncome   = parseFloat(document.getElementById('fh-net-income')?.value)   || null;
  const label       = document.getElementById('fh-label')?.value.trim()             || null;
  const isProjected = document.getElementById('fh-projected')?.checked              || false;
  const ebitdaMargin = (revenue && ebitda) ? +(ebitda / revenue * 100).toFixed(2)   : null;

  const deal = await DB.get(STORES.deals, dealId);
  if (!deal) return;

  const history = deal.financialHistory || [];
  const idx     = history.findIndex(h => h.year === year);
  const entry   = { year, label, revenue, ebitda, ebitdaMargin, grossMargin, netIncome, isProjected };

  if (idx >= 0) { history[idx] = entry; } else { history.push(entry); }
  history.sort((a, b) => a.year - b.year);

  deal.financialHistory = history;
  deal.updatedAt        = new Date().toISOString();
  await DB.put(STORES.deals, deal);

  closeModal();
  showToast('Financial data saved', 'success');
  if (typeof switchDealTab === 'function') switchDealTab('financials');
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getDocType(ext) {
  if (ext === 'pdf') return 'pdf';
  if (['xlsx', 'xls'].includes(ext)) return 'xlsx';
  if (ext === 'csv') return 'csv';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  return 'other';
}

async function extractTextFromPDF(base64Data) {
  if (typeof pdfjsLib === 'undefined') return null;

  // Set worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const data = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const binaryData = atob(data);
  const bytes = new Uint8Array(binaryData.length);
  for (let i = 0; i < binaryData.length; i++) bytes[i] = binaryData.charCodeAt(i);

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  let text = '';

  for (let i = 1; i <= Math.min(pdf.numPages, 100); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    text += `\n--- Page ${i} ---\n${pageText}`;
  }

  return text.trim();
}

async function extractDataFromSpreadsheet(base64Data, filename) {
  if (typeof XLSX === 'undefined') return { text: null, tables: null };

  const data = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const binaryData = atob(data);
  const bytes = new Uint8Array(binaryData.length);
  for (let i = 0; i < binaryData.length; i++) bytes[i] = binaryData.charCodeAt(i);

  const workbook = XLSX.read(bytes, { type: 'array' });
  let text = '';
  const tables = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    text += `\n--- Sheet: ${sheetName} ---\n${csv}`;
    tables.push({ sheet: sheetName, data: json.slice(0, 200) }); // limit rows
  }

  return { text: text.trim(), tables };
}

async function getDocumentTexts(documentIds) {
  const texts = [];
  for (const id of documentIds) {
    const doc = await DB.get(STORES.dealDocuments, id);
    if (doc && doc.extractedText) {
      texts.push({
        id: doc.id,
        name: doc.name,
        category: doc.category,
        text: doc.extractedText.substring(0, 12000), // ~3K tokens per doc max
      });
    }
  }
  return texts;
}

async function getAllDealDocumentTexts(dealId) {
  const docs = await DB.getAllByIndex(STORES.dealDocuments, 'dealId', dealId);
  const withText = docs.filter(d => d.extractedText);
  // Prioritize: CIM first, then financials, then others
  const priority = ['cim', 'financials', 'qoe', 'model', 'customer', 'tax', 'legal', 'management', 'other'];
  withText.sort((a, b) => priority.indexOf(a.category) - priority.indexOf(b.category));

  const maxChars = 50000; // ~12K tokens
  let totalChars = 0;
  const result = [];

  for (const doc of withText) {
    const remaining = maxChars - totalChars;
    if (remaining <= 0) break;
    const text = doc.extractedText.substring(0, remaining);
    result.push({ name: doc.name, category: doc.category, text, source: 'upload' });
    totalChars += text.length;
  }

  // Merge in folder documents (if a folder is linked and permission is active)
  if (typeof folderGetTexts === 'function' && totalChars < maxChars) {
    try {
      const folderDocs = await folderGetTexts(dealId);
      for (const fd of folderDocs) {
        const remaining = maxChars - totalChars;
        if (remaining <= 0) break;
        // Skip if an uploaded doc with the same name already exists
        const alreadyHave = result.some(r => r.name === fd.name);
        if (alreadyHave) continue;
        const text = fd.text.substring(0, remaining);
        result.push({ ...fd, text, source: 'folder' });
        totalChars += text.length;
      }
    } catch (e) {
      console.warn('[Docs] Could not read folder files:', e.message);
    }
  }

  return result;
}

async function deleteDealDocument(docId, dealId) {
  confirmDialog('Delete Document', 'This document and its extracted data will be permanently deleted.', async () => {
    const doc = await DB.get(STORES.dealDocuments, docId);
    await DB.delete(STORES.dealDocuments, docId);
    await logDealHistory(dealId, 'document_deleted', { documentId: docId, name: doc?.name });
    showToast('Document deleted', 'success');
    if (typeof currentDealId !== 'undefined' && currentDealId === dealId) {
      switchDealTab('documents');
    }
  });
}

function renderDocumentCard(doc) {
  const catLabel   = getDocCategoryLabel(doc.category);
  const icon       = getDocIcon(doc.category);
  const hasText    = !!doc.extractedText;
  const aiDone     = !!doc.aiExtractedAt;
  const aiTimeAgo  = aiDone ? _timeAgo(doc.aiExtractedAt) : null;

  return `
    <div class="flex items-center gap-3 p-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600 transition-colors bg-white dark:bg-surface-900">
      <div class="p-2 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-500 flex-shrink-0">
        ${icon}
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(doc.name)}</div>
        <div class="flex items-center gap-2 mt-0.5 flex-wrap">
          <span class="text-xs text-surface-400">${catLabel}</span>
          <span class="text-xs text-surface-300">·</span>
          <span class="text-xs text-surface-400">${formatFileSize(doc.size)}</span>
          ${aiDone ? `
            <span class="text-xs text-brand-500 dark:text-brand-400 flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
              AI fields extracted ${aiTimeAgo ? `· ${aiTimeAgo}` : ''}
            </span>` : hasText ? `
            <span class="text-xs text-green-500 flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 12.75l6 6 9-13.5"/></svg>
              Text ready
            </span>` : `
            <span class="text-xs text-surface-300">No text extracted</span>`}
        </div>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        ${hasText ? `
          <button onclick="extractFieldsFromDoc('${doc.id}', '${doc.dealId}')"
            class="px-2 py-1 rounded-lg text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 border border-brand-200 dark:border-brand-800 transition-colors"
            title="${aiDone ? 'Re-run AI field extraction' : 'Extract deal fields with AI'}">
            <span class="flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
              ${aiDone ? 'Re-extract' : 'Extract'}
            </span>
          </button>
          <button onclick="viewExtractedText('${doc.id}')" class="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600" title="View extracted text">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </button>` : ''}
        <button onclick="previewDocument('${doc.id}')" class="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-brand-600" title="Preview document">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"/></svg>
        </button>
        <button onclick="deleteDealDocument('${doc.id}', '${doc.dealId}')" class="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-400 hover:text-red-500" title="Delete">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
        </button>
      </div>
    </div>
  `;
}

// ── Document Preview ─────────────────────────────────────────────

async function previewDocument(docId) {
  const doc = await DB.get(STORES.dealDocuments, docId);
  if (!doc) return showToast('Document not found', 'error');

  const catLabel = getDocCategoryLabel(doc.category);
  const ext = doc.name.split('.').pop().toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
  const isPdf   = ext === 'pdf';
  const hasText = !!doc.extractedText;

  // Build the viewer content
  let viewerHtml = '';
  if (isPdf && doc.data) {
    viewerHtml = `
      <iframe src="${doc.data}" class="w-full rounded border border-surface-200 dark:border-surface-700"
        style="height:70vh;" title="${escapeHtml(doc.name)}"></iframe>`;
  } else if (isImage && doc.data) {
    viewerHtml = `
      <div class="flex items-center justify-center bg-surface-50 dark:bg-surface-800 rounded border border-surface-200 dark:border-surface-700 p-4" style="min-height:40vh;">
        <img src="${doc.data}" alt="${escapeHtml(doc.name)}" class="max-w-full max-h-[65vh] object-contain rounded" />
      </div>`;
  } else if (hasText) {
    viewerHtml = `
      <div class="bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded p-4 overflow-y-auto text-xs font-mono leading-relaxed whitespace-pre-wrap text-surface-700 dark:text-surface-300" style="max-height:65vh;">${escapeHtml(doc.extractedText.slice(0, 50000))}</div>`;
  } else if (doc.data) {
    viewerHtml = `
      <div class="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <svg class="w-12 h-12 text-surface-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
        <p class="text-sm text-surface-500">Preview not available for this file type.</p>
        <a href="${doc.data}" download="${escapeHtml(doc.name)}" class="btn-primary">Download File</a>
      </div>`;
  } else {
    viewerHtml = `<p class="text-center text-sm text-surface-400 py-8">No content available to preview.</p>`;
  }

  openModal(`
    <div style="max-width:860px;margin:0 auto;">
      <!-- Header -->
      <div class="flex items-start justify-between p-5 border-b border-surface-200 dark:border-surface-700">
        <div class="flex items-center gap-3 min-w-0">
          <div class="p-2 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-500 flex-shrink-0">${getDocIcon(doc.category)}</div>
          <div class="min-w-0">
            <h2 class="text-base font-semibold truncate">${escapeHtml(doc.name)}</h2>
            <p class="text-xs text-surface-400 mt-0.5">${catLabel} · ${formatFileSize(doc.size)} · Uploaded ${_timeAgo(doc.uploadedAt)}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0 ml-4">
          ${doc.data ? `<a href="${doc.data}" download="${escapeHtml(doc.name)}" class="btn-secondary btn-sm flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
            Download
          </a>` : ''}
          ${hasText ? `<button onclick="docAISummary('${docId}')" class="btn-primary btn-sm flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
            AI Summary
          </button>` : ''}
          <button onclick="closeModal()" class="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
      <!-- Viewer -->
      <div class="p-5">
        ${viewerHtml}
        <div id="doc-ai-summary-area" class="hidden mt-4"></div>
      </div>
    </div>
  `, { wide: true });
}

async function docAISummary(docId) {
  const area = document.getElementById('doc-ai-summary-area');
  if (!area) return;
  area.classList.remove('hidden');
  area.innerHTML = `<div class="flex items-center gap-2 text-sm text-surface-500 py-3"><div class="w-4 h-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin"></div> Generating AI summary…</div>`;

  const doc = await DB.get(STORES.dealDocuments, docId);
  if (!doc?.extractedText) {
    area.innerHTML = `<p class="text-sm text-surface-400">No extracted text available to summarize.</p>`;
    return;
  }

  try {
    const context = _buildExtractionContext(doc.extractedText, doc.category);
    const summary = await callAI(
      'You are a search fund analyst. Summarize this document concisely for a deal review. Be factual and specific.',
      `Document: "${doc.name}" (${getDocCategoryLabel(doc.category)})\n\n${context}\n\nProvide a concise 5-8 bullet point summary covering: key financials, business overview, notable strengths, risks or concerns, and anything unusual or important.`,
      800, 0.2
    );
    area.innerHTML = `
      <div class="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg p-4">
        <div class="flex items-center gap-2 mb-3">
          <svg class="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
          <span class="text-sm font-semibold text-brand-700 dark:text-brand-400">AI Document Summary</span>
        </div>
        <div class="text-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap leading-relaxed">${escapeHtml(summary)}</div>
      </div>`;
  } catch (err) {
    area.innerHTML = `<p class="text-sm text-red-500">Summary failed: ${escapeHtml(err.message)}</p>`;
  }
}

function _timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE AI EXTRACTION ENGINE
// Shared by auto-extract (silent) and manual extract (modal UI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build smart context from document text:
 * intro section + financially-rich pages + category-specific sections.
 */
function _buildExtractionContext(text, category) {
  const lines  = text.split('\n');
  const chunks = [];
  for (let i = 0; i < lines.length; i += 40) chunks.push(lines.slice(i, i + 40).join('\n'));

  const FIN_KW  = /revenue|ebitda|gross\s*margin|net\s*income|cash\s*flow|asking|enterprise\s*value|recurring|arr|mrr/i;
  const CUST_KW = /customer|client|concentration|top \d|churn|nrr|retention/i;
  const MGMT_KW = /founder|owner|ceo|president|management|employee|headcount|staff/i;
  const RISK_KW = /risk|concern|competition|competitor|litigation|covenant|debt/i;

  const intro   = chunks.slice(0, 5).join('\n\n').substring(0, 4000);
  const finPart = chunks.filter(c => FIN_KW.test(c)).slice(0, 5).join('\n---\n').substring(0, 3000);
  const custPart = category === 'customer'
    ? chunks.filter(c => CUST_KW.test(c)).slice(0, 4).join('\n---\n').substring(0, 2000) : '';
  const mgmtPart = ['management', 'qoe'].includes(category)
    ? chunks.filter(c => MGMT_KW.test(c)).slice(0, 3).join('\n---\n').substring(0, 1500) : '';
  const riskPart = chunks.filter(c => RISK_KW.test(c)).slice(0, 3).join('\n---\n').substring(0, 1500);

  return [
    intro,
    finPart  ? '\n\n=== FINANCIALS ===\n'    + finPart  : '',
    custPart ? '\n\n=== CUSTOMERS ===\n'     + custPart : '',
    mgmtPart ? '\n\n=== MANAGEMENT ===\n'   + mgmtPart : '',
    riskPart ? '\n\n=== RISKS/CONCERNS ===\n' + riskPart : '',
  ].join('').substring(0, 12000);
}

/**
 * Call the AI and return parsed JSON + the number of deal fields that were applied.
 * Mutates `deal` in place — caller must save to DB.
 */
async function _runAIExtraction(doc, deal) {
  const context = _buildExtractionContext(doc.extractedText, doc.category);
  const SECTORS = typeof DEAL_SECTORS !== 'undefined' ? DEAL_SECTORS.join('|') : 'Business Services|Healthcare Services|Technology|Industrial|Consumer|Education|Construction / Trades|Distribution|Food & Beverage|Financial Services|Other';

  const raw = await callAI(
    'You are an expert M&A analyst specializing in lower-middle-market search fund acquisitions. Extract all available deal data from the document and return ONLY valid JSON — no markdown, no explanation, no trailing text.',
    `Analyze this document and return a JSON object. Use null for any field not found. Do NOT invent data.

DOCUMENT TYPE: ${doc.category} — "${doc.name}"

Return this exact structure:
{
  "companyName": "Legal or trade name of the company",
  "website": "Company website URL or null",
  "foundedYear": <4-digit integer year or null>,
  "sector": "${SECTORS}",
  "subsector": "Specific niche e.g. HVAC Contractor, B2B SaaS",
  "location": "City, State (primary operations)",
  "revenue": <TTM/LTM revenue as plain USD number or null>,
  "ebitda": <Adjusted/normalized EBITDA as plain USD number or null>,
  "ebitdaMargin": <EBITDA as % of revenue, number only or null>,
  "askingPrice": <Asking/listed price as plain USD number or null>,
  "askingMultiple": <EV/EBITDA multiple as decimal number or null>,
  "employeeCount": <integer headcount or null>,
  "revenueGrowthRate": <annual revenue growth % as number e.g. 12 for 12% or null>,
  "recurringRevenuePct": <% of revenue that is recurring/contracted e.g. 65 for 65% or null>,
  "customerConcentration": "Narrative e.g. Top customer 18%, top 5 is 42% of revenue",
  "ownerSituation": "e.g. Founder retiring, absentee owner, second-gen transition or null",
  "description": "3–5 sentence plain-text description of what the business does, who it serves, and what makes it distinctive",
  "thesis": "2–3 sentence plain-text investment thesis from a search fund perspective",
  "concerns": "Key risks, red flags or concerns, or null if none apparent",
  "tags": ["concise keyword tags, e.g. recurring-revenue, founder-owned, B2B"]
}

All dollar amounts must be plain numbers (no $, no commas). Prefer TTM/LTM figures.

DOCUMENT:
${context}`,
    1500, 0.05
  );

  // Parse JSON — strip markdown fences if present
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]+\}/);
    parsed = m ? JSON.parse(m[0]) : null;
  }
  if (!parsed) throw new Error('AI returned invalid JSON. Try again.');

  // ── Apply to deal (blank fields only) ──────────────────────────────────────
  let appliedCount = 0;
  const set = (field, val) => {
    if (val != null && val !== '' && !deal[field]) {
      deal[field] = val;
      appliedCount++;
    }
  };

  // Name: only replace placeholder
  if (parsed.companyName && (!deal.name || deal.name === 'Unnamed Deal')) {
    deal.name = parsed.companyName; appliedCount++;
  }

  set('website',      parsed.website);
  set('location',     parsed.location);
  set('subsector',    parsed.subsector);
  set('description',  parsed.description);
  set('thesis',       parsed.thesis);
  set('ownerSituation', parsed.ownerSituation);
  set('foundedYear',  parsed.foundedYear ? parseInt(parsed.foundedYear) : null);
  set('employeeCount', parsed.employeeCount ? parseInt(parsed.employeeCount) : null);

  // Financials
  if (!deal.revenue     && parsed.revenue)     { deal.revenue     = Math.round(parsed.revenue);     appliedCount++; }
  if (!deal.ebitda      && parsed.ebitda)      { deal.ebitda      = Math.round(parsed.ebitda);      appliedCount++; }
  if (!deal.askingPrice && parsed.askingPrice) { deal.askingPrice = Math.round(parsed.askingPrice); appliedCount++; }
  if (!deal.askingMultiple) {
    const mult = parsed.askingMultiple
      || (parsed.ebitda && parsed.askingPrice ? +(parsed.askingPrice / parsed.ebitda).toFixed(2) : null);
    if (mult) { deal.askingMultiple = mult; appliedCount++; }
  }

  // Metrics — store even if already present (these are often discovered later)
  if (parsed.recurringRevenuePct != null && !deal.recurringRevenuePct) {
    deal.recurringRevenuePct = parsed.recurringRevenuePct; appliedCount++;
  }
  if (parsed.revenueGrowthRate != null && !deal.revenueGrowthRate) {
    deal.revenueGrowthRate = parsed.revenueGrowthRate; appliedCount++;
  }
  if (parsed.customerConcentration && !deal.customerConcentration) {
    deal.customerConcentration = parsed.customerConcentration; appliedCount++;
  }

  // Sector — fuzzy match against DEAL_SECTORS
  if (!deal.sector && parsed.sector) {
    const sectors = typeof DEAL_SECTORS !== 'undefined' ? DEAL_SECTORS : [];
    const matched = sectors.find(s => s.toLowerCase() === parsed.sector.toLowerCase())
      || sectors.find(s => s.toLowerCase().includes(parsed.sector.toLowerCase().split('/')[0].trim()));
    if (matched) { deal.sector = matched; appliedCount++; }
  }

  // Tags — merge, no duplicates
  if (Array.isArray(parsed.tags) && parsed.tags.length) {
    const existing = new Set(deal.tags || []);
    parsed.tags.forEach(t => existing.add(t));
    if (existing.size > (deal.tags || []).length) {
      deal.tags = [...existing]; appliedCount++;
    }
  }

  // Append KPIs to description if new info discovered
  if (parsed.description && deal.description && deal.description !== parsed.description) {
    const extras = [];
    if (parsed.revenueGrowthRate && !deal.description.includes('growing') && !deal.description.includes('growth')) {
      extras.push(`Revenue growing ~${parsed.revenueGrowthRate}% annually.`);
    }
    if (parsed.recurringRevenuePct && !deal.description.includes('recurring')) {
      extras.push(`~${parsed.recurringRevenuePct}% recurring revenue.`);
    }
    if (parsed.customerConcentration && !deal.description.includes('concentration')) {
      extras.push(`Customer concentration: ${parsed.customerConcentration}.`);
    }
    if (extras.length) {
      deal.description = deal.description.trimEnd() + ' ' + extras.join(' ');
    }
  }

  return { parsed, appliedCount };
}

// ── Manual extraction (shows modal with full results) ────────────────────────
async function extractFieldsFromDoc(docId, dealId) {
  const doc = await DB.get(STORES.dealDocuments, docId);
  if (!doc?.extractedText) return showToast('No text extracted from this document yet.', 'error');

  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`).catch(() => null);
  if (!settings?.openaiApiKey && !settings?.claudeApiKey) {
    return showToast('Add an OpenAI or Claude API key in Settings to use AI extraction.', 'error');
  }

  const deal = await DB.get(STORES.deals, dealId);
  if (!deal) return;

  openModal('AI Field Extraction', `
    <div class="p-6">
      <div class="flex items-center gap-3 mb-5">
        <div class="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0" id="extract-icon">
          <svg class="w-5 h-5 text-brand-600 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
        <div>
          <p class="text-sm font-semibold">Analysing <em>${escapeHtml(doc.name)}</em></p>
          <p class="text-xs text-surface-400 mt-0.5">Extracting all available deal data with AI…</p>
        </div>
      </div>
      <div id="extract-modal-result">
        <div class="space-y-2">
          ${['w-3/4','w-1/2','w-2/3','w-5/6','w-1/3'].map(w =>
            `<div class="h-3 bg-surface-100 dark:bg-surface-800 rounded animate-pulse ${w}"></div>`).join('')}
        </div>
      </div>
    </div>
  `);

  try {
    const { parsed, appliedCount } = await _runAIExtraction(doc, deal);

    if (appliedCount > 0) {
      deal.updatedAt = new Date().toISOString();
      await DB.put(STORES.deals, deal);
      await logDealHistory(dealId, 'field_updated', { fields: `Manual extraction: ${appliedCount} fields from ${doc.name}` });
      doc.aiExtractedAt = new Date().toISOString();
      await DB.put(STORES.dealDocuments, doc);
    }

    // Build result table
    const fmt$ = n => n ? `$${(n/1e6).toFixed(2)}M` : null;
    const fmtPct = n => n != null ? `${n}%` : null;
    const rows = [
      ['Company',        parsed.companyName],
      ['Website',        parsed.website],
      ['Founded',        parsed.foundedYear],
      ['Location',       parsed.location],
      ['Sector',         parsed.sector],
      ['Sub-sector',     parsed.subsector],
      ['Revenue',        fmt$(parsed.revenue)],
      ['EBITDA',         fmt$(parsed.ebitda)],
      ['EBITDA Margin',  fmtPct(parsed.ebitdaMargin)],
      ['Asking Price',   fmt$(parsed.askingPrice)],
      ['Multiple',       parsed.askingMultiple ? `${parsed.askingMultiple}x` : null],
      ['Revenue Growth', fmtPct(parsed.revenueGrowthRate)],
      ['Recurring Rev',  fmtPct(parsed.recurringRevenuePct)],
      ['Employees',      parsed.employeeCount],
      ['Owner Situation', parsed.ownerSituation],
      ['Cust. Conc.',    parsed.customerConcentration],
    ].filter(([, v]) => v != null);

    const resultEl = document.getElementById('extract-modal-result');
    if (resultEl) {
      resultEl.innerHTML = `
        <div class="space-y-4">
          ${rows.length ? `
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-surface-400 mb-2">Extracted Data</p>
            <div class="grid grid-cols-2 gap-x-6 gap-y-1">
              ${rows.map(([label, val]) => `
                <div class="flex items-baseline justify-between border-b border-surface-100 dark:border-surface-800 pb-1">
                  <span class="text-xs text-surface-400">${label}</span>
                  <span class="text-xs font-semibold truncate max-w-[140px]" title="${escapeHtml(String(val))}">${escapeHtml(String(val))}</span>
                </div>`).join('')}
            </div>
          </div>` : ''}
          ${parsed.description ? `
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-surface-400 mb-1">Description</p>
            <p class="text-sm leading-relaxed text-surface-600 dark:text-surface-300">${escapeHtml(parsed.description)}</p>
          </div>` : ''}
          ${parsed.concerns ? `
          <div class="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/15 border border-yellow-200 dark:border-yellow-800">
            <p class="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-1">⚠ Concerns / Risks</p>
            <p class="text-xs text-yellow-600 dark:text-yellow-500">${escapeHtml(String(parsed.concerns))}</p>
          </div>` : ''}
          <div class="pt-1 flex items-center justify-between gap-3">
            <p class="text-xs text-surface-400">
              ${appliedCount > 0
                ? `<span class="text-green-600 font-medium">✓ ${appliedCount} field${appliedCount !== 1 ? 's' : ''} applied to deal</span> (existing data not overwritten)`
                : 'All matching fields were already populated — no changes made.'}
            </p>
            <button onclick="closeModal(); if(typeof switchDealTab==='function') switchDealTab('overview');"
              class="btn-primary btn-sm flex-shrink-0">
              ${appliedCount > 0 ? 'View Deal →' : 'Done'}
            </button>
          </div>
        </div>`;

      // Swap spinner → checkmark
      const iconEl = document.getElementById('extract-icon');
      if (iconEl) iconEl.innerHTML = `<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    }

    // Refresh deal overview in background
    if (appliedCount > 0 && typeof switchDealTab === 'function' && typeof currentDealId !== 'undefined' && currentDealId === dealId) {
      // Silently refresh the overview header without closing the modal
      if (typeof renderDealOverviewTab === 'function') {
        // The modal is in front — the overview will refresh when user clicks "View Deal →"
      }
    }

  } catch (err) {
    const resultEl = document.getElementById('extract-modal-result');
    if (resultEl) resultEl.innerHTML = `
      <div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800">
        <p class="text-sm font-medium text-red-700 dark:text-red-400">Extraction failed</p>
        <p class="text-xs text-red-600 dark:text-red-500 mt-1">${escapeHtml(err.message)}</p>
        <p class="text-xs text-surface-400 mt-2">Make sure an AI API key is configured in Settings.</p>
      </div>
      <div class="flex justify-end mt-4">
        <button onclick="closeModal()" class="btn-secondary btn-sm">Close</button>
      </div>`;

    const iconEl = document.getElementById('extract-icon');
    if (iconEl) iconEl.innerHTML = `<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>`;
  }
}

async function viewExtractedText(docId) {
  const doc = await DB.get(STORES.dealDocuments, docId);
  if (!doc || !doc.extractedText) return;

  openModal(`Extracted Text: ${doc.name}`, `
    <div class="p-6">
      <div class="flex items-center gap-2 mb-4">
        <span class="badge badge-blue">${getDocCategoryLabel(doc.category)}</span>
        <span class="text-xs text-surface-400">${formatFileSize(doc.size)}</span>
        <span class="text-xs text-surface-400">${doc.extractedText.length.toLocaleString()} characters</span>
      </div>
      <div class="max-h-96 overflow-y-auto bg-surface-50 dark:bg-surface-800 rounded p-4">
        <pre class="text-xs text-surface-700 dark:text-surface-300 whitespace-pre-wrap font-mono leading-relaxed">${escapeHtml(doc.extractedText.substring(0, 20000))}</pre>
        ${doc.extractedText.length > 20000 ? '<p class="text-xs text-surface-400 mt-2 italic">Showing first 20,000 characters...</p>' : ''}
      </div>
      <div class="flex justify-end mt-4">
        <button onclick="closeModal()" class="btn-secondary">Close</button>
      </div>
    </div>
  `);
}
