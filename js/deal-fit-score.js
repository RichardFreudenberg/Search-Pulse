/* ============================================================
   SearchPulse CRM — Deal Fit Score Engine  v2.0
   Deterministic scoring engine + AI explanation layer.
   All scoring logic is pure / side-effect-free.
   AI is invoked only for human-readable suggestions.
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────────────────────
// §1  SCHEMA VERSION & TIER DEFINITIONS
// ─────────────────────────────────────────────────────────────
const EVAL_SCHEMA_VERSION = '2.0';

const SCORE_TIERS = [
  { min: 90, label: 'Strong Fit',     tier: 'strong',     color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  { min: 70, label: 'Acceptable Fit', tier: 'acceptable', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  { min: 50, label: 'Partial Fit',    tier: 'partial',    color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  { min:  0, label: 'Weak Fit',       tier: 'weak',       color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
];

function _getTier(score) {
  return SCORE_TIERS.find(t => score >= t.min) || SCORE_TIERS[SCORE_TIERS.length - 1];
}

// ─────────────────────────────────────────────────────────────
// §2  CRITERIA MODEL
// ─────────────────────────────────────────────────────────────

/**
 * Each criterion:
 *   id            – unique key, used for overrides map
 *   label         – display name
 *   category      – grouping header
 *   type          – 'hard' (binary disqualifier) | 'soft' (weighted 0-10)
 *   weight        – contribution to total score (soft only, sum = 100)
 *   isDisqualifier– hard fail → total score = 0
 *   description   – tooltip / explanation text
 */
const CRITERIA_DEFINITIONS = [
  // ── Hard gates (binary) ──────────────────────────────────
  {
    id: 'control_buyout', label: 'Control / Majority Buyout',
    category: 'Deal Structure', type: 'hard', weight: 0, isDisqualifier: true,
    description: 'Deal must allow majority/control position; minority deals are auto-rejected.',
  },
  {
    id: 'excluded_sector', label: 'Not in Excluded Sector',
    category: 'Industry', type: 'hard', weight: 0, isDisqualifier: true,
    description: 'Deal sector must not appear in your excluded-sectors list.',
  },

  // ── Soft criteria (weighted, sum = 100) ──────────────────
  {
    id: 'industry_fit', label: 'Industry / Sector Fit',
    category: 'Industry', type: 'soft', weight: 15,
    description: 'How well the company sector matches your target industries.',
  },
  {
    id: 'geography', label: 'Geography',
    category: 'Geography', type: 'soft', weight: 5,
    description: 'Company location alignment with your target geographies.',
  },
  {
    id: 'revenue_size', label: 'Revenue Size',
    category: 'Financials', type: 'soft', weight: 12,
    description: 'Trailing revenue fits within your min/max revenue range.',
  },
  {
    id: 'ebitda_size', label: 'EBITDA Size',
    category: 'Financials', type: 'soft', weight: 13,
    description: 'Trailing EBITDA fits within your min/max EBITDA range.',
  },
  {
    id: 'margin_quality', label: 'EBITDA Margin Quality',
    category: 'Financials', type: 'soft', weight: 12,
    description: 'EBITDA margin meets or exceeds your minimum margin threshold.',
  },
  {
    id: 'entry_multiple', label: 'Entry Multiple',
    category: 'Financials', type: 'soft', weight: 10,
    description: 'Asking EBITDA multiple is at or below your maximum multiple.',
  },
  {
    id: 'revenue_growth', label: 'Revenue Growth',
    category: 'Growth', type: 'soft', weight: 10,
    description: 'Historical revenue growth rate meets your minimum growth threshold.',
  },
  {
    id: 'recurring_revenue', label: 'Recurring Revenue',
    category: 'Growth', type: 'soft', weight: 8,
    description: 'Percentage of predictable / recurring revenue.',
  },
  {
    id: 'customer_concentration', label: 'Customer Concentration',
    category: 'Risk', type: 'soft', weight: 8,
    description: 'Top customer concentration is below your maximum threshold.',
  },
  {
    id: 'business_stability', label: 'Business Stability',
    category: 'Risk', type: 'soft', weight: 5,
    description: 'Business age, consistent cash flow, and operational stability signals.',
  },
  {
    id: 'owner_situation', label: 'Owner / Seller Situation',
    category: 'Deal Structure', type: 'soft', weight: 2,
    description: 'Seller motivation aligns with a clean, motivated handover.',
  },
];

// ─────────────────────────────────────────────────────────────
// §3  EVIDENCE EXTRACTOR
// Pure function — reads deal fields + extracted doc text.
// Returns structured evidence with source citations.
// ─────────────────────────────────────────────────────────────

/**
 * @param {object} deal   – deal record from IndexedDB
 * @param {object[]} docs – document records (may include extractedText)
 * @returns {object}      – map of evidence fields
 */
function extractEvidence(deal, docs = []) {
  const d = deal || {};
  const docText = _combineDocText(docs);

  return {
    revenue:        _ev_revenue(d, docText),
    ebitda:         _ev_ebitda(d, docText),
    multiple:       _ev_multiple(d, docText),
    margin:         _ev_margin(d, docText),
    dealSector:     _ev_sector(d, docText),
    location:       _ev_location(d, docText),
    growthRate:     _ev_growthRate(d, docText),
    recurringRev:   _ev_recurringRev(d, docText),
    custConc:       _ev_custConc(d, docText),
    controlSignal:  _ev_control(d, docText),
    ownerSignal:    _ev_ownerSituation(d, docText),
    businessAge:    _ev_businessAge(d, docText),
    tags:           { value: d.tags || [], source: 'deal_field', confidence: 'high' },
  };
}

function _combineDocText(docs) {
  return (docs || [])
    .filter(d => d.extractedText)
    .map(d => d.extractedText)
    .join('\n\n')
    .slice(0, 20000);
}

function _ev(value, source, confidence = 'high') {
  return { value, source, confidence };
}

function _ev_revenue(d, txt) {
  if (d.revenue && !isNaN(parseFloat(d.revenue))) return _ev(parseFloat(d.revenue), 'deal_field', 'high');
  const m = txt.match(/(?:revenue|sales|turnover)[^\d]{0,20}[\$£€]?\s*([\d,]+(?:\.\d+)?)\s*(?:M|K|million|thousand)?/i);
  if (m) return _ev(_parseMoney(m[1], m[0]), 'doc_text', 'medium');
  return _ev(null, 'not_found', 'none');
}

function _ev_ebitda(d, txt) {
  if (d.ebitda && !isNaN(parseFloat(d.ebitda))) return _ev(parseFloat(d.ebitda), 'deal_field', 'high');
  const m = txt.match(/ebitda[^\d]{0,20}[\$£€]?\s*([\d,]+(?:\.\d+)?)\s*(?:M|K|million|thousand)?/i);
  if (m) return _ev(_parseMoney(m[1], m[0]), 'doc_text', 'medium');
  return _ev(null, 'not_found', 'none');
}

function _ev_multiple(d, txt) {
  if (d.askingMultiple && !isNaN(parseFloat(d.askingMultiple))) return _ev(parseFloat(d.askingMultiple), 'deal_field', 'high');
  if (d.askingPrice && d.ebitda && parseFloat(d.ebitda) > 0) {
    return _ev(parseFloat(d.askingPrice) / parseFloat(d.ebitda), 'computed', 'medium');
  }
  const m = txt.match(/([\d.]+)\s*x\s*(?:ebitda|earnings)/i);
  if (m) return _ev(parseFloat(m[1]), 'doc_text', 'medium');
  return _ev(null, 'not_found', 'none');
}

function _ev_margin(d, txt) {
  const rev = parseFloat(d.revenue);
  const ebt = parseFloat(d.ebitda);
  if (rev > 0 && ebt > 0) return _ev((ebt / rev) * 100, 'computed', 'high');
  const m = txt.match(/ebitda\s+margin[^\d]{0,10}([\d.]+)\s*%/i);
  if (m) return _ev(parseFloat(m[1]), 'doc_text', 'medium');
  return _ev(null, 'not_found', 'none');
}

function _ev_sector(d, txt) {
  const v = (d.sector || '').trim();
  if (v) return _ev(v, 'deal_field', 'high');
  return _ev('', 'not_found', 'none');
}

function _ev_location(d, txt) {
  const v = (d.location || d.state || d.city || '').trim();
  if (v) return _ev(v, 'deal_field', 'high');
  const m = txt.match(/(?:headquartered|located|offices?)\s+in\s+([A-Za-z\s,]+?)[\.\n]/i);
  if (m) return _ev(m[1].trim(), 'doc_text', 'low');
  return _ev('', 'not_found', 'none');
}

