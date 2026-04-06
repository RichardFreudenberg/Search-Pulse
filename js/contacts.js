/* ============================================
   Nexus CRM — Contacts Management
   ============================================ */

let contactsViewMode = 'table'; // table | cards
let contactsFilters = { stage: '', tag: '', search: '', sort: 'name' };

async function renderContacts() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto">${renderLoadingSkeleton(5)}</div>`;

  const [contacts, companies, tags] = await Promise.all([
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.companies, currentUser.id),
    DB.getForUser(STORES.tags, currentUser.id),
  ]);

  const activeContacts = contacts.filter(c => !c.archived);
  const companyMap = {};
  companies.forEach(c => companyMap[c.id] = c);

  // Apply filters
  let filtered = [...activeContacts];
  if (contactsFilters.stage) {
    filtered = filtered.filter(c => c.stage === contactsFilters.stage);
  }
  if (contactsFilters.tag) {
    filtered = filtered.filter(c => (c.tags || []).includes(contactsFilters.tag));
  }
  if (contactsFilters.search) {
    const q = contactsFilters.search.toLowerCase();
    filtered = filtered.filter(c =>
      c.fullName.toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (companyMap[c.companyId]?.name || '').toLowerCase().includes(q)
    );
  }

  // Sort
  if (contactsFilters.sort === 'name') {
    filtered.sort((a, b) => a.fullName.localeCompare(b.fullName));
  } else if (contactsFilters.sort === 'recent') {
    filtered.sort((a, b) => new Date(b.lastContactDate || 0) - new Date(a.lastContactDate || 0));
  } else if (contactsFilters.sort === 'follow-up') {
    filtered.sort((a, b) => {
      if (!a.nextFollowUpDate) return 1;
      if (!b.nextFollowUpDate) return -1;
      return new Date(a.nextFollowUpDate) - new Date(b.nextFollowUpDate);
    });
  } else if (contactsFilters.sort === 'added') {
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      ${renderPageHeader('Contacts', `${activeContacts.length} contacts`, `
        <button onclick="openNewContactModal()" class="btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Contact
        </button>
      `)}

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-3 mb-6">
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input type="text" placeholder="Search contacts…" value="${escapeHtml(contactsFilters.search)}"
            oninput="contactsFilters.search=this.value; renderContacts()"
            class="w-full pl-10 pr-4 py-2 text-sm bg-surface-100 dark:bg-surface-900 border-0 rounded-xl focus:ring-2 focus:ring-brand-500" />
        </div>
        <select onchange="contactsFilters.stage=this.value; renderContacts()" class="input-field w-auto text-sm" style="max-width: 180px">
          <option value="">All stages</option>
          ${STAGES.map(s => `<option value="${s}" ${contactsFilters.stage === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <select onchange="contactsFilters.tag=this.value; renderContacts()" class="input-field w-auto text-sm" style="max-width: 180px">
          <option value="">All tags</option>
          ${tags.map(t => `<option value="${t.name}" ${contactsFilters.tag === t.name ? 'selected' : ''}>${t.name}</option>`).join('')}
        </select>
        <select onchange="contactsFilters.sort=this.value; renderContacts()" class="input-field w-auto text-sm" style="max-width: 180px">
          <option value="name" ${contactsFilters.sort === 'name' ? 'selected' : ''}>Name A–Z</option>
          <option value="recent" ${contactsFilters.sort === 'recent' ? 'selected' : ''}>Last contacted</option>
          <option value="follow-up" ${contactsFilters.sort === 'follow-up' ? 'selected' : ''}>Follow-up date</option>
          <option value="added" ${contactsFilters.sort === 'added' ? 'selected' : ''}>Recently added</option>
        </select>
        <div class="flex border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
          <button onclick="contactsViewMode='table'; renderContacts()" class="p-2 ${contactsViewMode === 'table' ? 'bg-surface-200 dark:bg-surface-700' : 'hover:bg-surface-100 dark:hover:bg-surface-800'}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" /></svg>
          </button>
          <button onclick="contactsViewMode='cards'; renderContacts()" class="p-2 ${contactsViewMode === 'cards' ? 'bg-surface-200 dark:bg-surface-700' : 'hover:bg-surface-100 dark:hover:bg-surface-800'}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      ${filtered.length === 0 ? renderEmptyState(
        '<svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>',
        contactsFilters.search || contactsFilters.stage || contactsFilters.tag ? 'No contacts match your filters' : 'No contacts yet',
        contactsFilters.search || contactsFilters.stage || contactsFilters.tag ? 'Try adjusting your filters' : 'Add your first contact to get started',
        contactsFilters.search || contactsFilters.stage || contactsFilters.tag ? '' : '<button onclick="openNewContactModal()" class="btn-primary">Add Contact</button>'
      ) : contactsViewMode === 'table' ? `
        <div class="card p-0 overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Company</th>
                <th>Stage</th>
                <th>Last Contact</th>
                <th>Follow-up</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(c => renderContactRow(c, companyMap[c.companyId])).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          ${filtered.map(c => renderContactCard(c, companyMap[c.companyId])).join('')}
        </div>
      `}
    </div>
  `;
}

async function openNewContactModal(prefill = {}) {
  const [companies, tags] = await Promise.all([
    DB.getForUser(STORES.companies, currentUser.id),
    DB.getForUser(STORES.tags, currentUser.id),
  ]);

  initTagInput('contact-tags', prefill.tags || []);

  openModal(`
    <div class="p-6">
      <h2 class="text-lg font-semibold mb-1">New Contact</h2>
      <p class="text-sm text-surface-500 mb-6">Paste a LinkedIn URL to auto-populate, or fill in manually</p>

      <!-- LinkedIn Auto-populate Section -->
      <div class="bg-brand-50 dark:bg-brand-900/15 border border-brand-200 dark:border-brand-800 rounded-xl p-4 mb-6">
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-5 h-5 text-brand-600" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          <span class="text-sm font-medium text-brand-700 dark:text-brand-300">Quick Add from LinkedIn</span>
        </div>
        <div class="flex gap-2">
          <input type="url" id="linkedin-import-url" class="input-field flex-1" placeholder="https://www.linkedin.com/in/jane-smith-12345/" value="${escapeHtml(prefill.linkedInUrl || '')}" />
          <button type="button" onclick="autoPopulateFromLinkedIn()" id="linkedin-populate-btn" class="btn-primary whitespace-nowrap">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
            Populate
          </button>
        </div>
        <div id="linkedin-status" class="mt-2 hidden">
          <p class="text-xs text-surface-500"></p>
        </div>
      </div>

      <form id="new-contact-form" class="space-y-4">
        <!-- Photo preview -->
        <div id="contact-photo-preview" class="hidden flex items-center gap-4 p-3 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
          <div id="contact-photo-preview-img" class="avatar avatar-lg"></div>
          <div>
            <p class="text-sm font-medium" id="contact-photo-preview-name"></p>
            <p class="text-xs text-surface-500" id="contact-photo-preview-info"></p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Full Name *</label>
            <input type="text" id="contact-name" required class="input-field" placeholder="Jane Smith" value="${escapeHtml(prefill.fullName || '')}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Title</label>
            <input type="text" id="contact-title" class="input-field" placeholder="Managing Director" value="${escapeHtml(prefill.title || '')}" />
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Company</label>
            <select id="contact-company" class="input-field">
              <option value="">Select or create below</option>
              ${companies.map(c => `<option value="${c.id}" ${prefill.companyId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
            <input type="text" id="contact-new-company" class="input-field mt-2" placeholder="Or type a new company name" value="${escapeHtml(prefill.companyName || '')}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Location</label>
            <input type="text" id="contact-location" class="input-field" placeholder="Boston, MA" value="${escapeHtml(prefill.location || '')}" />
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Email</label>
            <input type="email" id="contact-email" class="input-field" placeholder="jane@example.com" value="${escapeHtml(prefill.email || '')}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Phone</label>
            <input type="tel" id="contact-phone" class="input-field" placeholder="+1 (555) 000-0000" value="${escapeHtml(prefill.phone || '')}" />
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">LinkedIn URL</label>
            <input type="url" id="contact-linkedin" class="input-field" placeholder="https://linkedin.com/in/..." value="${escapeHtml(prefill.linkedInUrl || '')}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Stage</label>
            <select id="contact-stage" class="input-field">
              ${STAGES.map(s => `<option value="${s}" ${(prefill.stage || 'New intro') === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Photo</label>
          <div class="flex gap-2">
            <input type="url" id="contact-photo" class="input-field flex-1" placeholder="https://photo-url.com/..." value="${escapeHtml(prefill.photoUrl || '')}" />
            <label class="btn-secondary btn-sm cursor-pointer whitespace-nowrap self-center" title="Upload photo from file">
              <input type="file" accept="image/*" class="hidden" onchange="contactPhotoFileUpload(this)" />
              📷 Upload
            </label>
          </div>
          <p class="text-xs text-surface-400 mt-1">Paste a URL or upload an image file</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Tags</label>
          ${renderTagInput(prefill.tags || [], tags, 'contact-tags')}
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Notes</label>
          <textarea id="contact-notes" class="input-field" rows="3" placeholder="Initial notes about this contact…">${escapeHtml(prefill.notes || '')}</textarea>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
          <button type="submit" class="btn-primary">Save Contact</button>
        </div>
      </form>
    </div>
  `);

  // If prefill has linkedInUrl, also set the import input
  if (prefill.linkedInUrl) {
    const importInput = document.getElementById('linkedin-import-url');
    if (importInput) importInput.value = prefill.linkedInUrl;
  }

  document.getElementById('new-contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveNewContact();
  });

  // Auto-populate if URL is pasted via keyboard
  const linkedinInput = document.getElementById('linkedin-import-url');
  linkedinInput.addEventListener('paste', () => {
    setTimeout(() => autoPopulateFromLinkedIn(), 100);
  });
  linkedinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); autoPopulateFromLinkedIn(); }
  });
}

