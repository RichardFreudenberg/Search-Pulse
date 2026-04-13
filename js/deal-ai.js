/* ============================================
   Nexus CRM — AI Due Diligence Engine
   ============================================ */

const DILIGENCE_TYPES = {
  full_diligence: { label: 'Full Diligence Report', icon: '📋', description: 'Comprehensive analysis across all dimensions' },
  screening_memo: { label: 'Screening Memo', icon: '📝', description: 'One-page go/no-go assessment' },
  ic_memo: { label: 'IC Memo Draft', icon: '📊', description: 'Investment committee presentation draft' },
  red_flags: { label: 'Red Flag Analysis', icon: '🚩', description: 'Risk identification and severity assessment' },
  market_analysis: { label: 'Market Analysis', icon: '🌐', description: 'Industry and competitive landscape' },
  financial_analysis: { label: 'Financial Analysis', icon: '💰', description: 'Revenue quality, margins, and cash flow' },
  management_questions: { label: 'Management Questions', icon: '❓', description: 'Questions for the next management call' },
  deal_snapshot: { label: 'One-Page Snapshot', icon: '📄', description: 'Quick deal summary for stakeholders' },
};

async function callDealOpenAI(messages, temperature = 0.25) {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  if (!settings?.openaiApiKey && !settings?.claudeApiKey) {
    throw new Error('No AI API key configured. Add an OpenAI or Claude API key in Settings.');
  }

  const startTime = Date.now();
  const content = await callAIMessages(messages, 4096, temperature);
  return {
    content,
    tokensUsed: 0,
    durationMs: Date.now() - startTime,
  };
}

function buildDealContext(deal, documents, notes) {
  let context = `## Deal: ${deal.name}\n`;
  context += `**Stage:** ${deal.stage}\n`;
  if (deal.sector) context += `**Sector:** ${deal.sector}\n`;
  if (deal.subsector) context += `**Sub-sector:** ${deal.subsector}\n`;
  if (deal.location) context += `**Location:** ${deal.location}\n`;
  if (deal.source) context += `**Source:** ${deal.source}\n`;
  if (deal.revenue) context += `**Revenue:** $${(deal.revenue / 1e6).toFixed(1)}M\n`;
  if (deal.ebitda) context += `**EBITDA:** $${(deal.ebitda / 1e6).toFixed(1)}M (${deal.revenue ? ((deal.ebitda / deal.revenue) * 100).toFixed(1) + '% margin' : 'N/A'})\n`;
  if (deal.askingPrice) context += `**Asking Price:** $${(deal.askingPrice / 1e6).toFixed(1)}M\n`;
  if (deal.askingMultiple) context += `**Asking Multiple:** ${deal.askingMultiple}x EBITDA\n`;
  if (deal.employeeCount) context += `**Employees:** ${deal.employeeCount}\n`;
  if (deal.description) context += `\n**Description:**\n${deal.description}\n`;
  if (deal.thesis) context += `\n**Investment Thesis:**\n${deal.thesis}\n`;

  if (documents && documents.length > 0) {
    context += `\n## Documents\n`;
    for (const doc of documents) {
      context += `\n### ${doc.name} (${getDocCategoryLabel(doc.category)})\n${doc.text}\n`;
    }
  }

  if (notes && notes.length > 0) {
    context += `\n## Notes\n`;
    for (const note of notes) {
      context += `- [${note.type}] ${note.content}\n`;
    }
  }

  return context;
}

const SYSTEM_PROMPT = `You are a senior due diligence analyst for a search fund. Your role is to help a searcher evaluate potential acquisition targets in the lower middle market ($1M-$10M EBITDA range).

Key search fund considerations you must always evaluate:
- Owner-operator transition risk
- Key person dependency
- Customer concentration risk
- Recurring revenue quality and durability
- Capital intensity and working capital needs
- Growth runway (organic and add-on)
- Management team depth below the owner
- Defensible market position or niche
- Valuation relative to quality
- SBA loan eligibility considerations

Always cite specific data from the provided materials when making claims. If information is missing, explicitly note what is unavailable and what questions need answers. Be direct, practical, and honest — do not be overly optimistic. Flag genuine risks clearly.`;

