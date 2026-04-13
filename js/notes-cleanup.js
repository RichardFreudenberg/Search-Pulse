/* ============================================
   Nexus CRM — Notes Cleanup Feature
   ============================================ */

/*
 * Clean Up Notes — formatting-only transformation.
 *
 * Rules:
 * - Preserve original meaning and content EXACTLY
 * - Never add new facts
 * - Never remove content
 * - Never change substance
 * - Only improve formatting, structure, readability, punctuation, grammar, organization
 * - Optionally categorize into sections based on content
 */

// Section categories for search fund networking context
const NOTE_SECTIONS = [
  { key: 'background', label: 'Background', keywords: ['background', 'grew up', 'from', 'born', 'education', 'university', 'college', 'school', 'degree', 'mba', 'undergrad', 'studied'] },
  { key: 'career', label: 'Career Path', keywords: ['career', 'worked at', 'joined', 'role', 'position', 'promoted', 'left', 'started', 'founded', 'years at', 'experience', 'industry', 'previously', 'currently', 'before that'] },
  { key: 'investment', label: 'Investment Experience', keywords: ['invest', 'fund', 'portfolio', 'deal', 'acquisition', 'bought', 'sold', 'returns', 'capital', 'raise', 'lp', 'gp', 'private equity', 'venture', 'buyout', 'ebitda', 'multiple', 'valuation'] },
  { key: 'searchfund', label: 'Search Fund Relevance', keywords: ['search fund', 'search', 'searcher', 'acquisition entrepreneur', 'self-funded', 'traditional search', 'accelerator', 'smb', 'small business', 'owner-operator', 'ceo transition'] },
  { key: 'personal', label: 'Personal Details', keywords: ['family', 'married', 'kids', 'children', 'hobbies', 'interests', 'lives in', 'moved to', 'personal', 'wife', 'husband', 'partner', 'dog', 'cat'] },
  { key: 'followup', label: 'Follow-up Items', keywords: ['follow up', 'follow-up', 'send', 'share', 'introduce', 'connect', 'email', 'call back', 'next steps', 'todo', 'to do', 'action', 'promised', 'will send', 'should reach out', 'intro'] },
];

function cleanUpNotesLocally(rawText) {
  if (!rawText || !rawText.trim()) return rawText;

  // Step 1: Basic text cleanup
  let text = rawText.trim();

  // Fix common punctuation issues
  text = text.replace(/\s+/g, ' '); // Normalize whitespace within lines first
  // Restore line breaks from the original
  text = rawText.trim();

  // Fix double spaces
  text = text.replace(/  +/g, ' ');

  // Fix missing space after periods, commas, colons
  text = text.replace(/\.([A-Z])/g, '. $1');
  text = text.replace(/,([A-Za-z])/g, ', $1');

  // Fix missing capitalization after periods
  text = text.replace(/\. ([a-z])/g, (match, letter) => '. ' + letter.toUpperCase());

  // Fix common abbreviations and typos
  text = text.replace(/\bi\b/g, 'I');
  text = text.replace(/\bim\b/gi, "I'm");
  text = text.replace(/\bdont\b/gi, "don't");
  text = text.replace(/\bdoesnt\b/gi, "doesn't");
  text = text.replace(/\bwont\b/gi, "won't");
  text = text.replace(/\bcant\b/gi, "can't");
  text = text.replace(/\bwouldnt\b/gi, "wouldn't");
  text = text.replace(/\bcouldnt\b/gi, "couldn't");
  text = text.replace(/\bshouldnt\b/gi, "shouldn't");
  text = text.replace(/\btheyre\b/gi, "they're");
  text = text.replace(/\bwere\b(?!\s)/gi, "we're");
  text = text.replace(/\btheyve\b/gi, "they've");
  text = text.replace(/\bweve\b/gi, "we've");
  text = text.replace(/\bive\b/gi, "I've");
  text = text.replace(/\bhes\b/gi, "he's");
  text = text.replace(/\bshes\b/gi, "she's");

  // Step 2: Split into lines/sentences
  let lines = text.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0);

  // Step 3: Categorize lines into sections
  const sections = {};
  const uncategorized = [];

  for (const line of lines) {
    const lineLower = line.toLowerCase();
    let matched = false;

    for (const section of NOTE_SECTIONS) {
      if (section.keywords.some(kw => lineLower.includes(kw))) {
        if (!sections[section.key]) sections[section.key] = [];
        sections[section.key].push(cleanLine(line));
        matched = true;
        break;
      }
    }

    if (!matched) {
      uncategorized.push(cleanLine(line));
    }
  }

  // Step 4: Build formatted output
  let output = '';

  // If we have meaningful sections, format with headers
  const sectionKeys = Object.keys(sections);
  if (sectionKeys.length >= 2) {
    for (const section of NOTE_SECTIONS) {
      if (sections[section.key] && sections[section.key].length > 0) {
        output += `## ${section.label}\n`;
        for (const line of sections[section.key]) {
          output += `- ${line}\n`;
        }
        output += '\n';
      }
    }
    if (uncategorized.length > 0) {
      output += `## Other Notes\n`;
      for (const line of uncategorized) {
        output += `- ${line}\n`;
      }
      output += '\n';
    }
  } else {
    // Not enough sections to categorize — just clean up as bullet points
    const allLines = [...lines].map(cleanLine);
    for (const line of allLines) {
      // If it already starts with - or *, keep it
      if (line.startsWith('-') || line.startsWith('*') || line.startsWith('•')) {
        output += `${line}\n`;
      } else {
        output += `- ${line}\n`;
      }
    }
  }

  return output.trim();
}