// ============================================
// LinkedIn Auto-Populate Logic
// ============================================

function parseLinkedInUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (!u.hostname.includes('linkedin.com')) return null;

    // Extract slug from /in/slug or /in/slug/
    const match = u.pathname.match(/\/in\/([^\/]+)/);
    if (!match) return null;

    const slug = match[1];
    // Parse name from slug: "jane-smith-12345" → "Jane Smith"
    // Remove trailing numbers/hashes
    const cleanSlug = slug.replace(/-[a-f0-9]{5,}$/i, '').replace(/-\d+$/, '');
    const nameParts = cleanSlug.split('-').filter(p => p.length > 0);
    const fullName = nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');

    return { slug, fullName, url: url.trim() };
  } catch {
    return null;
  }
}

async function autoPopulateFromLinkedIn() {
  const urlInput = document.getElementById('linkedin-import-url');
  const url = urlInput.value.trim();
  const statusEl = document.getElementById('linkedin-status');
  const btn = document.getElementById('linkedin-populate-btn');

  if (!url) { showToast('Please paste a LinkedIn URL', 'warning'); return; }

  const parsed = parseLinkedInUrl(url);
  if (!parsed) {
    showToast('Invalid LinkedIn URL. Use format: linkedin.com/in/name', 'error');
    return;
  }

  // Show loading state
  btn.disabled = true;
  btn.innerHTML = '<svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Looking up…';
  statusEl.classList.remove('hidden');
  statusEl.querySelector('p').textContent = 'Extracting profile information…';

  // Step 1: Parse name from URL
  setFieldIfEmpty('contact-name', parsed.fullName);
  setFieldValue('contact-linkedin', parsed.url);

  // Step 2: Try RapidAPI if key is configured
  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  let enrichedViaApi = false;

  if (settings && settings.rapidApiKey) {
    try {
      statusEl.querySelector('p').textContent = 'Fetching profile via API…';
      const profileData = await fetchLinkedInProfile(parsed.url, settings.rapidApiKey);
      if (profileData) {
        applyLinkedInProfileData(profileData);
        enrichedViaApi = true;
        statusEl.querySelector('p').innerHTML = '<span class="text-green-600 dark:text-green-400 font-medium">✓ Profile populated from LinkedIn API</span>';
      }
    } catch (err) {
      console.warn('LinkedIn API enrichment failed:', err);
    }
  }

  // Step 3: If no API key or API failed, try free enrichment sources
  if (!enrichedViaApi) {
    statusEl.querySelector('p').textContent = 'Looking up public data…';

    const fieldsFound = ['Name (from URL)'];

    // Try to get a profile photo from unavatar.io (free, no API key needed)
    try {
      const photoUrl = `https://unavatar.io/linkedin/${parsed.slug}`;
      const resp = await fetch(photoUrl, { method: 'HEAD' });
      if (resp.ok && resp.status === 200) {
        setFieldIfEmpty('contact-photo', photoUrl);
        showPhotoPreview(photoUrl, parsed.fullName);
        fieldsFound.push('Photo');
      }
    } catch {}

    // Try a second photo source if first failed
    if (!document.getElementById('contact-photo').value) {
      try {
        const photoUrl2 = `https://unavatar.io/${parsed.fullName.replace(/\s+/g, '+')}`;
        const resp2 = await fetch(photoUrl2, { method: 'HEAD' });
        if (resp2.ok && resp2.status === 200) {
          setFieldIfEmpty('contact-photo', photoUrl2);
          showPhotoPreview(photoUrl2, parsed.fullName);
          fieldsFound.push('Photo');
        }
      } catch {}
    }

    // Try to use AI (if configured) to extract info from the LinkedIn page
    const settings2 = await DB.get(STORES.settings, `settings_${currentUser.id}`);
    if (settings2 && (settings2.openaiApiKey || settings2.claudeApiKey)) {
      try {
        statusEl.querySelector('p').textContent = 'Using AI to look up public profile info…';
        const aiResult = await aiEnrichFromLinkedIn(parsed.fullName, parsed.url);
        if (aiResult) {
          if (aiResult.title) { setFieldIfEmpty('contact-title', aiResult.title); fieldsFound.push('Title'); }
          if (aiResult.company) { setFieldIfEmpty('contact-new-company', aiResult.company); fieldsFound.push('Company'); }
          if (aiResult.location) { setFieldIfEmpty('contact-location', aiResult.location); fieldsFound.push('Location'); }
          if (aiResult.bio) {
            const notes = document.getElementById('contact-notes');
            if (!notes.value.trim()) notes.value = aiResult.bio;
            fieldsFound.push('Bio');
          }
        }
      } catch (err) {
        console.warn('AI enrichment failed:', err);
      }
    }

    statusEl.querySelector('p').innerHTML = `
      <span class="text-green-600 dark:text-green-400 font-medium">✓ Populated: ${fieldsFound.join(', ')}</span><br>
      <span class="text-surface-400">${fieldsFound.length <= 2 ? 'Add a RapidAPI key in Settings for full LinkedIn profile data (title, company, location, photo, bio).' : 'Profile enriched from available sources.'}</span>
    `;
  }

  btn.disabled = false;
  btn.innerHTML = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.5 12.75l6 6 9-13.5" /></svg> Done';

  showToast(`Populated profile for ${parsed.fullName}`, 'success');
}