function _ev_growthRate(d, txt) {
  if (d.revenueGrowthRate != null && d.revenueGrowthRate !== '') return _ev(parseFloat(d.revenueGrowthRate), 'deal_field', 'high');
  const m = txt.match(/(?:revenue|sales)\s+(?:growth|grew|cagr)[^\d]{0,15}([\d.]+)\s*%/i);
  if (m) return _ev(parseFloat(m[1]), 'doc_text', 'medium');
  return _ev(null, 'not_found', 'none');
}

function _ev_recurringRev(d, txt) {
  if (d.recurringRevenuePct != null && d.recurringRevenuePct !== '') return _ev(parseFloat(d.recurringRevenuePct), 'deal_field', 'high');
  const m = txt.match(/([\d.]+)\s*%\s*(?:recurring|subscription|contracted)/i);
  if (m) return _ev(parseFloat(m[1]), 'doc_text', 'medium');
  if (/recurring|subscription|saas/i.test(txt)) return _ev(null, 'doc_text', 'low');
  return _ev(null, 'not_found', 'none');
}

function _ev_custConc(d, txt) {
  if (d.customerConcentration != null && d.customerConcentration !== '') return _ev(parseFloat(d.customerConcentration), 'deal_field', 'high');
  const m = txt.match(/(?:top|largest)\s+customer[^\d]{0,20}([\d.]+)\s*%/i);
  if (m) return _ev(parseFloat(m[1]), 'doc_text', 'medium');
  if (/no single customer|diverse customer/i.test(txt)) return _ev(10, 'doc_text', 'low');
  return _ev(null, 'not_found', 'none');
}

function _ev_control(d, txt) {
  // Positive signals for control availability
  if (/minority|passive|non-control/i.test(txt + ' ' + (d.description || ''))) {
    return _ev('minority_indicated', 'doc_text', 'medium');
  }
  if (/100%|full ownership|complete ownership|control|majority stake/i.test(txt)) {
    return _ev('control_available', 'doc_text', 'low');
  }
  return _ev('unknown', 'not_found', 'none');
}

function _ev_ownerSituation(d, txt) {
  const signals = [];
  if (/founder.owned|founded by/i.test(txt)) signals.push('founder-owned');
  if (/family.owned|family business/i.test(txt)) signals.push('family-owned');
  if (/retiring|retirement/i.test(txt)) signals.push('retiring-owner');
  if (/motivated seller|looking to sell/i.test(txt)) signals.push('motivated');
  const v = signals.length ? signals : (d.ownerSituation ? [d.ownerSituation] : []);
  return _ev(v, v.length ? 'doc_text' : 'not_found', v.length ? 'low' : 'none');
}

function _ev_businessAge(d, txt) {
  if (d.foundedYear) {
    const age = new Date().getFullYear() - parseInt(d.foundedYear);
    return _ev(age, 'deal_field', 'high');
  }
  const m = txt.match(/(?:founded|established|operating since)\s+(?:in\s+)?(19|20)\d{2}/i);
  if (m) {
    const yr = parseInt(m[0].match(/(19|20)\d{2}/)[0]);
    return _ev(new Date().getFullYear() - yr, 'doc_text', 'medium');
  }
  return _ev(null, 'not_found', 'none');
}

function _parseMoney(numStr, context = '') {
  const n = parseFloat(numStr.replace(/,/g, ''));
  if (/million/i.test(context) || /\bM\b/.test(context)) return n * 1_000_000;
  if (/thousand/i.test(context) || /\bK\b/.test(context)) return n * 1_000;
  // Heuristic: bare numbers < 1000 are likely millions in deal docs
  return n < 1000 ? n * 1_000_000 : n;
}

// ─────────────────────────────────────────────────────────────
// §4  SCORING ENGINE  (deterministic, pure)
// ─────────────────────────────────────────────────────────────

/**
 * Score a single criterion.
 * Returns { id, rating, score, matchType, reason, gap, confidence, overridden }
 *   rating    – 'pass' | 'watch' | 'fail' | 'no_data' | 'override'
 *   matchType – 'exact' | 'partial' | 'no_data' | 'fail' | 'no_constraint' | 'override'
 *   score     – 0-10 (soft only)
 *   gap       – null | { severity: 'disqualifier'|'partial'|'weak', description }
 */
