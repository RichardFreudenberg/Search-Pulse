/* ============================================================
   Pulse — AI Deal Task Prioritisation  (Feature 1)
   Ranks open tasks across all active deals by urgency and
   importance, with a short AI-generated reason for each.
   ============================================================ */

async function openDealPrioritizeModal() {
  openModal('🎯 AI Task Prioritisation', `
    <div class="p-6">
      <p class="text-sm text-surface-500 mb-4">
        Analysing open tasks across your entire pipeline…
      </p>
      <div id="prioritize-loading" class="flex items-center gap-3 py-8 justify-center">
        <svg class="animate-spin w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <span class="text-sm text-surface-500">Gathering tasks…</span>
      </div>
      <div id="prioritize-results" class="hidden space-y-3"></div>
      <div id="prioritize-error" class="hidden text-sm text-red-500 py-4 text-center"></div>
    </div>
  `, [{ label: 'Close', onclick: 'closeModal()', class: 'btn-secondary' }]);

  try {
    await _runDealPrioritize();
  } catch (err) {
    document.getElementById('prioritize-loading')?.classList.add('hidden');
    const errEl = document.getElementById('prioritize-error');
    if (errEl) { errEl.textContent = err.message || 'Something went wrong.'; errEl.classList.remove('hidden'); }
  }
}

async function _runDealPrioritize() {
  const loadingEl = document.getElementById('prioritize-loading');
  const resultsEl = document.getElementById('prioritize-results');

  // 1 — Fetch all active deals
  const allDeals  = await DB.getAll(STORES.deals);
  const active    = allDeals.filter(d =>
    d.userId === currentUser.id &&
    !['Closed - Won', 'Closed - Lost', 'Rejected'].includes(d.stage)
  );

  if (active.length === 0) {
    if (loadingEl) loadingEl.innerHTML = '<p class="text-sm text-surface-500 text-center">No active deals in your pipeline yet.</p>';
    return;
  }

  // 2 — Fetch all open tasks for those deals
  const allTasks = await DB.getAll(STORES.dealTasks);
  const today    = new Date();
  today.setHours(0, 0, 0, 0);

  const tasksByDeal = {};
  allTasks.forEach(t => {
    if (t.userId !== currentUser.id) return;
    if (t.status === 'done') return;
    const deal = active.find(d => d.id === t.dealId);
    if (!deal) return;
    if (!tasksByDeal[t.dealId]) tasksByDeal[t.dealId] = { deal, tasks: [] };
    tasksByDeal[t.dealId].tasks.push(t);
  });

  const entries = Object.values(tasksByDeal);
  if (entries.length === 0) {
    if (loadingEl) loadingEl.innerHTML = '<p class="text-sm text-surface-500 text-center">No open tasks found across your active deals.</p>';
    return;
  }

  // 3 — Build AI context string
  if (loadingEl) {
    const span = loadingEl.querySelector('span');
    if (span) span.textContent = 'Running AI analysis…';
  }

  const taskLines = [];
  entries.forEach(({ deal, tasks }) => {
    tasks.forEach(t => {
      const due     = t.dueDate ? new Date(t.dueDate) : null;
      const daysUntilDue = due ? Math.round((due - today) / 86400000) : null;
      const dueStr  = daysUntilDue === null  ? 'no due date'
                    : daysUntilDue < 0       ? `OVERDUE by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''}`
                    : daysUntilDue === 0     ? 'due TODAY'
                    : `due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`;
      taskLines.push(
        `DEAL: "${deal.name}" | Stage: ${deal.stage} | Sector: ${deal.sector || 'Unknown'}` +
        ` | Revenue: ${deal.revenue ? '$' + deal.revenue.toLocaleString() : 'unknown'}` +
        ` || TASK ID: ${t.id} | Title: "${t.title}"` +
        `${t.description ? ` | Notes: "${t.description.slice(0, 120)}"` : ''}` +
        ` | Priority: ${t.priority || 'medium'} | ${dueStr}`
      );
    });
  });

  const systemPrompt = `You are an expert search fund advisor helping a searcher prioritise their deal pipeline tasks.
You will receive a list of open tasks across multiple deals with context about each deal's stage and each task's urgency.
Rank the TOP 7 most important tasks the searcher should focus on RIGHT NOW.

Return ONLY a JSON array (no markdown, no explanation outside the JSON) in this exact format:
[
  {
    "taskId": "<task id>",
    "dealName": "<deal name>",
    "taskTitle": "<task title>",
    "rank": 1,
    "reason": "<2 sentences max: why this specific task is the most important right now>"
  }
]

Prioritisation logic:
- Overdue tasks at advanced deal stages (Due Diligence, Exclusivity, LOI) = highest priority
- High-priority tasks due very soon at advanced stages = next
- Tasks that block deal progression (e.g., "submit LOI", "sign NDA") outrank general research tasks
- Deals further along in the pipeline generally outrank early-stage deals
- Be specific in your reasoning — mention the deal stage, the task name, and why it's urgent`;

  const userPrompt = `Here are all open tasks across my active deals:\n\n${taskLines.join('\n')}\n\nRank the top 7 tasks I should focus on right now.`;

  const raw = await callAI(systemPrompt, userPrompt, 1200, 0.2);

  // 4 — Parse JSON response
  let ranked;
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    ranked = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    throw new Error('AI returned an unexpected response. Please try again.');
  }

  // 5 — Render results
  if (loadingEl) loadingEl.classList.add('hidden');
  if (!resultsEl) return;

  const medalColors = ['#f59e0b', '#9ca3af', '#b45309'];
  const rankIcons   = ['🥇', '🥈', '🥉'];

  resultsEl.innerHTML = `
    <p class="text-xs text-surface-400 mb-3">Top ${ranked.length} tasks ranked by AI across your pipeline — click a task to jump to its deal.</p>
    ${ranked.map((item, i) => {
      const medal = i < 3 ? rankIcons[i] : `<span class="text-xs font-bold text-surface-400">#${item.rank}</span>`;
      // Find the actual task to get its dealId for navigation
      const matchedTask = allTasks.find(t => t.id === item.taskId);
      const dealId = matchedTask?.dealId || '';
      return `
        <div class="flex items-start gap-3 p-4 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors cursor-pointer group"
             onclick="closeModal(); navigateTo('deals'); setTimeout(() => openDealDetail('${dealId}'), 400);">
          <div class="flex-shrink-0 w-8 text-center text-lg leading-8">${medal}</div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">${escapeHtml(item.dealName)}</span>
            </div>
            <p class="text-sm font-medium text-surface-800 dark:text-surface-200">${escapeHtml(item.taskTitle)}</p>
            <p class="text-xs text-surface-500 mt-1 leading-relaxed">${escapeHtml(item.reason)}</p>
          </div>
          <svg class="w-4 h-4 text-surface-300 group-hover:text-brand-400 flex-shrink-0 mt-1 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.25 4.5l7.5 7.5-7.5 7.5"/>
          </svg>
        </div>`;
    }).join('')}
    <button onclick="closeModal(); setTimeout(openDealPrioritizeModal, 100)" class="w-full mt-2 text-xs text-brand-500 hover:text-brand-600 text-center py-2">
      ↺ Re-run analysis
    </button>
  `;
  resultsEl.classList.remove('hidden');
}
