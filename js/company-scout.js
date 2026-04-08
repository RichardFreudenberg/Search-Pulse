/* ============================================
   Pulse — Company Scout: Map-Based Business Discovery
   ============================================ */

// ─── Industry → Search Config ─────────────────────────────────────────────────

const SCOUT_INDUSTRY_MAP = {
  'Healthcare Services': {
    googleQuery: 'medical clinic hospital healthcare services',
    osmTags: ['["amenity"~"clinic|hospital|doctors|pharmacy|dentist"]["name"]'],
  },
  'Technology': {
    googleQuery: 'software technology IT services company',
    osmTags: ['["office"~"software|technology|it"]["name"]'],
  },
  'Business Services': {
    googleQuery: 'business services consulting staffing agency',
    osmTags: ['["office"~"consulting|employment_agency|company"]["name"]'],
  },
  'Industrial': {
    googleQuery: 'manufacturing factory industrial production',
    osmTags: ['["industrial"]["name"]', '["man_made"="works"]["name"]'],
  },
  'Construction / Trades': {
    googleQuery: 'construction contractor HVAC plumbing electrical roofing',
    osmTags: ['["craft"~"builder|electrician|plumber|hvac|roofer|painter"]["name"]'],
  },
  'Distribution': {
    googleQuery: 'distribution logistics warehouse supply chain',
    osmTags: ['["building"="warehouse"]["name"]', '["office"~"logistics|courier"]["name"]'],
  },
  'Food & Beverage': {
    googleQuery: 'restaurant food catering beverage food production',
    osmTags: ['["amenity"~"restaurant|fast_food|cafe|bar|pub"]["name"]'],
  },
  'Consumer': {
    googleQuery: 'retail store consumer goods brand',
    osmTags: ['["shop"]["name"]'],
  },
  'Education': {
    googleQuery: 'school training educational institution tutoring',
    osmTags: ['["amenity"~"school|college|university|driving_school"]["name"]'],
  },
  'Financial Services': {
    googleQuery: 'financial services accounting insurance wealth management',
    osmTags: [
      '["amenity"="bank"]["name"]',
      '["office"~"financial_advisor|insurance|accountant"]["name"]',
    ],
  },
  'Other': {
    googleQuery: 'business company services',
    osmTags: ['["office"]["name"]', '["amenity"]["name"]'],
  },
};

// ─── Page State ───────────────────────────────────────────────────────────────

let _scoutMap      = null;
let _scoutMarker   = null;
let _scoutCircle   = null;
let _scoutLat      = null;
let _scoutLng      = null;
let _scoutLocName  = '';
let _scoutResults  = [];
let _scoutSaved    = new Set(); // indices already saved to Companies

// ─── Main Render ─────────────────────────────────────────────────────────────