function scoreCriterion(def, evidence, criteria) {
  const overrides = (criteria && criteria._overrides) || {};
  const ov = overrides[def.id];

  if (ov) {
    return {
      id: def.id, label: def.label, category: def.category, type: def.type,
      weight: def.weight, isDisqualifier: !!def.isDisqualifier,
      rating: 'override', matchType: 'override',
      score: typeof ov.rating === 'number' ? ov.rating : 10,
      reason: `Manual override: ${ov.note || '(no note)'}`,
      gap: null, confidence: 'high', overridden: true,
      overrideNote: ov.note, overrideAt: ov.at,
    };
  }

  switch (def.id) {

    // ── Hard gates ──────────────────────────────────────────
    case 'control_buyout': {
      if (!criteria.controlBuyout) {
        return _result(def, 'pass', 10, 'no_constraint', 'Control buyout not required by criteria.', null, 'high');
      }
      const sig = evidence.controlSignal;
      if (sig.value === 'minority_indicated') {
        return _result(def, 'fail', 0, 'fail', 'Document signals minority/non-control deal.', { severity: 'disqualifier', description: 'Minority stake indicated — does not meet control buyout requirement.' }, sig.confidence);
      }
      if (sig.value === 'control_available') {
        return _result(def, 'pass', 10, 'exact', 'Control/majority signal found in documents.', null, sig.confidence);
      }
      return _result(def, 'watch', 5, 'no_data', 'Control position not confirmed. Verify with seller.', { severity: 'partial', description: 'No explicit confirmation that a majority stake is being offered.' }, 'none');
    }

    case 'excluded_sector': {
      const excluded = (criteria.excludedSectors || []).map(s => s.toLowerCase());
      if (!excluded.length) {
        return _result(def, 'pass', 10, 'no_constraint', 'No excluded sectors defined.', null, 'high');
      }
      const sector = (evidence.dealSector.value || '').toLowerCase();
      const hit = excluded.find(ex => sector.includes(ex) || ex.includes(sector));
      if (hit) {
        return _result(def, 'fail', 0, 'fail', `Sector "${sector}" matches excluded sector "${hit}".`, { severity: 'disqualifier', description: `Company is in an excluded sector (${hit}).` }, evidence.dealSector.confidence);
      }
      return _result(def, 'pass', 10, 'exact', 'Sector is not in excluded list.', null, evidence.dealSector.confidence);
    }

    // ── Soft criteria ────────────────────────────────────────
    case 'industry_fit': {
      const targets = (criteria.targetIndustries || []).map(s => s.toLowerCase());
      if (!targets.length) return _result(def, 'pass', 10, 'no_constraint', 'No target industries set.', null, 'high');
      const sector = (evidence.dealSector.value || '').toLowerCase();
      if (!sector) return _result(def, 'watch', 5, 'no_data', 'Sector not identified for this deal.', { severity: 'weak', description: 'Unknown sector — cannot confirm industry fit.' }, 'none');
      const exact = targets.find(t => sector.includes(t) || t.includes(sector));
      if (exact) return _result(def, 'pass', 10, 'exact', `Sector "${evidence.dealSector.value}" matches target "${exact}".`, null, evidence.dealSector.confidence);
      // Partial: keyword overlap
      const partial = targets.find(t => t.split(/\s+/).some(w => w.length > 3 && sector.includes(w)));
      if (partial) return _result(def, 'watch', 6, 'partial', `Partial sector match with "${partial}".`, { severity: 'weak', description: 'Sector partially overlaps but is not an exact match.' }, evidence.dealSector.confidence);
      return _result(def, 'fail', 0, 'fail', `Sector "${evidence.dealSector.value}" not in target industries.`, { severity: 'partial', description: 'Industry is outside defined target verticals.' }, evidence.dealSector.confidence);
    }

    case 'geography': {
      const targets = (criteria.targetGeographies || []).map(s => s.toLowerCase());
      if (!targets.length) return _result(def, 'pass', 10, 'no_constraint', 'No geography filter set.', null, 'high');
      const loc = (evidence.location.value || '').toLowerCase();
      if (!loc) return _result(def, 'watch', 5, 'no_data', 'Company location not found.', { severity: 'weak', description: 'Location unknown — geography match cannot be confirmed.' }, 'none');
      const match = targets.find(t => loc.includes(t) || t.includes(loc));
      if (match) return _result(def, 'pass', 10, 'exact', `Location matches target geography "${match}".`, null, evidence.location.confidence);
      return _result(def, 'fail', 3, 'fail', `Location "${evidence.location.value}" not in target geographies.`, { severity: 'weak', description: 'Company is outside target geography.' }, evidence.location.confidence);
    }

    case 'revenue_size': {
      const rev = evidence.revenue.value;
      if (rev == null) return _result(def, 'watch', 5, 'no_data', 'Revenue not found.', { severity: 'weak', description: 'Revenue data missing — cannot assess size fit.' }, 'none');
      const min = criteria.revenueMin || 0;
      const max = criteria.revenueMax || Infinity;
      if (rev >= min && rev <= max) return _result(def, 'pass', 10, 'exact', `Revenue ${_fmt$(rev)} is within range ${_fmt$(min)}–${_fmt$(max)}.`, null, evidence.revenue.confidence);
      if (rev < min) {
        const pct = rev / min;
        const score = pct >= 0.7 ? 6 : pct >= 0.5 ? 3 : 0;
        return _result(def, score >= 6 ? 'watch' : 'fail', score, 'partial', `Revenue ${_fmt$(rev)} is below minimum ${_fmt$(min)}.`, { severity: pct < 0.5 ? 'partial' : 'weak', description: `Revenue is ${Math.round((1 - pct) * 100)}% below the minimum threshold.` }, evidence.revenue.confidence);
      }
      const over = rev / max;
      const score = over <= 1.3 ? 7 : over <= 1.6 ? 4 : 0;
      return _result(def, score >= 7 ? 'watch' : 'fail', score, 'partial', `Revenue ${_fmt$(rev)} exceeds maximum ${_fmt$(max)}.`, { severity: over > 1.6 ? 'partial' : 'weak', description: `Revenue is ${Math.round((over - 1) * 100)}% above the maximum threshold.` }, evidence.revenue.confidence);
    }

    case 'ebitda_size': {
      const ebt = evidence.ebitda.value;
      if (ebt == null) return _result(def, 'watch', 5, 'no_data', 'EBITDA not found.', { severity: 'weak', description: 'EBITDA data missing.' }, 'none');
      const min = criteria.ebitdaMin || 0;
      const max = criteria.ebitdaMax || Infinity;
      if (ebt >= min && ebt <= max) return _result(def, 'pass', 10, 'exact', `EBITDA ${_fmt$(ebt)} is within range ${_fmt$(min)}–${_fmt$(max)}.`, null, evidence.ebitda.confidence);
      if (ebt < min) {
        const pct = ebt / min;
        const score = pct >= 0.7 ? 6 : pct >= 0.5 ? 3 : 0;
        return _result(def, score >= 6 ? 'watch' : 'fail', score, 'partial', `EBITDA ${_fmt$(ebt)} below minimum ${_fmt$(min)}.`, { severity: pct < 0.5 ? 'partial' : 'weak', description: `EBITDA is ${Math.round((1 - pct) * 100)}% below the minimum threshold.` }, evidence.ebitda.confidence);
      }
      return _result(def, 'watch', 7, 'partial', `EBITDA ${_fmt$(ebt)} exceeds maximum ${_fmt$(max)}.`, { severity: 'weak', description: 'EBITDA is above target range — company may be too large.' }, evidence.ebitda.confidence);
    }

    case 'margin_quality': {
      const margin = evidence.margin.value;
      if (margin == null) return _result(def, 'watch', 5, 'no_data', 'EBITDA margin not computable.', { severity: 'weak', description: 'Margin data missing — cannot assess profitability.' }, 'none');
      const min = criteria.marginMin || 0;
      if (margin >= min) return _result(def, 'pass', 10, 'exact', `Margin ${margin.toFixed(1)}% meets minimum ${min}%.`, null, evidence.margin.confidence);
      const pct = margin / min;
      const score = pct >= 0.8 ? 6 : pct >= 0.6 ? 3 : 0;
      return _result(def, score >= 6 ? 'watch' : 'fail', score, 'partial', `Margin ${margin.toFixed(1)}% is below minimum ${min}%.`, { severity: pct < 0.6 ? 'partial' : 'weak', description: `EBITDA margin is ${(min - margin).toFixed(1)}pp below the minimum threshold.` }, evidence.margin.confidence);
    }

    case 'entry_multiple': {
      const mult = evidence.multiple.value;
      if (mult == null) return _result(def, 'watch', 5, 'no_data', 'Entry multiple not found.', { severity: 'weak', description: 'Asking multiple not available — cannot assess valuation.' }, 'none');
      const max = criteria.multipleMax || 10;
      if (mult <= max) return _result(def, 'pass', 10, 'exact', `Multiple ${mult.toFixed(1)}x is at or below maximum ${max}x.`, null, evidence.multiple.confidence);
      const over = mult / max;
      const score = over <= 1.15 ? 7 : over <= 1.3 ? 4 : 0;
      return _result(def, score >= 7 ? 'watch' : 'fail', score, 'partial', `Multiple ${mult.toFixed(1)}x exceeds maximum ${max}x.`, { severity: over > 1.3 ? 'partial' : 'weak', description: `Entry multiple is ${((over - 1) * 100).toFixed(0)}% above maximum — will impact returns.` }, evidence.multiple.confidence);
    }

    case 'revenue_growth': {
      const gr = evidence.growthRate.value;
      if (gr == null) return _result(def, 'watch', 5, 'no_data', 'Revenue growth rate not found.', { severity: 'weak', description: 'Growth rate data missing.' }, 'none');
      const min = criteria.growthRateMin || 0;
      if (gr >= min) {
        const score = gr >= min + 10 ? 10 : gr >= min + 5 ? 8 : 7;
        return _result(def, 'pass', score, 'exact', `Growth ${gr.toFixed(1)}% meets minimum ${min}%.`, null, evidence.growthRate.confidence);
      }
      const score = gr >= -5 ? 4 : gr >= -15 ? 2 : 0;
      return _result(def, score >= 4 ? 'watch' : 'fail', score, 'partial', `Growth ${gr.toFixed(1)}% is below minimum ${min}%.`, { severity: gr < -5 ? 'partial' : 'weak', description: `Revenue is declining or growing below the ${min}% minimum threshold.` }, evidence.growthRate.confidence);
    }

    case 'recurring_revenue': {
      const rec = evidence.recurringRev.value;
      const pref = criteria.recurringRevenue || 'any';
      if (pref === 'any') return _result(def, 'pass', 10, 'no_constraint', 'Recurring revenue not required.', null, 'high');
      if (rec == null) {
        const score = pref === 'required' ? 3 : 6;
        return _result(def, 'watch', score, 'no_data', 'Recurring revenue % not found.', pref === 'required' ? { severity: 'partial', description: 'Recurring revenue is required but data is missing.' } : null, evidence.recurringRev.confidence);
      }
      if (pref === 'required' && rec < 50) {
        return _result(def, 'fail', Math.round(rec / 5), 'partial', `Recurring revenue ${rec}% is below required threshold.`, { severity: rec < 25 ? 'partial' : 'weak', description: `Only ${rec}% recurring revenue — below the 50% threshold for "required."` }, evidence.recurringRev.confidence);
      }
      const score = rec >= 80 ? 10 : rec >= 60 ? 8 : rec >= 40 ? 6 : rec >= 20 ? 4 : 2;
      return _result(def, score >= 8 ? 'pass' : 'watch', score, 'partial', `Recurring revenue is ${rec}%.`, rec < 40 ? { severity: 'weak', description: 'Limited recurring revenue — revenue predictability is lower.' } : null, evidence.recurringRev.confidence);
    }

    case 'customer_concentration': {
      const conc = evidence.custConc.value;
      if (conc == null) return _result(def, 'watch', 5, 'no_data', 'Customer concentration not found.', { severity: 'weak', description: 'Concentration data missing — potential hidden risk.' }, 'none');
      const max = criteria.maxCustomerConc || 40;
      if (conc <= max) {
        const score = conc <= 10 ? 10 : conc <= 20 ? 8 : 7;
        return _result(def, 'pass', score, 'exact', `Top customer concentration ${conc}% is at or below max ${max}%.`, null, evidence.custConc.confidence);
      }
      const over = conc / max;
      const score = over <= 1.25 ? 5 : over <= 1.5 ? 2 : 0;
      return _result(def, score >= 5 ? 'watch' : 'fail', score, 'partial', `Concentration ${conc}% exceeds max ${max}%.`, { severity: conc >= 50 ? 'partial' : 'weak', description: `Top customer is ${conc}% of revenue — creates dependency risk.` }, evidence.custConc.confidence);
    }

    case 'business_stability': {
      const age = evidence.businessAge.value;
      if (age == null) return _result(def, 'watch', 5, 'no_data', 'Business age not found.', null, 'none');
      const minAge = criteria.minBusinessAgeYears || 5;
      if (age >= minAge) {
        const bonus = Math.max(0, age - minAge);
        const score = bonus >= 15 ? 10 : bonus >= 8 ? 8 : 7;
        return _result(def, score >= 8 ? 'pass' : 'watch', score, 'exact',
          `Business is ${age} years old — meets the ${minAge}-year minimum.`, null, evidence.businessAge.confidence);
      }
      const pct = age / minAge;
      const score = pct >= 0.7 ? 4 : pct >= 0.5 ? 2 : 0;
      return _result(def, score >= 4 ? 'watch' : 'fail', score, 'partial',
        `Business is ${age} year${age !== 1 ? 's' : ''} old — below the ${minAge}-year minimum.`,
        { severity: 'weak', description: `Business has been operating for only ${age} years — less proven track record.` },
        evidence.businessAge.confidence);
    }

    case 'owner_situation': {
      const sigs = evidence.ownerSignal.value || [];
      if (!criteria.ownerSituation?.length) return _result(def, 'pass', 10, 'no_constraint', 'No owner situation preference set.', null, 'high');
      if (!sigs.length) return _result(def, 'watch', 6, 'no_data', 'Owner situation not identified.', null, 'none');
      const match = sigs.some(s => (criteria.ownerSituation || []).includes(s));
      if (match) return _result(def, 'pass', 10, 'exact', `Owner situation matches preferred: ${sigs.join(', ')}.`, null, evidence.ownerSignal.confidence);
      return _result(def, 'watch', 6, 'partial', `Owner situation (${sigs.join(', ')}) doesn't exactly match preferences.`, null, evidence.ownerSignal.confidence);
    }

    default:
      return _result(def, 'watch', 5, 'no_data', 'Unknown criterion.', null, 'none');
  }
}

