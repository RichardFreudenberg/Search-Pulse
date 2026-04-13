/* ============================================
   Nexus CRM — Search Fund News
   ============================================ */

const NEWS_REGIONS = [
  { id: 'all', label: 'All Regions', icon: '🌍' },
  { id: 'usa', label: 'USA', icon: '🇺🇸' },
  { id: 'europe', label: 'Europe', icon: '🇪🇺' },
  { id: 'latam', label: 'Latin America', icon: '🌎' },
  { id: 'asia', label: 'Asia Pacific', icon: '🌏' },
  { id: 'africa', label: 'Africa & ME', icon: '🌍' },
];

const NEWS_INDUSTRIES = [
  { id: 'all', label: 'All Industries' },
  { id: 'search-funds', label: 'Search Funds' },
  { id: 'private-equity', label: 'Private Equity' },
  { id: 'venture-capital', label: 'Venture Capital' },
];

const NEWS_SEARCH_QUERIES = {
  // Region queries
  all: '"search fund" OR "acquisition entrepreneurship" OR "entrepreneurship through acquisition"',
  usa: '"search fund" AND (USA OR "United States" OR American OR Stanford OR HBS OR Wharton)',
  europe: '"search fund" AND (Europe OR European OR IESE OR INSEAD OR "London Business School" OR Spain OR UK OR France OR Germany OR Switzerland)',
  latam: '"search fund" AND ("Latin America" OR Brazil OR Mexico OR Colombia OR Chile OR Argentina OR "South America")',
  asia: '"search fund" AND (Asia OR "Asia Pacific" OR India OR Singapore OR Australia OR Japan OR China)',
  africa: '"search fund" AND (Africa OR "Middle East" OR "South Africa" OR Nigeria OR UAE OR Israel)',
};

const NEWS_INDUSTRY_QUERIES = {
  'all': '',
  'search-funds': '"search fund" OR "acquisition entrepreneurship" OR "ETA"',
  'private-equity': '"private equity" OR "PE fund" OR "buyout" OR "LBO"',
  'venture-capital': '"venture capital" OR "VC fund" OR "startup funding" OR "Series A"',
};

const NEWSLETTER_FREQUENCIES = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Biweekly' },
  { id: 'monthly', label: 'Monthly' },
];

let currentNewsRegion = 'all';
let currentNewsIndustry = 'all';
let newsCache = {};
let newsLastFetch = {};

