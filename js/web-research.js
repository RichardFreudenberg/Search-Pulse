/* ============================================================
   Pulse CRM — Web Research Utility  (web-research.js)
   ============================================================
   Browser-only. All network calls use fetch().
   No Node.js, no build step, no external dependencies.

   Public API:
     webSearch(query, options)           → Promise<SearchResult[]>
     readUrl(url, options)               → Promise<string>
     newsSearch(query, maxResults)       → Promise<NewsResult[]>
     researchPerson(fullName, company, title)   → Promise<string>
     researchCompany(companyName, website, sector) → Promise<string>
     clearResearchCache()               → number
     getResearchCacheStats()            → { count, expiredCount, totalKB }

   Providers (in priority order):
     Web search  : Tavily (key required) → Jina.ai search (free)
     URL reader  : Firecrawl (key required) → Jina.ai reader (free)
     News search : Tavily news topic → Google News RSS via Jina reader

   Settings are read from:
     DB.get(STORES.settings, `settings_${currentUser.id}`)
   Expected keys: settings.tavilyApiKey, settings.firecrawlApiKey
   ============================================================ */

// ─── TTL constants (milliseconds) ────────────────────────────────────────────
const WR_TTL = {
  search:  15 * 60 * 1000,       // 15 minutes
  news:    20 * 60 * 1000,       // 20 minutes
  reader:   4 * 60 * 60 * 1000,  // 4 hours  (page content rarely changes)
  company: 12 * 60 * 60 * 1000,  // 12 hours (company overview pages)
};

// ─── Internal state ───────────────────────────────────────────────────────────
const _WR_CACHE_PREFIX  = 'pulse_wrc_';
const _WR_RATE_LIMIT_MS = 1000;               // min gap between requests per hostname
const _WR_MAX_ATTEMPTS  = 3;                  // retry attempts
const _WR_BASE_DELAY_MS = 1000;               // exponential backoff base

/** hostname → timestamp of last outbound request */
const _wrLastRequestTime = {};

// ─── Helpers: hashing ─────────────────────────────────────────────────────────

/**
 * djb2 hash of a string.  Returns a 12-character lowercase hex string.
 * Used to derive deterministic, compact cache keys.
 * @param {string} str
 * @returns {string}
 */
function _wrHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0; // coerce to 32-bit int
  }
  // Convert to unsigned, then hex, zero-pad to 8 chars
  const hex8 = (h >>> 0).toString(16).padStart(8, '0');
  // Mix in length for extra collision resistance, then take 12 chars total
  const lenHex = (str.length & 0xffff).toString(16).padStart(4, '0');
  return (hex8 + lenHex).slice(0, 12);
}

// ─── Helpers: URL ─────────────────────────────────────────────────────────────

/**
 * Extract the hostname from a URL string.
 * Returns an empty string on any parse error.
 * @param {string} url
 * @returns {string}
 */
function _wrGetHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// ─── Helpers: rate limiter ────────────────────────────────────────────────────

/**
 * Enforces a minimum 1-second gap between successive requests to the same
 * hostname.  Awaits a short sleep if needed, then records the new timestamp.
 * @param {string} url  — full URL (hostname will be extracted)
 */
async function _wrRateLimit(url) {
  const host = _wrGetHostname(url);
  if (!host) return;

  const last = _wrLastRequestTime[host] || 0;
  const elapsed = Date.now() - last;

  if (elapsed < _WR_RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, _WR_RATE_LIMIT_MS - elapsed));
  }

  _wrLastRequestTime[host] = Date.now();
}

// ─── Helpers: retry with exponential backoff ──────────────────────────────────

/**
 * Calls `fn()` up to `maxAttempts` times.
 * On failure waits baseDelay ms, then baseDelay*2, etc.
 * Throws the last error if all attempts fail.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} [maxAttempts=3]
 * @param {number} [baseDelay=1000]
 * @returns {Promise<T>}
 */
