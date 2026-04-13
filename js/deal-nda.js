/* ============================================
   Nexus CRM — AI NDA Checker
   ============================================ */

const NDA_STORE = 'ndaTemplates';

// Open the NDA management modal (hub)
function openNdaCheckerModal(dealId) {
  openModal('AI NDA Checker', `
    <div class="p-6 space-y-4">
      <p class="text-sm text-surface-600 dark:text-surface-400">
        Upload reference NDAs to teach the AI what terms are acceptable. Then upload a new NDA to check it clause by clause.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onclick="openNdaTemplateUpload()" class="card hover:border-brand-300 dark:hover:border-brand-700 transition-colors text-left p-4 cursor-pointer">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"/></svg>
            </div>
            <div>
              <p class="font-medium text-sm">Upload NDA Template</p>
              <p class="text-xs text-surface-500">Add an acceptable reference NDA</p>
            </div>
          </div>
        </button>
        <button onclick="openNdaReview(${JSON.stringify(dealId)})" class="card hover:border-brand-300 dark:hover:border-brand-700 transition-colors text-left p-4 cursor-pointer">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 6.627 5.373 12 12 12s12-5.373 12-12c0-2.13-.558-4.128-1.534-5.856"/></svg>
            </div>
            <div>
              <p class="font-medium text-sm">Review an NDA</p>
              <p class="text-xs text-surface-500">Upload & AI-check a new NDA</p>
            </div>
          </div>
        </button>
      </div>
      <div id="nda-templates-list">
        <p class="text-xs text-surface-500 mb-2">Loading templates...</p>
      </div>
    </div>
  `);

  // Load templates list async
  loadNdaTemplatesList();
}

async function loadNdaTemplatesList() {
  const container = document.getElementById('nda-templates-list');
  if (!container) return;
  try {
    const templates = await DB.getAll(NDA_STORE).then(all => all.filter(t => t.userId === currentUser.id));
    if (templates.length === 0) {
      container.innerHTML = `<p class="text-xs text-surface-500 italic">No reference NDAs uploaded yet.</p>`;
      return;
    }
    container.innerHTML = `
      <p class="text-xs font-medium text-surface-500 mb-2">Reference NDAs (${templates.length})</p>
      <div class="space-y-2">
        ${templates.map(t => `
          <div class="flex items-center gap-3 p-2 rounded-lg bg-surface-50 dark:bg-surface-800">
            <svg class="w-4 h-4 text-surface-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
            <span class="text-sm flex-1 truncate">${escapeHtml(t.name)}</span>
            <span class="text-xs text-surface-400">${t.pageCount || '?'} pages</span>
            <button onclick="deleteNdaTemplate('${t.id}')" class="text-red-400 hover:text-red-600 p-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<p class="text-xs text-red-500">Failed to load templates</p>`;
  }
}

function openNdaTemplateUpload() {
  openModal('Upload Reference NDA', `
    <div class="p-6 space-y-4">
      <p class="text-sm text-surface-500">Upload a PDF of an NDA you consider acceptable. This becomes a reference for future NDA reviews.</p>
      <div>
        <label class="block text-sm font-medium mb-1">Template Name</label>
        <input type="text" id="nda-template-name" class="input-field" placeholder="e.g., Standard Search Fund NDA" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-2">NDA PDF File</label>
        <input type="file" id="nda-template-file" accept=".pdf,.txt,.doc,.docx" class="block w-full text-sm text-surface-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-600 file:text-white hover:file:bg-brand-700 cursor-pointer" />
      </div>
      <div class="flex justify-end gap-3">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="uploadNdaTemplate()" class="btn-primary">Upload Template</button>
      </div>
    </div>
  `);
}

async function uploadNdaTemplate() {
  const name = document.getElementById('nda-template-name')?.value.trim();
  const fileInput = document.getElementById('nda-template-file');
  const file = fileInput?.files?.[0];

  if (!name) return showToast('Enter a template name', 'warning');
  if (!file) return showToast('Select a PDF file', 'warning');

  showToast('Processing NDA...', 'info');

  try {
    let text = '';
    let pageCount = 1;

    if (file.type === 'application/pdf' && typeof pdfjsLib !== 'undefined') {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const result = await extractTextFromPDF(base64);
      text = result;
      pageCount = Math.ceil(text.length / 2000);
    } else {
      text = await file.text();
    }

    await DB.add(NDA_STORE, {
      id: generateId(),
      userId: currentUser.id,
      name,
      text: text.substring(0, 40000),
      pageCount,
      fileName: file.name,
      createdAt: new Date().toISOString(),
    });

    showToast('NDA template saved!', 'success');
    closeModal();
  } catch (e) {
    showToast('Error processing file: ' + e.message, 'error');
  }
}

async function deleteNdaTemplate(id) {
  await DB.delete(NDA_STORE, id);
  showToast('Template deleted', 'info');
  loadNdaTemplatesList();
}