async function fetchLinkedInProfile(linkedInUrl, apiKey) {
  // RapidAPI — Fresh LinkedIn Profile Data
  // https://rapidapi.com/freshdata-freshdata-default/api/fresh-linkedin-profile-data
  const response = await fetch(`https://fresh-linkedin-profile-data.p.rapidapi.com/get-linkedin-profile?linkedin_url=${encodeURIComponent(linkedInUrl)}&include_skills=false`, {
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
    },
  });

  if (!response.ok) throw new Error(`API returned ${response.status}`);
  const json = await response.json();
  return json.data || json;
}

function applyLinkedInProfileData(data) {
  // Supports both RapidAPI Fresh LinkedIn and legacy Proxycurl field names
  const fullName = data.full_name || data.fullName || '';
  const headline = data.headline || data.occupation || '';
  const city = data.city || data.location?.city || '';
  const state = data.state || data.location?.state || '';
  const country = data.country_full_name || data.country || '';
  const profilePic = data.profile_pic_url || data.profile_image_url || data.avatar || '';
  const summary = data.summary || data.about || '';
  const company = data.company || '';

  if (fullName) setFieldValue('contact-name', fullName);
  if (headline) setFieldIfEmpty('contact-title', headline);

  // Location
  const locParts = [city, state, country].filter(Boolean);
  if (locParts.length > 0) {
    setFieldIfEmpty('contact-location', locParts.join(', '));
  } else if (data.location) {
    // RapidAPI sometimes returns location as a plain string
    const locStr = typeof data.location === 'string' ? data.location : '';
    if (locStr) setFieldIfEmpty('contact-location', locStr);
  }

  if (profilePic) {
    setFieldValue('contact-photo', profilePic);
    showPhotoPreview(profilePic, fullName);
  }

  // Company from current experience or top-level field
  if (company) {
    setFieldIfEmpty('contact-new-company', company);
  }
  if (data.experiences && data.experiences.length > 0) {
    const current = data.experiences.find(e => !e.ends_at && !e.end_date) || data.experiences[0];
    if (current) {
      if (current.company || current.company_name) setFieldIfEmpty('contact-new-company', current.company || current.company_name);
      if (current.title) setFieldIfEmpty('contact-title', current.title);
    }
  }

  // Summary/bio into notes
  if (summary) {
    const notes = document.getElementById('contact-notes');
    if (!notes.value.trim()) {
      notes.value = `LinkedIn Bio: ${summary}`;
    }
  }
}