function _result(def, rating, score, matchType, reason, gap, confidence) {
  return {
    id: def.id, label: def.label, category: def.category,
    type: def.type, weight: def.weight, isDisqualifier: !!def.isDisqualifier,
    rating, score, matchType, reason, gap,
    confidence, overridden: false,
  };
}

// ─── Confidence score ────────────────────────────────────────
const CONFIDENCE_WEIGHTS = { high: 1.0, medium: 0.6, low: 0.3, none: 0.0 };

function computeConfidenceScore(criterionResults) {
  const soft = criterionResults.filter(r => r.type === 'soft');
  if (!soft.length) return 0;
  const totalWeight = soft.reduce((s, r) => s + r.weight, 0);
  const weightedConf = soft.reduce((s, r) => s + r.weight * (CONFIDENCE_WEIGHTS[r.confidence] || 0), 0);
  return Math.round((weightedConf / totalWeight) * 100);
}

// ─── Full pipeline ───────────────────────────────────────────

/**
 * Run the complete scoring engine.
 * @returns {EvaluationResult}
 */
function runScoringEngine(deal, criteria, docs = []) {
  const c = criteria || {};
  const evidence = extractEvidence(deal, docs);
  const results = CRITERIA_DEFINITIONS.map(def => scoreCriterion(def, evidence, c));

  // Hard fail check
  const hardFails = results.filter(r => r.type === 'hard' && r.rating === 'fail' && r.isDisqualifier && !r.overridden);
  const isDisqualified = hardFails.length > 0;

  // Soft score
  const softResults = results.filter(r => r.type === 'soft');
  const totalWeight = softResults.reduce((s, r) => s + r.weight, 0) || 1;
  const rawScore = softResults.reduce((s, r) => s + (r.score / 10) * r.weight, 0);
  const softScore = isDisqualified ? 0 : Math.round((rawScore / totalWeight) * 100);

  const tier = _getTier(softScore);
  const confidence = computeConfidenceScore(results);

  const gaps = results
    .filter(r => r.gap)
    .sort((a, b) => {
      const sev = { disqualifier: 0, partial: 1, weak: 2 };
      return (sev[a.gap.severity] ?? 3) - (sev[b.gap.severity] ?? 3);
    });

  return {
    schemaVersion: EVAL_SCHEMA_VERSION,
    dealId: deal.id,
    dealName: deal.companyName || deal.name || 'Unknown',
    evaluatedAt: new Date().toISOString(),
    score: softScore,
    tier: tier.tier,
    tierLabel: tier.label,
    tierColor: tier.color,
    isDisqualified,
    hardFails: hardFails.map(r => r.id),
    confidence,
    criterionResults: results,
    gaps,
    evidence,
    aiSuggestions: [], // filled in async by generateAISuggestions()
  };
}

/** Backward-compatible shim for any existing callers. */
function calculateFitScore(deal, criteria) {
  const result = runScoringEngine(deal, criteria, []);
  return {
    score: result.score,
    tier: result.tier,
    label: result.tierLabel,
    isDisqualified: result.isDisqualified,
    hardFails: result.hardFails,
    _full: result,
  };
}

// ─────────────────────────────────────────────────────────────
// §5  AI SUGGESTION LAYER  (async, runs after deterministic score)
// ─────────────────────────────────────────────────────────────

async function generateAISuggestions(evalResult, deal, criteria) {
  if (typeof callAI !== 'function') return { suggestions: [], error: 'unavailable' };
  const gaps = evalResult.gaps || [];
  if (!gaps.length) return { suggestions: [], error: null };

  const gapSummary = gaps.map(g =>
    `- [${g.gap.severity.toUpperCase()}] ${g.label}: ${g.gap.description}`
  ).join('\n');

  const systemPrompt = `You are an expert search fund acquisition advisor. When given a list of deal gaps, respond ONLY with a valid JSON array — no markdown, no explanation. Each element: {"id":"criterion_id","suggestion":"actionable text","negotiable":true|false}.`;

  const userPrompt = `Deal: ${evalResult.dealName || 'Unknown'}
Score: ${evalResult.score}/100 (${evalResult.tierLabel || ''})

Gaps found:
${gapSummary}

Return a JSON array with one entry per gap. IDs must match exactly: ${gaps.map(g => g.id).join(', ')}`;

  try {
    const raw = await callAI(systemPrompt, userPrompt, 1200, 0.2);
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { suggestions: [], error: null };
    return { suggestions: JSON.parse(jsonMatch[0]), error: null };
  } catch (e) {
    const isKeyError = e.message?.toLowerCase().includes('api key') || e.message?.toLowerCase().includes('no ai');
    console.warn('[FitScore] AI suggestions failed:', e.message);
    return { suggestions: [], error: isKeyError ? 'no_key' : 'failed', message: e.message };
  }
}

// ─────────────────────────────────────────────────────────────
// §6  STORAGE
// ─────────────────────────────────────────────────────────────

async function _loadStoredEval(dealId) {
  try {
    let all = [];
    if (typeof DB !== 'undefined') all = await DB.getAll(STORES.dealDiligence).catch(() => []);
    else if (typeof getDB === 'function') { const db = await getDB(); all = await db.getAll(STORES.dealDiligence); }
    else return null;
    const found = all
      .filter(r => r.dealId === dealId && r.type === 'fit_evaluation')
      .sort((a, b) => new Date(b.evaluatedAt) - new Date(a.evaluatedAt))[0];
    if (!found) return null;
    if (found.schemaVersion !== EVAL_SCHEMA_VERSION) return null; // stale — re-run
    return found;
  } catch (e) {
    console.warn('[FitScore] Could not load stored eval:', e);
    return null;
  }
}

async function _storeEval(evalResult) {
  try {
    const id = `fit_eval_${evalResult.dealId}_${Date.now()}`;
    const record = { ...evalResult, id, type: 'fit_evaluation' };
    if (typeof DB !== 'undefined') await DB.put(STORES.dealDiligence, record).catch(() => {});
    else if (typeof getDB === 'function') { const db = await getDB(); await db.put(STORES.dealDiligence, record); }
    return id;
  } catch (e) {
    console.warn('[FitScore] Could not store eval:', e);
  }
}

async function _updateStoredEval(id, patch) {
  try {
    if (typeof DB !== 'undefined') {
      const existing = await DB.get(STORES.dealDiligence, id).catch(() => null);
      if (existing) await DB.put(STORES.dealDiligence, { ...existing, ...patch }).catch(() => {});
    } else if (typeof getDB === 'function') {
      const db = await getDB();
      const existing = await db.get(STORES.dealDiligence, id);
      if (existing) await db.put(STORES.dealDiligence, { ...existing, ...patch });
    }
  } catch (e) {
    console.warn('[FitScore] Could not update stored eval:', e);
  }
}

// ─────────────────────────────────────────────────────────────
// §7  UI RENDERING
// ─────────────────────────────────────────────────────────────

