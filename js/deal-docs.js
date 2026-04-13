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
  const input = document.getElementById('doc-file-input');
  const category = document.getElementById('doc-category').value;

  if (!input.files.length) return showToast('Please select a file', 'error');

  const file = input.files[0];
  if (file.size > 25 * 1024 * 1024) return showToast('File too large (max 25MB)', 'error');

  const btn = document.getElementById('doc-upload-btn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  try {
    // Read file as base64
    const base64 = await readFileAsBase64(file);
    const ext = file.name.split('.').pop().toLowerCase();
    const type = getDocType(ext);

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
      uploadedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Extract text based on file type
    try {
      if (type === 'pdf' && typeof pdfjsLib !== 'undefined') {
        doc.extractedText = await extractTextFromPDF(base64);
      } else if (type === 'xlsx' && typeof XLSX !== 'undefined') {
        const result = await extractDataFromSpreadsheet(base64, file.name);
        doc.extractedText = result.text;
        doc.extractedTables = result.tables;
      } else if (type === 'csv') {
        doc.extractedText = atob(base64.split(',')[1] || base64);
      } else if (ext === 'txt') {
        doc.extractedText = atob(base64.split(',')[1] || base64);
      }
    } catch (extractErr) {
      console.warn('Text extraction failed:', extractErr);
      // Still save the document even if extraction fails
    }

    await DB.put(STORES.dealDocuments, doc);
    await logDealHistory(dealId, 'document_uploaded', {
      documentId: doc.id,
      name: doc.name,
      category,
      extracted: !!doc.extractedText,
    });

    closeModal();
    showToast(`Document uploaded${doc.extractedText ? ' & text extracted' : ''}`, 'success');

    // Auto-populate deal description if empty and text was extracted
    if (doc.extractedText && doc.extractedText.length > 100) {
      try {
        const deal = await DB.get(STORES.deals, dealId);
        const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
        if (deal && !deal.description && (settings?.openaiApiKey || settings?.claudeApiKey)) {
          try {
            const desc = await callAI(
              'You are a financial analyst. Return only a 2-3 sentence plain-text description of the company based on the document. No JSON, no markdown.',
              `Write a brief company description based on this document excerpt:\n\n${doc.extractedText.substring(0, 3000)}`,
              200, 0.2
            );
            if (desc?.trim()) {
              deal.description = desc.trim();
              await DB.put(STORES.deals, deal);
              showToast('Company description auto-filled from document', 'info');
            }
          } catch {}
        }
      } catch {}
    }

    // Re-render docs tab if on detail page
    if (typeof currentDealId !== 'undefined' && currentDealId === dealId) {
      switchDealTab('documents');
    }
  } catch (err) {
    showToast('Upload failed: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Upload & Extract';
  }
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

  let totalChars = 0;
  const maxChars = 50000; // ~12K tokens
  const result = [];

  for (const doc of withText) {
    const remaining = maxChars - totalChars;
    if (remaining <= 0) break;
    const text = doc.extractedText.substring(0, remaining);
    result.push({ name: doc.name, category: doc.category, text });
    totalChars += text.length;
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
  const catLabel = getDocCategoryLabel(doc.category);
  const icon = getDocIcon(doc.category);
  const hasText = !!doc.extractedText;

  return `
    <div class="flex items-center gap-3 p-3 rounded border border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600 transition-colors">
      <div class="p-2 rounded-lg bg-surface-100 dark:bg-surface-800 text-surface-500">
        ${icon}
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHtml(doc.name)}</div>
        <div class="flex items-center gap-2 mt-0.5">
          <span class="text-xs text-surface-400">${catLabel}</span>
          <span class="text-xs text-surface-300">&bull;</span>
          <span class="text-xs text-surface-400">${formatFileSize(doc.size)}</span>
          ${hasText ? `<span class="text-xs text-green-500 flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 12.75l6 6 9-13.5" /></svg>
            Extracted</span>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-1">
        ${hasText ? `<button onclick="viewExtractedText('${doc.id}')" class="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-surface-600" title="View extracted text">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>` : ''}
        <button onclick="deleteDealDocument('${doc.id}', '${doc.dealId}')" class="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-surface-400 hover:text-red-500" title="Delete">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
        </button>
      </div>
    </div>
  `;
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