async function aiEnrichFromLinkedIn(fullName, linkedInUrl) {
  // Use AI to look up publicly known information about a person
  const raw = await callAI(
    'You are a contact research assistant. Given a person\'s name and LinkedIn URL, return ONLY publicly known professional information. Return a JSON object with these fields (use null if unknown): title, company, location, bio (1-2 sentence professional summary). Only include information you are confident is accurate and publicly available. Do not fabricate.',
    `Look up public professional info for: ${fullName}\nLinkedIn: ${linkedInUrl}\n\nReturn JSON only, no markdown.`,
    300, 0.1
  );
  const jsonStr = raw.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function setFieldIfEmpty(fieldId, value) {
  const el = document.getElementById(fieldId);
  if (el && !el.value.trim() && value) {
    el.value = value;
    el.style.opacity = '1';
    // Subtle highlight to show field was auto-filled
    el.style.transition = 'background-color 0.5s ease';
    el.style.backgroundColor = 'rgba(92, 124, 250, 0.08)';
    setTimeout(() => { el.style.backgroundColor = ''; }, 2000);
  }
}

function setFieldValue(fieldId, value) {
  const el = document.getElementById(fieldId);
  if (el && value) {
    el.value = value;
    el.style.opacity = '1';
    el.style.transition = 'background-color 0.5s ease';
    el.style.backgroundColor = 'rgba(92, 124, 250, 0.08)';
    setTimeout(() => { el.style.backgroundColor = ''; }, 2000);
  }
}

function showPhotoPreview(photoUrl, name) {
  const preview = document.getElementById('contact-photo-preview');
  const imgContainer = document.getElementById('contact-photo-preview-img');
  const nameEl = document.getElementById('contact-photo-preview-name');
  const infoEl = document.getElementById('contact-photo-preview-info');

  if (preview && imgContainer) {
    imgContainer.innerHTML = `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name)}" onerror="this.parentElement.parentElement.classList.add('hidden')" />`;
    nameEl.textContent = name;
    infoEl.textContent = 'Photo found via LinkedIn';
    preview.classList.remove('hidden');
  }
}

async function saveNewContact() {
  const name = document.getElementById('contact-name').value.trim();
  if (!name) { showToast('Name is required', 'error'); return; }

  // Check duplicates
  const existingContacts = await DB.getForUser(STORES.contacts, currentUser.id);
  const email = document.getElementById('contact-email').value.trim();
  const dup = checkDuplicate(existingContacts, name, email);
  if (dup) {
    const proceed = confirm(`A similar contact "${dup.fullName}" already exists. Create anyway?`);
    if (!proceed) return;
  }

  // Handle company
  let companyId = document.getElementById('contact-company').value;
  const newCompanyName = document.getElementById('contact-new-company').value.trim();
  if (!companyId && newCompanyName) {
    const company = await DB.add(STORES.companies, {
      userId: currentUser.id,
      name: newCompanyName,
      description: '',
      size: '',
      website: '',
      logoUrl: '',
      industry: '',
    });
    companyId = company.id;
  }

  const contact = await DB.add(STORES.contacts, {
    userId: currentUser.id,
    fullName: name,
    title: document.getElementById('contact-title').value.trim(),
    companyId: companyId || null,
    location: document.getElementById('contact-location').value.trim(),
    email: email,
    phone: document.getElementById('contact-phone').value.trim(),
    linkedInUrl: document.getElementById('contact-linkedin').value.trim(),
    photoUrl: document.getElementById('contact-photo').value.trim(),
    stage: document.getElementById('contact-stage').value,
    tags: getTagInputValues('contact-tags'),
    notes: document.getElementById('contact-notes').value.trim(),
    lastContactDate: null,
    nextFollowUpDate: null,
    archived: false,
  });

  // Log activity
  await DB.add(STORES.activities, {
    userId: currentUser.id,
    contactId: contact.id,
    type: 'created',
    title: 'Contact created',
    description: `Added ${name} to contacts`,
    timestamp: new Date().toISOString(),
  });

  // Add initial note if provided
  const notesText = document.getElementById('contact-notes').value.trim();
  if (notesText) {
    await DB.add(STORES.notes, {
      userId: currentUser.id,
      contactId: contact.id,
      callId: null,
      content: notesText,
      cleanedContent: null,
      createdAt: new Date().toISOString(),
    });
  }

  closeModal();
  showToast('Contact created', 'success');
  navigate('contacts');
}

async function viewContact(contactId) {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-5xl mx-auto">${renderLoadingSkeleton(5)}</div>`;

  const [contact, companies, calls, notes, reminders, activities, sources, tags] = await Promise.all([
    DB.get(STORES.contacts, contactId),
    DB.getForUser(STORES.companies, currentUser.id),
    DB.getAllByIndex(STORES.calls, 'contactId', contactId),
    DB.getAllByIndex(STORES.notes, 'contactId', contactId),
    DB.getAllByIndex(STORES.reminders, 'contactId', contactId),
    DB.getAllByIndex(STORES.activities, 'contactId', contactId),
    DB.getAllByIndex(STORES.sources, 'contactId', contactId),
    DB.getForUser(STORES.tags, currentUser.id),
  ]);

  if (!contact) {
    showToast('Contact not found', 'error');
    navigate('contacts');
    return;
  }

  const company = contact.companyId ? companies.find(c => c.id === contact.companyId) : null;
  const sortedCalls = sortByDate(calls, 'date');
  const sortedNotes = sortByDate(notes, 'createdAt');
  const sortedActivities = sortByDate(activities, 'timestamp');
  const activeReminders = reminders.filter(r => r.status !== 'dismissed');

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <!-- Back button -->
      <button onclick="navigate('contacts')" class="btn-ghost mb-4 -ml-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        Back to contacts
      </button>

      <!-- Profile Header -->
      <div class="card mb-6">
        <div class="flex flex-col sm:flex-row items-start gap-5">
          ${renderAvatar(contact.fullName, contact.photoUrl, 'xl', contact.linkedInUrl)}
          <div class="flex-1 min-w-0">
            <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-1">
              <h1 class="text-2xl font-semibold truncate">${escapeHtml(contact.fullName)}</h1>
              ${renderStageBadge(contact.stage)}
            </div>
            <div class="flex items-center gap-2 text-surface-500 mb-3">
              ${contact.title ? `<span>${escapeHtml(contact.title)}</span>` : ''}
              ${contact.title && company ? '<span>·</span>' : ''}
              ${company ? `<div class="flex items-center gap-1.5">${renderCompanyLogo(company, 'sm')}<span>${escapeHtml(company.name)}</span></div>` : ''}
              ${contact.location ? `<span>·</span><span>${escapeHtml(contact.location)}</span>` : ''}
            </div>
            <div class="flex flex-wrap items-center gap-3 text-sm">
              ${contact.email ? `<a href="mailto:${escapeHtml(contact.email)}" class="flex items-center gap-1 text-brand-600 hover:text-brand-700"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>${escapeHtml(contact.email)}</a>` : ''}
              ${contact.phone ? `<a href="tel:${escapeHtml(contact.phone)}" class="flex items-center gap-1 text-brand-600 hover:text-brand-700"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>${escapeHtml(contact.phone)}</a>` : ''}
              ${contact.linkedInUrl ? `<a href="${escapeHtml(contact.linkedInUrl)}" target="_blank" class="flex items-center gap-1 text-brand-600 hover:text-brand-700"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>LinkedIn</a>` : ''}
            </div>
            <div class="flex flex-wrap gap-1 mt-3">
              ${(contact.tags || []).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="openEditContactModal('${contact.id}')" class="btn-secondary btn-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
              Edit
            </button>
            ${contact.email ? `<button onclick="emailContactWithBCC('${contact.id}')" class="btn-secondary btn-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
              Send Email
            </button>` : ''}
            <button onclick="openNewCallModal('${contact.id}')" class="btn-primary btn-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
              Log Call
            </button>
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-surface-200 dark:border-surface-800">
          <div class="text-center">
            <div class="text-lg font-semibold">${sortedCalls.length}</div>
            <div class="text-xs text-surface-500">Calls</div>
          </div>
          <div class="text-center">
            <div class="text-lg font-semibold">${sortedNotes.length}</div>
            <div class="text-xs text-surface-500">Notes</div>
          </div>
          <div class="text-center">
            <div class="text-lg font-semibold">${contact.lastContactDate ? formatRelative(contact.lastContactDate) : '—'}</div>
            <div class="text-xs text-surface-500">Last Contact</div>
          </div>
          <div class="text-center">
            <div class="text-lg font-semibold ${contact.nextFollowUpDate && isOverdue(contact.nextFollowUpDate) ? 'text-red-600' : ''}">${contact.nextFollowUpDate ? formatFutureRelative(contact.nextFollowUpDate) : '—'}</div>
            <div class="text-xs text-surface-500">Next Follow-up</div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tab-group mb-6">
        <button class="tab-item active" onclick="showContactTab(this, 'notes-tab')">Notes</button>
        <button class="tab-item" onclick="showContactTab(this, 'calls-tab')">Calls</button>
        <button class="tab-item" onclick="showContactTab(this, 'timeline-tab')">Timeline</button>
        <button class="tab-item" onclick="showContactTab(this, 'enrichment-tab')">Enrichment</button>
        <button class="tab-item" onclick="showContactTab(this, 'reminders-tab')">Reminders</button>
      </div>

      <!-- Tab Content -->
      <div id="notes-tab" class="tab-content">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-semibold">Notes</h2>
          <button onclick="openNewNoteModal('${contact.id}')" class="btn-secondary btn-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add Note
          </button>
        </div>
        ${sortedNotes.length === 0 ? '<p class="text-sm text-surface-500 py-4">No notes yet</p>' : `
          <div class="space-y-4">
            ${sortedNotes.map(n => `
              <div class="card">
                <div class="flex items-start justify-between mb-2">
                  <span class="text-xs text-surface-500">${formatDateTime(n.createdAt)}</span>
                  <div class="flex gap-1">
                    <button onclick="openCleanupNotes('${n.id}')" class="btn-ghost btn-xs text-brand-600" title="Clean Up Notes">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                      Clean Up
                    </button>
                    <button onclick="deleteNote('${n.id}', '${contact.id}')" class="btn-ghost btn-xs text-red-500">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </div>
                </div>
                <div class="text-sm whitespace-pre-wrap">${escapeHtml(n.cleanedContent || n.content)}</div>
                ${n.cleanedContent ? '<p class="text-xs text-surface-400 mt-2 italic">✨ Cleaned up version shown</p>' : ''}
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div id="calls-tab" class="tab-content hidden">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-semibold">Call History</h2>
          <button onclick="openNewCallModal('${contact.id}')" class="btn-secondary btn-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Log Call
          </button>
        </div>
        ${sortedCalls.length === 0 ? '<p class="text-sm text-surface-500 py-4">No calls logged yet</p>' : `
          <div class="space-y-4">
            ${sortedCalls.map(c => `
              <div class="card">
                <div class="flex items-start justify-between mb-2">
                  <div>
                    <span class="text-sm font-medium">${formatDateTime(c.date)}</span>
                    ${c.duration ? `<span class="text-xs text-surface-500 ml-2">${c.duration} min</span>` : ''}
                  </div>
                  ${c.outcome ? `<span class="badge badge-blue">${escapeHtml(c.outcome)}</span>` : ''}
                </div>
                ${c.notes ? `<p class="text-sm text-surface-600 dark:text-surface-400 whitespace-pre-wrap">${escapeHtml(c.notes)}</p>` : ''}
                ${c.nextSteps ? `<p class="text-sm mt-2"><span class="font-medium">Next steps:</span> ${escapeHtml(c.nextSteps)}</p>` : ''}
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div id="timeline-tab" class="tab-content hidden">
        <h2 class="text-base font-semibold mb-4">Relationship Timeline</h2>
        ${renderTimeline(sortedActivities)}
      </div>

      <div id="enrichment-tab" class="tab-content hidden">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-semibold">Enrichment Data</h2>
          <button onclick="startEnrichment('${contact.id}')" class="btn-secondary btn-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
            Enrich Profile
          </button>
        </div>
        ${sources.length === 0 ? `
          <div class="text-center py-8">
            <svg class="w-10 h-10 mx-auto text-surface-300 dark:text-surface-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
            <p class="text-sm text-surface-500">No enrichment data yet</p>
            <p class="text-xs text-surface-400 mt-1">Click "Enrich Profile" to search public web data</p>
          </div>
        ` : `
          <div class="space-y-3">
            ${sources.map(s => `
              <div class="card">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm font-medium">${escapeHtml(s.field)}</span>
                  ${renderVerificationBadge(s.verification)}
                </div>
                <p class="text-sm text-surface-600 dark:text-surface-400">${escapeHtml(s.value)}</p>
                ${s.sourceUrl ? `<a href="${escapeHtml(s.sourceUrl)}" target="_blank" class="text-xs text-brand-600 hover:underline mt-1 inline-block">${escapeHtml(s.sourceName || s.sourceUrl)}</a>` : ''}
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div id="reminders-tab" class="tab-content hidden">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-semibold">Reminders</h2>
          <button onclick="openNewReminderModal('${contact.id}')" class="btn-secondary btn-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Add Reminder
          </button>
        </div>
        ${activeReminders.length === 0 ? '<p class="text-sm text-surface-500 py-4">No active reminders</p>' : `
          <div class="space-y-3">
            ${activeReminders.map(r => renderReminderItem(r, contact)).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

function showContactTab(btn, tabId) {
  // Deactivate all tabs
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));

  // Activate clicked tab
  btn.classList.add('active');
  document.getElementById(tabId).classList.remove('hidden');
}

async function openEditContactModal(contactId) {
  const [contact, companies, tags] = await Promise.all([
    DB.get(STORES.contacts, contactId),
    DB.getForUser(STORES.companies, currentUser.id),
    DB.getForUser(STORES.tags, currentUser.id),
  ]);

  initTagInput('edit-contact-tags', contact.tags || []);

  openModal(`
    <div class="p-6">
      <h2 class="text-lg font-semibold mb-6">Edit Contact</h2>
      <form id="edit-contact-form" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Full Name *</label>
            <input type="text" id="edit-contact-name" required class="input-field" value="${escapeHtml(contact.fullName)}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Title</label>
            <input type="text" id="edit-contact-title" class="input-field" value="${escapeHtml(contact.title || '')}" />
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Company</label>
            <select id="edit-contact-company" class="input-field">
              <option value="">None</option>
              ${companies.map(c => `<option value="${c.id}" ${contact.companyId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Location</label>
            <input type="text" id="edit-contact-location" class="input-field" value="${escapeHtml(contact.location || '')}" />
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Email</label>
            <input type="email" id="edit-contact-email" class="input-field" value="${escapeHtml(contact.email || '')}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Phone</label>
            <input type="tel" id="edit-contact-phone" class="input-field" value="${escapeHtml(contact.phone || '')}" />
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">LinkedIn URL</label>
            <input type="url" id="edit-contact-linkedin" class="input-field" value="${escapeHtml(contact.linkedInUrl || '')}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Stage</label>
            <select id="edit-contact-stage" class="input-field">
              ${STAGES.map(s => `<option value="${s}" ${contact.stage === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Photo URL</label>
            <input type="url" id="edit-contact-photo" class="input-field" value="${escapeHtml(contact.photoUrl || '')}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Next Follow-up</label>
            <input type="date" id="edit-contact-followup" class="input-field" value="${toInputDate(contact.nextFollowUpDate)}" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Tags</label>
          ${renderTagInput(contact.tags || [], tags, 'edit-contact-tags')}
        </div>
        <div class="flex justify-between items-center pt-2">
          <button type="button" onclick="archiveContact('${contact.id}')" class="btn-ghost text-red-500 text-sm">Archive Contact</button>
          <div class="flex gap-3">
            <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </div>
      </form>
    </div>
  `);

  document.getElementById('edit-contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldStage = contact.stage;
    const newStage = document.getElementById('edit-contact-stage').value;

    contact.fullName = document.getElementById('edit-contact-name').value.trim();
    contact.title = document.getElementById('edit-contact-title').value.trim();
    contact.companyId = document.getElementById('edit-contact-company').value || null;
    contact.location = document.getElementById('edit-contact-location').value.trim();
    contact.email = document.getElementById('edit-contact-email').value.trim();
    contact.phone = document.getElementById('edit-contact-phone').value.trim();
    contact.linkedInUrl = document.getElementById('edit-contact-linkedin').value.trim();
    contact.photoUrl = document.getElementById('edit-contact-photo').value.trim();
    contact.stage = newStage;
    contact.tags = getTagInputValues('edit-contact-tags');
    const followUp = document.getElementById('edit-contact-followup').value;
    contact.nextFollowUpDate = followUp ? new Date(followUp).toISOString() : null;

    await DB.put(STORES.contacts, contact);

    if (oldStage !== newStage) {
      await DB.add(STORES.activities, {
        userId: currentUser.id,
        contactId: contact.id,
        type: 'stage_change',
        title: 'Stage changed',
        description: `${oldStage} → ${newStage}`,
        timestamp: new Date().toISOString(),
      });
    }

    await DB.add(STORES.activities, {
      userId: currentUser.id,
      contactId: contact.id,
      type: 'updated',
      title: 'Contact updated',
      description: 'Profile information updated',
      timestamp: new Date().toISOString(),
    });

    closeModal();
    showToast('Contact updated', 'success');
    viewContact(contact.id);
  });
}

async function archiveContact(contactId) {
  confirmDialog('Archive Contact', 'This will hide the contact from your active list. You can restore them later.', async () => {
    const contact = await DB.get(STORES.contacts, contactId);
    contact.archived = true;
    await DB.put(STORES.contacts, contact);
    showToast('Contact archived', 'success');
    navigate('contacts');
  });
}

async function openNewNoteModal(contactId) {
  openModal(`
    <div class="p-6">
      <h2 class="text-lg font-semibold mb-6">Add Note</h2>
      <form id="new-note-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Note</label>
          <textarea id="note-content" class="input-field" rows="8" required placeholder="Write your notes here…"></textarea>
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
          <button type="submit" class="btn-primary">Save Note</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('new-note-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = document.getElementById('note-content').value.trim();
    if (!content) return;

    await DB.add(STORES.notes, {
      userId: currentUser.id,
      contactId: contactId,
      callId: null,
      content,
      cleanedContent: null,
    });

    await DB.add(STORES.activities, {
      userId: currentUser.id,
      contactId: contactId,
      type: 'note',
      title: 'Note added',
      description: truncate(content, 60),
      timestamp: new Date().toISOString(),
    });

    closeModal();
    showToast('Note saved', 'success');
    viewContact(contactId);
  });
}

async function deleteNote(noteId, contactId) {
  confirmDialog('Delete Note', 'This note will be permanently removed.', async () => {
    await DB.delete(STORES.notes, noteId);
    showToast('Note deleted', 'success');
    viewContact(contactId);
  });
}

// === CONTACT PHOTO FILE UPLOAD ===
function contactPhotoFileUpload(input) {
  if (!input.files.length) return;
  const file = input.files[0];
  if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Image too large (max 5MB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const photoInput = document.getElementById('contact-photo');
    if (photoInput) {
      photoInput.value = reader.result; // base64 data URL
      showPhotoPreview(reader.result, document.getElementById('contact-name')?.value || '');
      showToast('Photo uploaded', 'success');
    }
  };
  reader.readAsDataURL(file);
}

// === EMAIL WITH BCC LOGGING ===
async function emailContactWithBCC(contactId) {
  const contact = await DB.get(STORES.contacts, contactId);
  if (!contact) return;
  if (!contact.email) { showToast('No email address for this contact', 'warning'); return; }

  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  const bccEmail = settings?.reminderEmail || settings?.newsletterEmail || '';

  const subject = encodeURIComponent(`Following up — ${contact.fullName}`);
  const bccPart = bccEmail ? `&bcc=${encodeURIComponent(bccEmail)}` : '';
  window.location.href = `mailto:${encodeURIComponent(contact.email)}?subject=${subject}${bccPart}`;

  // Log the email as a contact activity
  await DB.add(STORES.activities, {
    id: generateId(),
    userId: currentUser.id,
    contactId,
    type: 'email_sent',
    description: `Email sent to ${contact.email}${bccEmail ? ' (BCC: ' + bccEmail + ')' : ''}`,
    timestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  // Update last contact date
  contact.lastContactDate = new Date().toISOString();
  await DB.put(STORES.contacts, contact);

  showToast(`Email client opened for ${contact.fullName}${bccEmail ? ' (BCC logged)' : ''}`, 'info');
}