async function _wrRetry(fn, maxAttempts = _WR_MAX_ATTEMPTS, baseDelay = _WR_BASE_DELAY_MS) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.warn(`[WebResearch] Attempt ${attempt}/${maxAttempts} failed — retrying in ${delay}ms`, err.message);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ─── Helpers: cache ───────────────────────────────────────────────────────────

/**
 * Retrieve a cached value.
 * Returns the stored data if present and not expired, otherwise null.
 * Expired entries are deleted immediately.
 * @param {string} key  — already-prefixed cache key
 * @returns {*|null}
 */
function _wrCacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (Date.now() > entry.expires) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    // Corrupt entry — silently discard
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return null;
  }
}

/**
 * Remove the N oldest `pulse_wrc_` entries from localStorage.
 * "Oldest" is determined by the `expires` field.
 * @param {number} n
 */
function _wrEvictOldest(n) {
  const entries = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(_WR_CACHE_PREFIX)) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(k));
      entries.push({ key: k, expires: entry.expires || 0 });
    } catch {
      // Unreadable — treat as oldest
      entries.push({ key: k, expires: 0 });
    }
  }

  // Sort ascending (smallest expires = oldest)
  entries.sort((a, b) => a.expires - b.expires);

  const toEvict = entries.slice(0, n);
  for (const { key } of toEvict) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

/**
 * Store a value in the cache with the given TTL.
 * On QuotaExceededError, evicts the 20 oldest entries and retries once.
 * @param {string} key   — already-prefixed cache key
 * @param {*}      data  — any JSON-serialisable value
 * @param {number} ttl   — time-to-live in milliseconds
 */
function _wrCacheSet(key, data, ttl) {
  const entry = JSON.stringify({ data, expires: Date.now() + ttl });

  const tryWrite = () => localStorage.setItem(key, entry);

  try {
    tryWrite();
  } catch (err) {
    if (err.name === 'QuotaExceededError' || err.code === 22) {
      console.warn('[WebResearch] localStorage quota exceeded — evicting 20 oldest cache entries');
      _wrEvictOldest(20);
      try {
        tryWrite();
      } catch (err2) {
        // If it still fails after eviction, skip caching silently
        console.warn('[WebResearch] Cache write failed after eviction — skipping cache', err2.message);
      }
    } else {
      console.warn('[WebResearch] Cache write error', err.message);
    }
  }
}

/**
 * Build a full cache key from an arbitrary request descriptor string.
 * @param {string} descriptor  — e.g. "search:my query:5"
 * @returns {string}
 */
function _wrCacheKey(descriptor) {
  return _WR_CACHE_PREFIX + _wrHash(descriptor);
}

// ─── Settings loader ──────────────────────────────────────────────────────────

/**
 * Load the current user's settings object from IndexedDB.
 * Returns an empty object on any error so callers never need to null-check.
 * @returns {Promise<Object>}
 */
async function _wrLoadSettings() {
  try {
    return (await DB.get(STORES.settings, `settings_${currentUser.id}`)) || {};
  } catch {
    return {};
  }
}

// ─── fetch with timeout ───────────────────────────────────────────────────────

/**
 * Wrapper around fetch() that adds an AbortController timeout.
 * @param {string|URL} url
 * @param {RequestInit} [options]
 * @param {number}      [timeoutMs=15000]
 * @returns {Promise<Response>}
 */