function getAnalysisPrompt(type) {
  const prompts = {
    full_diligence: `Produce a comprehensive due diligence report with the following sections:

1. **Executive Summary** (3-4 sentences, include go/no-go recommendation)
2. **Business Overview** (what they do, how they make money, key customers)
3. **Industry & Market** (market size, trends, competitive dynamics)
4. **Financial Analysis** (revenue trends, margin quality, cash flow, working capital)
5. **Key Strengths** (bullet points)
6. **Key Risks & Red Flags** (bullet points with severity: HIGH/MEDIUM/LOW)
7. **Diligence Questions** (numbered list of most important open questions)
8. **Value Creation Opportunities** (post-acquisition growth levers)
9. **Valuation Assessment** (is the asking price reasonable? comparable considerations)
10. **Search Fund Fit** (rate 1-10 with explanation)
11. **Recommendation** (GO / CONDITIONAL GO / NO-GO with clear reasoning)`,

    screening_memo: `Produce a concise one-page screening memo with:

1. **Company Overview** (2-3 sentences)
2. **Key Metrics** (revenue, EBITDA, margins, employees, asking price)
3. **Why Interesting** (top 3 reasons)
4. **Key Concerns** (top 3 risks)
5. **Next Steps** (what to do if proceeding)
6. **Go / No-Go Recommendation** (with one-sentence justification)

Keep it brief and actionable — this is for a quick screening decision.`,

    ic_memo: `Draft an investment committee memo with:

1. **Investment Thesis** (clear articulation of why this is attractive)
2. **Company Overview** (business description, history, market position)
3. **Industry Dynamics** (market size, growth, competitive landscape)
4. **Financial Profile** (historical performance, projections framework, key ratios)
5. **Deal Structure** (proposed terms, financing considerations, SBA eligibility)
6. **Key Risks & Mitigants** (organized risk/mitigant table)
7. **Post-Acquisition Plan** (100-day plan, growth initiatives, value creation)
8. **Returns Analysis** (qualitative framework for expected returns)
9. **Recommendation** (investment committee recommendation)

This should be comprehensive enough to present to investors.`,

    red_flags: `Conduct a thorough red flag analysis. For each red flag found:

1. **Category** (Financial / Operational / Legal / Market / Management / Customer)
2. **Severity** (HIGH / MEDIUM / LOW)
3. **Description** (what the risk is)
4. **Evidence** (what in the materials supports this concern)
5. **Mitigant** (if any)
6. **Diligence Action** (what to investigate further)

Also list:
- **Missing Information** (what documents/data are needed but unavailable)
- **Deal Breaker Assessment** (are any red flags potentially fatal?)

Be thorough and honest. Better to over-flag than under-flag.`,

    market_analysis: `Analyze the market and competitive landscape:

1. **Industry Overview** (what industry, size, growth rate)
2. **Market Trends** (tailwinds and headwinds)
3. **Competitive Landscape** (who are the competitors, market share dynamics)
4. **Barriers to Entry** (what protects this business)
5. **Customer Dynamics** (who buys, switching costs, concentration)
6. **Regulatory Environment** (any regulatory risks or requirements)
7. **Technology Risk** (disruption potential)
8. **Market Position Assessment** (where does this company sit and why)`,

    financial_analysis: `Analyze the financial profile:

1. **Revenue Analysis** (size, growth, mix, quality, recurring vs. project-based)
2. **Profitability** (gross margins, EBITDA margins, trends, add-back assessment)
3. **Working Capital** (inventory, receivables, payables dynamics)
4. **Capital Expenditure** (maintenance vs. growth capex)
5. **Cash Flow Quality** (EBITDA-to-cash-flow conversion)
6. **Customer Concentration** (revenue by customer if available)
7. **Seasonality** (patterns and implications)
8. **Key Financial Risks** (what could go wrong)
9. **Normalized Earnings** (adjusted EBITDA assessment)`,

    management_questions: `Generate a comprehensive list of questions to ask management in the next call. Organize by topic:

1. **Business Model & Operations** (5-8 questions)
2. **Customers & Revenue** (5-8 questions)
3. **Competition & Market** (3-5 questions)
4. **Team & Organization** (3-5 questions)
5. **Growth Opportunities** (3-5 questions)
6. **Financial Specifics** (5-8 questions)
7. **Owner Transition** (3-5 questions)
8. **Deal Process** (2-3 questions)

Make questions specific and probing — not generic. Reference specific data points where possible.`,

    deal_snapshot: `Create a one-page deal snapshot:

**[Company Name] — Deal Snapshot**

| Metric | Value |
|--------|-------|
| Revenue | ... |
| EBITDA | ... |
| Margin | ... |
| Asking Price | ... |
| Multiple | ... |
| Employees | ... |
| Location | ... |
| Source | ... |

**What They Do:** (2 sentences)
**Why Interesting:** (3 bullets)
**Key Risks:** (3 bullets)
**Score:** X/10
**Status:** [Current stage]
**Next Step:** [Recommended action]`,
  };

  return prompts[type] || prompts.full_diligence;
}