async function renderDealFitScoreTab() {
  // Load deal + criteria + docs
  // currentDealId is the module-level var from deal-detail.js
  const dealId = (typeof currentDealId !== 'undefined' && currentDealId) || null;
  let deal = {};
  try {
    if (dealId && typeof DB !== 'undefined') deal = await DB.get(STORES.deals, dealId) || {};
    else if (dealId && typeof getDB === 'function') { const db = await getDB(); deal = await db.get(STORES.deals, dealId) || {}; }
  } catch (e) { /* silent */ }
  window._currentDeal = deal; // cache for AI suggestion calls

  const settings = await _loadSettings();
  const criteria = (settings && settings.searchCriteria) || {};
  let docs = [];
  try {
    if (deal.id) {
      let all = [];
      if (typeof DB !== 'undefined') all = await DB.getAllByIndex(STORES.dealDocuments, 'dealId', deal.id).catch(() => []);
      else if (typeof getDB === 'function') { const db = await getDB(); all = await db.getAll(STORES.dealDocuments); all = all.filter(d => d.dealId === deal.id); }
      docs = all.filter(d => d.extractedText);
    }
  } catch (e) { /* silent */ }

  // Check for fresh stored eval (skip if found and same schema)
  let ev = await _loadStoredEval(deal.id);
  if (!ev) {
    ev = runScoringEngine(deal, criteria, docs);
    await _storeEval(ev);
  }

  window._currentFitEval = ev;
  return _renderFitScoreHTML(ev, deal, criteria);
}

async function _loadSettings() {
  try {
    return await DB.get(STORES.settings, `settings_${currentUser.id}`) || null;
  } catch (e) { /* silent */ }
  return null;
}

function _renderFitScoreHTML(ev, deal, criteria) {
  const tier = _getTier(ev.score);
  const hasCriteriaSet = Object.keys(criteria).filter(k => k !== '_overrides').length > 0;

  // Group criterion results by category
  const byCategory = {};
  (ev.criterionResults || []).forEach(r => {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  });

  const overrideCount = Object.keys((criteria._overrides) || {}).length;
  const passCount  = ev.criterionResults.filter(r => r.rating === 'pass' || r.rating === 'override').length;
  const watchCount = ev.criterionResults.filter(r => r.rating === 'watch').length;
  const failCount  = ev.criterionResults.filter(r => r.rating === 'fail').length;

  // Build criteria config summary chips
  const chips = [];
  if (criteria.targetIndustries?.length) chips.push(`🏭 ${criteria.targetIndustries.slice(0,2).join(', ')}${criteria.targetIndustries.length > 2 ? ' +' + (criteria.targetIndustries.length - 2) : ''}`);
  if (criteria.targetGeographies?.length) chips.push(`📍 ${criteria.targetGeographies.slice(0,2).join(', ')}`);
  if (criteria.revenueMin || criteria.revenueMax) chips.push(`💵 Rev $${_fmtM(criteria.revenueMin||0)}–$${_fmtM(criteria.revenueMax||0)}`);
  if (criteria.ebitdaMin || criteria.ebitdaMax) chips.push(`📊 EBITDA $${_fmtM(criteria.ebitdaMin||0)}–$${_fmtM(criteria.ebitdaMax||0)}`);
  if (criteria.multipleMax) chips.push(`×${criteria.multipleMax} max multiple`);
  if (criteria.marginMin) chips.push(`${criteria.marginMin}%+ margin`);

  return `
<div class="fit-score-tab">

  ${!hasCriteriaSet ? `
  <div class="fit-warning-banner">
    <span>⚠️</span>
    <div>
      <strong>Search criteria not configured.</strong>
      Scores use default thresholds — <a href="#" onclick="openSearchCriteriaModal(); return false;">configure your criteria →</a>
    </div>
  </div>` : ''}

  <!-- ── Score Hero ── -->
  <div class="fit-hero">
    <div class="fit-hero-score">
      <svg viewBox="0 0 72 72" width="96" height="96">
        <circle cx="36" cy="36" r="30" fill="none" stroke="${tier.border}" stroke-width="7" class="track"/>
        <circle cx="36" cy="36" r="30" fill="none" stroke="${tier.color}" stroke-width="7"
          stroke-dasharray="${Math.round(ev.score * 1.885)} 188.5"
          stroke-dashoffset="47.1" stroke-linecap="round"
          style="transform:rotate(-90deg);transform-origin:center;transition:stroke-dasharray 0.6s ease"/>
        <text x="36" y="41" text-anchor="middle" font-size="17" font-weight="800" fill="${tier.color}" font-family="DM Sans,Inter,sans-serif">${ev.score}</text>
      </svg>
      <div class="fit-score-ring-text" style="color:${tier.color};">${ev.tierLabel}</div>
    </div>

    <div class="fit-hero-meta">
      <div class="fit-tier-label" style="color:${tier.color};">${ev.tierLabel}</div>
      <div class="fit-deal-name">${escapeHtml(ev.dealName)}</div>
      <div class="fit-badges">
        ${ev.isDisqualified ? `<span class="fit-badge fail">🚫 Disqualified</span>` : ''}
        <span class="fit-badge pass">✓ ${passCount} pass</span>
        ${watchCount ? `<span class="fit-badge watch">◑ ${watchCount} watch</span>` : ''}
        ${failCount  ? `<span class="fit-badge fail">✗ ${failCount} fail</span>` : ''}
        ${overrideCount ? `<span class="fit-badge override">✎ ${overrideCount} override${overrideCount > 1 ? 's' : ''}</span>` : ''}
      </div>
      <div class="fit-confidence">Data confidence: <strong>${ev.confidence}%</strong></div>
    </div>

    <div class="fit-hero-actions">
      <button class="fit-action-btn primary" onclick="_runAISuggestions('${ev.dealId}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L9.5 8.5H2.5L8 12.8 5.8 19.5 12 15.5l6.2 4L16 12.8l5.5-4.3H13.5L12 2z"/></svg>
        AI Suggestions
      </button>
      <button class="fit-action-btn" onclick="openSearchCriteriaModal()">
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"/></svg>
        Edit Criteria
      </button>
      <button class="fit-action-btn" onclick="_rerunFitScore()">
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>
        Re-score
      </button>
    </div>
  </div>

  ${ev.isDisqualified ? `
  <div class="fit-disqualifier-alert">
    <strong>🚫 Hard Disqualifier Hit</strong> — This deal fails a mandatory criterion and is disqualified from scoring. Override individual criteria below if appropriate.
    <ul>${ev.hardFails.map(id => {
      const r = ev.criterionResults.find(x => x.id === id);
      return `<li><strong>${r ? r.label : id}:</strong> ${r ? r.reason : ''}</li>`;
    }).join('')}</ul>
  </div>` : ''}

  <!-- AI Suggestions (populated by _runAISuggestions) -->
  <div id="fit-ai-suggestions"></div>

  <!-- Gaps -->
  ${ev.gaps.length ? `
  <div class="fit-gaps-section">
    <div class="fit-section-title">
      <span>Gaps to Address (${ev.gaps.length})</span>
    </div>
    ${ev.gaps.map(g => `
    <div class="fit-gap-card severity-${g.gap.severity}">
      <div class="fit-gap-header">
        <span class="fit-gap-severity-badge">${_severityLabel(g.gap.severity)}</span>
        <span class="fit-gap-label">${escapeHtml(g.label)}</span>
        ${g.overridden ? '<span class="fit-override-badge">Overridden</span>' : ''}
      </div>
      <p class="fit-gap-desc">${g.gap.description}</p>
      <div class="fit-gap-suggestion" id="gap-suggestion-${g.id}">
        <span class="fit-gap-suggestion-placeholder">Click "AI Suggestions" above for actionable recommendations.</span>
      </div>
    </div>`).join('')}
  </div>` : `
  <div class="fit-no-gaps">✅ No significant gaps — all criteria are within acceptable ranges.</div>`}

  <!-- Criterion Breakdown -->
  <div class="fit-criteria-section">
    <div class="fit-section-title">
      <span>Criterion Breakdown</span>
      <button class="fit-override-btn" onclick="openSearchCriteriaModal()">Edit thresholds →</button>
    </div>
    ${Object.entries(byCategory).map(([cat, items]) => `
    <div class="fit-category-group">
      <div class="fit-category-header">${cat}</div>
      ${items.map(r => _renderCriterionRow(r)).join('')}
    </div>`).join('')}
  </div>

  <!-- Your Criteria Configuration -->
  <div class="fit-criteria-config">
    <div class="fit-criteria-config-header">
      <div class="fit-section-title" style="margin:0;">Your Search Criteria</div>
      <button class="fit-action-btn" style="padding:0.25rem 0.625rem;font-size:0.75rem;" onclick="openSearchCriteriaModal()">Edit →</button>
    </div>
    ${chips.length ? `
    <div class="fit-criteria-chips">
      ${chips.map(c => `<span class="fit-criteria-chip">${c}</span>`).join('')}
    </div>` : `<p style="font-size:0.8125rem;color:var(--text-muted);margin:0;">No criteria configured yet. Click Edit to set your investment parameters.</p>`}
  </div>

  <p class="fit-disclaimer">
    Fit scores are decision-support tools, not investment recommendations.
    Last evaluated: ${new Date(ev.evaluatedAt).toLocaleString()}
  </p>
</div>`;
}