async function _wrFetch(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Text parsing fallback for Jina search ───────────────────────────────────

/**
 * Parse Jina search plain-text response when JSON parsing fails.
 * Looks for blocks of  "Title: …\nURL Source: …\nDescription: …"
 * @param {string} text
 * @returns {Array<{title:string, url:string, snippet:string, content:string}>}
 */
function _wrParseJinaText(text) {
  const results = [];
  // Split by blank lines to get rough blocks
  const blocks = text.split(/\n{2,}/);

  let current = {};
  for (const block of blocks) {
    const lines = block.split('\n');
    for (const line of lines) {
      if (line.startsWith('Title:')) {
        if (current.title) { results.push(current); current = {}; }
        current.title = line.replace(/^Title:\s*/i, '').trim();
      } else if (line.startsWith('URL Source:')) {
        current.url = line.replace(/^URL Source:\s*/i, '').trim();
      } else if (line.startsWith('Description:')) {
        current.snippet = line.replace(/^Description:\s*/i, '').trim();
        current.content = current.snippet;
      }
    }
  }
  if (current.title) results.push(current);

  return results.filter(r => r.title && r.url);
}

// ─── RSS / XML parser ─────────────────────────────────────────────────────────

/**
 * Extract <item> blocks from an RSS XML string and map them to NewsResult objects.
 * Uses simple regex-based extraction — intentionally avoids DOMParser to keep
 * this module dependency-free and sandboxable.
 * @param {string} xml
 * @param {number} maxResults
 * @returns {Array<{title:string, url:string, snippet:string, publishedDate:string}>}
 */
function _wrParseRssItems(xml, maxResults) {
  const items = [];
  // Match every <item>…</item> block (non-greedy, dotAll-style via [\s\S])
  const itemPattern = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let itemMatch;

  while ((itemMatch = itemPattern.exec(xml)) !== null && items.length < maxResults) {
    const block = itemMatch[1];

    const getTag = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'))
             || block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };

    // For <link> the content often sits between tags without attributes
    const linkMatch = block.match(/<link[^>]*>([^<]*)<\/link>/i)
                   || block.match(/<link[^>]*\/?>([^<]+)/i);
    const url = linkMatch ? linkMatch[1].trim() : '';

    // Strip any remaining HTML tags from snippet
    const rawSnippet = getTag('description');
    const snippet = rawSnippet.replace(/<[^>]+>/g, '').trim();

    const title = getTag('title');
    const publishedDate = getTag('pubDate');

    if (title && url) {
      items.push({ title, url, snippet, publishedDate });
    }
  }

  return items;
}

// ╔══════════════════════════════════════════════════════════════════════════════
// ║  PUBLIC API
// ╚══════════════════════════════════════════════════════════════════════════════

/**
 * Search the web for a query.
 *
 * Uses Tavily (if `settings.tavilyApiKey` is set) as the primary provider,
 * falls back to the free Jina.ai search endpoint.
 *
 * @param {string} query
 * @param {Object}  [options]
 * @param {number}  [options.maxResults=5]   — max results to return
 * @param {number}  [options.ttl]            — override default TTL (ms)
 * @returns {Promise<Array<{title:string, url:string, snippet:string, content:string}>>}
 */