async function runDiligenceAnalysis(dealId, type = 'full_diligence') {
  const deal = await DB.get(STORES.deals, dealId);
  if (!deal) throw new Error('Deal not found');

  // Gather all context
  const documents = await getAllDealDocumentTexts(dealId);
  const allNotes = await DB.getAllByIndex(STORES.dealNotes, 'dealId', dealId);
  const notes = allNotes.filter(n => n.userId === currentUser.id);

  const context = buildDealContext(deal, documents, notes);
  const analysisPrompt = getAnalysisPrompt(type);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `${context}\n\n---\n\n${analysisPrompt}` },
  ];

  // Create diligence record in "running" state
  const diligenceId = generateId();
  const diligenceRecord = {
    id: diligenceId,
    dealId,
    userId: currentUser.id,
    type,
    status: 'running',
    prompt: JSON.stringify(messages),
    response: '',
    parsedResult: null,
    model: 'gpt-4o-mini',
    tokensUsed: null,
    durationMs: null,
    documentIds: documents.map(d => d.id || d.name),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await DB.put(STORES.dealDiligence, diligenceRecord);

  try {
    const result = await callDealOpenAI(messages);

    // Update record with results
    diligenceRecord.status = 'completed';
    diligenceRecord.response = result.content;
    diligenceRecord.tokensUsed = result.tokensUsed;
    diligenceRecord.durationMs = result.durationMs;
    diligenceRecord.updatedAt = new Date().toISOString();
    await DB.put(STORES.dealDiligence, diligenceRecord);

    // Update deal
    deal.lastDiligenceRunAt = new Date().toISOString();
    await DB.put(STORES.deals, deal);

    // Log history
    await logDealHistory(dealId, 'diligence_run', {
      diligenceId,
      type,
      tokensUsed: result.tokensUsed,
      durationMs: result.durationMs,
    });

    return diligenceRecord;
  } catch (err) {
    diligenceRecord.status = 'failed';
    diligenceRecord.response = err.message;
    diligenceRecord.updatedAt = new Date().toISOString();
    await DB.put(STORES.dealDiligence, diligenceRecord);
    throw err;
  }
}