async function renderNews() {
  const pageContent = document.getElementById('page-content');
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      ${renderPageHeader('Search Fund News', 'Stay updated on the search fund community worldwide')}

      <!-- Region Tabs -->
      <div class="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        ${NEWS_REGIONS.map(r => `
          <button onclick="switchNewsRegion('${r.id}')" id="news-tab-${r.id}"
            class="flex items-center gap-2 px-4 py-2.5 rounded text-sm font-medium whitespace-nowrap transition-all ${currentNewsRegion === r.id
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-brand-300 dark:hover:border-brand-700'}">
            <span>${r.icon}</span>
            <span>${r.label}</span>
          </button>
        `).join('')}
      </div>

      <!-- Industry Filter Pills -->
      <div class="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-1 px-1">
        ${NEWS_INDUSTRIES.map(ind => `
          <button onclick="switchNewsIndustry('${ind.id}')" id="news-industry-${ind.id}"
            class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${currentNewsIndustry === ind.id
              ? 'bg-purple-600 text-white'
              : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700'}">
            ${ind.label}
          </button>
        `).join('')}
      </div>

      <!-- Newsletter Subscribe Banner -->
      <div class="card mb-6 bg-gradient-to-r from-brand-50 to-purple-50 dark:from-brand-900/20 dark:to-purple-900/20 border-brand-200 dark:border-brand-800">
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div class="flex-1">
            <h3 class="text-sm font-semibold mb-1">Search Fund Newsletter</h3>
            <p class="text-xs text-surface-500">Get a curated digest of search fund news delivered to your inbox.</p>
          </div>
          <button onclick="toggleNewsletterPrefs()" class="btn-secondary btn-sm whitespace-nowrap">
            ${settings?.newsletterSubscribed ? '✓ Subscribed — Edit' : 'Subscribe'}
          </button>
        </div>
        <div id="newsletter-prefs" class="mt-3 pt-3 border-t border-brand-200/50 dark:border-brand-800/50 ${settings?.newsletterSubscribed ? '' : 'hidden'}">
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Email</label>
              <input type="email" id="newsletter-email" class="input-field text-sm" placeholder="your@email.com" value="${escapeHtml(settings?.newsletterEmail || currentUser.email || '')}" />
            </div>
            <div>
              <label class="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1">Frequency</label>
              <div class="flex gap-2">
                ${NEWSLETTER_FREQUENCIES.map(f => `
                  <label class="flex-1">
                    <input type="radio" name="newsletter-freq" value="${f.id}" class="peer hidden" ${(settings?.newsletterFrequency || 'daily') === f.id ? 'checked' : ''} />
                    <div class="text-center px-2 py-1.5 rounded-lg border border-surface-200 dark:border-surface-700 text-xs font-medium cursor-pointer peer-checked:bg-brand-600 peer-checked:text-white peer-checked:border-brand-600 transition-all">${f.label}</div>
                  </label>
                `).join('')}
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Regions</label>
              <div class="flex flex-wrap gap-2">
                ${NEWS_REGIONS.filter(r => r.id !== 'all').map(r => `
                  <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" class="newsletter-region-cb rounded" value="${r.id}" ${(settings?.newsRegions || ['usa', 'europe']).includes(r.id) ? 'checked' : ''} />
                    <span>${r.icon} ${r.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">Industries</label>
              <div class="flex flex-wrap gap-2">
                ${NEWS_INDUSTRIES.filter(i => i.id !== 'all').map(i => `
                  <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" class="newsletter-industry-cb rounded" value="${i.id}" ${(settings?.newsIndustries || ['search-funds']).includes(i.id) ? 'checked' : ''} />
                    <span>${i.label}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            <button onclick="subscribeNewsletter()" class="btn-primary btn-sm w-full">${settings?.newsletterSubscribed ? 'Update Subscription' : 'Subscribe'}</button>
          </div>
        </div>
      </div>

      <!-- News Content -->
      <div id="news-content">
        ${renderNewsLoading()}
      </div>
    </div>
  `;

  await fetchAndRenderNews(currentNewsRegion, currentNewsIndustry);
}

function toggleNewsletterPrefs() {
  const prefs = document.getElementById('newsletter-prefs');
  if (prefs) prefs.classList.toggle('hidden');
}

function renderNewsLoading() {
  return `
    <div class="space-y-4">
      ${Array(5).fill(0).map(() => `
        <div class="card animate-pulse">
          <div class="flex gap-4">
            <div class="skeleton w-20 h-20 rounded-lg flex-shrink-0"></div>
            <div class="flex-1 space-y-2">
              <div class="skeleton h-4 w-3/4"></div>
              <div class="skeleton h-3 w-1/2"></div>
              <div class="skeleton h-3 w-full"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function switchNewsRegion(regionId) {
  currentNewsRegion = regionId;

  // Update tab styles
  NEWS_REGIONS.forEach(r => {
    const tab = document.getElementById(`news-tab-${r.id}`);
    if (tab) {
      if (r.id === regionId) {
        tab.className = 'flex items-center gap-2 px-4 py-2.5 rounded text-sm font-medium whitespace-nowrap transition-all bg-brand-600 text-white shadow-sm';
      } else {
        tab.className = 'flex items-center gap-2 px-4 py-2.5 rounded text-sm font-medium whitespace-nowrap transition-all bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-brand-300 dark:hover:border-brand-700';
      }
    }
  });

  const container = document.getElementById('news-content');
  if (container) container.innerHTML = renderNewsLoading();

  await fetchAndRenderNews(regionId, currentNewsIndustry);
}

async function switchNewsIndustry(industryId) {
  currentNewsIndustry = industryId;

  // Update pill styles
  NEWS_INDUSTRIES.forEach(ind => {
    const pill = document.getElementById(`news-industry-${ind.id}`);
    if (pill) {
      if (ind.id === industryId) {
        pill.className = 'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all bg-purple-600 text-white';
      } else {
        pill.className = 'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700';
      }
    }
  });

  const container = document.getElementById('news-content');
  if (container) container.innerHTML = renderNewsLoading();

  await fetchAndRenderNews(currentNewsRegion, industryId);
}

async function fetchAndRenderNews(regionId, industryId) {
  const container = document.getElementById('news-content');
  if (!container) return;

  const cacheKey = `${regionId}_${industryId}`;
  if (newsCache[cacheKey] && newsLastFetch[cacheKey] && (Date.now() - newsLastFetch[cacheKey] < 15 * 60 * 1000)) {
    container.innerHTML = renderNewsItems(newsCache[cacheKey], regionId, industryId);
    return;
  }

  try {
    const regionQuery = NEWS_SEARCH_QUERIES[regionId] || NEWS_SEARCH_QUERIES.all;
    const industryQuery = NEWS_INDUSTRY_QUERIES[industryId] || '';
    const query = industryId !== 'all' ? `(${industryQuery}) ${regionId !== 'all' ? 'AND (' + regionQuery + ')' : ''}` : regionQuery;
    const articles = await fetchNewsArticles(query, regionId);

    newsCache[cacheKey] = articles;
    newsLastFetch[cacheKey] = Date.now();

    container.innerHTML = renderNewsItems(articles, regionId, industryId);
  } catch (err) {
    console.error('News fetch error:', err);
    container.innerHTML = renderNewsFallback(regionId, industryId);
  }
}

async function fetchNewsArticles(query, regionId) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=US&ceid=US:en`;

  // Ordered list of CORS-capable RSS fetchers — rss2json is most reliable
  const fetchers = [
    async () => {
      const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=20`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('rss2json ' + r.status);
      const json = await r.json();
      if (json.status !== 'ok' || !json.items?.length) throw new Error('rss2json empty');
      return json.items.map(item => ({
        title: (item.title || '').replace(/ - .*$/, ''),
        link: item.link || item.guid || '',
        pubDate: item.pubDate || '',
        description: (item.description || '').replace(/<[^>]+>/g, '').substring(0, 200),
        source: item.author || extractSourceFromTitle(item.title || ''),
        region: regionId,
      }));
    },
    async () => {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`;
      const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('allorigins ' + r.status);
      const text = await r.text();
      if (!text.includes('<item>')) throw new Error('allorigins no items');
      return parseRssXml(text, regionId);
    },
    async () => {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(rssUrl)}`;
      const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('corsproxy ' + r.status);
      const text = await r.text();
      if (!text.includes('<item>')) throw new Error('corsproxy no items');
      return parseRssXml(text, regionId);
    },
  ];

  for (const fetcher of fetchers) {
    try {
      const articles = await fetcher();
      if (articles && articles.length > 0) return articles;
    } catch (e) {
      continue;
    }
  }
  throw new Error('All news sources failed');
}

function parseRssXml(text, regionId) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'text/xml');
  const items = xml.querySelectorAll('item');
  const articles = [];
  items.forEach((item, i) => {
    if (i >= 20) return;
    const title = item.querySelector('title')?.textContent || '';
    const link = item.querySelector('link')?.textContent || '';
    const pubDate = item.querySelector('pubDate')?.textContent || '';
    const description = item.querySelector('description')?.textContent || '';
    const source = item.querySelector('source')?.textContent || '';
    const div = document.createElement('div');
    div.innerHTML = description;
    articles.push({
      title: title.replace(/ - .*$/, ''),
      link,
      pubDate,
      description: (div.textContent || '').substring(0, 200),
      source: source || extractSourceFromTitle(title),
      region: regionId,
    });
  });
  return articles;
}