function _renderCriterionRow(r) {
  const ratingColor = { pass: 'var(--green)', watch: '#d97706', fail: 'var(--red)', no_data: 'var(--text-muted)', override: '#7c3aed' };
  const barColor    = { pass: '#16a34a',      watch: '#f59e0b', fail: '#dc2626',   no_data: '#cbd5e1',              override: '#7c3aed' };

  const color  = ratingColor[r.rating] || 'var(--text-muted)';
  const bcolor = barColor[r.rating]    || '#cbd5e1';

  const ratingLabel = { pass: '✓ Pass', watch: '◑ Watch', fail: '✗ Fail', no_data: '— No data', override: '✎ Override' };
  const sourceHint  = r.matchType === 'no_data' ? 'No data found for this criterion' :
                      r.matchType === 'no_constraint' ? 'No threshold configured' :
                      r.reason || '';

  if (r.type === 'hard') {
    return `
    <div class="fit-criterion-row" title="${escapeHtml(r.reason || '')}">
      <span class="fit-criterion-label">
        ${escapeHtml(r.label)}
        <span class="fit-criterion-sublabel">Hard gate · ${escapeHtml(r.reason || '')}</span>
      </span>
      <span class="fit-criterion-rating" style="color:${color};">${ratingLabel[r.rating] || r.rating}</span>
      <button class="fit-override-btn" onclick="_openCriterionOverride('${r.id}','${r.label.replace(/'/g, "\\'")}',${r.score})">Override</button>
    </div>`;
  }

  const scorePct = (r.score / 10) * 100;
  return `
  <div class="fit-criterion-row" title="${escapeHtml(sourceHint)}">
    <span class="fit-criterion-label">
      ${escapeHtml(r.label)}
      ${r.overridden ? '<span class="fit-override-badge" style="margin-left:4px;">manual</span>' : ''}
      <span class="fit-criterion-sublabel">${escapeHtml(sourceHint)}</span>
    </span>
    <div class="fit-criterion-score-bar">
      <div class="fit-criterion-score-fill" style="width:${scorePct}%;background:${bcolor};transition:width 0.5s ease;"></div>
    </div>
    <span class="fit-criterion-score-text" style="color:${color};">${r.score}/10</span>
    <span class="fit-criterion-rating" style="color:${color};font-size:0.6875rem;">${ratingLabel[r.rating] || ''}</span>
    <button class="fit-override-btn" onclick="_openCriterionOverride('${r.id}','${r.label.replace(/'/g, "\\'")}',${r.score})">Override</button>
  </div>`;
}

/** Format number as $XM / $XK shorthand */
function _fmtM(n) {
  if (!n && n !== 0) return '?';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n;
}

function _severityLabel(sev) {
  return { disqualifier: '🚫 Disqualifier', partial: '⚠ Partial', weak: '◦ Weak' }[sev] || sev;
}

// ─── Override modal ──────────────────────────────────────────

function _openCriterionOverride(criterionId, label, currentScore) {
  document.getElementById('criterion-override-modal')?.remove();
  const existing   = (window._currentFitEval?.criterionResults || []).find(r => r.id === criterionId);
  const existingOv = existing?.overridden;
  const existingNote = existingOv
    ? ((window._currentFitEval?.criterionResults || []).find(r => r.id === criterionId)?.overrideNote || '')
    : '';

  const html = `
  <div id="criterion-override-modal" class="fit-override-modal-overlay" onclick="if(event.target===this)this.remove()">
    <div class="fit-override-modal" onclick="event.stopPropagation()">
      <p class="fit-override-modal-title">Override: ${escapeHtml(label)}</p>
      <p class="fit-override-modal-sub">
        Manually set the score for this criterion. Overrides are flagged in the score breakdown and can be removed at any time.
      </p>

      ${existing ? `
      <div class="fit-override-computed">
        Computed: <strong>${existing.rating}</strong> (${existing.score}/10) — ${escapeHtml(existing.reason || '')}
      </div>` : ''}

      <label class="fit-override-label">Override score (0 – 10)</label>
      <div class="fit-override-score-row">
        <input type="number" id="override-score" min="0" max="10" step="1" value="${currentScore}"
          class="fit-override-score-input" />
        <span class="fit-override-score-hint">0 = worst fit &nbsp;·&nbsp; 10 = perfect fit</span>
      </div>

      <label class="fit-override-label">Reason <span style="font-weight:400;color:var(--text-muted);">(required)</span></label>
      <textarea id="override-note" rows="3" placeholder="Why are you overriding this? e.g. 'Broker confirmed seller is open to minority stake…'"
        class="fit-override-note">${existingNote ? escapeHtml(existingNote) : ''}</textarea>

      <div class="fit-override-actions">
        ${existingOv ? `<button class="btn-secondary btn-sm" onclick="_clearOverride('${criterionId}')">Remove override</button>` : ''}
        <button class="btn-secondary btn-sm" onclick="document.getElementById('criterion-override-modal').remove()">Cancel</button>
        <button class="btn-primary btn-sm" onclick="_saveOverride('${criterionId}')">Save override</button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => document.getElementById('override-score')?.select(), 50);
}

async function _saveOverride(criterionId) {
  const scoreEl = document.getElementById('override-score');
  const noteEl = document.getElementById('override-note');
  if (!scoreEl || !noteEl) return;

  const rating = parseInt(scoreEl.value, 10);
  const note = noteEl.value.trim();
  if (!note) { noteEl.style.borderColor = '#dc2626'; noteEl.focus(); return; }
  if (isNaN(rating) || rating < 0 || rating > 10) { scoreEl.style.borderColor = '#dc2626'; scoreEl.focus(); return; }

  try {
    const settings = await _loadSettings() || {};
    const sc = settings.searchCriteria || {};
    const overrides = sc._overrides || {};
    overrides[criterionId] = { rating, note, at: new Date().toISOString() };
    const updated = { ...settings, id: `settings_${currentUser.id}`, searchCriteria: { ...sc, _overrides: overrides } };
    await DB.put(STORES.settings, updated);
    document.getElementById('criterion-override-modal')?.remove();
    showToast('Override saved. Re-running score…', 'success');
    window._currentFitEval = null;
    if (typeof switchDealTab === 'function') switchDealTab('fit-score');
  } catch (e) {
    showToast('Failed to save override: ' + e.message, 'error');
  }
}

async function _clearOverride(criterionId) {
  try {
    const settings = await _loadSettings() || {};
    const sc = settings.searchCriteria || {};
    const overrides = sc._overrides || {};
    delete overrides[criterionId];
    const updated = { ...settings, id: `settings_${currentUser.id}`, searchCriteria: { ...sc, _overrides: overrides } };
    await DB.put(STORES.settings, updated);
    document.getElementById('criterion-override-modal')?.remove();
    showToast('Override removed. Re-running score…', 'info');
    window._currentFitEval = null;
    if (typeof switchDealTab === 'function') switchDealTab('fit-score');
  } catch (e) {
    showToast('Failed to remove override: ' + e.message, 'error');
  }
}

async function _rerunFitScore() {
  window._currentFitEval = null;
  if (typeof switchDealTab === 'function') switchDealTab('fit-score');
}

async function _runAISuggestions(dealId) {
  const el = document.getElementById('fit-ai-suggestions');
  if (!el) return;

  const ev = window._currentFitEval;
  if (!ev || !ev.gaps.length) {
    el.innerHTML = `<div class="fit-ai-block"><p class="fit-ai-block-title">✅ No gaps to address — all criteria look good.</p></div>`;
    return;
  }

  // Show spinner while loading
  el.innerHTML = `
    <div class="fit-ai-loading">
      <div class="fit-ai-spinner"></div>
      <span>Analysing gaps and generating recommendations…</span>
    </div>`;

  const deal     = window._currentDeal || {};
  const settings = await _loadSettings();
  const criteria = (settings && settings.searchCriteria) || {};

  const result = await generateAISuggestions(ev, deal, criteria);
  const suggestions = result.suggestions || [];
  ev.aiSuggestions = suggestions;

  if (result.error === 'no_key') {
    el.innerHTML = `
      <div class="fit-ai-block">
        <p class="fit-ai-block-title">⚠ No AI API key configured</p>
        <p style="font-size:0.8125rem;color:var(--text-secondary);margin:0;">
          Add an OpenAI or Claude API key in
          <button onclick="navigate('settings')" style="background:none;border:none;color:var(--accent);cursor:pointer;padding:0;font-size:inherit;font-weight:500;">Settings →</button>
        </p>
      </div>`;
    return;
  }

  if (result.error === 'failed' || !suggestions.length) {
    el.innerHTML = `
      <div class="fit-ai-block">
        <p class="fit-ai-block-title">AI Suggestions unavailable</p>
        <p style="font-size:0.8125rem;color:var(--text-secondary);margin:0;">
          ${result.message ? escapeHtml(result.message) : 'The AI could not generate suggestions for these gaps. Try again or add more deal information.'}
        </p>
      </div>`;
    return;
  }

  // Inject individual suggestions into each gap card
  suggestions.forEach(s => {
    const gapEl = document.getElementById(`gap-suggestion-${s.id}`);
    if (gapEl) {
      const negotiability = s.negotiable != null
        ? `<span style="font-size:0.71875rem;color:var(--text-muted);margin-left:0.375rem;">${s.negotiable ? '· likely negotiable' : '· structural constraint'}</span>`
        : '';
      gapEl.innerHTML = `<strong style="color:var(--accent);">💡</strong> ${s.suggestion}${negotiability}`;
    }
  });

  // Summary block above the gaps section
  el.innerHTML = `
  <div class="fit-ai-block">
    <p class="fit-ai-block-title">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L9.5 8.5H2.5L8 12.8 5.8 19.5 12 15.5l6.2 4L16 12.8l5.5-4.3H13.5L12 2z"/></svg>
      AI Recommendations (${suggestions.length})
    </p>
    ${suggestions.map(s => {
      const r = ev.criterionResults.find(x => x.id === s.id);
      const neg = s.negotiable != null
        ? `<span style="font-size:0.6875rem;color:var(--text-muted);margin-left:0.25rem;">${s.negotiable ? '· negotiable' : '· structural'}</span>`
        : '';
      return `<div class="fit-ai-suggestion-item">
        <strong>${escapeHtml(r ? r.label : s.id)}:</strong> ${s.suggestion}${neg}
      </div>`;
    }).join('')}
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// §8  SEARCH CRITERIA MODAL
// ─────────────────────────────────────────────────────────────

// ── Helpers ──────────────────────────────────────────────────

/** Parse shorthand like "$3M", "750K", "1.5B" → raw number. */
function _parseShorthandNum(str, fallback) {
  if (str == null) return fallback;
  str = String(str).trim().replace(/[$,\s]/g, '');
  const m = str.match(/^(\d+(?:\.\d+)?)\s*([kmb]?)$/i);
  if (!m) { const n = parseFloat(str); return isNaN(n) ? fallback : n; }
  const n = parseFloat(m[1]);
  const s = m[2].toLowerCase();
  if (s === 'b') return Math.round(n * 1e9);
  if (s === 'm') return Math.round(n * 1e6);
  if (s === 'k') return Math.round(n * 1e3);
  return n;
}

/** Format a raw number back to shorthand for display. */
function _fmtShorthand(n) {
  if (n == null || isNaN(n)) return '';
  if (n >= 1e6) { const v = n / 1e6; return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + 'M'; }
  if (n >= 1e3) { const v = n / 1e3; return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) + 'K'; }
  return String(n);
}

