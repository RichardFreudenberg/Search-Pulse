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

let _scoutMap           = null;
let _scoutMarker        = null;
let _scoutCircle        = null;
let _scoutLat           = null;
let _scoutLng           = null;
let _scoutLocName       = '';
let _scoutResults       = [];
let _scoutSaved         = new Set(); // indices already saved to Companies
let _pipelineCompanies  = [];        // companies fetched by the Bundesanzeiger pipeline
let _scoutMode          = 'map';     // 'map' | 'pipeline'

// ─── Main Render ─────────────────────────────────────────────────────────────

async function renderCompanyScout() {
  const pageContent = document.getElementById('page-content');
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  const hasGoogleKey = !!(settings?.googlePlacesApiKey);

  // Load pipeline companies count for badge
  let pipelineCount = 0;
  try {
    const allCompanies = await DB.getForUser(STORES.companies, currentUser.id);
    _pipelineCompanies = allCompanies.filter(c => c.source === 'pipeline');
    pipelineCount = _pipelineCompanies.length;
  } catch (_) {}

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      ${renderPageHeader('Company Scout', 'Discover businesses on the map or browse pipeline-fetched companies')}

      <!-- ── Mode toggle ───────────────────────────────────────────────────── -->
      <div class="flex gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-xl mb-6 w-fit">
        <button id="scout-tab-map"
          onclick="scoutSwitchMode('map')"
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                 ${_scoutMode === 'map'
                   ? 'bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-surface-100'
                   : 'text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497z"/>
          </svg>
          Map Scout
        </button>
        <button id="scout-tab-pipeline"
          onclick="scoutSwitchMode('pipeline')"
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                 ${_scoutMode === 'pipeline'
                   ? 'bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-surface-100'
                   : 'text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100'}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"/>
          </svg>
          Pipeline Companies
          ${pipelineCount > 0 ? `<span class="ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">${pipelineCount}</span>` : ''}
        </button>
      </div>

      <!-- ── Map Scout panel ───────────────────────────────────────────────── -->
      <div id="scout-map-panel" class="${_scoutMode !== 'map' ? 'hidden' : ''}">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

          <!-- Map -->
          <div class="lg:col-span-2 card p-0 overflow-hidden">
            <div id="scout-map" style="height:460px; width:100%; background:#e8f0fe;"></div>
            <div class="px-4 py-2 border-t border-surface-100 dark:border-surface-800 flex items-center gap-2 text-xs text-surface-500">
              <svg class="w-3.5 h-3.5 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
              </svg>
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
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
                  </svg>
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

        <!-- Map results -->
        <div id="scout-results"></div>
      </div>

      <!-- ── Pipeline Companies panel ──────────────────────────────────────── -->
      <div id="scout-pipeline-panel" class="${_scoutMode !== 'pipeline' ? 'hidden' : ''}">
        <div id="pipeline-companies-section"></div>
      </div>

    </div>
  `;

  // Init map if starting in map mode
  if (_scoutMode === 'map') {
    requestAnimationFrame(() => initScoutMap());
  }

  // Render pipeline panel if starting there, or pre-populate for badge accuracy
  renderPipelineSection(_pipelineCompanies);
}

// ─── Mode switch ──────────────────────────────────────────────────────────────

function scoutSwitchMode(mode) {
  _scoutMode = mode;

  const mapPanel      = document.getElementById('scout-map-panel');
  const pipelinePanel = document.getElementById('scout-pipeline-panel');
  const tabMap        = document.getElementById('scout-tab-map');
  const tabPipeline   = document.getElementById('scout-tab-pipeline');

  const activeClass   = 'bg-white dark:bg-surface-700 shadow-sm text-surface-900 dark:text-surface-100';
  const inactiveClass = 'text-surface-500 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100';

  if (mode === 'map') {
    mapPanel?.classList.remove('hidden');
    pipelinePanel?.classList.add('hidden');
    tabMap?.classList.remove(...inactiveClass.split(' '));
    tabMap?.classList.add(...activeClass.split(' '));
    tabPipeline?.classList.remove(...activeClass.split(' '));
    tabPipeline?.classList.add(...inactiveClass.split(' '));
    // Init map if not yet done
    if (!_scoutMap) requestAnimationFrame(() => initScoutMap());
    else setTimeout(() => _scoutMap?.invalidateSize(), 50);
  } else {
    pipelinePanel?.classList.remove('hidden');
    mapPanel?.classList.add('hidden');
    tabPipeline?.classList.remove(...inactiveClass.split(' '));
    tabPipeline?.classList.add(...activeClass.split(' '));
    tabMap?.classList.remove(...activeClass.split(' '));
    tabMap?.classList.add(...inactiveClass.split(' '));
  }
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
        <span class="text-xs px-1.5 py-0.5 rounded ${company._source === 'google'
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

// ─── Pipeline Companies Section ───────────────────────────────────────────────

function renderPipelineSection(companies) {
  const el = document.getElementById('pipeline-companies-section');
  if (!el) return;

  if (!companies.length) {
    el.innerHTML = `
      <div class="card p-12 text-center text-surface-400">
        <div class="text-4xl mb-4">🏭</div>
        <p class="text-sm font-semibold mb-1">No pipeline companies yet</p>
        <p class="text-xs text-surface-500 max-w-sm mx-auto mt-1">
          Run the Python pipeline to fetch companies from Bundesanzeiger and Unternehmensregister.
          They'll appear here automatically once synced to Firestore.
        </p>
        <div class="mt-4 px-4 py-3 rounded-lg bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-left text-xs text-surface-600 dark:text-surface-400 max-w-sm mx-auto font-mono">
          python pipeline/run_simple.py --query "GmbH München" --sync
        </div>
      </div>`;
    return;
  }

  // Group stats
  const bySource = {};
  companies.forEach(c => {
    const src = (c._pipeline?.data_source || c.source || 'pipeline');
    bySource[src] = (bySource[src] || 0) + 1;
  });
  const sourceChips = Object.entries(bySource).map(([src, n]) =>
    `<span class="px-2 py-0.5 rounded-full text-xs bg-surface-100 dark:bg-surface-800 text-surface-500">${src}: ${n}</span>`
  ).join('');

  el.innerHTML = `
    <div>
      <!-- Header row -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div class="flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-semibold">${companies.length.toLocaleString()} companies fetched from registry</span>
            <div class="flex gap-1.5 flex-wrap">${sourceChips}</div>
          </div>
          <p class="text-xs text-surface-500 mt-0.5">Click <strong>+ Pipeline</strong> to move any company into your active deal flow</p>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <input type="text" id="pipeline-search-input"
            placeholder="Filter by name, city, legal form…"
            oninput="filterPipelineCompanies(this.value)"
            class="input-field text-sm w-56" />
          <select id="pipeline-source-filter" onchange="filterPipelineCompanies(document.getElementById('pipeline-search-input').value)"
            class="input-field text-sm w-36">
            <option value="">All sources</option>
            ${Object.keys(bySource).map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" id="pipeline-cards-grid">
        ${companies.map(c => renderPipelineCard(c)).join('')}
      </div>
    </div>
  `;
}

// Format EUR values: ≥1M → "€1.2M", ≥1k → "€123k", else "€999"
function _fmtEur(val) {
  if (val == null) return null;
  const abs = Math.abs(val);
  const sign = val < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}€${Math.round(abs / 1_000)}k`;
  return `${sign}€${Math.round(abs)}`;
}

function renderPipelineCard(c) {
  const city   = c.location || '';
  const desc   = c.description || '';
  const hrNum  = c.hrNumber || '';
  const safeId = (c.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const src    = c._pipeline?.data_source || 'pipeline';
  const srcLabel = src === 'bundesanzeiger' ? 'BA'
                 : src === 'unternehmensregister' ? 'UR'
                 : 'Pipeline';

  // Financial data — stored under _pipeline.financials in Firestore
  const fin = c._pipeline?.financials || null;

  let financialsHtml = '';
  if (fin) {
    const year        = fin.fiscal_year ? `FY${fin.fiscal_year}` : '';
    const quality     = fin.data_quality || '';
    const qualityColor = quality === 'pdf_parsed'    ? 'text-green-600 dark:text-green-400'
                       : quality === 'llm_extracted' ? 'text-amber-600 dark:text-amber-400'
                       :                               'text-surface-400';
    const qualityLabel = quality === 'pdf_parsed'    ? 'PDF'
                       : quality === 'llm_extracted' ? 'LLM'
                       : quality === 'html_parsed'   ? 'HTML'
                       : quality;

    const rows = [
      { label: 'Revenue',    val: _fmtEur(fin.revenue),    bold: true  },
      { label: 'Gross Profit', val: _fmtEur(fin.gross_profit) },
      { label: 'EBITDA',     val: _fmtEur(fin.ebitda),
        extra: fin.ebitda_margin_pct != null ? `(${fin.ebitda_margin_pct.toFixed(1)}%)` : '' },
      { label: 'EBIT',       val: _fmtEur(fin.ebit) },
      { label: 'Net Income', val: _fmtEur(fin.net_income),
        extra: fin.net_margin_pct != null ? `(${fin.net_margin_pct.toFixed(1)}%)` : '',
        highlight: fin.net_income != null && fin.net_income < 0 },
      { label: 'Employees',  val: fin.employees != null ? fin.employees.toLocaleString() : null },
    ].filter(r => r.val != null);

    if (rows.length) {
      financialsHtml = `
        <div class="border-t border-surface-100 dark:border-surface-700 pt-2.5 mt-0.5">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-semibold text-surface-600 dark:text-surface-300">
              P&amp;L ${year}
            </span>
            ${qualityLabel ? `<span class="text-[10px] ${qualityColor}">${qualityLabel}</span>` : ''}
          </div>
          <div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
            ${rows.map(r => `
              <span class="text-[11px] text-surface-500">${r.label}</span>
              <span class="text-[11px] text-right font-medium
                ${r.bold ? 'text-surface-800 dark:text-surface-200' : ''}
                ${r.highlight ? 'text-red-600 dark:text-red-400' : 'text-surface-700 dark:text-surface-300'}">
                ${r.val}${r.extra ? `<span class="ml-1 font-normal text-surface-400">${r.extra}</span>` : ''}
              </span>`).join('')}
          </div>
        </div>`;
    }
  }

  const rawId = c.id || '';
  return `
    <div class="card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow" id="pipeline-card-${safeId}">
      <!-- Clickable body → opens detail drawer -->
      <div class="flex flex-col gap-2 cursor-pointer" onclick="openPipelineCompanyDetail('${safeId}')">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
            style="background:${avatarColor(c.name)}">${getInitials(c.name)}</div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-semibold leading-snug">${escapeHtml(c.name)}</h3>
            ${city ? `<p class="text-xs text-surface-500">${escapeHtml(city)}</p>` : ''}
          </div>
          <span class="text-xs px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300 whitespace-nowrap flex-shrink-0">${srcLabel}</span>
        </div>
        ${desc  ? `<p class="text-xs text-surface-500 line-clamp-2">${escapeHtml(desc)}</p>` : ''}
        ${hrNum ? `<p class="text-xs text-surface-400">HR: ${escapeHtml(hrNum)}</p>` : ''}
        ${financialsHtml}
        ${!fin ? `<p class="text-[11px] text-surface-400 italic">Click to view details →</p>` : ''}
      </div>
      <!-- Action buttons — stop propagation so they don't open the drawer -->
      <div class="flex gap-2 mt-auto pt-1 border-t border-surface-100 dark:border-surface-700/50">
        <button onclick="event.stopPropagation(); pipelinePromoteToCompany('${safeId}')" id="pipeline-promote-${safeId}"
          class="btn-secondary btn-sm flex-1 text-xs">
          + Companies
        </button>
        <button onclick="event.stopPropagation(); pipelineAddToDeal('${safeId}')" id="pipeline-deal-${safeId}"
          class="btn-primary btn-sm flex-1 text-xs">
          + Deals
        </button>
        <button onclick="event.stopPropagation(); openPipelineCompanyDetail('${safeId}')"
          class="btn-secondary btn-sm text-xs px-2" title="View details">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// Promote a pipeline company into the Companies tab
// Updates source in Firestore so it passes the companies.js filter
async function pipelinePromoteToCompany(companyId) {
  const company = _pipelineCompanies.find(c => c.id === companyId);
  if (!company) return;

  const btn = document.getElementById(`pipeline-promote-${companyId}`);
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    // Update the source field so it's no longer filtered out of Companies tab
    await DB.put(STORES.companies, {
      ...company,
      source:    'scout',          // no longer 'pipeline' → now visible in Companies tab
      updatedAt: new Date().toISOString(),
    });

    // Remove from local pipeline list so it disappears from this tab
    _pipelineCompanies = _pipelineCompanies.filter(c => c.id !== companyId);
    const card = document.getElementById(`pipeline-card-${companyId}`);
    if (card) card.remove();

    showToast(`"${company.name}" added to Companies ✓`, 'success');
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '+ Add to Companies'; }
  }
}

function filterPipelineCompanies(query) {
  const q          = (query || '').toLowerCase();
  const srcFilter  = document.getElementById('pipeline-source-filter')?.value || '';

  const filtered = _pipelineCompanies.filter(c => {
    if (srcFilter) {
      const src = c._pipeline?.data_source || c.source || 'pipeline';
      if (src !== srcFilter) return false;
    }
    if (q) {
      return (
        (c.name        || '').toLowerCase().includes(q) ||
        (c.location    || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.hrNumber    || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const grid = document.getElementById('pipeline-cards-grid');
  if (grid) {
    grid.innerHTML = filtered.length
      ? filtered.map(c => renderPipelineCard(c)).join('')
      : `<div class="col-span-3 card p-8 text-center text-surface-400 text-sm">No companies match your filter</div>`;
  }
}

async function pipelineAddToDeal(companyId) {
  const company = _pipelineCompanies.find(c => c.id === companyId);
  if (!company) return;

  try {
    await DB.add(STORES.deals, {
      id:          generateId(),
      userId:      currentUser.id,
      name:        company.name,
      stage:       'Initial Review',
      sector:      company.industry || '',
      location:    company.location || '',
      website:     company.website  || '',
      source:      'Bundesanzeiger Pipeline',
      description: company.description || '',
      notes:       company.hrNumber ? `HR-Nr: ${company.hrNumber}` : '',
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    });
    showToast(`"${company.name}" added to Pipeline`, 'success');
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
}

// ─── Pipeline Company Detail Drawer ──────────────────────────────────────────

let _detailEscListener = null;

function openPipelineCompanyDetail(companyId) {
  // Find company by safe id (we sanitised id to alphanum/dash/underscore in the card)
  const company = _pipelineCompanies.find(c =>
    c.id === companyId || (c.id || '').replace(/[^a-zA-Z0-9_-]/g, '_') === companyId
  );
  if (!company) return;

  // Remove any existing drawer
  document.getElementById('pipeline-detail-overlay')?.remove();
  if (_detailEscListener) document.removeEventListener('keydown', _detailEscListener);

  const overlay = document.createElement('div');
  overlay.id = 'pipeline-detail-overlay';
  overlay.className = 'fixed inset-0 z-50 flex justify-end';
  overlay.style.cssText = 'animation:fadeIn .15s ease';
  overlay.innerHTML = `
    <style>
      @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
      @keyframes slideIn  { from { transform:translateX(100%) } to { transform:translateX(0) } }
    </style>
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="closePipelineDetail()"></div>
    <div class="relative w-full max-w-lg bg-white dark:bg-surface-900 shadow-2xl flex flex-col overflow-hidden"
         style="animation:slideIn .2s cubic-bezier(.25,.46,.45,.94); max-height:100vh">
      ${_renderDetailContent(company)}
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  _detailEscListener = (e) => { if (e.key === 'Escape') closePipelineDetail(); };
  document.addEventListener('keydown', _detailEscListener);
}

function closePipelineDetail() {
  document.getElementById('pipeline-detail-overlay')?.remove();
  document.body.style.overflow = '';
  if (_detailEscListener) {
    document.removeEventListener('keydown', _detailEscListener);
    _detailEscListener = null;
  }
}

function _renderDetailContent(c) {
  const safeId   = (c.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const city     = c.location || '';
  const desc     = c.description || '';
  const hrNum    = c.hrNumber || '';
  const court    = c._pipeline?.court || '';
  const src      = c._pipeline?.data_source || 'pipeline';
  const srcFull  = src === 'bundesanzeiger' ? 'Bundesanzeiger'
                 : src === 'unternehmensregister' ? 'Unternehmensregister'
                 : 'Pipeline';
  const fin      = c._pipeline?.financials || null;
  const synced   = (c._pipeline?.last_synced_at || '').slice(0, 10);
  const nameEnc  = encodeURIComponent(c.name);
  const cityEnc  = city ? encodeURIComponent(city) : '';
  const hrSlug   = hrNum.replace(/\s+/g, '+');

  return `
    <!-- ── Sticky header ───────────────────────────────────────────────── -->
    <div class="flex items-start justify-between p-5 border-b border-surface-200 dark:border-surface-700 flex-shrink-0">
      <div class="flex items-start gap-3 min-w-0">
        <div class="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style="background:${avatarColor(c.name)}">${getInitials(c.name)}</div>
        <div class="min-w-0">
          <h2 class="text-base font-bold leading-snug">${escapeHtml(c.name)}</h2>
          <div class="flex flex-wrap items-center gap-1.5 mt-1">
            ${city ? `<span class="text-xs text-surface-500">📍 ${escapeHtml(city)}</span>` : ''}
            <span class="text-xs px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300">${srcFull}</span>
            ${fin ? `<span class="text-xs px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300">📊 P&L available</span>` : ''}
            ${c.status && c.status !== 'active' ? `<span class="text-xs px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600">${escapeHtml(c.status)}</span>` : ''}
          </div>
        </div>
      </div>
      <button onclick="closePipelineDetail()"
        class="flex-shrink-0 ml-2 p-1.5 rounded-lg text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- ── Scrollable body ─────────────────────────────────────────────── -->
    <div class="flex-1 overflow-y-auto p-5 space-y-6">

      <!-- Registry Info -->
      <section>
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-surface-400 mb-3">Registry Information</h3>
        <div class="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
          ${hrNum   ? `<div><p class="text-xs text-surface-400 mb-0.5">HR Number</p><p class="font-semibold font-mono text-sm">${escapeHtml(hrNum)}</p></div>` : ''}
          ${court   ? `<div><p class="text-xs text-surface-400 mb-0.5">Register Court</p><p class="font-semibold">${escapeHtml(court)}</p></div>` : ''}
          ${c.type  ? `<div><p class="text-xs text-surface-400 mb-0.5">Legal Form</p><p class="font-semibold">${escapeHtml(c.type)}</p></div>` : ''}
          ${c.status? `<div><p class="text-xs text-surface-400 mb-0.5">Status</p><p class="font-semibold capitalize">${escapeHtml(c.status)}</p></div>` : ''}
          <div><p class="text-xs text-surface-400 mb-0.5">Source</p><p class="font-semibold">${escapeHtml(srcFull)}</p></div>
          ${synced  ? `<div><p class="text-xs text-surface-400 mb-0.5">Last Synced</p><p class="font-semibold">${escapeHtml(synced)}</p></div>` : ''}
        </div>
      </section>

      ${desc ? `
      <!-- Business Description -->
      <section>
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-surface-400 mb-3">Business Description</h3>
        <p class="text-sm text-surface-700 dark:text-surface-300 leading-relaxed">${escapeHtml(desc)}</p>
      </section>` : ''}

      <!-- Financials -->
      <section>
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-surface-400 mb-3">P&amp;L Financials</h3>
        ${fin ? _renderDetailPL(fin) : `
          <div class="rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 p-5 text-center">
            <p class="text-sm text-surface-400 mb-2">No financial data yet</p>
            <p class="text-xs text-surface-400">Run the pipeline to fetch P&amp;L from Bundesanzeiger:</p>
            <code class="inline-block mt-2 text-xs font-mono bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-1.5">
              python pipeline/run_simple.py --financials --sync
            </code>
          </div>`}
      </section>

      <!-- Officers & Ownership -->
      <section>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[11px] font-semibold uppercase tracking-wider text-surface-400">Officers &amp; Ownership</h3>
          ${hrNum ? `
            <button onclick="pipelineFetchOfficers('${safeId}')" id="fetch-officers-btn-${safeId}"
              class="btn-secondary btn-sm text-xs flex items-center gap-1.5">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Fetch from Handelsregister
            </button>` : ''}
        </div>
        <div id="detail-officers-${safeId}">
          <p class="text-xs text-surface-400 italic">
            ${hrNum
              ? 'Click "Fetch from Handelsregister" to load managing directors and officers (requires Apify key in Settings).'
              : 'No HR number — cannot automatically look up officers.'}
          </p>
        </div>
      </section>

      <!-- Research Links -->
      <section>
        <h3 class="text-[11px] font-semibold uppercase tracking-wider text-surface-400 mb-3">Research Sources</h3>
        <div class="grid grid-cols-2 gap-2">
          <a href="https://www.northdata.de/${nameEnc}${cityEnc ? ',+' + cityEnc : ''}${hrSlug ? '/' + hrSlug : ''}"
             target="_blank" rel="noopener"
             class="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors">
            <span class="text-base leading-none">📊</span>
            <div><p class="text-xs font-semibold">North Data</p><p class="text-[10px] text-surface-400">Revenue, owners, history</p></div>
          </a>
          <a href="https://www.bundesanzeiger.de/pub/de/suche?q=${nameEnc}&fts=true"
             target="_blank" rel="noopener"
             class="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors">
            <span class="text-base leading-none">🏛</span>
            <div><p class="text-xs font-semibold">Bundesanzeiger</p><p class="text-[10px] text-surface-400">Annual accounts</p></div>
          </a>
          <a href="https://www.unternehmensregister.de/ureg/result.html?fulltext=${nameEnc}"
             target="_blank" rel="noopener"
             class="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors">
            <span class="text-base leading-none">📂</span>
            <div><p class="text-xs font-semibold">Unternehmensregister</p><p class="text-[10px] text-surface-400">Filings &amp; disclosures</p></div>
          </a>
          <a href="https://www.handelsregister.de/rp_web/mask.do?Typ=n"
             target="_blank" rel="noopener"
             class="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors">
            <span class="text-base leading-none">📋</span>
            <div><p class="text-xs font-semibold">Handelsregister.de</p><p class="text-[10px] text-surface-400">Official register</p></div>
          </a>
        </div>
      </section>

    </div>

    <!-- ── Sticky footer actions ────────────────────────────────────────── -->
    <div class="flex-shrink-0 p-4 border-t border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/80 flex gap-2">
      <button onclick="pipelinePromoteToCompany('${safeId}'); closePipelineDetail();"
        id="detail-promote-${safeId}"
        class="btn-secondary flex-1 text-sm">
        + Add to Companies
      </button>
      <button onclick="pipelineAddToDeal('${safeId}'); closePipelineDetail();"
        class="btn-primary flex-1 text-sm">
        + Add to Deals
      </button>
    </div>`;
}

function _renderDetailPL(fin) {
  const year  = fin.fiscal_year ? `FY${fin.fiscal_year}` : '';
  const qlMap = { pdf_parsed: 'PDF parsed', llm_extracted: 'LLM extracted', html_parsed: 'HTML parsed' };
  const qlLabel = qlMap[fin.data_quality] || fin.data_quality || '';
  const rev   = fin.revenue;

  const pct = (val) => (rev && val != null) ? (val / rev * 100).toFixed(1) + '%' : null;

  const rows = [
    { label: 'Revenue',         val: fin.revenue,          pct: null,                  bold: true },
    { label: 'Gross Profit',    val: fin.gross_profit,     pct: pct(fin.gross_profit)              },
    { label: 'EBITDA',          val: fin.ebitda,           pct: fin.ebitda_margin_pct != null ? fin.ebitda_margin_pct.toFixed(1) + '%' : pct(fin.ebitda), accent: true },
    { label: 'Depreciation',    val: fin.depreciation,     pct: null,                  indent: true },
    { label: 'EBIT',            val: fin.ebit,             pct: pct(fin.ebit)                      },
    { label: 'Interest',        val: fin.interest,         pct: null,                  indent: true },
    { label: 'EBT',             val: fin.ebt,              pct: null                               },
    { label: 'Taxes',           val: fin.taxes,            pct: null,                  indent: true },
    { label: 'Net Income',      val: fin.net_income,       pct: fin.net_margin_pct != null ? fin.net_margin_pct.toFixed(1) + '%' : pct(fin.net_income), bold: true, isNetIncome: true },
    { label: 'Personnel Costs', val: fin.personnel_costs,  pct: pct(fin.personnel_costs)            },
    { label: 'Employees',       val: fin.employees != null ? fin.employees : null, isCount: true   },
  ].filter(r => r.val != null);

  if (!rows.length) return `<p class="text-xs text-surface-400 italic">No data extracted from filing.</p>`;

  const rowsHtml = rows.map((r, i) => {
    const display   = r.isCount ? r.val.toLocaleString() + ' employees' : _fmtEur(r.val);
    const isNeg     = !r.isCount && r.val < 0;
    const valClass  = r.isNetIncome && isNeg ? 'text-red-600 dark:text-red-400'
                    : r.bold || r.accent    ? 'text-surface-900 dark:text-surface-100'
                    :                         'text-surface-700 dark:text-surface-300';
    const labelClass = r.indent ? 'pl-4 text-surface-400'
                     : r.bold   ? 'font-semibold text-surface-700 dark:text-surface-200'
                     :            'text-surface-600 dark:text-surface-400';
    const rowBg     = r.accent ? 'bg-brand-50/60 dark:bg-brand-900/10' : (i % 2 === 0 ? '' : 'bg-surface-50/60 dark:bg-surface-800/20');
    return `
      <div class="flex items-center justify-between px-4 py-2 rounded-lg ${rowBg}">
        <span class="text-xs ${labelClass}">${r.label}</span>
        <div class="flex items-center gap-2">
          ${r.pct ? `<span class="text-[11px] text-surface-400">${r.pct}</span>` : ''}
          <span class="text-sm font-semibold ${valClass}">${display}</span>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2.5 bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
        <span class="text-xs font-semibold">Income Statement ${year}</span>
        <div class="flex items-center gap-3">
          ${qlLabel ? `<span class="text-[10px] text-surface-400">${escapeHtml(qlLabel)}</span>` : ''}
          ${fin.source_url ? `<a href="${escapeHtml(fin.source_url)}" target="_blank" rel="noopener" class="text-[10px] text-brand-600 hover:underline">View filing →</a>` : ''}
        </div>
      </div>
      <div class="py-1">${rowsHtml}</div>
    </div>`;
}

async function pipelineFetchOfficers(companyId) {
  const company = _pipelineCompanies.find(c =>
    c.id === companyId || (c.id || '').replace(/[^a-zA-Z0-9_-]/g, '_') === companyId
  );
  if (!company) return;

  const officersEl = document.getElementById(`detail-officers-${companyId}`);
  const btn        = document.getElementById(`fetch-officers-btn-${companyId}`);
  if (!officersEl) return;

  const hrNum = company.hrNumber || '';
  const court = company._pipeline?.court || '';

  // Need HR number to do lookup
  if (!hrNum) {
    officersEl.innerHTML = `<p class="text-xs text-surface-400 italic">No HR number — cannot fetch officers automatically.</p>`;
    return;
  }

  // Check for Apify key
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`).catch(() => ({})) || {};
  const apifyKey = settings.apifyApiKey || '';

  if (!apifyKey) {
    officersEl.innerHTML = `
      <div class="rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 p-4 text-xs">
        <p class="font-semibold text-amber-800 dark:text-amber-300 mb-1">Apify API key required</p>
        <p class="text-amber-700 dark:text-amber-400 mb-2">
          Add your Apify key in <strong>Settings → Research &amp; Data Enrichment</strong> to fetch managing directors from Handelsregister.de.
        </p>
        <div class="flex gap-2">
          <a href="https://apify.com/sign-up" target="_blank" class="text-brand-600 hover:underline font-medium">
            Get free Apify key →
          </a>
          <span class="text-amber-500">·</span>
          <a href="https://www.northdata.de/${encodeURIComponent(company.name)}" target="_blank" class="text-brand-600 hover:underline font-medium">
            Check North Data instead →
          </a>
        </div>
      </div>`;
    return;
  }

  // Show loading
  if (btn) { btn.disabled = true; btn.innerHTML = `<svg class="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Fetching…`; }
  officersEl.innerHTML = `
    <div class="flex items-center gap-2 text-xs text-surface-400 py-3">
      <svg class="animate-spin w-3.5 h-3.5 text-brand-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      Querying Handelsregister.de via Apify — this takes ~15–30s…
    </div>`;

  try {
    const hrMatch  = hrNum.match(/(HR[AB]|PR|VR)\s*(\d+)/i);
    if (!hrMatch) throw new Error(`Unrecognised HR number format: ${hrNum}`);

    const BASE     = 'https://api.apify.com/v2';
    const TOKEN    = `token=${encodeURIComponent(apifyKey)}`;
    const courtVal = (typeof _HR_CITY_TO_COURT !== 'undefined' && _HR_CITY_TO_COURT[court])
                   || court.toLowerCase() || 'all';
    const validCourt = (typeof _HR_VALID_COURTS !== 'undefined' && _HR_VALID_COURTS.has(courtVal))
                     ? courtVal : 'all';

    const _apiFetch = (url, opts, ms) => {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), ms);
      return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
    };

    const input = {
      register_number:         hrMatch[2],
      register_type:           hrMatch[1].toUpperCase(),
      register_court:          validCourt,
      include_company_details: true,
      include_representatives: true,
      include_address:         true,
      include_documents:       false,
    };

    const startResp = await _apiFetch(
      `${BASE}/acts/radeance~handelsregister-api/runs?${TOKEN}&maxTotalChargeUsd=2`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
      30000,
    );
    if (!startResp.ok) throw new Error(`Apify error (${startResp.status})`);

    const runData   = await startResp.json();
    const runId     = runData?.data?.id;
    const datasetId = runData?.data?.defaultDatasetId;
    if (!runId) throw new Error('No Apify run ID returned');

    // Poll until done
    const DONE     = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);
    let   status   = runData?.data?.status || 'RUNNING';
    const deadline = Date.now() + 90_000;
    while (!DONE.has(status)) {
      if (Date.now() > deadline) throw new Error('Timed out after 90s');
      await new Promise(r => setTimeout(r, 3000));
      const p = await _apiFetch(`${BASE}/actor-runs/${runId}?${TOKEN}`, {}, 10000);
      status  = (await p.json())?.data?.status || status;
    }
    if (status !== 'SUCCEEDED') throw new Error(`Apify run ${status}`);

    const itemsResp = await _apiFetch(
      `${BASE}/datasets/${datasetId}/items?${TOKEN}&clean=true&format=json`, {}, 15000
    );
    const items  = await itemsResp.json();
    const result = Array.isArray(items) ? items[0] : null;
    if (!result) throw new Error('No data returned from Handelsregister');

    const officers = (result.representatives || []).map(r => {
      if (typeof r === 'string') return { name: r, role: '' };
      return { name: r.full_name || r.name || '', role: r.role || r.position || '' };
    }).filter(o => o.name);

    const purpose      = result.business_purpose || '';
    const shareCapital = result.share_capital != null
      ? `${result.share_capital}${result.share_capital_currency ? ' ' + result.share_capital_currency : ''}`
      : '';
    const foundingDate = result.founding_date || '';

    let html = '';

    // Registry details row
    const extras = [
      shareCapital  ? `<div><p class="text-xs text-surface-400 mb-0.5">Share Capital</p><p class="text-sm font-semibold">${escapeHtml(shareCapital)}</p></div>` : '',
      foundingDate  ? `<div><p class="text-xs text-surface-400 mb-0.5">Founded</p><p class="text-sm font-semibold">${escapeHtml(foundingDate)}</p></div>` : '',
      result.status ? `<div><p class="text-xs text-surface-400 mb-0.5">Status</p><p class="text-sm font-semibold capitalize">${escapeHtml(result.status)}</p></div>` : '',
    ].filter(Boolean);
    if (extras.length) html += `<div class="grid grid-cols-3 gap-4 mb-4">${extras.join('')}</div>`;

    // Officers list
    if (officers.length) {
      html += `
        <div class="mb-4">
          <p class="text-[10px] font-semibold text-surface-400 uppercase tracking-wide mb-2">
            Managing Directors / Officers (${officers.length})
          </p>
          <div class="space-y-2">
            ${officers.map(o => `
              <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                  style="background:${avatarColor(o.name)}">
                  ${o.name.split(/\s+/).map(n => n[0] || '').join('').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p class="text-sm font-semibold leading-snug">${escapeHtml(o.name)}</p>
                  ${o.role ? `<p class="text-xs text-surface-400">${escapeHtml(o.role)}</p>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>`;
    }

    // Business purpose
    if (purpose) {
      html += `
        <div class="px-3 py-2.5 rounded-xl bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
          <p class="text-[10px] font-semibold text-surface-400 uppercase tracking-wide mb-1.5">Business Purpose</p>
          <p class="text-xs text-surface-700 dark:text-surface-300 leading-relaxed">${escapeHtml(purpose)}</p>
        </div>`;
    }

    if (!html) html = `<p class="text-xs text-surface-400 italic">No officer data found in Handelsregister for this entry.</p>`;

    officersEl.innerHTML = html;
    if (btn) btn.remove();

  } catch (err) {
    console.error('[pipelineFetchOfficers]', err);
    officersEl.innerHTML = `
      <div class="rounded-xl bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800 px-4 py-3 text-xs">
        <p class="font-semibold text-red-700 dark:text-red-400 mb-1">Fetch failed</p>
        <p class="text-red-600 dark:text-red-500">${escapeHtml(err.message)}</p>
        <a href="https://www.northdata.de/${encodeURIComponent(company.name)}" target="_blank"
           class="inline-block mt-2 text-brand-600 hover:underline font-medium">
          Try North Data instead →
        </a>
      </div>`;
    if (btn) { btn.disabled = false; btn.innerHTML = 'Retry'; }
  }
}
