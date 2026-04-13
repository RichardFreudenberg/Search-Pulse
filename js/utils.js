/* ============================================
   Nexus CRM — Utilities
   ============================================ */

const STAGES = ['New intro', 'Met once', 'Active relationship', 'Warm relationship', 'Needs follow-up'];

const STAGE_COLORS = {
  'New intro': 'blue',
  'Met once': 'green',
  'Active relationship': 'purple',
  'Warm relationship': 'yellow',
  'Needs follow-up': 'red',
};

const STAGE_CLASSES = {
  'New intro': 'stage-new-intro',
  'Met once': 'stage-met-once',
  'Active relationship': 'stage-active-relationship',
  'Warm relationship': 'stage-warm-relationship',
  'Needs follow-up': 'stage-needs-follow-up',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatRelative(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function formatFutureRelative(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diffMs = d - now;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays} days`;
  if (diffDays < 30) return `In ${Math.floor(diffDays / 7)} weeks`;
  return `In ${Math.floor(diffDays / 30)} months`;
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d < now;
}

function isDueToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isDueThisWeek(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d >= now && d <= weekEnd;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - now) / (1000 * 60 * 60 * 24));
}

function toInputDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toISOString().split('T')[0];
}

function toInputDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toISOString().slice(0, 16);
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function avatarColor(name) {
  if (!name) return '#4c6ef5';
  const colors = ['#4c6ef5', '#7048e8', '#ae3ec9', '#e64980', '#f03e3e', '#d9480f', '#e8590c', '#f76707', '#fab005', '#40c057', '#12b886', '#15aabf', '#228be6', '#3b5bdb'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function renderAvatar(name, photoUrl, size = 'md', linkedInUrl = '') {
  const sizeClass = `avatar-${size}`;
  let imgSrc = photoUrl;

  // If no stored photo, generate a DiceBear illustrated avatar from the name
  // This gives every contact a unique, visually appealing avatar
  if (!imgSrc && name) {
    const seed = encodeURIComponent(name.trim());
    imgSrc = `https://api.dicebear.com/9.x/initials/svg?seed=${seed}&backgroundColor=4c6ef5,7048e8,ae3ec9,40c057,fab005,f03e3e,15aabf&backgroundType=gradientLinear&fontWeight=600`;
  }

  if (imgSrc) {
    return `<div class="avatar ${sizeClass}"><img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(name)}" onerror="this.parentElement.innerHTML='${getInitials(name)}';this.parentElement.style.backgroundColor='${avatarColor(name)}20';this.parentElement.style.color='${avatarColor(name)}'" /></div>`;
  }
  return `<div class="avatar ${sizeClass}" style="background-color: ${avatarColor(name)}20; color: ${avatarColor(name)}">${getInitials(name)}</div>`;
}

function getCompanyLogoUrl(company) {
  if (!company) return '';
  if (company.logoUrl) return company.logoUrl;
  let domain = '';
  if (company.website) {
    try { domain = new URL(company.website).hostname.replace('www.', ''); } catch {}
  }
  if (!domain && company.name) {
    domain = company.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  }
  if (domain) {
    // Google favicon service — reliable, free, no API key
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  }
  return '';
}

function renderCompanyLogo(company, size = 'sm') {
  const sizeClass = `avatar-${size}`;
  if (!company) return '';

  const logoSrc = getCompanyLogoUrl(company);

  if (logoSrc) {
    return `<div class="avatar ${sizeClass}" style="background: white; border: 1px solid #e9ecef; display:flex; align-items:center; justify-content:center;"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(company.name)}" style="width:65%;height:65%;object-fit:contain;" onerror="this.style.display='none';this.parentElement.innerHTML='${getInitials(company.name)}';this.parentElement.style.backgroundColor='${avatarColor(company.name)}15';this.parentElement.style.color='${avatarColor(company.name)}'" /></div>`;
  }
  return `<div class="avatar ${sizeClass}" style="background-color: ${avatarColor(company.name)}15; color: ${avatarColor(company.name)}">${getInitials(company.name)}</div>`;
}

function renderStageBadge(stage) {
  const cls = STAGE_CLASSES[stage] || 'badge-gray';
  return `<span class="badge ${cls}">${escapeHtml(stage)}</span>`;
}