async function askDealQuestion(dealId, question) {
  const deal = await DB.get(STORES.deals, dealId);
  const documents = await getAllDealDocumentTexts(dealId);
  const context = buildDealContext(deal, documents, []);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + '\n\nAnswer the user\'s question about this deal based on the available materials. Be specific and cite sources.' },
    { role: 'user', content: `${context}\n\n---\n\n**Question:** ${question}` },
  ];

  const diligenceId = generateId();
  const record = {
    id: diligenceId,
    dealId,
    userId: currentUser.id,
    type: 'qa_response',
    status: 'running',
    prompt: JSON.stringify({ question }),
    response: '',
    parsedResult: null,
    model: 'gpt-4o-mini',
    tokensUsed: null,
    durationMs: null,
    documentIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await DB.put(STORES.dealDiligence, record);

  const result = await callDealOpenAI(messages, 0.3);
  record.status = 'completed';
  record.response = result.content;
  record.tokensUsed = result.tokensUsed;
  record.durationMs = result.durationMs;
  await DB.put(STORES.dealDiligence, record);

  return record;
}

function renderDiligenceReport(report) {
  const typeInfo = DILIGENCE_TYPES[report.type] || { label: report.type, icon: '📋' };
  const statusColors = {
    running: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  return `
    <div class="card mb-4">
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="text-lg">${typeInfo.icon}</span>
          <div>
            <h3 class="text-sm font-semibold">${escapeHtml(typeInfo.label)}</h3>
            <p class="text-xs text-surface-400">${formatDateTime(report.createdAt)}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge ${statusColors[report.status] || ''}">${report.status}</span>
          ${report.tokensUsed ? `<span class="text-xs text-surface-400">${report.tokensUsed} tokens</span>` : ''}
          ${report.durationMs ? `<span class="text-xs text-surface-400">${(report.durationMs / 1000).toFixed(1)}s</span>` : ''}
        </div>
      </div>
      ${report.status === 'completed' ? `
        <div class="prose prose-sm dark:prose-invert max-w-none mt-4 deal-ai-output">
          ${renderMarkdown(report.response)}
        </div>
      ` : report.status === 'running' ? `
        <div class="flex items-center gap-3 p-4">
          <div class="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full"></div>
          <span class="text-sm text-surface-500">Analysis in progress...</span>
        </div>
      ` : `
        <div class="p-4 bg-red-50 dark:bg-red-900/15 rounded">
          <p class="text-sm text-red-600">${escapeHtml(report.response)}</p>
        </div>
      `}
    </div>
  `;
}

// Simple markdown renderer for AI output
function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold mt-4 mb-2">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold mt-5 mb-2">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="text-lg font-semibold mt-6 mb-3">$1</h2>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Tables
  html = html.replace(/\|(.+)\|/g, (match) => {
    const cells = match.split('|').filter(c => c.trim());
    if (cells.every(c => /^[\s-:]+$/.test(c))) return ''; // separator row
    const isHeader = cells.some(c => c.includes('---'));
    const tag = isHeader ? 'th' : 'td';
    return `<tr>${cells.map(c => `<${tag} class="px-3 py-1.5 text-xs border border-surface-200 dark:border-surface-700">${c.trim()}</${tag}>`).join('')}</tr>`;
  });

  // Bullet lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 text-sm">$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 text-sm"><strong>$1.</strong> $2</li>');

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p class="text-sm mb-2">');
  html = '<p class="text-sm mb-2">' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p class="text-sm mb-2"><\/p>/g, '');

  // Severity tags
  html = html.replace(/\bHIGH\b/g, '<span class="inline-flex px-1.5 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">HIGH</span>');
  html = html.replace(/\bMEDIUM\b/g, '<span class="inline-flex px-1.5 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">MEDIUM</span>');
  html = html.replace(/\bLOW\b/g, '<span class="inline-flex px-1.5 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">LOW</span>');

  // GO/NO-GO tags
  html = html.replace(/\bNO-GO\b/g, '<span class="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">NO-GO</span>');
  html = html.replace(/\bCONDITIONAL GO\b/g, '<span class="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">CONDITIONAL GO</span>');
  html = html.replace(/(?<![A-Z-])\bGO\b(?![/-])/g, '<span class="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">GO</span>');

  return html;
}