function extractSourceFromTitle(title) {
  const match = title.match(/ - ([^-]+)$/);
  return match ? match[1].trim() : '';
}

function renderNewsItems(articles, regionId, industryId) {
  if (!articles || articles.length === 0) {
    return renderNewsFallback(regionId, industryId);
  }

  const region = NEWS_REGIONS.find(r => r.id === regionId);
  const industry = NEWS_INDUSTRIES.find(i => i.id === industryId);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-base font-semibold">${region ? region.icon + ' ' + region.label : ''} ${industry && industry.id !== 'all' ? '· ' + industry.label : ''} News</h2>
        <p class="text-xs text-surface-500">${today} · ${articles.length} articles</p>
      </div>
      <button onclick="newsCache={}; newsLastFetch={}; fetchAndRenderNews('${regionId}', '${industryId}')" class="btn-ghost btn-sm">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
        Refresh
      </button>
    </div>
    <div class="space-y-3">
      ${articles.map((a, i) => `
        <a href="${escapeHtml(a.link)}" target="_blank" rel="noopener" class="card card-interactive block" style="animation-delay: ${i * 50}ms">
          <div class="flex items-start gap-4">
            <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-400">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" /></svg>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-medium leading-snug mb-1 group-hover:text-brand-600">${escapeHtml(a.title)}</h3>
              ${a.description ? `<p class="text-xs text-surface-500 line-clamp-2 mb-2">${escapeHtml(a.description)}</p>` : ''}
              <div class="flex items-center gap-3 text-xs text-surface-400">
                ${a.source ? `<span class="font-medium text-surface-500">${escapeHtml(a.source)}</span>` : ''}
                ${a.pubDate ? `<span>${formatNewsDate(a.pubDate)}</span>` : ''}
              </div>
            </div>
            <svg class="w-4 h-4 text-surface-300 dark:text-surface-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
          </div>
        </a>
      `).join('')}
    </div>
  `;
}

function renderNewsFallback(regionId, industryId) {
  const region = NEWS_REGIONS.find(r => r.id === regionId);

  const googleSearches = {
    all: 'https://news.google.com/search?q=%22search+fund%22+OR+%22acquisition+entrepreneurship%22',
    usa: 'https://news.google.com/search?q=%22search+fund%22+USA+OR+Stanford+OR+HBS',
    europe: 'https://news.google.com/search?q=%22search+fund%22+Europe+OR+IESE+OR+INSEAD',
    latam: 'https://news.google.com/search?q=%22search+fund%22+%22Latin+America%22+OR+Brazil+OR+Mexico',
    asia: 'https://news.google.com/search?q=%22search+fund%22+Asia+OR+India+OR+Singapore',
    africa: 'https://news.google.com/search?q=%22search+fund%22+Africa+OR+%22Middle+East%22',
  };

  return `
    <div class="text-center py-6 mb-6">
      <div class="inline-flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/15 border border-yellow-200 dark:border-yellow-800 rounded">
        <svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
        <span class="text-sm text-yellow-700 dark:text-yellow-400">Live news feed unavailable — try the Resources tab for curated sources</span>
      </div>
    </div>

    <div class="flex items-center justify-between mb-4">
      <h2 class="text-base font-semibold">${region ? region.icon + ' ' : ''}Quick Access</h2>
      <a href="${googleSearches[regionId] || googleSearches.all}" target="_blank" class="btn-primary btn-sm">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
        Open Google News
      </a>
    </div>

    <!-- Live Search Links by Region -->
    <div class="card">
      <h3 class="text-sm font-semibold mb-3">Quick Search by Region</h3>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
        ${NEWS_REGIONS.filter(r => r.id !== 'all').map(r => `
          <a href="${googleSearches[r.id]}" target="_blank" class="flex items-center gap-2 p-3 rounded border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-700 transition-colors">
            <span class="text-lg">${r.icon}</span>
            <span class="text-sm font-medium">${r.label}</span>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

function formatNewsDate(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

async function subscribeNewsletter() {
  const email = document.getElementById('newsletter-email').value.trim();
  if (!email) { showToast('Please enter your email', 'warning'); return; }

  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  const regionCheckboxes = document.querySelectorAll('.newsletter-region-cb:checked');
  const industryCheckboxes = document.querySelectorAll('.newsletter-industry-cb:checked');
  const selectedRegions = Array.from(regionCheckboxes).map(cb => cb.value);
  const selectedIndustries = Array.from(industryCheckboxes).map(cb => cb.value);
  const frequency = document.querySelector('input[name="newsletter-freq"]:checked')?.value || 'daily';

  settings.newsletterEmail = email;
  settings.newsRegions = selectedRegions;
  settings.newsIndustries = selectedIndustries;
  settings.newsletterFrequency = frequency;
  settings.newsletterSubscribed = true;
  await DB.put(STORES.settings, settings);

  showToast(`Subscribed! ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} digest for ${selectedRegions.length} region(s) and ${selectedIndustries.length} industry(s)`, 'success');

  await DB.add(STORES.notifications, {
    userId: currentUser.id,
    title: 'Newsletter subscribed',
    description: `${frequency} search fund digest: ${selectedRegions.join(', ')} · ${selectedIndustries.join(', ')} → ${email}`,
    type: 'info',
    read: false,
    timestamp: new Date().toISOString(),
  });
}