function renderVerificationBadge(status) {
  if (status === 'verified') return '<span class="verified-badge">✓ Verified</span>';
  if (status === 'imported') return '<span class="imported-badge">↓ Imported</span>';
  return '<span class="manual-badge">✎ Manual</span>';
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function truncate(str, len = 100) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function getCompanyForContact(contact) {
  if (!contact.companyId) return null;
  return DB.get(STORES.companies, contact.companyId);
}

async function getContactsForCompany(companyId) {
  return DB.getAllByIndex(STORES.contacts, 'companyId', companyId);
}

// Build a lookup map from an array keyed by a field (default 'id')
function buildMap(arr, key = 'id') {
  const map = {};
  arr.forEach(item => { map[item[key]] = item; });
  return map;
}

// Return only non-archived contacts
function getActiveContacts(contacts) {
  return contacts.filter(c => !c.archived);
}

function sortByDate(arr, field, desc = true) {
  return arr.sort((a, b) => {
    const da = new Date(a[field] || 0);
    const db = new Date(b[field] || 0);
    return desc ? db - da : da - db;
  });
}

// Duplicate detection
function normalizeString(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function checkDuplicate(contacts, name, email) {
  const normName = normalizeString(name);
  const normEmail = normalizeString(email);

  return contacts.find(c => {
    if (normEmail && normalizeString(c.email) === normEmail) return true;
    if (normName && normalizeString(c.fullName) === normName) return true;
    // Fuzzy: check if names are very similar
    if (normName.length > 3 && normalizeString(c.fullName).includes(normName)) return true;
    return false;
  });
}

// === UNIVERSAL AI WRAPPER ===
// Routes to Claude (if claudeApiKey set) or OpenAI (if openaiApiKey set)
// Usage: const text = await callAI(systemPrompt, userPrompt, maxTokens, temperature)
async function callAI(systemPrompt, userPrompt, maxTokens = 500, temperature = 0.2) {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  return _routeAI(settings, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], maxTokens, temperature);
}

// Multi-turn version — pass a full messages array (same format as OpenAI)
async function callAIMessages(messagesArr, maxTokens = 500, temperature = 0.2) {
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  return _routeAI(settings, messagesArr, maxTokens, temperature);
}

// Internal router — called by both wrappers
// Priority: OpenAI first (GPT-4o-mini), then Claude as fallback
async function _routeAI(settings, messagesArr, maxTokens, temperature) {
  if (settings?.openaiApiKey) {
    // OpenAI GPT-4o-mini
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messagesArr,
        max_tokens: maxTokens,
        temperature,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API error: ${resp.status}`);
    }
    const data = await resp.json();
    return data.choices[0].message.content;
  } else if (settings?.claudeApiKey) {
    // Anthropic Claude — system prompt is a top-level field, not a message
    const systemMsg = messagesArr.find(m => m.role === 'system')?.content || '';
    const nonSystem = messagesArr.filter(m => m.role !== 'system');
    const body = {
      model: 'claude-3-5-haiku-20241022',
      messages: nonSystem,
      max_tokens: maxTokens,
    };
    if (systemMsg) body.system = systemMsg;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.claudeApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Claude API error: ${resp.status}`);
    }
    const data = await resp.json();
    return data.content[0].text;
  } else {
    throw new Error('No AI API key configured. Add an OpenAI or Claude API key in Settings.');
  }
}

// === SHARED: FETCH COMPANY INFO FROM WEBSITE ===
async function fetchCompanyInfoFromUrl(url) {
  // Fetch the homepage via CORS proxy
  let pageText = '';
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];
  for (const proxyUrl of proxies) {
    try {
      const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const html = await r.text();
        // Strip tags to get text
        const div = document.createElement('div');
        div.innerHTML = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        pageText = (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim().substring(0, 4000);
        if (pageText.length > 100) break;
      }
    } catch {}
  }
  if (!pageText) throw new Error('Could not fetch the website');

  const content = await callAI(
    'You are a business analyst. Extract company information from website text. Return ONLY valid JSON, no markdown.',
    `Extract this company's info. Return JSON with fields: name (string), industry (string), description (2-3 sentences), employeeCount (integer or null), founded (year integer or null).\n\nWebsite: ${url}\nContent:\n${pageText}`,
    300, 0.1
  );
  const cleaned = content.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(cleaned);
}