function openNdaReview(dealId) {
  openModal('Review NDA', `
    <div class="p-6 space-y-4">
      <p class="text-sm text-surface-500">Upload the NDA you received. The AI will compare it against your reference NDAs and flag unacceptable clauses with suggested alternatives.</p>
      <div>
        <label class="block text-sm font-medium mb-1">NDA to Review (PDF or text)</label>
        <input type="file" id="nda-review-file" accept=".pdf,.txt" class="block w-full text-sm text-surface-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-brand-600 file:text-white hover:file:bg-brand-700 cursor-pointer" />
      </div>
      <div id="nda-review-result"></div>
      <div class="flex justify-end gap-3">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="runNdaReview(${JSON.stringify(dealId)})" class="btn-primary">Analyze NDA</button>
      </div>
    </div>
  `);
}

async function runNdaReview(dealId) {
  const fileInput = document.getElementById('nda-review-file');
  const file = fileInput?.files?.[0];
  if (!file) return showToast('Select an NDA file to review', 'warning');

  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  if (!settings?.openaiApiKey && !settings?.claudeApiKey) {
    showToast('Add an OpenAI or Claude API key in Settings to use AI NDA review', 'warning');
    return;
  }

  const resultDiv = document.getElementById('nda-review-result');
  resultDiv.innerHTML = `<div class="p-4 bg-surface-50 dark:bg-surface-800 rounded text-sm text-surface-500 animate-pulse">Extracting text and analyzing NDA...</div>`;

  try {
    // Extract text from submitted NDA
    let reviewText = '';
    if (file.type === 'application/pdf' && typeof pdfjsLib !== 'undefined') {
      const ab = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
      reviewText = await extractTextFromPDF(b64);
    } else {
      reviewText = await file.text();
    }
    reviewText = reviewText.substring(0, 25000);

    // Get reference templates
    const templates = await DB.getAll(NDA_STORE).then(all => all.filter(t => t.userId === currentUser.id));
    let templateContext = '';
    if (templates.length > 0) {
      templateContext = `\n\nREFERENCE NDA TEMPLATES (what we consider acceptable):\n` +
        templates.map(t => `--- Template: "${t.name}" ---\n${t.text.substring(0, 8000)}`).join('\n\n');
    }

    const prompt = `You are a legal expert reviewing an NDA for a search fund buyer. Analyze the NDA below and:
1. Identify UNACCEPTABLE clauses (ones that disadvantage the buyer, are overly broad, or deviate from standard search fund NDAs)
2. For each unacceptable clause, suggest a specific ACCEPTABLE ALTERNATIVE
3. Identify ACCEPTABLE clauses to confirm what is fine
4. Give an OVERALL RECOMMENDATION (Acceptable / Needs Revision / Reject)

Format your response with clear sections:
## Overall Recommendation: [ACCEPTABLE / NEEDS REVISION / REJECT]
## Summary
## Unacceptable Clauses
For each: **Clause:** [quote] → **Issue:** [explain] → **Suggested Alternative:** [rewrite]
## Acceptable Clauses
## Key Negotiation Points

NDA TO REVIEW:
${reviewText}
${templateContext}`;

    const analysis = await callAI(
      'You are a legal expert specializing in M&A NDAs for search fund acquisitions.',
      prompt,
      2000, 0.3
    );

    // Determine overall status from response
    const isAcceptable = analysis.includes('ACCEPTABLE') && !analysis.includes('NEEDS REVISION') && !analysis.includes('REJECT');
    const isReject = analysis.includes('REJECT');
    const statusColor = isReject ? 'red' : isAcceptable ? 'green' : 'yellow';
    const statusText = isReject ? 'REJECT' : isAcceptable ? 'ACCEPTABLE' : 'NEEDS REVISION';

    // Save to deal diligence if dealId provided
    if (dealId) {
      await DB.add(STORES.dealDiligence, {
        id: generateId(),
        dealId,
        userId: currentUser.id,
        type: 'nda_review',
        status: 'completed',
        content: analysis,
        fileName: file.name,
        createdAt: new Date().toISOString(),
      });
    }

    resultDiv.innerHTML = `
      <div class="space-y-3 max-h-96 overflow-y-auto">
        <div class="flex items-center gap-2 p-3 bg-${statusColor}-50 dark:bg-${statusColor}-900/20 rounded border border-${statusColor}-200 dark:border-${statusColor}-800">
          <span class="font-semibold text-${statusColor}-700 dark:text-${statusColor}-300 text-sm">NDA Status: ${statusText}</span>
        </div>
        <div class="deal-ai-output text-sm p-3 bg-surface-50 dark:bg-surface-800 rounded">
          ${renderMarkdown(analysis)}
        </div>
      </div>
    `;
  } catch (e) {
    resultDiv.innerHTML = `<div class="p-3 bg-red-50 dark:bg-red-900/20 rounded text-red-700 dark:text-red-300 text-sm">Error: ${escapeHtml(e.message)}</div>`;
  }
}