function _closeSearchCriteriaModal() {
  document.getElementById('sc-modal-overlay')?.remove();
}

/** Re-render all sc-tags inside a tag field, keeping the text input. */
function _scRenderTags(listId) {
  const tags = (window._scTags || {})[listId] || [];
  const field = document.getElementById('sc-tag-field-' + listId);
  if (!field) return;
  const input = field.querySelector('.sc-tag-input');
  // Detach input to preserve event listeners
  if (input) field.removeChild(input);
  field.innerHTML = '';
  tags.forEach((tag, i) => {
    const span = document.createElement('span');
    span.className = 'sc-tag';
    span.innerHTML = `${escapeHtml(tag)}<button class="sc-tag-remove" onclick="_scRemoveTag('${listId}',${i})" title="Remove">×</button>`;
    field.appendChild(span);
  });
  if (input) field.appendChild(input);
}

function _scRemoveTag(listId, index) {
  if (!window._scTags?.[listId]) return;
  window._scTags[listId].splice(index, 1);
  _scRenderTags(listId);
}

function _scTagKeydown(event, listId) {
  const input = event.target;
  const raw = input.value;
  const val = raw.trim().replace(/,$/, '');
  if (['Enter', ',', 'Tab'].includes(event.key)) {
    event.preventDefault();
    if (!val) return;
    if (!window._scTags) window._scTags = {};
    if (!window._scTags[listId]) window._scTags[listId] = [];
    if (!window._scTags[listId].includes(val)) {
      window._scTags[listId].push(val);
      _scRenderTags(listId);
    }
    input.value = '';
  } else if (event.key === 'Backspace' && !raw) {
    if (!window._scTags?.[listId]?.length) return;
    window._scTags[listId].pop();
    _scRenderTags(listId);
  }
}

function _scRadioChange(el, group) {
  document.querySelectorAll(`[data-sc-radio="${group}"]`).forEach(opt => opt.classList.remove('active'));
  el.classList.add('active');
  const inp = el.querySelector('input[type="radio"]');
  if (inp) inp.checked = true;
}

// ── Modal ─────────────────────────────────────────────────────

