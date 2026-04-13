/* ============================================
   Nexus CRM — Commercial Due Diligence Tool
   ============================================ */

const DD_WORKSTREAMS = [
  { id: 'market',        label: 'Market Analysis',       desc: 'Market size, growth rate, trends & maturity cycle' },
  { id: 'customers',     label: 'Customer Analysis',      desc: 'Customer base, concentration, retention & satisfaction' },
  { id: 'competition',   label: 'Competitive Landscape',  desc: 'Competitors, positioning, moats & threats' },
  { id: 'pricing',       label: 'Pricing & Margins',      desc: 'Pricing model, power, expansion & gross margin structure' },
  { id: 'growth',        label: 'Growth Analysis',        desc: 'Historical growth, key drivers, headroom & predictability' },
  { id: 'unitEconomics', label: 'Unit Economics',         desc: 'CAC, LTV, payback period & profitability profile' },
  { id: 'gtm',           label: 'GTM & Channels',         desc: 'Go-to-market motion, sales efficiency & channel mix' },
  { id: 'risks',         label: 'Risk Assessment',        desc: 'Key risks, red flags, regulatory exposure & mitigation' },
];

const DD_WORKSTREAM_INSTRUCTIONS = {
  market: 'Analyze the total addressable market (TAM), serviceable addressable market (SAM), market growth rate, market maturity/lifecycle stage, key industry trends, and regulatory environment. Assess whether the market is large enough and growing fast enough to support the investment thesis.',
  customers: 'Analyze the customer base quality including: concentration risk (% revenue from top customers), customer retention/churn rates, NPS/satisfaction indicators, customer segments, expansion revenue potential, switching costs, and any signs of customer dissatisfaction.',
  competition: 'Map the competitive landscape including: direct and indirect competitors, the company\'s market positioning and differentiation, competitive moats (switching costs, network effects, IP, brand, scale), threats from new entrants or substitutes, and ability to defend and expand market share.',
  pricing: 'Analyze the pricing model (per seat, usage-based, flat fee, etc.), pricing power and ability to raise prices, gross margin structure, pricing relative to competitors, upsell/cross-sell potential, and any margin improvement opportunities post-acquisition.',
  growth: 'Analyze historical revenue growth trajectory, key growth drivers (organic vs. acquisition), market share gains, geographic expansion opportunities, product/service expansion potential, and sustainability and predictability of growth going forward.',
  unitEconomics: 'Analyze the unit economic profile including: customer acquisition cost (CAC), lifetime value (LTV), LTV/CAC ratio, payback period, gross margin by product/segment, and path to profitability or margin expansion. Identify if the business is fundamentally profitable at the unit level.',
  gtm: 'Analyze the go-to-market strategy including: sales motion (direct, channel, PLG), sales cycle length, average contract value, win rates, customer success and expansion motion, marketing efficiency, and any key sales talent dependencies or single points of failure.',
  risks: 'Identify and assess all major risks including: customer concentration, key person dependencies, technology/platform risks, regulatory/compliance risks, market disruption risks, operational risks, financial covenant risks, and macro/cyclical risks. Prioritize by severity and likelihood.',
};

let ddCurrentProjectId = null;

// ─── Tab Renderer ─────────────────────────────────────────────────────────────