async function renderCompanyScout() {
  const pageContent = document.getElementById('page-content');
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  const hasGoogleKey = !!(settings?.googlePlacesApiKey);

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      ${renderPageHeader('Company Scout', 'Click the map to pick a location, choose an industry, and discover real businesses')}

      <!-- Map + Controls -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        <!-- Map -->
        <div class="lg:col-span-2 card p-0 overflow-hidden">
          <div id="scout-map" style="height:460px; width:100%; background:#e8f0fe;"></div>
          <div class="px-4 py-2 border-t border-surface-100 dark:border-surface-800 flex items-center gap-2 text-xs text-surface-500">
            <svg class="w-3.5 h-3.5 text-brand-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
            <span id="scout-location-label">Click anywhere on the map to set your search location</span>
          </div>
        </div>

        <!-- Controls -->
        <div class="flex flex-col gap-4">
          <div class="card flex-1">
            <h3 class="text-sm font-semibold mb-4">Search Settings</h3>

            <div class="space-y-4">
              <div>
                <label class="block text-xs font-medium text-surface-500 mb-1">Industry</label>
                <select id="scout-industry" class="input-field text-sm">
                  ${Object.keys(SCOUT_INDUSTRY_MAP).map(k =>
                    `<option value="${k}">${k}</option>`).join('')}
                </select>
              </div>

              <div>
                <label class="block text-xs font-medium text-surface-500 mb-1">
                  Search Radius: <span id="scout-radius-label">5 km</span>
                </label>
                <input type="range" id="scout-radius" min="1" max="50" value="5" step="1"
                  oninput="scoutUpdateRadius(this.value)"
                  class="w-full accent-brand-600" />
                <div class="flex justify-between text-xs text-surface-400 mt-0.5">
                  <span>1 km</span><span>50 km</span>
                </div>
              </div>

              <div>
                <label class="block text-xs font-medium text-surface-500 mb-2">Data Source</label>
                <div class="flex flex-col gap-2">
                  <label class="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="scout-source" value="google" id="scout-src-google"
                      class="mt-0.5 accent-brand-600" ${hasGoogleKey ? 'checked' : ''} />
                    <div>
                      <div class="text-sm font-medium flex items-center gap-1">
                        <img src="https://www.google.com/favicon.ico" class="w-3.5 h-3.5" /> Google Places
                        ${!hasGoogleKey ? '<span class="text-xs text-amber-500">(key required)</span>' : '<span class="text-xs text-green-600">✓ Ready</span>'}
                      </div>
                      <div class="text-xs text-surface-400">Rich data — website, phone, rating, reviews</div>
                    </div>
                  </label>
                  <label class="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="scout-source" value="osm" id="scout-src-osm"
                      class="mt-0.5 accent-brand-600" ${!hasGoogleKey ? 'checked' : ''} />
                    <div>
                      <div class="text-sm font-medium flex items-center gap-1">
                        🗺 OpenStreetMap
                        <span class="text-xs text-green-600">Free</span>
                      </div>
                      <div class="text-xs text-surface-400">No API key — community-maintained data</div>
                    </div>
                  </label>
                </div>
              </div>

              <button onclick="runCompanyScout()" id="scout-run-btn"
                class="btn-primary w-full flex items-center justify-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg>
                Scout Businesses
              </button>

              ${!hasGoogleKey ? `
                <div class="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  Add a <strong>Google Places API key</strong> in Settings for richer results (website, phone, rating). OpenStreetMap works without any key.
                  <button onclick="navigate('settings')" class="block mt-1 underline">Go to Settings →</button>
                </div>` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Results -->
      <div id="scout-results"></div>
    </div>
  `;

  // Init map after DOM is ready
  requestAnimationFrame(() => initScoutMap());
}

// ─── Map Initialisation ───────────────────────────────────────────────────────

function initScoutMap() {
  if (!window.L) {
    document.getElementById('scout-map').innerHTML =
      '<div class="flex items-center justify-center h-full text-surface-400 text-sm">Map library not loaded — refresh the page</div>';
    return;
  }

  // Destroy old map if re-rendering
  if (_scoutMap) { _scoutMap.remove(); _scoutMap = null; }
  _scoutMarker = null;
  _scoutCircle = null;
  _scoutResults = [];
  _scoutSaved.clear();

  _scoutMap = L.map('scout-map', { zoomControl: true }).setView([30, 10], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(_scoutMap);

  _scoutMap.on('click', (e) => scoutHandleMapClick(e.latlng.lat, e.latlng.lng));

  // Force recalculation of map size after the container is fully painted
  setTimeout(() => _scoutMap && _scoutMap.invalidateSize(), 100);
}

async function scoutHandleMapClick(lat, lng) {
  _scoutLat = lat;
  _scoutLng = lng;

  const radiusKm = parseInt(document.getElementById('scout-radius')?.value || 5);
  const radiusM  = radiusKm * 1000;

  // Update / create marker
  const pinIcon = L.divIcon({
    className: '',
    html: `<div style="background:#4c6ef5;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
    iconSize: [14, 14], iconAnchor: [7, 7],
  });
  if (_scoutMarker) _scoutMarker.setLatLng([lat, lng]);
  else _scoutMarker = L.marker([lat, lng], { icon: pinIcon }).addTo(_scoutMap);

  if (_scoutCircle) _scoutCircle.setLatLng([lat, lng]).setRadius(radiusM);
  else _scoutCircle = L.circle([lat, lng], {
    radius: radiusM, color: '#4c6ef5', fillColor: '#4c6ef5', fillOpacity: 0.08, weight: 2,
  }).addTo(_scoutMap);

  // Reverse-geocode to get a readable place name
  const label = document.getElementById('scout-location-label');
  if (label) label.textContent = 'Looking up location…';
  _scoutLocName = await scoutReverseGeocode(lat, lng);
  if (label) label.textContent = `📍 ${_scoutLocName}  ·  ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

function scoutUpdateRadius(val) {
  const label = document.getElementById('scout-radius-label');
  if (label) label.textContent = `${val} km`;
  if (_scoutCircle && _scoutLat) {
    _scoutCircle.setRadius(parseInt(val) * 1000);
  }
}

async function scoutReverseGeocode(lat, lng) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let r;
    try {
      r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
        { headers: { 'Accept-Language': 'en' }, signal: controller.signal }
      );
    } finally {
      clearTimeout(timer);
    }
    const d = await r.json();
    const a = d.address || {};
    return [a.city || a.town || a.village || a.county, a.state, a.country].filter(Boolean).join(', ');
  } catch {
    return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  }
}

// ─── Run Scout ────────────────────────────────────────────────────────────────

async function runCompanyScout() {
  if (!_scoutLat || !_scoutLng) {
    showToast('Click the map to pick a location first', 'warning');
    return;
  }

  const industry  = document.getElementById('scout-industry').value;
  const radiusKm  = parseInt(document.getElementById('scout-radius').value || 5);
  const radiusM   = radiusKm * 1000;
  const source    = document.querySelector('input[name="scout-source"]:checked')?.value || 'osm';
  const settings  = await DB.get(STORES.settings, `settings_${currentUser.id}`);

  if (source === 'google' && !settings?.googlePlacesApiKey) {
    showToast('Add your Google Places API key in Settings first', 'warning');
    return;
  }

  const btn = document.getElementById('scout-run-btn');
  btn.disabled = true;
  btn.innerHTML = `<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> Scouting…`;

  const resultsEl = document.getElementById('scout-results');
  resultsEl.innerHTML = `<div class="card p-8 text-center animate-pulse text-sm text-surface-500">Searching for ${industry} businesses within ${radiusKm} km of ${_scoutLocName}…</div>`;

  try {
    let raw = [];
    if (source === 'google') {
      raw = await scoutSearchGoogle(_scoutLat, _scoutLng, radiusM, industry, settings.googlePlacesApiKey);
    } else {
      raw = await scoutSearchOsm(_scoutLat, _scoutLng, radiusM, industry);
    }

    _scoutResults = raw;
    _scoutSaved.clear();

    // Drop result markers on map
    raw.forEach(c => {
      if (c._lat && c._lng) {
        const dot = L.circleMarker([c._lat, c._lng], {
          radius: 6, color: '#4c6ef5', fillColor: '#4c6ef5', fillOpacity: 0.7, weight: 2,
        }).addTo(_scoutMap).bindPopup(`<strong>${c.name}</strong><br>${c.address || ''}`);
      }
    });

    renderScoutResults(raw, source);
  } catch (err) {
    resultsEl.innerHTML = `<div class="card p-6 border border-red-200 dark:border-red-800 text-sm text-red-600">Search failed: ${escapeHtml(err.message)}</div>`;
  }

  btn.disabled = false;
  btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/></svg> Scout Businesses`;
}