async function openSearchCriteriaModal() {
  // Remove any existing instance
  document.getElementById('sc-modal-overlay')?.remove();

  let settings = {};
  try { settings = await _loadSettings() || {}; } catch (e) { /* silent */ }

  const sc = settings.searchCriteria || {};
  const overrides = sc._overrides || {};
  const overrideCount = Object.keys(overrides).length;

  // Initialise tag state
  window._scTags = {
    industries:  [...(Array.isArray(sc.targetIndustries)  ? sc.targetIndustries  : [])],
    excluded:    [...(Array.isArray(sc.excludedSectors)   ? sc.excludedSectors   : [])],
    geos:        [...(Array.isArray(sc.targetGeographies) ? sc.targetGeographies : [])],
    situations:  [...(Array.isArray(sc.ownerSituation)    ? sc.ownerSituation    : [])],
  };

  const g     = (f, def) => sc[f] != null ? sc[f] : def;
  const recur = g('recurringRevenue', 'preferred');

  // ── Micro-templates ──────────────────────────────────────────

  const tf = (listId, ph) =>
    `<div class="sc-tag-field" id="sc-tag-field-${listId}" onclick="this.querySelector('.sc-tag-input')?.focus()">` +
    `<input type="text" class="sc-tag-input" placeholder="${ph}" onkeydown="_scTagKeydown(event,'${listId}')"></div>`;

  const mf = (key, def, ph) =>
    `<div class="sc-input-wrap"><span class="sc-pfx">$</span>` +
    `<input type="text" id="sc-${key}" class="sc-input has-pfx" value="${_fmtShorthand(g(key, def))}" placeholder="${ph}"></div>`;

  const nf = (key, def, ph, sfx) =>
    `<div class="sc-input-wrap">` +
    `<input type="text" id="sc-${key}" class="sc-input${sfx ? ' has-sfx' : ''}" value="${g(key, def)}" placeholder="${ph}">` +
    (sfx ? `<span class="sc-sfx">${sfx}</span>` : '') + `</div>`;

  const rc = (val, label, icon) =>
    `<div class="sc-radio-card${recur === val ? ' active' : ''}" data-sc-radio="recurringRevenue" onclick="_scRadioChange(this,'recurringRevenue')">` +
    `<input type="radio" name="sc-recurringRevenue" value="${val}" ${recur === val ? 'checked' : ''} style="position:absolute;opacity:0;width:0;height:0;">` +
    `<div class="sc-radio-dot"></div><span>${icon} ${label}</span></div>`;

  const html = `
<div id="sc-modal-overlay" class="sc-modal-overlay" onclick="if(event.target===this)_closeSearchCriteriaModal()">
  <div class="sc-modal" onclick="event.stopPropagation()">

    <div class="sc-modal-header">
      <div>
        <h3 class="sc-modal-title">Search Criteria</h3>
        <p class="sc-modal-sub">These criteria power the AI fit score for every deal you evaluate.</p>
      </div>
      <button class="sc-modal-close" onclick="_closeSearchCriteriaModal()" title="Close">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="sc-modal-body">

      ${overrideCount > 0 ? `
      <div class="sc-override-banner">
        <span>✎ <strong>${overrideCount} active override${overrideCount > 1 ? 's' : ''}</strong> on individual criteria — these persist when you save.</span>
        <button class="sc-override-clear" onclick="_clearAllOverrides()">Clear All</button>
      </div>` : ''}

      <!-- Section 1: Industry & Geography -->
      <div class="sc-section">
        <div class="sc-section-head">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
          Industry &amp; Geography
        </div>
        <div class="sc-section-body">
          <div class="sc-field">
            <label class="sc-field-label">Target Industries <span class="sc-weight-badge">15 pts</span></label>
            ${tf('industries', 'Type and press Enter · e.g. B2B SaaS, Healthcare IT')}
            <p class="sc-field-hint">Deals in matching industries score higher. Leave blank to consider any industry.</p>
          </div>
          <div class="sc-field">
            <label class="sc-field-label">Excluded Sectors <span class="sc-hard-gate-badge">Hard Gate</span></label>
            ${tf('excluded', 'Type and press Enter · e.g. Cannabis, Crypto')}
            <p class="sc-field-hint">Deals in these sectors are automatically disqualified, regardless of other scores.</p>
          </div>
          <div class="sc-field">
            <label class="sc-field-label">Target Geographies <span class="sc-weight-badge">5 pts</span></label>
            ${tf('geos', 'Type and press Enter · e.g. Northeast US, Texas')}
            <p class="sc-field-hint">Leave blank to consider businesses in any geography.</p>
          </div>
        </div>
      </div>

      <!-- Section 2: Financial Thresholds -->
      <div class="sc-section">
        <div class="sc-section-head">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          Financial Thresholds
        </div>
        <div class="sc-section-body">
          <div class="sc-grid-2">
            <div class="sc-field">
              <label class="sc-field-label">Revenue Min <span class="sc-weight-badge">12 pts</span></label>
              ${mf('revenueMin', 3000000, '3M')}
            </div>
            <div class="sc-field">
              <label class="sc-field-label">Revenue Max</label>
              ${mf('revenueMax', 30000000, '30M')}
            </div>
            <div class="sc-field">
              <label class="sc-field-label">EBITDA Min <span class="sc-weight-badge">13 pts</span></label>
              ${mf('ebitdaMin', 750000, '750K')}
            </div>
            <div class="sc-field">
              <label class="sc-field-label">EBITDA Max</label>
              ${mf('ebitdaMax', 8000000, '8M')}
            </div>
            <div class="sc-field">
              <label class="sc-field-label">Margin Min <span class="sc-weight-badge">12 pts</span></label>
              ${nf('marginMin', 15, '15', '%')}
            </div>
            <div class="sc-field">
              <label class="sc-field-label">Multiple Max <span class="sc-weight-badge">10 pts</span></label>
              ${nf('multipleMax', 8, '8', '×')}
            </div>
            <div class="sc-field">
              <label class="sc-field-label">Growth Rate Min <span class="sc-weight-badge">10 pts</span></label>
              ${nf('growthRateMin', 0, '0', '%')}
            </div>
            <div class="sc-field">
              <label class="sc-field-label">Max Cust. Conc. <span class="sc-weight-badge">8 pts</span></label>
              ${nf('maxCustomerConc', 40, '40', '%')}
            </div>
          </div>
          <p class="sc-field-hint">Tip: use shorthand — type <strong>3M</strong> for $3,000,000 or <strong>750K</strong> for $750,000.</p>
        </div>
      </div>

      <!-- Section 3: Deal Structure & Requirements -->
      <div class="sc-section">
        <div class="sc-section-head">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Deal Structure &amp; Requirements
        </div>
        <div class="sc-section-body">
          <div class="sc-field">
            <label class="sc-field-label">Recurring Revenue <span class="sc-weight-badge">8 pts</span></label>
            <div class="sc-radio-group">
              ${rc('required',  'Required',  '🔒')}
              ${rc('preferred', 'Preferred', '⭐')}
              ${rc('any',       'Any',       '✓')}
            </div>
            <p class="sc-field-hint">"Required" = ≥50% recurring revenue; deals below that will be flagged.</p>
          </div>
          <div class="sc-field">
            <label class="sc-field-label">Control / Majority Buyout <span class="sc-hard-gate-badge">Hard Gate</span></label>
            <div class="sc-toggle-row">
              <label class="sc-toggle">
                <input type="checkbox" id="sc-controlBuyout" ${g('controlBuyout', true) ? 'checked' : ''}>
                <div class="sc-toggle-track"></div>
              </label>
              <div class="sc-toggle-text">
                <div class="sc-toggle-title">Require majority control</div>
                <div class="sc-toggle-desc">When on, minority-stake deals are automatically disqualified.</div>
              </div>
            </div>
          </div>
          <div class="sc-field">
            <label class="sc-field-label">Owner Situation <span class="sc-weight-badge">2 pts</span></label>
            ${tf('situations', 'Type and press Enter · e.g. Retiring owner, Absentee')}
            <p class="sc-field-hint">Preferred ownership situations boost the score. Leave blank to consider any.</p>
          </div>
        </div>
      </div>

      <!-- Section 4: Risk & Stability -->
      <div class="sc-section">
        <div class="sc-section-head">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Risk &amp; Stability
        </div>
        <div class="sc-section-body">
          <div class="sc-field">
            <label class="sc-field-label">Minimum Business Age <span class="sc-weight-badge">5 pts</span></label>
            ${nf('minBusinessAgeYears', 5, '5', 'yrs')}
            <p class="sc-field-hint">Businesses operating at least this many years receive full stability points. Younger businesses are partially scored or flagged.</p>
          </div>
        </div>
      </div>

    </div>

    <div class="sc-modal-footer">
      <button class="btn btn-secondary" onclick="_closeSearchCriteriaModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveSearchCriteria()">Save &amp; Rescore</button>
    </div>

  </div>
</div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  // Render initial tags into each field now that the DOM exists
  Object.keys(window._scTags).forEach(listId => _scRenderTags(listId));
}

async function saveSearchCriteria() {
  const el  = k => document.getElementById('sc-' + k);
  const pn  = (key, def) => _parseShorthandNum(el(key)?.value, def);

  // Read the selected radio value
  const recurEl  = document.querySelector('[data-sc-radio="recurringRevenue"].active input[type="radio"]');
  const recurVal = recurEl ? recurEl.value : 'preferred';

  const tags = window._scTags || {};

  const newCriteria = {
    targetIndustries:    tags.industries || [],
    excludedSectors:     tags.excluded   || [],
    targetGeographies:   tags.geos       || [],
    revenueMin:          pn('revenueMin',          3000000),
    revenueMax:          pn('revenueMax',          30000000),
    ebitdaMin:           pn('ebitdaMin',           750000),
    ebitdaMax:           pn('ebitdaMax',           8000000),
    marginMin:           pn('marginMin',           15),
    multipleMax:         pn('multipleMax',         8),
    growthRateMin:       pn('growthRateMin',       0),
    maxCustomerConc:     pn('maxCustomerConc',     40),
    recurringRevenue:    recurVal,
    controlBuyout:       !!el('controlBuyout')?.checked,
    ownerSituation:      tags.situations || [],
    minBusinessAgeYears: pn('minBusinessAgeYears', 5),
  };

  try {
    const settings = await _loadSettings() || {};
    const existingOverrides = (settings.searchCriteria || {})._overrides || {};
    const updated = { ...settings, id: `settings_${currentUser.id}`, searchCriteria: { ...newCriteria, _overrides: existingOverrides } };
    await DB.put(STORES.settings, updated);
    _closeSearchCriteriaModal();
    showToast('Search criteria saved — rescoring…', 'success');
    if (typeof renderSettingsCriteriaSummary === 'function') renderSettingsCriteriaSummary();
    window._currentFitEval = null;
    // Auto-rescore if the fit-score tab is currently active
    if (typeof currentDealTab !== 'undefined' && currentDealTab === 'fit-score') {
      if (typeof switchDealTab === 'function') await switchDealTab('fit-score');
    }
  } catch (e) {
    showToast('Failed to save: ' + e.message, 'error');
  }
}

async function _clearAllOverrides() {
  try {
    const settings = await _loadSettings() || {};
    const sc = settings.searchCriteria || {};
    const updated = { ...settings, id: `settings_${currentUser.id}`, searchCriteria: { ...sc, _overrides: {} } };
    await DB.put(STORES.settings, updated);
    _closeSearchCriteriaModal();
    showToast('All score overrides cleared.', 'info');
    window._currentFitEval = null;
    await openSearchCriteriaModal();
  } catch (e) {
    showToast('Failed to clear overrides: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────────
// §9  DEFAULT CRITERIA (backward compat export)
// ─────────────────────────────────────────────────────────────

const DEFAULT_SEARCH_CRITERIA = {
  targetIndustries:   [],
  excludedSectors:    [],
  targetGeographies:  [],
  revenueMin:         3000000,
  revenueMax:         30000000,
  ebitdaMin:          750000,
  ebitdaMax:          8000000,
  marginMin:          15,
  multipleMax:        8,
  growthRateMin:      0,
  maxCustomerConc:    40,
  recurringRevenue:    'preferred',
  controlBuyout:       true,
  ownerSituation:      [],
  minBusinessAgeYears: 5,
  _overrides:          {},
};

// ─────────────────────────────────────────────────────────────
// §10  UTILITY HELPERS
// ─────────────────────────────────────────────────────────────

function _fmt$(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}