async function renderDealDDTab(dealId) {
  const allProjects = await DB.getAll(STORES.ddProjects);
  const projects = allProjects
    .filter(p => p.dealId === dealId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (ddCurrentProjectId) {
    const project = projects.find(p => p.id === ddCurrentProjectId);
    if (project) return renderDDDeck(project);
  }

  if (projects.length === 0) {
    return `
      <div class="text-center py-16">
        <div class="w-16 h-16 rounded bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <h3 class="text-lg font-semibold mb-2">No Due Diligence Reports</h3>
        <p class="text-sm text-surface-500 mb-6 max-w-sm mx-auto">Generate a consulting-quality commercial due diligence report across 8 key workstreams — market, customers, competition, pricing, growth, unit economics, GTM, and risks.</p>
        <button onclick="openNewDDModal('${dealId}')" class="btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Start Due Diligence
        </button>
      </div>
    `;
  }

  return `
    <div class="space-y-4">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-base font-semibold">Due Diligence Reports</h3>
        <button onclick="openNewDDModal('${dealId}')" class="btn-primary btn-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          New Report
        </button>
      </div>
      ${projects.map(p => renderDDProjectCard(p)).join('')}
    </div>
  `;
}

function renderDDProjectCard(project) {
  const statusColors = { draft: 'gray', running: 'yellow', complete: 'green', error: 'red' };
  const color = statusColors[project.status] || 'gray';
  const wsComplete = Object.values(project.workstreams || {}).filter(w => w.status === 'complete').length;
  const wsTotal = DD_WORKSTREAMS.length;
  const overallRating = getDDOverallRating(project);
  const ratingColor = overallRating === 'GREEN' ? 'green' : overallRating === 'YELLOW' ? 'yellow' : overallRating === 'RED' ? 'red' : null;

  return `
    <div class="card p-4 cursor-pointer hover:shadow-md transition-shadow" onclick="viewDDProject('${project.id}')">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="font-medium text-sm">${escapeHtml(project.companyName)}</span>
            <span class="badge bg-${color}-100 text-${color}-700 dark:bg-${color}-900/30 dark:text-${color}-400 capitalize">${project.status === 'running' ? 'Analyzing…' : project.status}</span>
            ${ratingColor ? `<span class="badge bg-${ratingColor}-100 text-${ratingColor}-700 dark:bg-${ratingColor}-900/30 dark:text-${ratingColor}-400">${overallRating === 'GREEN' ? '✓ Favorable' : overallRating === 'YELLOW' ? '⚠ Caution' : '✗ Concerns'}</span>` : ''}
          </div>
          <p class="text-xs text-surface-500">${escapeHtml(project.dealType || 'Acquisition')} · ${escapeHtml(project.industry || 'Unknown Industry')} · ${new Date(project.createdAt).toLocaleDateString()}</p>
          ${project.status === 'running' || project.status === 'complete' ? `
            <div class="mt-2">
              <div class="flex justify-between text-xs text-surface-500 mb-1">
                <span>${wsComplete} of ${wsTotal} workstreams complete</span>
                <span>${Math.round(wsComplete / wsTotal * 100)}%</span>
              </div>
              <div class="w-full h-1.5 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
                <div class="h-full bg-brand-600 rounded-full transition-all" style="width:${Math.round(wsComplete / wsTotal * 100)}%"></div>
              </div>
            </div>
          ` : ''}
          ${project.status === 'error' ? `<p class="text-xs text-red-600 mt-1">${escapeHtml(project.errorMessage || 'Analysis error')}</p>` : ''}
        </div>
        <div class="flex gap-2 flex-shrink-0">
          ${project.status === 'complete' ? `
            <button onclick="event.stopPropagation();exportDDMarkdown('${project.id}')" class="btn-secondary btn-sm" title="Export as Markdown">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
              Export
            </button>
          ` : ''}
          <button onclick="event.stopPropagation();deleteDDProject('${project.id}')" class="btn-danger btn-sm">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function getDDOverallRating(project) {
  if (project.status !== 'complete') return null;
  const ratings = Object.values(project.workstreams || {}).map(w => w.rating).filter(Boolean);
  if (!ratings.length) return null;
  if (ratings.includes('RED')) return 'RED';
  if (ratings.includes('YELLOW')) return 'YELLOW';
  return 'GREEN';
}

// ─── New DD Modal ─────────────────────────────────────────────────────────────

async function openNewDDModal(dealId) {
  const deal = await DB.get(STORES.deals, dealId);
  if (!deal) return;

  const sourceMaterials = ['CIM', 'Financial Model', 'Management Presentation', 'Customer References', 'Market Research', 'Contracts', 'Tech / Product Demo', 'Audited Financials', 'LOI / Term Sheet'];

  showModal(`
    <div class="p-6">
      <h2 class="text-xl font-semibold mb-1">New Due Diligence Report</h2>
      <p class="text-sm text-surface-500 mb-6">Configure the 8-workstream AI analysis for <strong>${escapeHtml(deal.name)}</strong>.</p>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label">Company Name *</label>
            <input id="dd-company" class="input" value="${escapeHtml(deal.name)}" placeholder="e.g. Acme Corp" />
          </div>
          <div>
            <label class="label">Industry *</label>
            <input id="dd-industry" class="input" value="${escapeHtml(deal.sector || '')}" placeholder="e.g. B2B SaaS, Healthcare IT" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label">Geography</label>
            <input id="dd-geography" class="input" value="${escapeHtml(deal.location || 'USA')}" placeholder="e.g. USA, North America" />
          </div>
          <div>
            <label class="label">Deal Type</label>
            <select id="dd-deal-type" class="input">
              <option value="Search Fund Acquisition">Search Fund Acquisition</option>
              <option value="Management Buyout">Management Buyout</option>
              <option value="Growth Equity">Growth Equity</option>
              <option value="Minority Investment">Minority Investment</option>
              <option value="Recapitalization">Recapitalization</option>
              <option value="Platform Acquisition">Platform Acquisition</option>
              <option value="Add-On Acquisition">Add-On Acquisition</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="label">Revenue ($)</label>
            <input id="dd-revenue" type="number" class="input" value="${deal.revenue || ''}" placeholder="e.g. 5000000" />
          </div>
          <div>
            <label class="label">EBITDA ($)</label>
            <input id="dd-ebitda" type="number" class="input" value="${deal.ebitda || ''}" placeholder="e.g. 1500000" />
          </div>
          <div>
            <label class="label">Asking Price ($)</label>
            <input id="dd-price" type="number" class="input" value="${deal.askingPrice || ''}" placeholder="e.g. 20000000" />
          </div>
        </div>

        <div>
          <label class="label">Investor Thesis *</label>
          <textarea id="dd-thesis" class="input resize-none" rows="4" placeholder="Describe your investment thesis — why this is a compelling opportunity, what value creation levers you plan to use, your target customer segments, and your return profile expectations…"></textarea>
        </div>

        <div>
          <label class="label">Available Source Materials</label>
          <div class="grid grid-cols-3 gap-2 mt-1">
            ${sourceMaterials.map(m => `
              <label class="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800">
                <input type="checkbox" class="dd-material rounded accent-brand-600" value="${escapeHtml(m)}" /> ${escapeHtml(m)}
              </label>
            `).join('')}
          </div>
        </div>

        <div>
          <label class="label">Additional Context</label>
          <textarea id="dd-context" class="input resize-none" rows="3" placeholder="Any other relevant information — management team quality, competitive dynamics, customer conversations, recent market intelligence, known risks or concerns…"></textarea>
        </div>
      </div>

      <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-200 dark:border-surface-800">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="saveDDProject('${dealId}')" class="btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
          Run Analysis (8 Workstreams)
        </button>
      </div>
    </div>
  `);
}

async function saveDDProject(dealId) {
  const companyName = document.getElementById('dd-company').value.trim();
  const industry = document.getElementById('dd-industry').value.trim();
  const thesis = document.getElementById('dd-thesis').value.trim();

  if (!companyName) { showToast('Company name is required', 'error'); return; }
  if (!thesis) { showToast('Investor thesis is required', 'error'); return; }

  const materials = Array.from(document.querySelectorAll('.dd-material:checked')).map(cb => cb.value);

  const project = {
    id: generateId(),
    userId: currentUser.id,
    dealId,
    companyName,
    industry,
    geography: document.getElementById('dd-geography').value.trim() || 'USA',
    dealType: document.getElementById('dd-deal-type').value,
    revenue: parseFloat(document.getElementById('dd-revenue').value) || null,
    ebitda: parseFloat(document.getElementById('dd-ebitda').value) || null,
    askingPrice: parseFloat(document.getElementById('dd-price').value) || null,
    investorThesis: thesis,
    sourceMaterials: materials,
    additionalContext: document.getElementById('dd-context').value.trim(),
    status: 'running',
    workstreams: Object.fromEntries(DD_WORKSTREAMS.map(ws => [ws.id, { status: 'pending' }])),
    scenarios: null,
    createdAt: new Date().toISOString(),
  };

  await DB.add(STORES.ddProjects, project);
  closeModal();

  ddCurrentProjectId = project.id;
  switchDealTab('dd');

  runDDAnalysis(project.id).catch(err => {
    console.error('DD analysis error:', err);
    showToast('Analysis error: ' + err.message, 'error');
  });
}

// ─── Analysis Engine ──────────────────────────────────────────────────────────

async function runDDAnalysis(projectId) {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);

  if (!settings?.openaiApiKey && !settings?.claudeApiKey) {
    const project = await DB.get(STORES.ddProjects, projectId);
    project.status = 'error';
    project.errorMessage = 'No AI API key configured. Add an OpenAI or Claude API key in Settings to run AI analysis.';
    await DB.put(STORES.ddProjects, project);
    refreshDDView(projectId);
    showToast('Add an OpenAI or Claude key in Settings to run analysis', 'error');
    return;
  }

  for (const ws of DD_WORKSTREAMS) {
    try {
      await runDDWorkstream(projectId, ws.id);
    } catch (err) {
      console.warn(`Workstream ${ws.id} failed:`, err);
      const project = await DB.get(STORES.ddProjects, projectId);
      project.workstreams[ws.id] = {
        status: 'error',
        confidence: 0,
        rating: 'YELLOW',
        headline: 'Analysis could not be completed for this workstream',
        keyFindings: ['Please retry or add more context'],
        positives: [],
        concerns: ['Analysis failed: ' + err.message],
        openQuestions: [],
        redFlags: [],
        recommendation: 'Retry with more detailed context or review manually',
      };
      await DB.put(STORES.ddProjects, project);
      refreshDDView(projectId);
    }
  }

  try {
    await runDDScenarios(projectId);
  } catch (err) {
    console.warn('Scenario analysis failed:', err);
  }

  const project = await DB.get(STORES.ddProjects, projectId);
  project.status = 'complete';
  project.completedAt = new Date().toISOString();
  await DB.put(STORES.ddProjects, project);

  refreshDDView(projectId);
  showToast('Due diligence analysis complete!', 'success');
}

async function runDDWorkstream(projectId, wsId) {
  let project = await DB.get(STORES.ddProjects, projectId);
  project.workstreams[wsId] = { status: 'running' };
  await DB.put(STORES.ddProjects, project);
  refreshDDView(projectId);

  const wsInfo = DD_WORKSTREAMS.find(w => w.id === wsId);
  const prompt = buildDDWorkstreamPrompt(project, wsInfo);

  let content = (await callAI(
    'You are a senior management consultant performing commercial due diligence. Always respond with valid JSON only — no markdown, no code fences, no explanation.',
    prompt,
    900, 0.3
  )).trim();
  content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {
      headline: 'Analysis generated — manual review recommended',
      rating: 'YELLOW',
      confidence: 40,
      keyFindings: ['Raw analysis: ' + content.substring(0, 300)],
      positives: [],
      concerns: ['JSON parsing failed — review raw output'],
      openQuestions: [],
      redFlags: [],
      recommendation: 'Manual review recommended',
    };
  }

  project = await DB.get(STORES.ddProjects, projectId);
  project.workstreams[wsId] = {
    status: 'complete',
    confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 65)),
    rating: ['GREEN', 'YELLOW', 'RED'].includes(parsed.rating) ? parsed.rating : 'YELLOW',
    headline: parsed.headline || '',
    keyFindings: (parsed.keyFindings || []).slice(0, 5),
    positives: (parsed.positives || []).slice(0, 4),
    concerns: (parsed.concerns || []).slice(0, 4),
    openQuestions: (parsed.openQuestions || []).slice(0, 5),
    redFlags: (parsed.redFlags || []).slice(0, 4),
    recommendation: parsed.recommendation || '',
  };
  await DB.put(STORES.ddProjects, project);
  refreshDDView(projectId);
}

async function runDDScenarios(projectId) {
  const project = await DB.get(STORES.ddProjects, projectId);
  const fmt = v => v ? '$' + (v / 1e6).toFixed(1) + 'M' : 'Unknown';

  const ddSummary = DD_WORKSTREAMS.map(ws => {
    const w = project.workstreams[ws.id];
    return w?.headline ? `- ${ws.label}: ${w.headline} [${w.rating}]` : '';
  }).filter(Boolean).join('\n');

  const prompt = `You are a senior PE/search fund analyst. Based on this commercial due diligence, create 3 investment scenarios.

Company: ${project.companyName} | Industry: ${project.industry} | Geography: ${project.geography}
Deal Type: ${project.dealType}
Revenue: ${fmt(project.revenue)} | EBITDA: ${fmt(project.ebitda)} | Asking Price: ${fmt(project.askingPrice)}
${project.ebitda && project.askingPrice ? `EV/EBITDA: ${(project.askingPrice / project.ebitda).toFixed(1)}x` : ''}

Investor Thesis: ${project.investorThesis}

DD Workstream Summary:
${ddSummary}

Return ONLY valid JSON (no markdown) in this exact structure:
{
  "base": {
    "label": "Base Case",
    "description": "2-3 sentence summary of base case assumptions and how thesis plays out",
    "revenueGrowthRate": "e.g. 8-10% p.a.",
    "ebitdaMargin": "e.g. 24-26%",
    "holdPeriod": "e.g. 5 years",
    "evMultiple": "e.g. 7-8x EBITDA",
    "irr": "e.g. 20-25%",
    "moic": "e.g. 2.5-3.0x",
    "keyDrivers": ["driver 1", "driver 2", "driver 3"]
  },
  "upside": {
    "label": "Upside Case",
    "description": "...",
    "revenueGrowthRate": "...",
    "ebitdaMargin": "...",
    "holdPeriod": "...",
    "evMultiple": "...",
    "irr": "...",
    "moic": "...",
    "keyDrivers": ["..."]
  },
  "downside": {
    "label": "Downside Case",
    "description": "...",
    "revenueGrowthRate": "...",
    "ebitdaMargin": "...",
    "holdPeriod": "...",
    "evMultiple": "...",
    "irr": "...",
    "moic": "...",
    "keyDrivers": ["..."]
  }
}`;

  let rawScenarios;
  try {
    rawScenarios = (await callAI(
      'You are a senior PE analyst. Always respond with valid JSON only, no markdown.',
      prompt,
      900, 0.2
    )).trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  } catch {
    return; // Scenarios are optional — silently skip if AI call fails
  }

  try {
    const scenarios = JSON.parse(rawScenarios);
    const updated = await DB.get(STORES.ddProjects, projectId);
    updated.scenarios = scenarios;
    await DB.put(STORES.ddProjects, updated);
  } catch {
    // Scenarios are optional
  }
}

function buildDDWorkstreamPrompt(project, wsInfo) {
  const fmt = v => v ? '$' + (v / 1e6).toFixed(1) + 'M' : 'Unknown';
  const ebitdaMargin = project.revenue && project.ebitda
    ? ((project.ebitda / project.revenue) * 100).toFixed(0) + '%'
    : 'Unknown';
  const evRevMultiple = project.revenue && project.askingPrice
    ? (project.askingPrice / project.revenue).toFixed(1) + 'x revenue'
    : '';
  const evEbitdaMultiple = project.ebitda && project.askingPrice
    ? (project.askingPrice / project.ebitda).toFixed(1) + 'x EBITDA'
    : '';
  const multiples = [evRevMultiple, evEbitdaMultiple].filter(Boolean).join(' | ');

  return `Perform a ${wsInfo.label} for this commercial due diligence engagement.

COMPANY PROFILE:
- Company: ${project.companyName}
- Industry: ${project.industry}
- Geography: ${project.geography}
- Deal Type: ${project.dealType}
- Revenue: ${fmt(project.revenue)} | EBITDA: ${fmt(project.ebitda)} | EBITDA Margin: ${ebitdaMargin}
- Asking Price: ${fmt(project.askingPrice)}${multiples ? ' | ' + multiples : ''}
- Source Materials Available: ${project.sourceMaterials?.join(', ') || 'Not specified'}

INVESTOR THESIS:
${project.investorThesis}
${project.additionalContext ? '\nADDITIONAL CONTEXT:\n' + project.additionalContext : ''}

ANALYSIS REQUIRED:
${DD_WORKSTREAM_INSTRUCTIONS[wsInfo.id] || wsInfo.desc}

Return ONLY valid JSON (no markdown, no code fences) in this exact structure:
{
  "headline": "One crisp sentence capturing the key takeaway for ${wsInfo.label}",
  "rating": "GREEN" or "YELLOW" or "RED",
  "confidence": <integer 0-100 reflecting confidence given available data>,
  "keyFindings": ["finding 1", "finding 2", "finding 3", "finding 4"],
  "positives": ["strength 1", "strength 2"],
  "concerns": ["concern 1", "concern 2"],
  "openQuestions": ["question for management 1", "question 2", "question 3", "question 4"],
  "redFlags": ["red flag 1"],
  "recommendation": "One actionable sentence recommending next steps for this workstream"
}`;
}

// ─── Refresh Helper ───────────────────────────────────────────────────────────

function refreshDDView(projectId) {
  if (currentDealTab !== 'dd') return;
  const container = document.getElementById('deal-tab-content');
  if (!container) return;
  const pid = projectId || ddCurrentProjectId;
  if (!pid) return;
  DB.get(STORES.ddProjects, pid).then(project => {
    if (project) container.innerHTML = renderDDDeck(project);
  });
}

// ─── View Project ─────────────────────────────────────────────────────────────

async function viewDDProject(projectId) {
  ddCurrentProjectId = projectId;
  const project = await DB.get(STORES.ddProjects, projectId);
  if (!project) { showToast('Report not found', 'error'); return; }
  const container = document.getElementById('deal-tab-content');
  if (container) container.innerHTML = renderDDDeck(project);
}

// ─── Deck Renderer ────────────────────────────────────────────────────────────

function renderDDDeck(project) {
  const overallRating = getDDOverallRating(project);
  const wsComplete = Object.values(project.workstreams || {}).filter(w => w.status === 'complete').length;
  const wsTotal = DD_WORKSTREAMS.length;
  const isRunning = project.status === 'running';
  const rColor = overallRating === 'GREEN' ? 'green' : overallRating === 'YELLOW' ? 'yellow' : overallRating === 'RED' ? 'red' : 'surface';
  const rLabel = overallRating === 'GREEN' ? '✓ Proceed — Favorable'
    : overallRating === 'YELLOW' ? '⚠ Proceed with Caution'
    : overallRating === 'RED' ? '✗ Significant Concerns'
    : '⋯ Analysis in Progress';

  return `
    <div class="space-y-6 pb-8">

      <!-- Back + Export Row -->
      <div class="flex items-center justify-between">
        <button onclick="ddCurrentProjectId=null;switchDealTab('dd')" class="text-sm text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/></svg>
          All Reports
        </button>
        ${project.status === 'complete' ? `
          <button onclick="exportDDMarkdown('${project.id}')" class="btn-secondary btn-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
            Export Markdown
          </button>
        ` : ''}
      </div>

      <!-- Executive Summary Card -->
      <div class="card p-6 border-l-4 border-${rColor}-500">
        <div class="flex items-start justify-between flex-wrap gap-4 mb-4">
          <div>
            <p class="text-xs font-semibold text-surface-400 uppercase tracking-widest mb-1">Commercial Due Diligence Report</p>
            <h2 class="text-2xl font-bold mb-1">${escapeHtml(project.companyName)}</h2>
            <p class="text-sm text-surface-500">${escapeHtml(project.dealType)} · ${escapeHtml(project.industry)} · ${escapeHtml(project.geography)}</p>
          </div>
          <div class="text-right">
            <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-${rColor}-100 text-${rColor}-700 dark:bg-${rColor}-900/30 dark:text-${rColor}-400">
              ${rLabel}
            </span>
            <p class="text-xs text-surface-400 mt-1.5">${new Date(project.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        ${project.revenue || project.ebitda || project.askingPrice ? `
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-surface-200 dark:border-surface-700">
            ${project.revenue ? `<div><p class="text-xs text-surface-500 mb-0.5">Revenue</p><p class="text-base font-bold">$${(project.revenue / 1e6).toFixed(1)}M</p></div>` : ''}
            ${project.ebitda ? `<div><p class="text-xs text-surface-500 mb-0.5">EBITDA</p><p class="text-base font-bold">$${(project.ebitda / 1e6).toFixed(1)}M <span class="text-xs font-normal text-surface-400">(${((project.ebitda / project.revenue) * 100).toFixed(0)}%)</span></p></div>` : ''}
            ${project.askingPrice ? `<div><p class="text-xs text-surface-500 mb-0.5">Asking Price</p><p class="text-base font-bold">$${(project.askingPrice / 1e6).toFixed(1)}M</p></div>` : ''}
            ${project.ebitda && project.askingPrice ? `<div><p class="text-xs text-surface-500 mb-0.5">EV / EBITDA</p><p class="text-base font-bold">${(project.askingPrice / project.ebitda).toFixed(1)}x</p></div>` : ''}
          </div>
        ` : ''}

        ${isRunning ? `
          <div class="mt-4 pt-4 border-t border-surface-200 dark:border-surface-700">
            <div class="flex justify-between text-xs mb-2">
              <span class="font-medium text-brand-600 animate-pulse">AI analysis running — ${wsComplete} of ${wsTotal} workstreams complete</span>
              <span class="text-surface-400">${Math.round(wsComplete / wsTotal * 100)}%</span>
            </div>
            <div class="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
              <div class="h-full bg-brand-600 rounded-full transition-all duration-700" style="width:${Math.round(wsComplete / wsTotal * 100)}%"></div>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Investor Thesis -->
      <div class="card p-5">
        <h3 class="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Investor Thesis</h3>
        <p class="text-sm text-surface-700 dark:text-surface-300 leading-relaxed">${escapeHtml(project.investorThesis)}</p>
        ${project.sourceMaterials?.length ? `
          <div class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-surface-200 dark:border-surface-700">
            <span class="text-xs text-surface-400 self-center">Sources:</span>
            ${project.sourceMaterials.map(m => `<span class="badge bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400">${escapeHtml(m)}</span>`).join('')}
          </div>
        ` : ''}
      </div>

      <!-- Workstream Dashboard -->
      <div>
        <h3 class="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Workstream Dashboard</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          ${DD_WORKSTREAMS.map(ws => {
            const w = project.workstreams?.[ws.id] || { status: 'pending' };
            const wRatingColor = w.rating === 'GREEN' ? 'green' : w.rating === 'YELLOW' ? 'yellow' : w.rating === 'RED' ? 'red' : 'surface';
            const dotClass = w.status === 'complete' ? `bg-${wRatingColor}-500`
              : w.status === 'running' ? 'bg-yellow-400 animate-pulse'
              : w.status === 'error' ? 'bg-red-400'
              : 'bg-surface-300';
            return `
              <div class="card p-3 ${w.status === 'complete' ? 'cursor-pointer hover:shadow-md transition-shadow' : 'opacity-70'}"
                   ${w.status === 'complete' ? `onclick="document.getElementById('ws-section-${ws.id}')?.scrollIntoView({behavior:'smooth',block:'start'})"` : ''}>
                <div class="flex items-center gap-2 mb-1.5">
                  <span class="w-2 h-2 rounded-full flex-shrink-0 ${dotClass}"></span>
                  <span class="text-xs font-semibold truncate">${ws.label}</span>
                </div>
                ${w.status === 'complete' ? `
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-surface-400">${w.confidence || 0}% confidence</span>
                    <span class="text-xs font-bold text-${wRatingColor}-600 dark:text-${wRatingColor}-400">${w.rating}</span>
                  </div>
                  ${w.redFlags?.length ? `<p class="text-xs text-red-500 mt-1">${w.redFlags.length} red flag${w.redFlags.length !== 1 ? 's' : ''}</p>` : ''}
                ` : `<p class="text-xs text-surface-400 capitalize">${w.status === 'running' ? 'Analyzing…' : w.status}</p>`}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Workstream Detail Sections -->
      ${DD_WORKSTREAMS.map(ws => renderDDWorkstreamSection(ws, project.workstreams?.[ws.id] || { status: 'pending' })).join('')}

      <!-- Scenario Analysis -->
      ${project.scenarios ? renderDDScenarioSection(project.scenarios) : ''}

      <!-- Consolidated Risk Summary -->
      ${project.status === 'complete' ? renderDDRiskSummary(project) : ''}

      <!-- Export Footer -->
      ${project.status === 'complete' ? `
        <div class="card p-4 border border-dashed border-surface-300 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50">
          <div class="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p class="text-sm font-semibold">Ready to share this report?</p>
              <p class="text-xs text-surface-500 mt-0.5">Export as a Markdown memo for use in presentations, board decks, or investor updates.</p>
            </div>
            <button onclick="exportDDMarkdown('${project.id}')" class="btn-primary btn-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
              Export Markdown
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderDDWorkstreamSection(wsInfo, w) {
  if (w.status === 'pending') {
    return `
      <div id="ws-section-${wsInfo.id}" class="card p-4 opacity-40">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-surface-300"></span>
          <span class="text-sm font-semibold">${wsInfo.label}</span>
          <span class="text-xs text-surface-400">— Pending</span>
        </div>
      </div>
    `;
  }

  if (w.status === 'running') {
    return `
      <div id="ws-section-${wsInfo.id}" class="card p-4">
        <div class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
          <span class="text-sm font-semibold">${wsInfo.label}</span>
          <span class="text-xs text-yellow-600 animate-pulse">Analyzing…</span>
        </div>
      </div>
    `;
  }

  const rColor = w.rating === 'GREEN' ? 'green' : w.rating === 'YELLOW' ? 'yellow' : w.rating === 'RED' ? 'red' : 'surface';

  return `
    <div id="ws-section-${wsInfo.id}" class="card p-5">
      <!-- Header -->
      <div class="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div class="flex items-start gap-3 flex-1 min-w-0">
          <span class="w-2.5 h-2.5 rounded-full bg-${rColor}-500 flex-shrink-0 mt-1.5"></span>
          <div class="min-w-0">
            <h3 class="text-sm font-bold">${wsInfo.label}</h3>
            <p class="text-sm text-surface-600 dark:text-surface-400 mt-0.5 leading-snug">${escapeHtml(w.headline || '')}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-xs text-surface-400">${w.confidence || 0}% conf.</span>
          <span class="badge bg-${rColor}-100 text-${rColor}-700 dark:bg-${rColor}-900/30 dark:text-${rColor}-400 font-semibold">${w.rating}</span>
        </div>
      </div>

      <!-- Key Findings + Strengths/Concerns -->
      <div class="grid md:grid-cols-2 gap-5">
        ${w.keyFindings?.length ? `
          <div>
            <p class="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Key Findings</p>
            <ul class="space-y-1.5">
              ${w.keyFindings.map(f => `
                <li class="flex gap-2 text-sm leading-snug">
                  <span class="text-surface-300 flex-shrink-0 mt-0.5">•</span>
                  <span>${escapeHtml(f)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}

        <div class="space-y-4">
          ${w.positives?.length ? `
            <div>
              <p class="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-2">Strengths</p>
              <ul class="space-y-1">
                ${w.positives.map(p => `
                  <li class="flex gap-2 text-sm leading-snug">
                    <span class="text-green-500 font-bold flex-shrink-0">+</span>
                    <span>${escapeHtml(p)}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
          ${w.concerns?.length ? `
            <div>
              <p class="text-xs font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-wider mb-2">Concerns</p>
              <ul class="space-y-1">
                ${w.concerns.map(c => `
                  <li class="flex gap-2 text-sm leading-snug">
                    <span class="text-yellow-500 font-bold flex-shrink-0">−</span>
                    <span>${escapeHtml(c)}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Red Flags -->
      ${w.redFlags?.length ? `
        <div class="mt-4 p-3 rounded bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30">
          <p class="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-wider mb-2">⚠ Red Flags</p>
          <ul class="space-y-1">
            ${w.redFlags.map(f => `
              <li class="flex gap-2 text-sm text-red-700 dark:text-red-300 leading-snug">
                <span class="font-bold flex-shrink-0">!</span>
                <span>${escapeHtml(f)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Open Questions -->
      ${w.openQuestions?.length ? `
        <div class="mt-4 pt-4 border-t border-surface-200 dark:border-surface-700">
          <p class="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">Open Questions for Management</p>
          <ul class="space-y-1.5">
            ${w.openQuestions.map((q, i) => `
              <li class="flex gap-2 text-sm leading-snug">
                <span class="text-brand-500 font-semibold flex-shrink-0 min-w-[1.5rem]">Q${i + 1}.</span>
                <span class="text-surface-600 dark:text-surface-400">${escapeHtml(q)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Recommendation -->
      ${w.recommendation ? `
        <div class="mt-4 pt-3 border-t border-surface-200 dark:border-surface-700">
          <p class="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-1">Recommendation</p>
          <p class="text-sm font-medium text-surface-700 dark:text-surface-300">${escapeHtml(w.recommendation)}</p>
        </div>
      ` : ''}
    </div>
  `;
}

function renderDDScenarioSection(scenarios) {
  const order = ['base', 'upside', 'downside'];
  const colors = { base: 'blue', upside: 'green', downside: 'red' };
  const metrics = [
    { key: 'revenueGrowthRate', label: 'Revenue Growth' },
    { key: 'ebitdaMargin', label: 'EBITDA Margin' },
    { key: 'holdPeriod', label: 'Hold Period' },
    { key: 'evMultiple', label: 'Exit Multiple' },
    { key: 'irr', label: 'Target IRR' },
    { key: 'moic', label: 'Target MOIC' },
  ];

  return `
    <div>
      <h3 class="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Scenario Analysis</h3>
      <div class="grid md:grid-cols-3 gap-4">
        ${order.map(key => {
          const s = scenarios[key];
          if (!s) return '';
          const c = colors[key];
          return `
            <div class="card p-5 border-t-4 border-${c}-400">
              <h4 class="text-sm font-bold text-${c}-700 dark:text-${c}-400 mb-2">${escapeHtml(s.label || key)}</h4>
              <p class="text-xs text-surface-500 mb-4 leading-relaxed">${escapeHtml(s.description || '')}</p>
              <div class="space-y-2 mb-4">
                ${metrics.filter(m => s[m.key]).map(m => `
                  <div class="flex justify-between items-baseline">
                    <span class="text-xs text-surface-500">${m.label}</span>
                    <span class="text-sm font-semibold">${escapeHtml(s[m.key])}</span>
                  </div>
                `).join('')}
              </div>
              ${s.keyDrivers?.length ? `
                <div class="pt-3 border-t border-surface-200 dark:border-surface-700">
                  <p class="text-xs text-surface-400 mb-1.5">Key Drivers</p>
                  <ul class="space-y-1">
                    ${s.keyDrivers.map(d => `<li class="text-xs text-surface-600 dark:text-surface-400 flex gap-1.5"><span class="text-${c}-400">•</span><span>${escapeHtml(d)}</span></li>`).join('')}
                  </ul>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderDDRiskSummary(project) {
  const allRedFlags = [];
  const allOpenQuestions = [];

  DD_WORKSTREAMS.forEach(ws => {
    const w = project.workstreams?.[ws.id];
    if (!w) return;
    (w.redFlags || []).forEach(f => allRedFlags.push({ workstream: ws.label, text: f }));
    (w.openQuestions || []).slice(0, 2).forEach(q => allOpenQuestions.push({ workstream: ws.label, text: q }));
  });

  if (!allRedFlags.length && !allOpenQuestions.length) return '';

  return `
    <div class="card p-5">
      <h3 class="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-4">Consolidated Risk & Questions Summary</h3>
      <div class="grid md:grid-cols-2 gap-6">
        ${allRedFlags.length ? `
          <div>
            <p class="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-3">Red Flags (${allRedFlags.length})</p>
            <ul class="space-y-2">
              ${allRedFlags.map(({ workstream, text }) => `
                <li class="flex gap-2 text-sm leading-snug">
                  <span class="text-red-500 font-bold flex-shrink-0">!</span>
                  <span><span class="text-xs text-surface-400">[${workstream}]</span> ${escapeHtml(text)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        ${allOpenQuestions.length ? `
          <div>
            <p class="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider mb-3">Priority Questions (${allOpenQuestions.length})</p>
            <ul class="space-y-2">
              ${allOpenQuestions.slice(0, 10).map(({ workstream, text }) => `
                <li class="flex gap-2 text-sm leading-snug">
                  <span class="text-brand-500 font-bold flex-shrink-0">?</span>
                  <span><span class="text-xs text-surface-400">[${workstream}]</span> ${escapeHtml(text)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function exportDDMarkdown(projectId) {
  const project = await DB.get(STORES.ddProjects, projectId);
  if (!project) return;

  const rating = getDDOverallRating(project);
  const ratingLabel = rating === 'GREEN' ? 'PROCEED — FAVORABLE'
    : rating === 'YELLOW' ? 'PROCEED WITH CAUTION'
    : rating === 'RED' ? 'SIGNIFICANT CONCERNS'
    : 'INCOMPLETE';
  const fmt = v => v ? '$' + (v / 1e6).toFixed(1) + 'M' : 'N/A';
  const dateStr = new Date(project.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let md = `# Commercial Due Diligence — ${project.companyName}\n\n`;
  md += `**Date:** ${dateStr}  \n`;
  md += `**Overall Rating:** ${ratingLabel}  \n`;
  md += `**Deal Type:** ${project.dealType}  \n`;
  md += `**Industry:** ${project.industry} | **Geography:** ${project.geography}\n\n`;

  if (project.revenue || project.ebitda || project.askingPrice) {
    md += `## Financial Summary\n\n| Metric | Value |\n|---|---|\n`;
    if (project.revenue) md += `| Revenue | ${fmt(project.revenue)} |\n`;
    if (project.ebitda) md += `| EBITDA | ${fmt(project.ebitda)} (${((project.ebitda / project.revenue) * 100).toFixed(0)}% margin) |\n`;
    if (project.askingPrice) md += `| Asking Price | ${fmt(project.askingPrice)} |\n`;
    if (project.ebitda && project.askingPrice) md += `| EV/EBITDA | ${(project.askingPrice / project.ebitda).toFixed(1)}x |\n`;
    if (project.revenue && project.askingPrice) md += `| EV/Revenue | ${(project.askingPrice / project.revenue).toFixed(1)}x |\n`;
    md += `\n`;
  }

  md += `## Investor Thesis\n\n${project.investorThesis}\n\n`;
  if (project.sourceMaterials?.length) {
    md += `**Source Materials Available:** ${project.sourceMaterials.join(', ')}\n\n`;
  }
  if (project.additionalContext) {
    md += `**Additional Context:** ${project.additionalContext}\n\n`;
  }

  md += `---\n\n## Workstream Analysis\n\n`;

  DD_WORKSTREAMS.forEach(ws => {
    const w = project.workstreams?.[ws.id];
    if (!w || w.status !== 'complete') return;

    md += `### ${ws.label}\n\n`;
    md += `**Rating:** ${w.rating} | **Confidence:** ${w.confidence}%\n\n`;
    md += `> ${w.headline}\n\n`;

    if (w.keyFindings?.length) {
      md += `**Key Findings:**\n`;
      w.keyFindings.forEach(f => { md += `- ${f}\n`; });
      md += `\n`;
    }
    if (w.positives?.length) {
      md += `**Strengths:**\n`;
      w.positives.forEach(p => { md += `+ ${p}\n`; });
      md += `\n`;
    }
    if (w.concerns?.length) {
      md += `**Concerns:**\n`;
      w.concerns.forEach(c => { md += `- ${c}\n`; });
      md += `\n`;
    }
    if (w.redFlags?.length) {
      md += `**⚠ Red Flags:**\n`;
      w.redFlags.forEach(f => { md += `> ⚠ ${f}\n`; });
      md += `\n`;
    }
    if (w.openQuestions?.length) {
      md += `**Open Questions for Management:**\n`;
      w.openQuestions.forEach((q, i) => { md += `${i + 1}. ${q}\n`; });
      md += `\n`;
    }
    if (w.recommendation) {
      md += `**Recommendation:** ${w.recommendation}\n\n`;
    }
    md += `---\n\n`;
  });

  if (project.scenarios) {
    md += `## Scenario Analysis\n\n`;
    ['base', 'upside', 'downside'].forEach(key => {
      const s = project.scenarios[key];
      if (!s) return;
      md += `### ${s.label || key}\n\n${s.description || ''}\n\n`;
      md += `| Metric | Value |\n|---|---|\n`;
      if (s.revenueGrowthRate) md += `| Revenue Growth | ${s.revenueGrowthRate} |\n`;
      if (s.ebitdaMargin) md += `| EBITDA Margin | ${s.ebitdaMargin} |\n`;
      if (s.holdPeriod) md += `| Hold Period | ${s.holdPeriod} |\n`;
      if (s.evMultiple) md += `| Exit Multiple | ${s.evMultiple} |\n`;
      if (s.irr) md += `| Target IRR | ${s.irr} |\n`;
      if (s.moic) md += `| Target MOIC | ${s.moic} |\n`;
      md += `\n`;
      if (s.keyDrivers?.length) {
        md += `**Key Drivers:** ${s.keyDrivers.join(', ')}\n\n`;
      }
    });
    md += `---\n\n`;
  }

  const allRedFlags = [];
  DD_WORKSTREAMS.forEach(ws => {
    const w = project.workstreams?.[ws.id];
    (w?.redFlags || []).forEach(f => allRedFlags.push(`[${ws.label}] ${f}`));
  });
  if (allRedFlags.length) {
    md += `## Consolidated Red Flags\n\n`;
    allRedFlags.forEach(f => { md += `> ⚠ ${f}\n`; });
    md += `\n`;
  }

  md += `---\n*Generated by Pulse — Commercial Due Diligence Tool · ${new Date().toLocaleDateString()}*\n`;

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DD_${project.companyName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported as Markdown', 'success');
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteDDProject(projectId) {
  if (!confirm('Delete this due diligence report? This cannot be undone.')) return;
  await DB.delete(STORES.ddProjects, projectId);
  if (ddCurrentProjectId === projectId) ddCurrentProjectId = null;
  showToast('Report deleted', 'info');
  switchDealTab('dd');
}