// ─── Google Places API (New) ──────────────────────────────────────────────────

async function scoutSearchGoogle(lat, lng, radiusM, industry, apiKey) {
  const cfg = SCOUT_INDUSTRY_MAP[industry] || SCOUT_INDUSTRY_MAP['Other'];

  const fieldMask = [
    'places.displayName',
    'places.formattedAddress',
    'places.internationalPhoneNumber',
    'places.websiteUri',
    'places.rating',
    'places.userRatingCount',
    'places.id',
    'places.types',
    'places.businessStatus',
    'places.location',
    'places.primaryType',
  ].join(',');

  let allPlaces = [];
  let pageToken  = null;
  let page       = 0;

  do {
    const body = {
      textQuery: `${cfg.googleQuery} near ${_scoutLocName || ''}`,
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radiusM, 50000) }
      },
      maxResultCount: 20,
      ...(pageToken ? { pageToken } : {}),
    };

    const gController = new AbortController();
    const gTimer = setTimeout(() => gController.abort(), 15000);
    let resp;
    try {
      resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
        signal: gController.signal,
      });
    } finally {
      clearTimeout(gTimer);
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Google API error ${resp.status}`);
    }

    const data = await resp.json();
    allPlaces.push(...(data.places || []));
    pageToken = data.nextPageToken || null;
    page++;
    if (page >= 3) break; // max 60 results (3 pages × 20)
  } while (pageToken);

  return allPlaces
    .filter(p => p.businessStatus !== 'CLOSED_PERMANENTLY')
    .map(p => scoutNormalizeGoogle(p, industry));
}

function scoutNormalizeGoogle(place, industry) {
  return {
    name:        place.displayName?.text || 'Unknown',
    industry,
    website:     place.websiteUri || '',
    phone:       place.internationalPhoneNumber || '',
    address:     place.formattedAddress || '',
    description: place.types?.slice(0, 3).map(t => t.replace(/_/g, ' ')).join(', ') || '',
    size:        '',
    logoUrl:     '',
    _source:     'google',
    _rating:     place.rating || null,
    _reviews:    place.userRatingCount || null,
    _placeId:    place.id || null,
    _lat:        place.location?.latitude || null,
    _lng:        place.location?.longitude || null,
  };
}

// ─── Overpass / OpenStreetMap ─────────────────────────────────────────────────

async function scoutSearchOsm(lat, lng, radiusM, industry) {
  const cfg = SCOUT_INDUSTRY_MAP[industry] || SCOUT_INDUSTRY_MAP['Other'];

  // Build union of all tag filters for this industry
  const unionParts = cfg.osmTags.flatMap(filter => [
    `node${filter}(around:${radiusM},${lat},${lng});`,
    `way${filter}(around:${radiusM},${lat},${lng});`,
  ]).join('\n  ');

  const query = `[out:json][timeout:30];\n(\n  ${unionParts}\n);\nout center tags;`;

  // Try multiple Overpass API mirrors in sequence
  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter',
  ];

  let lastError = null;
  for (const mirror of mirrors) {
    try {
      // Use AbortController instead of AbortSignal.timeout for broad browser support
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000);

      let resp;
      try {
        resp = await fetch(mirror, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}${txt ? ': ' + txt.slice(0, 120) : ''}`);
      }

      const data = await resp.json();
      const elements = (data.elements || []).filter(el => el.tags?.name);

      if (elements.length === 0 && data.elements?.length === 0) {
        // Valid response but no results — return empty, don't try next mirror
        return [];
      }

      return elements.map(el => scoutNormalizeOsm(el, industry));
    } catch (err) {
      if (err.name === 'AbortError') {
        lastError = new Error(`Request timed out on ${mirror}`);
      } else {
        lastError = err;
      }
      // Try next mirror
    }
  }

  throw new Error(`All Overpass API mirrors failed. Last error: ${lastError?.message || 'unknown'}`);
}