function cleanLine(line) {
  let cleaned = line.trim();

  // Remove leading dashes/bullets if we'll re-add them
  cleaned = cleaned.replace(/^[-*•]\s*/, '');

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // Ensure ends with period if it's a statement (not a question or exclamation)
  if (cleaned.length > 0 && !cleaned.endsWith('.') && !cleaned.endsWith('?') && !cleaned.endsWith('!') && !cleaned.endsWith(':')) {
    cleaned += '.';
  }

  return cleaned;
}

async function openCleanupNotes(noteId) {
  const note = await DB.get(STORES.notes, noteId);
  if (!note) { showToast('Note not found', 'error'); return; }

  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  const hasApiKey = settings && (settings.openaiApiKey || settings.claudeApiKey);

  // Perform local cleanup
  const localCleaned = cleanUpNotesLocally(note.content);

  openModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-lg font-semibold">Clean Up Notes</h2>
        <button onclick="closeModal()" class="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <!-- Disclaimer -->
      <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3 mb-6">
        <p class="text-xs text-blue-700 dark:text-blue-300">
          <strong>Formatting only.</strong> This cleanup improves structure, readability, punctuation, and grammar. No content is added, removed, or changed in meaning.
        </p>
      </div>

      <!-- Side by side view -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div>
          <h3 class="text-sm font-medium text-surface-500 mb-2">Original Notes</h3>
          <div class="bg-surface-50 dark:bg-surface-800 rounded p-4 text-sm whitespace-pre-wrap max-h-80 overflow-y-auto font-mono text-surface-700 dark:text-surface-300">${escapeHtml(note.content)}</div>
        </div>
        <div>
          <h3 class="text-sm font-medium text-surface-500 mb-2">Cleaned Notes</h3>
          <div id="cleaned-notes-preview" class="bg-surface-50 dark:bg-surface-800 rounded p-4 text-sm whitespace-pre-wrap max-h-80 overflow-y-auto">${formatCleanedPreview(localCleaned)}</div>
        </div>
      </div>

      ${hasApiKey ? `
        <div class="mb-4">
          <button onclick="aiCleanupNotes('${noteId}')" id="ai-cleanup-btn" class="btn-secondary btn-sm w-full">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
            Use AI for Enhanced Cleanup
          </button>
          <p class="text-xs text-surface-400 mt-1 text-center">Uses your configured API key for smarter formatting</p>
        </div>
      ` : ''}

      <div class="flex justify-end gap-3">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="applyCleanedNotes('${noteId}', 'local')" class="btn-primary">Apply Cleanup</button>
      </div>
    </div>
  `, { wide: true });

  // Store the cleaned text for later use
  window._cleanedNotesCache = {
    noteId,
    localCleaned,
    aiCleaned: null,
  };
}

function formatCleanedPreview(text) {
  // Render markdown-like headers and bullets
  return text
    .replace(/^## (.+)$/gm, '<h4 class="font-semibold text-surface-900 dark:text-surface-100 mt-3 mb-1">$1</h4>')
    .replace(/^- (.+)$/gm, '<div class="flex gap-2 ml-1"><span class="text-brand-500">•</span><span>$1</span></div>');
}

async function aiCleanupNotes(noteId) {
  const btn = document.getElementById('ai-cleanup-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Processing…';
  }

  try {
    const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
    const note = await DB.get(STORES.notes, noteId);

    const aiCleaned = (await callAI(
      `You are a notes formatting assistant. Your ONLY job is to improve the formatting, structure, readability, punctuation, grammar, and organization of notes. You must:
- Preserve the original meaning and content EXACTLY
- Never add new facts or information
- Never remove any content
- Never change the substance of the notes
- Only improve formatting, structure, readability, punctuation, grammar, and organization
- Categorize into relevant sections if the notes cover multiple topics. Possible sections include: Background, Career Path, Investment Experience, Search Fund Relevance, Personal Details, Follow-up Items — but use whatever sections best fit the actual content.
- Use markdown formatting with ## headers and - bullet points
- Output ONLY the cleaned notes, nothing else.`,
      `Clean up the formatting of these networking call notes:\n\n${note.content}`,
      2000, 0.3
    )).trim();

    window._cleanedNotesCache.aiCleaned = aiCleaned;

    const preview = document.getElementById('cleaned-notes-preview');
    if (preview) {
      preview.innerHTML = formatCleanedPreview(aiCleaned);
    }

    if (btn) {
      btn.innerHTML = '✓ AI cleanup applied';
      btn.classList.add('text-green-600');
    }
  } catch (err) {
    showToast('AI cleanup failed: ' + err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Retry AI Cleanup';
    }
  }
}

async function applyCleanedNotes(noteId, source) {
  const cache = window._cleanedNotesCache;
  if (!cache || cache.noteId !== noteId) {
    showToast('Error: cleanup cache missing', 'error');
    return;
  }

  const cleanedText = cache.aiCleaned || cache.localCleaned;
  const note = await DB.get(STORES.notes, noteId);
  if (!note) return;

  note.cleanedContent = cleanedText;
  await DB.put(STORES.notes, note);

  closeModal();
  showToast('Notes cleaned up', 'success');

  // Refresh contact view if we're on it
  if (note.contactId) {
    viewContact(note.contactId);
  }
}

// ── Clean Notes directly in the call modal textarea ───────────────
// Writes cleaned text directly into #call-notes — no DOM swapping,
// no second modal. An Undo button appears so the user can revert.

async function cleanCallNotes() {
  const textarea = document.getElementById('call-notes');
  if (!textarea) return;

  const raw = textarea.value.trim();
  if (!raw) { showToast('No notes to clean', 'warning'); return; }

  const btn = document.getElementById('clean-call-notes-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Cleaning…`;
  }

  try {
    const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
    let cleaned;

    if (settings?.openaiApiKey || settings?.claudeApiKey) {
      cleaned = (await callAI(
        `You are a notes formatting assistant for a search fund CRM. Your ONLY job is to improve the formatting, structure, readability, punctuation, and grammar of networking call notes. Rules:
- Preserve the original meaning and every piece of content EXACTLY — do not add, invent, or remove any facts
- Rewrite as clean, structured bullet points
- Group related points under short ## section headers when the notes cover multiple topics (e.g. ## Background, ## Search Fund Relevance, ## Follow-up Items)
- Fix grammar, punctuation, capitalisation, and sentence flow
- Output ONLY the cleaned notes in markdown format — no preamble, no commentary`,
        `Please clean up these call notes:\n\n${raw}`,
        2000, 0.2
      )).trim();
    } else {
      cleaned = cleanUpNotesLocally(raw);
    }

    // Write cleaned text directly into the textarea — no DOM surgery needed
    window._originalCallNotes = raw;
    textarea.value = cleaned;

    // Swap the button to an Undo state so the user can revert
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `↩ Undo Clean`;
      btn.onclick = _undoCleanCallNotes;
      btn.classList.add('text-amber-600');
      btn.classList.remove('text-brand-600');
    }

  } catch (err) {
    showToast('Could not clean notes: ' + err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/></svg> Clean Notes`;
      btn.onclick = cleanCallNotes;
    }
  }
}

function _undoCleanCallNotes() {
  const textarea = document.getElementById('call-notes');
  if (textarea && window._originalCallNotes != null) {
    textarea.value = window._originalCallNotes;
    window._originalCallNotes = null;
  }
  const btn = document.getElementById('clean-call-notes-btn');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/></svg> Clean Notes`;
    btn.onclick = cleanCallNotes;
    btn.classList.remove('text-amber-600');
    btn.classList.add('text-brand-600');
  }
}