async function webSearch(query, { maxResults = 5, ttl } = {}) {
  if (!query || !query.trim()) return [];

  const cacheKey = _wrCacheKey(`search:${query}:${maxResults}`);
  const cacheTtl = ttl ?? WR_TTL.search;

  // ── Cache hit? ────────────────────────────────────────────────────────────
  const cached = _wrCacheGet(cacheKey);
  if (cached) return cached;

  const settings = await _wrLoadSettings();

  // ── Tavily (primary) ──────────────────────────────────────────────────────
  if (settings.tavilyApiKey) {
    try {
      const results = await _wrRetry(async () => {
        const endpoint = 'https://api.tavily.com/search';
        await _wrRateLimit(endpoint);

        const res = await _wrFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: settings.tavilyApiKey,
            query,
            max_results: maxResults,
            include_answer: false,
            include_raw_content: false,
          }),
        }, 20000);

        if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
        const json = await res.json();

        return (json.results || []).map(r => ({
          title:   r.title   || '',
          url:     r.url     || '',
          snippet: r.content || r.snippet || '',
          content: r.content || r.snippet || '',
        }));
      });

      _wrCacheSet(cacheKey, results, cacheTtl);
      return results;
    } catch (err) {
      console.warn('[WebResearch] webSearch — Tavily failed, falling back to Jina', err.message);
    }
  }

  // ── Jina.ai search (free fallback) ────────────────────────────────────────
  try {
    const results = await _wrRetry(async () => {
      const endpoint = `https://s.jina.ai/${encodeURIComponent(query)}`;
      await _wrRateLimit(endpoint);

      const res = await _wrFetch(endpoint, {
        headers: {
          'Accept':           'application/json',
          'X-Retain-Images':  'none',
          'X-No-Cache':       'true',
        },
      }, 20000);

      if (!res.ok) throw new Error(`Jina search HTTP ${res.status}`);

      let mapped = [];
      const text = await res.text();

      try {
        const json = JSON.parse(text);
        const items = Array.isArray(json.data) ? json.data : (json.results || []);
        mapped = items.map(r => ({
          title:   r.title       || '',
          url:     r.url         || '',
          snippet: r.description || r.content || '',
          content: r.content     || r.description || '',
        }));
      } catch {
        // JSON parse failed — fall back to text parsing
        console.warn('[WebResearch] Jina search response was not JSON — using text parser');
        mapped = _wrParseJinaText(text);
      }

      return mapped.slice(0, maxResults);
    });

    _wrCacheSet(cacheKey, results, cacheTtl);
    return results;
  } catch (err) {
    console.warn('[WebResearch] webSearch — Jina fallback also failed', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch and return the readable text content of a URL.
 *
 * Uses Firecrawl (if `settings.firecrawlApiKey` is set) as the primary provider,
 * falls back to the free Jina.ai reader endpoint.
 *
 * @param {string} url
 * @param {Object}  [options]
 * @param {number}  [options.maxChars=6000]           — truncate result to this length
 * @param {number}  [options.ttl]                     — override default TTL (ms)
 * @param {string}  [options.cacheType='reader']      — 'reader' or 'company'
 * @returns {Promise<string>}
 */
async function readUrl(url, { maxChars = 6000, ttl, cacheType = 'reader' } = {}) {
  if (!url || !url.trim()) return '';

  const cacheKey = _wrCacheKey(`readurl:${url}:${maxChars}`);
  const cacheTtl = ttl ?? WR_TTL[cacheType] ?? WR_TTL.reader;

  // ── Cache hit? ────────────────────────────────────────────────────────────
  const cached = _wrCacheGet(cacheKey);
  if (cached) return cached;

  const settings = await _wrLoadSettings();

  // ── Firecrawl (primary) ───────────────────────────────────────────────────
  if (settings.firecrawlApiKey) {
    try {
      const text = await _wrRetry(async () => {
        const endpoint = 'https://api.firecrawl.dev/v1/scrape';
        await _wrRateLimit(endpoint);

        const res = await _wrFetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${settings.firecrawlApiKey}`,
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent: true,
          }),
        }, 25000);

        if (!res.ok) throw new Error(`Firecrawl HTTP ${res.status}`);
        const json = await res.json();
        return json.data?.markdown || '';
      });

      const truncated = text.slice(0, maxChars);
      _wrCacheSet(cacheKey, truncated, cacheTtl);
      return truncated;
    } catch (err) {
      console.warn('[WebResearch] readUrl — Firecrawl failed, falling back to Jina reader', err.message);
    }
  }

  // ── Jina.ai reader (free fallback) ────────────────────────────────────────
  try {
    const text = await _wrRetry(async () => {
      const endpoint = `https://r.jina.ai/${encodeURIComponent(url)}`;
      await _wrRateLimit(endpoint);

      const res = await _wrFetch(endpoint, {
        headers: {
          'Accept':          'text/plain',
          'X-Retain-Images': 'none',
          'X-No-Cache':      'true',
        },
      }, 15000);

      if (!res.ok) throw new Error(`Jina reader HTTP ${res.status}`);
      return await res.text();
    });

    const truncated = text.slice(0, maxChars);
    _wrCacheSet(cacheKey, truncated, cacheTtl);
    return truncated;
  } catch (err) {
    console.warn('[WebResearch] readUrl — Jina reader also failed', err.message);
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search for recent news articles about a topic.
 *
 * Uses Tavily with `topic: 'news'` (if key set); otherwise fetches Google News
 * RSS via the Jina reader and parses the XML response.
 *
 * @param {string} query
 * @param {number} [maxResults=8]
 * @returns {Promise<Array<{title:string, url:string, snippet:string, publishedDate:string}>>}
 */
async function newsSearch(query, maxResults = 8) {
  if (!query || !query.trim()) return [];

  const cacheKey = _wrCacheKey(`news:${query}:${maxResults}`);

  // ── Cache hit? ────────────────────────────────────────────────────────────
  const cached = _wrCacheGet(cacheKey);
  if (cached) return cached;

  const settings = await _wrLoadSettings();

  // ── Tavily news (primary) ─────────────────────────────────────────────────
  if (settings.tavilyApiKey) {
    try {
      const results = await _wrRetry(async () => {
        const endpoint = 'https://api.tavily.com/search';
        await _wrRateLimit(endpoint);

        const res = await _wrFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: settings.tavilyApiKey,
            query,
            topic: 'news',
            max_results: maxResults,
            include_answer: false,
            include_raw_content: false,
          }),
        }, 20000);

        if (!res.ok) throw new Error(`Tavily news HTTP ${res.status}`);
        const json = await res.json();

        return (json.results || []).map(r => ({
          title:         r.title          || '',
          url:           r.url            || '',
          snippet:       r.content        || r.snippet || '',
          publishedDate: r.published_date || '',
        }));
      });

      _wrCacheSet(cacheKey, results, WR_TTL.news);
      return results;
    } catch (err) {
      console.warn('[WebResearch] newsSearch — Tavily failed, falling back to Google News RSS', err.message);
    }
  }

  // ── Google News RSS via Jina reader (free fallback) ───────────────────────
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

    // Use readUrl with a short cache (news TTL) and large maxChars for full RSS
    const xmlText = await readUrl(rssUrl, {
      maxChars:  50000,     // RSS can be verbose
      ttl:       WR_TTL.news,
      cacheType: 'reader',
    });

    const results = _wrParseRssItems(xmlText, maxResults);

    _wrCacheSet(cacheKey, results, WR_TTL.news);
    return results;
  } catch (err) {
    console.warn('[WebResearch] newsSearch — Google News RSS fallback failed', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Research a person by running three searches in parallel and combining the
 * results into a single structured context string ready for callAI().
 *
 * @param {string} fullName
 * @param {string} [company='']
 * @param {string} [title='']
 * @returns {Promise<string>}
 */
async function researchPerson(fullName, company = '', title = '') {
  if (!fullName) return '';

  const namePart    = `"${fullName}"`;
  const companyPart = company ? `"${company}"` : (title ? `"${title}"` : '');

  // Three parallel searches
  const [webResults1, webResults2, newsResults] = await Promise.all([
    webSearch(`${namePart} ${companyPart} background career education`.trim(), { maxResults: 3 }),
    webSearch(`${namePart} hobbies interests family personal`, { maxResults: 3 }),
    newsSearch(`${namePart} ${companyPart}`.trim(), 3),
  ]);

  const allWebResults = [...webResults1, ...webResults2];

  // ── Format web results ────────────────────────────────────────────────────
  let output = `=== WEB SEARCH RESULTS FOR: ${fullName} ===\n\n`;

  if (allWebResults.length === 0) {
    output += 'No web results found.\n';
  } else {
    allWebResults.forEach((r, i) => {
      output += `[Source ${i + 1}: ${r.title || 'Untitled'} | ${r.url || ''}]\n`;
      output += `${(r.snippet || r.content || '').trim()}\n\n`;
    });
  }

  // ── Format news results ───────────────────────────────────────────────────
  output += `=== RECENT NEWS ===\n\n`;

  if (newsResults.length === 0) {
    output += 'No recent news found.\n';
  } else {
    newsResults.forEach((r, i) => {
      const date = r.publishedDate ? ` (${r.publishedDate})` : '';
      output += `[News ${i + 1}: ${r.title || 'Untitled'}${date} | ${r.url || ''}]\n`;
      output += `${(r.snippet || '').trim()}\n\n`;
    });
  }

  return output.trim();
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Research a company by reading its website (if provided) and running web and
 * news searches in parallel.  Returns a structured context string for callAI().
 *
 * @param {string} companyName
 * @param {string} [website='']  — company website URL
 * @param {string} [sector='']   — industry / sector keyword
 * @returns {Promise<string>}
 */
async function researchCompany(companyName, website = '', sector = '') {
  if (!companyName) return '';

  const sectorPart = sector ? ` ${sector}` : '';

  // Three tasks in parallel: website read + web search + news search
  const [websiteText, webResults, newsResults] = await Promise.all([
    website ? readUrl(website, { maxChars: 4000, cacheType: 'company' }) : Promise.resolve(''),
    webSearch(`"${companyName}"${sectorPart} revenue employees founded overview`, { maxResults: 4 }),
    newsSearch(`"${companyName}"${sectorPart}`, 4),
  ]);

  // ── Format website content ────────────────────────────────────────────────
  let output = `=== COMPANY WEBSITE CONTENT ===\n\n`;
  output += (websiteText && websiteText.trim())
    ? websiteText.trim() + '\n'
    : 'No website provided.\n';

  // ── Format web results ────────────────────────────────────────────────────
  output += `\n=== WEB SEARCH RESULTS ===\n\n`;

  if (webResults.length === 0) {
    output += 'No web results found.\n';
  } else {
    webResults.forEach((r, i) => {
      output += `[Source ${i + 1}: ${r.title || 'Untitled'} | ${r.url || ''}]\n`;
      output += `${(r.snippet || r.content || '').trim()}\n\n`;
    });
  }

  // ── Format news results ───────────────────────────────────────────────────
  output += `=== RECENT NEWS ===\n\n`;

  if (newsResults.length === 0) {
    output += 'No recent news found.\n';
  } else {
    newsResults.forEach((r, i) => {
      const date = r.publishedDate ? ` (${r.publishedDate})` : '';
      output += `[News ${i + 1}: ${r.title || 'Untitled'}${date} | ${r.url || ''}]\n`;
      output += `${(r.snippet || '').trim()}\n\n`;
    });
  }

  return output.trim();
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clear all research cache entries from localStorage.
 * @returns {number}  — number of entries removed
 */
function clearResearchCache() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(_WR_CACHE_PREFIX)) keysToRemove.push(k);
  }
  for (const k of keysToRemove) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
  return keysToRemove.length;
}

/**
 * Return statistics about the current research cache.
 * @returns {{ count: number, expiredCount: number, totalKB: number }}
 */
function getResearchCacheStats() {
  let count        = 0;
  let expiredCount = 0;
  let totalBytes   = 0;

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(_WR_CACHE_PREFIX)) continue;

    const raw = localStorage.getItem(k);
    if (!raw) continue;

    count++;
    totalBytes += raw.length * 2; // UTF-16 encoding: 2 bytes per char

    try {
      const entry = JSON.parse(raw);
      if (Date.now() > entry.expires) expiredCount++;
    } catch {
      expiredCount++; // Treat corrupt entries as expired
    }
  }

  return {
    count,
    expiredCount,
    totalKB: Math.round(totalBytes / 1024),
  };
}
