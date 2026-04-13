/* ============================================
   Nexus CRM — Deal Scoring & Prioritization
   ============================================ */

const DEFAULT_SCORING_CRITERIA = {
  revenueSize:          { weight: 15, label: 'Revenue Size ($1M-$30M ideal)',        description: 'Annual revenue within search fund target range' },
  ebitdaMargin:         { weight: 15, label: 'EBITDA Margin (15%+ ideal)',           description: 'Healthy margins indicating pricing power' },
  ownerDependence:      { weight: 10, label: 'Owner Dependence (low = good)',        description: 'Low owner dependence reduces transition risk' },
  recurringRevenue:     { weight: 10, label: 'Recurring Revenue %',                  description: 'Recurring or contractual revenue quality' },
  marketPosition:       { weight: 10, label: 'Market Position',                      description: 'Niche leadership or defensible position' },
  growthPotential:      { weight: 10, label: 'Growth Potential',                     description: 'Organic and inorganic growth runway' },
  customerConcentration:{ weight: 10, label: 'Customer Concentration (low = good)',  description: 'Low concentration reduces revenue risk' },
  valuationAttractiveness:{ weight: 10, label: 'Valuation Attractiveness',           description: 'Asking multiple relative to quality' },
  geographicFit:        { weight: 5,  label: 'Geographic Fit',                       description: 'Location relative to searcher preferences' },
  sectorFit:            { weight: 5,  label: 'Sector Fit',                           description: 'Industry alignment with thesis' },
};

function computeWeightedScore(scores, criteria) {
  if (!scores || !criteria) return null;
  let totalWeight = 0;
  let weightedSum = 0;

  for (const [key, config] of Object.entries(criteria)) {
    const score = scores[key];
    if (score !== undefined && score !== null && !isNaN(score)) {
      weightedSum += score * config.weight;
      totalWeight += config.weight;
    }
  }

  if (totalWeight === 0) return null;
  return Math.round((weightedSum / totalWeight) * 10) / 10; // 0-10 scale, 1 decimal
}

async function calculateDealScore(dealId) {
  const deal = await DB.get(STORES.deals, dealId);
  if (!deal) return;

  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  const criteria = settings?.dealScoringCriteria || DEFAULT_SCORING_CRITERIA;

  const score = computeWeightedScore(deal.scoreBreakdown, criteria);
  deal.score = score;
  deal.updatedAt = new Date().toISOString();
  await DB.put(STORES.deals, deal);

  await logDealHistory(dealId, 'score_updated', { score, breakdown: deal.scoreBreakdown });
  return score;
}

function renderScoreBar(score, size = 'md') {
  if (score === null || score === undefined) {
    return `<span class="text-xs text-surface-400">Not scored</span>`;
  }

  const pct = (score / 10) * 100;
  const color = score >= 7 ? '#40c057' : score >= 5 ? '#fab005' : '#fa5252';
  const sizeClass = size === 'sm' ? 'h-1.5' : 'h-2';

  return `
    <div class="flex items-center gap-2">
      <div class="flex-1 bg-surface-200 dark:bg-surface-700 rounded-sm ${sizeClass} min-w-[60px]">
        <div class="rounded-full ${sizeClass}" style="width: ${pct}%; background-color: ${color}"></div>
      </div>
      <span class="text-xs font-semibold" style="color: ${color}">${score.toFixed(1)}</span>
    </div>
  `;
}

function renderScoreBreakdown(breakdown, criteria) {
  if (!breakdown) return '<p class="text-sm text-surface-500">No scores entered yet.</p>';
  const usedCriteria = criteria || DEFAULT_SCORING_CRITERIA;

  return `
    <div class="space-y-3">
      ${Object.entries(usedCriteria).map(([key, config]) => {
        const val = breakdown[key];
        const pct = val !== undefined ? (val / 10) * 100 : 0;
        const color = val >= 7 ? '#40c057' : val >= 5 ? '#fab005' : val !== undefined ? '#fa5252' : '#ced4da';
        return `
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-surface-600 dark:text-surface-400">${escapeHtml(config.label)} <span class="text-surface-400">(${config.weight}%)</span></span>
              <span class="text-xs font-semibold" style="color: ${color}">${val !== undefined ? val + '/10' : '—'}</span>
            </div>
            <div class="bg-surface-200 dark:bg-surface-700 rounded-sm h-1.5">
              <div class="rounded-full h-1.5 transition-all" style="width: ${pct}%; background-color: ${color}"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function openScoringModal(dealId) {
  DB.get(STORES.deals, dealId).then(deal => {
    if (!deal) return;
    const breakdown = deal.scoreBreakdown || {};
    const criteria = DEFAULT_SCORING_CRITERIA;

    openModal('Score Deal', `
      <div class="p-6 space-y-4">
        <p class="text-sm text-surface-500">Rate each criterion from 0 (worst) to 10 (best). Weights determine importance.</p>
        ${Object.entries(criteria).map(([key, config]) => `
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">${escapeHtml(config.label)} <span class="text-surface-400 text-xs">(${config.weight}%)</span></label>
            <p class="text-xs text-surface-400 mb-1">${escapeHtml(config.description)}</p>
            <div class="flex items-center gap-3">
              <input type="range" id="score-${key}" min="0" max="10" step="0.5" value="${breakdown[key] ?? 5}" class="flex-1 accent-brand-600"
                oninput="document.getElementById('score-val-${key}').textContent = this.value" />
              <span id="score-val-${key}" class="text-sm font-semibold w-8 text-center">${breakdown[key] ?? 5}</span>
            </div>
          </div>
        `).join('')}
        <div class="flex justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-800">
          <button onclick="closeModal()" class="btn-secondary">Cancel</button>
          <button onclick="saveDealScores('${dealId}')" class="btn-primary">Save Scores</button>
        </div>
      </div>
    `);
  });
}

async function saveDealScores(dealId) {
  const deal = await DB.get(STORES.deals, dealId);
  if (!deal) return;

  const breakdown = {};
  for (const key of Object.keys(DEFAULT_SCORING_CRITERIA)) {
    const el = document.getElementById(`score-${key}`);
    if (el) breakdown[key] = parseFloat(el.value);
  }

  deal.scoreBreakdown = breakdown;
  deal.score = computeWeightedScore(breakdown, DEFAULT_SCORING_CRITERIA);
  await DB.put(STORES.deals, deal);
  await logDealHistory(dealId, 'score_updated', { score: deal.score, breakdown });

  closeModal();
  showToast(`Deal scored: ${deal.score?.toFixed(1)}/10`, 'success');

  // Re-render if on detail page
  if (typeof currentDealId !== 'undefined' && currentDealId === dealId) {
    viewDeal(dealId);
  }
}

function renderScoreBadge(score) {
  if (score === null || score === undefined) return '';
  const color = score >= 7 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    : score >= 5 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${color}">${score.toFixed(1)}</span>`;
}