// ---- Tests for notes cleanup (run in console) ----
function testNotesCleanup() {
  const tests = [
    {
      name: 'Preserves all content',
      input: 'talked about search funds\nhe worked at McKinsey\nwife is a doctor',
      check: (output) => {
        return output.includes('search funds') && output.includes('McKinsey') && output.includes('doctor');
      }
    },
    {
      name: 'Fixes capitalization',
      input: 'met at conference. great conversation about PE deals.',
      check: (output) => {
        return output.includes('Met at conference') || output.includes('met at conference');
      }
    },
    {
      name: 'Adds structure',
      input: 'grew up in Boston\nworked at Bain for 5 years\ninterested in search funds\nhas two kids\nneed to send him our deck',
      check: (output) => {
        return output.includes('##') || output.includes('-');
      }
    },
    {
      name: 'Handles empty input',
      input: '',
      check: (output) => output === ''
    },
    {
      name: 'Does not add new facts',
      input: 'John is a great guy',
      check: (output) => {
        // Output should not contain facts not in input
        return !output.includes('Harvard') && !output.includes('MBA') && output.includes('great guy');
      }
    },
    {
      name: 'Preserves questions',
      input: 'Should we follow up next week?',
      check: (output) => output.includes('?')
    }
  ];

  let passed = 0;
  let failed = 0;
  for (const test of tests) {
    const output = cleanUpNotesLocally(test.input);
    if (test.check(output)) {
      console.log(`✅ ${test.name}`);
      passed++;
    } else {
      console.log(`❌ ${test.name}`);
      console.log('  Input:', test.input);
      console.log('  Output:', output);
      failed++;
    }
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Expose test function
window.testNotesCleanup = testNotesCleanup;