function scoutNormalizeOsm(el, industry) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat ?? null;
  const lng = el.lon ?? el.center?.lon ?? null;

  const addressParts = [
    t['addr:housenumber'] ? `${t['addr:housenumber']} ${t['addr:street'] || ''}` : t['addr:street'],
    t['addr:city'],
    t['addr:state'] || t['addr:country'],
  ].filter(Boolean);

  return {
    name:        t.name || 'Unknown',
    industry,
    website:     t.website || t['contact:website'] || t['url'] || '',
    phone:       t.phone || t['contact:phone'] || t['phone:mobile'] || '',
    address:     addressParts.join(', '),
    description: [t.amenity, t.office, t.craft, t.shop, t.industrial]
                   .filter(Boolean).map(s => s.replace(/_/g, ' ')).join(', '),
    size:        '',
    logoUrl:     '',
    _source:     'osm',
    _osmId:      el.id || null,
    _lat:        lat,
    _lng:        lng,
  };
}

// ─── Results Rendering ────────────────────────────────────────────────────────

function renderScoutResults(results, source) {
  const el = document.getElementById('scout-results');
  if (!el) return;

  if (!results.length) {
    el.innerHTML = `
      <div class="card p-10 text-center text-surface-400">
        <p class="text-sm font-medium mb-1">No businesses found in this area</p>
        <p class="text-xs">Try a larger radius, different industry, or different location</p>
        ${source === 'osm' ? '<p class="text-xs mt-2">OpenStreetMap coverage varies by region — Google Places often has more data</p>' : ''}
      </div>`;
    return;
  }

  const sourceBadge = source === 'google'
    ? '<img src="https://www.google.com/favicon.ico" class="w-3 h-3 inline mr-1" />Google Places'
    : '🗺 OpenStreetMap';

  el.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <p class="text-sm text-surface-500">
        <strong>${results.length}</strong> businesses found via ${sourceBadge} · ${_scoutLocName}
      </p>
      <button onclick="scoutSaveAll()" class="btn-secondary btn-sm">Save All to Companies</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="scout-cards-grid">
      ${results.map((c, i) => renderScoutCard(c, i)).join('')}
    </div>`;
}

function renderScoutCard(company, index) {
  const domain = company.website
    ? (() => { try { return new URL(company.website).hostname.replace('www.', ''); } catch { return ''; } })()
    : '';
  const logoUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';

  const stars = company._rating
    ? '★'.repeat(Math.round(company._rating)) + '☆'.repeat(5 - Math.round(company._rating))
    : null;

  return `
    <div id="scout-card-${index}" class="card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <!-- Header -->
      <div class="flex items-start gap-3">
        ${logoUrl
          ? `<div class="w-9 h-9 rounded-lg bg-white border border-surface-100 flex items-center justify-center flex-shrink-0 overflow-hidden"><img src="${escapeHtml(logoUrl)}" class="w-6 h-6 object-contain" onerror="this.style.display='none'" /></div>`
          : `<div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-sm font-bold" style="background:${avatarColor(company.name)}">${getInitials(company.name)}</div>`
        }
        <div class="flex-1 min-w-0">
          <h3 class="text-sm font-semibold leading-snug">${escapeHtml(company.name)}</h3>
          <p class="text-xs text-surface-500 truncate">${escapeHtml(company.industry)}</p>
        </div>
        <span class="text-xs px-1.5 py-0.5 rounded-full ${company._source === 'google'
          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300'
          : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300'} whitespace-nowrap flex-shrink-0">
          ${company._source === 'google' ? 'G' : 'OSM'}
        </span>
      </div>

      <!-- Details -->
      <div class="space-y-1 text-xs text-surface-500">
        ${company.address ? `<div class="flex gap-1.5"><span class="flex-shrink-0">📍</span><span class="truncate">${escapeHtml(company.address)}</span></div>` : ''}
        ${company.phone   ? `<div class="flex gap-1.5"><span class="flex-shrink-0">📞</span><span>${escapeHtml(company.phone)}</span></div>` : ''}
        ${company.website ? `<div class="flex gap-1.5"><span class="flex-shrink-0">🌐</span><a href="${escapeHtml(company.website)}" target="_blank" rel="noopener" class="text-brand-600 hover:underline truncate">${escapeHtml(domain)}</a></div>` : ''}
        ${company.description ? `<div class="flex gap-1.5"><span class="flex-shrink-0">🏷</span><span class="truncate">${escapeHtml(company.description)}</span></div>` : ''}
      </div>

      <!-- Rating (Google only) -->
      ${stars ? `
        <div class="flex items-center gap-1.5 text-xs">
          <span class="text-yellow-500">${stars}</span>
          <span class="text-surface-500">${company._rating.toFixed(1)} (${company._reviews?.toLocaleString() || '?'} reviews)</span>
        </div>` : ''}

      <!-- Actions -->
      <div class="flex gap-2 mt-auto pt-1">
        <button id="scout-save-${index}" onclick="scoutSaveCompany(${index})"
          class="btn-primary btn-sm flex-1 text-xs">
          + Save to Companies
        </button>
        <button onclick="scoutAddToDeal(${index})" class="btn-secondary btn-sm text-xs">
          + Pipeline
        </button>
        ${company._lat && company._lng
          ? `<a href="https://www.google.com/maps/search/?api=1&query=${company._lat},${company._lng}" target="_blank" rel="noopener" class="btn-secondary btn-sm text-xs">Map</a>`
          : ''}
      </div>
    </div>`;
}

// ─── Save Actions ─────────────────────────────────────────────────────────────

async function scoutSaveCompany(index) {
  if (_scoutSaved.has(index)) return;
  const company = _scoutResults[index];
  if (!company) return;

  try {
    // Check for duplicate name
    const existing = await DB.getForUser(STORES.companies, currentUser.id);
    if (existing.some(c => c.name.toLowerCase() === company.name.toLowerCase())) {
      showToast(`"${company.name}" already exists in Companies`, 'warning');
      return;
    }

    await DB.add(STORES.companies, {
      id: generateId(),
      userId:      currentUser.id,
      name:        company.name,
      industry:    company.industry,
      size:        company.size || '',
      website:     company.website || '',
      phone:       company.phone || '',
      address:     company.address || '',
      logoUrl:     '',
      description: company.description || '',
      notes:       `Discovered via Company Scout (${company._source === 'google' ? 'Google Places' : 'OpenStreetMap'}) in ${_scoutLocName}`,
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    });

    _scoutSaved.add(index);
    const btn = document.getElementById(`scout-save-${index}`);
    if (btn) {
      btn.textContent = '✓ Saved';
      btn.disabled = true;
      btn.className = 'btn-sm flex-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg px-2 py-1';
    }
    showToast(`"${company.name}" saved to Companies`, 'success');
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}

async function scoutSaveAll() {
  let saved = 0;
  for (let i = 0; i < _scoutResults.length; i++) {
    if (!_scoutSaved.has(i)) {
      await scoutSaveCompany(i);
      saved++;
    }
  }
  showToast(`Saved ${saved} companies`, 'success');
}

async function scoutAddToDeal(index) {
  const company = _scoutResults[index];
  if (!company) return;
  try {
    await DB.add(STORES.deals, {
      id:          generateId(),
      userId:      currentUser.id,
      name:        company.name,
      stage:       'Initial Review',
      sector:      company.industry || '',
      location:    company.address || _scoutLocName || '',
      website:     company.website || '',
      source:      `Company Scout (${company._source === 'google' ? 'Google Places' : 'OpenStreetMap'})`,
      description: company.description || '',
      notes:       company.phone ? `Phone: ${company.phone}` : '',
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    });
    showToast(`"${company.name}" added to Deal Pipeline`, 'success');
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
}
