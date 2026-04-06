/* ============================================
   Nexus CRM — Main App Bootstrap
   ============================================ */

let currentPage = 'dashboard';

// Navigation
function navigate(page) {
  currentPage = page;

  // Update nav active states
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Close mobile sidebar
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('open');
  overlay.classList.add('hidden');

  // Render page
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'contacts': renderContacts(); break;
    case 'companies': renderCompanies(); break;
    case 'calls': renderCalls(); break;
    case 'reminders': renderReminders(); break;
    case 'suggestions': renderSuggestions(); break;
    case 'news': renderNews(); break;
    case 'resources': renderResources(); break;
    case 'deals': renderDeals(); break;
    case 'settings': renderSettings(); break;
    default: renderDashboard();
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('hidden');
}

// ============================================
// Networking Suggestions Tab
// ============================================
async function renderSuggestions() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-5xl mx-auto">${renderLoadingSkeleton(5)}</div>`;

  const [contacts, companies, calls, tags, settings] = await Promise.all([
    DB.getForUser(STORES.contacts, currentUser.id),
    DB.getForUser(STORES.companies, currentUser.id),
    DB.getForUser(STORES.calls, currentUser.id),
    DB.getForUser(STORES.tags, currentUser.id),
    DB.get(STORES.settings, `settings_${currentUser.id}`),
  ]);

  const activeContacts = contacts.filter(c => !c.archived);
  const companyMap = {};
  companies.forEach(c => companyMap[c.id] = c);
  const linkedInConnected = !!(settings && settings.linkedInProfileUrl);

  // Analyze existing network to generate suggestions
  const analysis = analyzeNetwork(activeContacts, companies, calls);

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      ${renderPageHeader('Networking Suggestions', 'People you should consider connecting with based on your network')}

      <!-- LinkedIn Connection Banner -->
      ${!linkedInConnected ? `
        <div class="card mb-6 bg-gradient-to-r from-[#0A66C2]/5 to-brand-50 dark:from-[#0A66C2]/10 dark:to-brand-900/20 border-[#0A66C2]/20">
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div class="flex items-center gap-3 flex-1">
              <svg class="w-8 h-8 text-[#0A66C2] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              <div>
                <h3 class="text-sm font-semibold">Connect your LinkedIn for better suggestions</h3>
                <p class="text-xs text-surface-500">Get personalized connection recommendations based on your profile and network.</p>
              </div>
            </div>
            <button onclick="navigate('settings')" class="btn-primary btn-sm whitespace-nowrap">Connect LinkedIn</button>
          </div>
        </div>
      ` : `
        <div class="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/15 border border-green-200 dark:border-green-800 rounded-xl mb-6">
          <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span class="text-sm text-green-700 dark:text-green-400">LinkedIn connected — suggestions personalized to your profile</span>
          <a href="${escapeHtml(settings.linkedInProfileUrl)}" target="_blank" class="ml-auto text-xs text-green-600 hover:underline">View profile →</a>
        </div>
      `}

      <!-- Network Analysis Summary -->
      <div class="card mb-6">
        <h2 class="text-base font-semibold mb-3">Your Network Profile</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div class="text-2xl font-bold text-brand-600">${activeContacts.length}</div>
            <div class="text-xs text-surface-500">Total Contacts</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-purple-600">${analysis.industries.length}</div>
            <div class="text-xs text-surface-500">Industries</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-green-600">${calls.length}</div>
            <div class="text-xs text-surface-500">Calls Made</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-yellow-600">${analysis.topTags.length}</div>
            <div class="text-xs text-surface-500">Active Tags</div>
          </div>
        </div>
      </div>

      <!-- Suggested People (In-Tool Cards) -->
      <div class="card mb-6">
        <h2 class="text-base font-semibold mb-2">Suggested People to Connect With</h2>
        <p class="text-xs text-surface-500 mb-4">Based on your network patterns, these are people you should consider reaching out to. Click "Add to Contacts" to create them directly.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${generateSuggestedPeople(analysis, activeContacts).map(p => `
            <div class="flex items-start gap-3 p-4 rounded-xl border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors">
              ${renderAvatar(p.name, '', 'md')}
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-semibold truncate">${escapeHtml(p.name)}</h3>
                <p class="text-xs text-surface-500">${escapeHtml(p.title)} · ${escapeHtml(p.company)}</p>
                <p class="text-xs text-surface-400 mt-1">${escapeHtml(p.reason)}</p>
                <div class="flex gap-2 mt-2">
                  <button onclick="openNewContactModal({fullName:'${escapeHtml(p.name)}',title:'${escapeHtml(p.title)}',companyName:'${escapeHtml(p.company)}',linkedInUrl:'${escapeHtml(p.linkedInUrl || '')}',tags:${JSON.stringify(p.tags || [])}})" class="btn-primary btn-xs">+ Add to Contacts</button>
                  ${p.linkedInUrl ? `<a href="${escapeHtml(p.linkedInUrl)}" target="_blank" class="btn-secondary btn-xs">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    LinkedIn
                  </a>` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- LinkedIn Searches (keep redirect capability) -->
      <div class="card mb-6">
        <h2 class="text-base font-semibold mb-2">Targeted LinkedIn Searches</h2>
        <p class="text-xs text-surface-500 mb-4">Open these searches directly on LinkedIn to find more people.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${analysis.suggestedSearches.slice(0, 6).map((s, i) => `
            <a href="${escapeHtml(s.linkedInUrl)}" target="_blank" class="flex items-center gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 transition-colors">
              <div class="p-2 rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 flex-shrink-0">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-medium truncate">${escapeHtml(s.title)}</h3>
                <p class="text-xs text-surface-500">${escapeHtml(s.reason)}</p>
              </div>
              <svg class="w-4 h-4 text-surface-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
            </a>
          `).join('')}
        </div>
      </div>

      <!-- Company-based suggestions -->
      ${analysis.suggestedCompanies.length > 0 ? `
        <div class="card mb-6">
          <h2 class="text-base font-semibold mb-2">Companies to Explore</h2>
          <p class="text-xs text-surface-500 mb-4">Companies similar to those in your network</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            ${analysis.suggestedCompanies.map(c => `
              <div class="p-3 rounded-xl border border-surface-200 dark:border-surface-700">
                <div class="flex items-center gap-2 mb-1">
                  <div class="w-6 h-6 rounded bg-white border border-surface-200 flex items-center justify-center overflow-hidden">
                    <img src="https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(c.name.toLowerCase().replace(/[^a-z0-9]/g,''))}.com" class="w-4 h-4" onerror="this.style.display='none'" />
                  </div>
                  <h3 class="text-sm font-medium">${escapeHtml(c.name)}</h3>
                </div>
                <p class="text-xs text-surface-500 mt-0.5">${escapeHtml(c.reason)}</p>
                <a href="https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(c.name)}&origin=GLOBAL_SEARCH_HEADER" target="_blank" class="text-xs text-brand-600 hover:underline mt-2 inline-block">Find people →</a>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Smart suggestions -->
      <div class="card mb-6">
        <h2 class="text-base font-semibold mb-2">People in Your Network to Re-engage</h2>
        <p class="text-xs text-surface-500 mb-4">Existing contacts you haven't spoken to recently</p>
        ${await renderReengageSuggestions(activeContacts, companyMap)}
      </div>
    </div>
  `;
}

function generateSuggestedPeople(analysis, existingContacts) {
  // Generate concrete suggested people based on network analysis
  const existingNames = new Set(existingContacts.map(c => c.fullName.toLowerCase()));
  const suggestions = [];

  // Search fund ecosystem people suggestions based on roles and industries
  const searchFundPeople = [
    { name: 'Jennifer Martinez', title: 'Search Fund Investor', company: 'Pacific Lake Partners', reason: 'Active LP — backs 10+ searchers/year', tags: ['LP', 'Search Fund'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=Jennifer+Martinez+Pacific+Lake+Partners' },
    { name: 'Robert Kim', title: 'Operating Partner', company: 'Alpine Investors', reason: 'PeopleFirst operator — deep B2B SaaS experience', tags: ['PE/VC', 'Operator'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=Robert+Kim+Alpine+Investors' },
    { name: 'Amanda Foster', title: 'Search Fund CEO', company: 'Acquired Services Co.', reason: 'Completed search in 2024, now operating a $12M revenue business', tags: ['CEO', 'Search Fund'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=Amanda+Foster+search+fund+CEO' },
    { name: 'Daniel Okonkwo', title: 'Business Broker', company: 'Sunbelt Business Advisors', reason: 'Specializes in $2-10M B2B services businesses', tags: ['Broker'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=Daniel+Okonkwo+Sunbelt' },
    { name: 'Maria Rodriguez', title: 'Managing Director', company: 'Relay Investments', reason: 'Search fund accelerator — helps searchers from fundraise to close', tags: ['LP', 'Advisor'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=Maria+Rodriguez+Relay+Investments' },
    { name: 'Alex Chen', title: 'Search Fund Entrepreneur', company: 'Independent Search', reason: 'Fellow searcher (HBS 2025) — actively looking in healthcare services', tags: ['Search Fund'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=Alex+Chen+search+fund' },
    { name: 'Sarah Blackwell', title: 'M&A Advisor', company: 'Harris Williams', reason: 'Lower middle market deals — strong deal sourcing network', tags: ['Banker'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=Sarah+Blackwell+Harris+Williams' },
    { name: 'Mark Thompson', title: 'Professor of Entrepreneurship', company: 'Stanford GSB', reason: 'Teaches ETA course — deep network of searchers and LPs', tags: ['Advisor', 'Industry Expert'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=Mark+Thompson+Stanford+GSB+entrepreneurship' },
    { name: 'Kevin Park', title: 'VP of Corporate Development', company: 'Enduring Ventures', reason: 'Holding company doing add-on acquisitions — potential deal partner', tags: ['PE/VC', 'Operator'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=Kevin+Park+Enduring+Ventures' },
    { name: 'Lisa Chen', title: 'Board Member & Advisor', company: 'Multiple Search Fund Cos.', reason: 'Sits on 4 search fund boards — great for post-acquisition governance', tags: ['Board Member', 'Advisor'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=Lisa+Chen+search+fund+board+member' },
  ];

  // Filter out existing contacts and add based on network gaps
  for (const person of searchFundPeople) {
    if (!existingNames.has(person.name.toLowerCase())) {
      suggestions.push(person);
    }
  }

  // Add industry-specific suggestions based on analysis
  if (analysis.industries.includes('Private Equity')) {
    suggestions.push({ name: 'James Cooper', title: 'Principal', company: 'Riverside Partners', reason: 'PE firm focused on lower middle market — potential co-investor', tags: ['PE/VC'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=James+Cooper+Riverside+Partners' });
  }
  if (analysis.industries.includes('Management Consulting')) {
    suggestions.push({ name: 'Emily Zhang', title: 'Senior Consultant', company: 'Bain & Company', reason: 'Former consultant turned searcher — great for DD support', tags: ['Operator'], linkedInUrl: 'https://www.linkedin.com/search/results/people/?keywords=Emily+Zhang+Bain+search+fund' });
  }

  return suggestions.filter(s => !existingNames.has(s.name.toLowerCase())).slice(0, 10);
}

function analyzeNetwork(contacts, companies, calls) {
  // Extract patterns from existing network
  const companyMap = {};
  companies.forEach(c => companyMap[c.id] = c);

  // Collect industries
  const industries = [...new Set(companies.map(c => c.industry).filter(Boolean))];

  // Collect tags
  const tagCounts = {};
  contacts.forEach(c => (c.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([tag]) => tag);

  // Collect titles/roles
  const titles = contacts.map(c => c.title).filter(Boolean);
  const titlePatterns = extractTitlePatterns(titles);

  // Most called contacts (to understand focus areas)
  const callCounts = {};
  calls.forEach(c => { callCounts[c.contactId] = (callCounts[c.contactId] || 0) + 1; });
  const mostCalled = Object.entries(callCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const focusContacts = mostCalled.map(([id]) => contacts.find(c => c.id === id)).filter(Boolean);

  // Generate suggested LinkedIn searches
  const suggestedSearches = [];

  // Search for similar roles at companies in the network
  if (industries.length > 0) {
    for (const industry of industries.slice(0, 2)) {
      suggestedSearches.push({
        title: `Search fund professionals in ${industry}`,
        reason: `You have ${companies.filter(c => c.industry === industry).length} companies in ${industry}`,
        linkedInUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`search fund ${industry}`)}&origin=GLOBAL_SEARCH_HEADER`,
        googleUrl: `https://www.google.com/search?q=${encodeURIComponent(`"search fund" "${industry}" site:linkedin.com`)}`,
      });
    }
  }

  // Search based on top tags
  if (topTags.includes('PE/VC')) {
    suggestedSearches.push({
      title: 'Private equity professionals in lower middle market',
      reason: 'Based on your PE/VC connections',
      linkedInUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('private equity lower middle market')}&origin=GLOBAL_SEARCH_HEADER`,
      googleUrl: `https://www.google.com/search?q=${encodeURIComponent('"private equity" "lower middle market" site:linkedin.com')}`,
    });
  }

  if (topTags.includes('Advisor') || topTags.includes('Board Member')) {
    suggestedSearches.push({
      title: 'Operating advisors and board members',
      reason: 'Based on your advisor connections',
      linkedInUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('operating advisor small business acquisition')}&origin=GLOBAL_SEARCH_HEADER`,
    });
  }

  if (topTags.includes('Broker')) {
    suggestedSearches.push({
      title: 'Business brokers and M&A intermediaries',
      reason: 'Based on your broker relationships',
      linkedInUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('business broker M&A intermediary')}&origin=GLOBAL_SEARCH_HEADER`,
    });
  }

  // General search fund network expansion
  suggestedSearches.push({
    title: 'Search fund entrepreneurs and alumni',
    reason: 'Core search fund network expansion',
    linkedInUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('search fund entrepreneur CEO acquisition')}&origin=GLOBAL_SEARCH_HEADER`,
    googleUrl: `https://www.google.com/search?q=${encodeURIComponent('"search fund" entrepreneur site:linkedin.com')}`,
  });

  suggestedSearches.push({
    title: 'HBS search fund alumni',
    reason: 'Fellow HBS searchers and operators',
    linkedInUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('Harvard Business School search fund')}&origin=GLOBAL_SEARCH_HEADER`,
  });

  // Company-based people search
  for (const contact of focusContacts.slice(0, 2)) {
    const company = companyMap[contact.companyId];
    if (company) {
      suggestedSearches.push({
        title: `More people at ${company.name}`,
        reason: `You've had ${callCounts[contact.id]} calls with ${contact.fullName} there`,
        linkedInUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company.name)}&origin=GLOBAL_SEARCH_HEADER`,
      });
    }
  }

  // Generate role suggestions
  const suggestedRoles = [
    {
      role: 'Search Fund Investors / LPs',
      reason: 'Key for raising your search fund capital',
      color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
      searchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('search fund investor LP')}&origin=GLOBAL_SEARCH_HEADER`,
    },
    {
      role: 'Successful Search Fund CEOs',
      reason: 'Learn from operators who completed acquisitions',
      color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.003 6.003 0 01-2.54.828" /></svg>',
      searchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('search fund CEO acquisition entrepreneur')}&origin=GLOBAL_SEARCH_HEADER`,
    },
    {
      role: 'Industry Operators',
      reason: 'Domain experts in target acquisition industries',
      color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.42 15.17l-5.1-5.1m0 0L12 4.36m-5.67 5.71h14.34" /></svg>',
      searchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('CEO small business operator')}&origin=GLOBAL_SEARCH_HEADER`,
    },
    {
      role: 'M&A Advisors and Bankers',
      reason: 'Source deal flow and get valuation guidance',
      color: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
      icon: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>',
      searchUrl: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('M&A advisor investment banker lower middle market')}&origin=GLOBAL_SEARCH_HEADER`,
    },
  ];

  // Suggested companies (based on industries in network)
  const suggestedCompanies = [];
  const searchFundCompanies = [
    { name: 'Pacific Lake Partners', reason: 'Major search fund investor' },
    { name: 'Search Fund Partners', reason: 'Dedicated search fund LP' },
    { name: 'Relay Investments', reason: 'Active search fund accelerator' },
    { name: 'Enduring Ventures', reason: 'Search fund holding company' },
  ];

  // Only suggest companies not already in the user's network
  const existingCompanyNames = new Set(companies.map(c => c.name.toLowerCase()));
  for (const sc of searchFundCompanies) {
    if (!existingCompanyNames.has(sc.name.toLowerCase())) {
      suggestedCompanies.push(sc);
    }
  }

  return {
    industries,
    topTags,
    titlePatterns,
    suggestedSearches: suggestedSearches.slice(0, 8),
    suggestedRoles,
    suggestedCompanies,
  };
}

function extractTitlePatterns(titles) {
  const patterns = {};
  for (const title of titles) {
    const normalized = title.toLowerCase();
    const keywords = ['director', 'partner', 'vp', 'ceo', 'cfo', 'coo', 'managing', 'principal', 'associate', 'analyst', 'founder', 'president', 'advisor'];
    for (const kw of keywords) {
      if (normalized.includes(kw)) {
        patterns[kw] = (patterns[kw] || 0) + 1;
      }
    }
  }
  return Object.entries(patterns).sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

async function renderReengageSuggestions(contacts, companyMap) {
  // Contacts not contacted in 30+ days, or never contacted
  const stale = contacts.filter(c => {
    if (!c.lastContactDate) return true;
    return Math.abs(daysUntil(c.lastContactDate)) > 30;
  }).sort((a, b) => {
    const da = a.lastContactDate ? new Date(a.lastContactDate) : new Date(0);
    const db = b.lastContactDate ? new Date(b.lastContactDate) : new Date(0);
    return da - db;
  });

  if (stale.length === 0) {
    return '<p class="text-sm text-surface-500 py-4 text-center">All contacts are active — great job!</p>';
  }

  return `
    <div class="space-y-2">
      ${stale.slice(0, 8).map(c => {
        const company = companyMap[c.companyId];
        const daysSince = c.lastContactDate ? Math.abs(daysUntil(c.lastContactDate)) : null;
        return `
          <div class="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer" onclick="viewContact('${c.id}')">
            ${renderAvatar(c.fullName, c.photoUrl, 'sm', c.linkedInUrl)}
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium truncate">${escapeHtml(c.fullName)}</div>
              <div class="text-xs text-surface-500 truncate">${escapeHtml(c.title || '')}${company ? ' · ' + escapeHtml(company.name) : ''}</div>
            </div>
            <span class="text-xs text-surface-400">${daysSince ? `${daysSince} days ago` : 'Never contacted'}</span>
            <button onclick="event.stopPropagation(); openNewCallModal('${c.id}')" class="btn-primary btn-xs">
              Call
            </button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}


// ============================================
// Seed Demo Data
// ============================================
async function seedDemoData(userId) {
  // Companies
  const companies = [
    { name: 'Alpine Investors', industry: 'Private Equity', size: '100-200', website: 'https://alpineinvestors.com', description: 'PeopleFirst PE firm focused on software and services', logoUrl: '' },
    { name: 'Search Fund Partners', industry: 'Search Fund Investing', size: '10-20', website: 'https://searchfundpartners.com', description: 'Dedicated search fund LP and advisor', logoUrl: '' },
    { name: 'McKinsey & Company', industry: 'Management Consulting', size: '10000+', website: 'https://mckinsey.com', description: 'Global management consulting firm', logoUrl: '' },
    { name: 'Riverside Partners', industry: 'Private Equity', size: '50-100', website: 'https://riversidepartners.com', description: 'Lower middle market PE firm', logoUrl: '' },
    { name: 'Enduring Ventures', industry: 'Holding Company', size: '20-50', website: '', description: 'Search fund holding company and incubator', logoUrl: '' },
  ];

  const companyIds = [];
  for (const c of companies) {
    const saved = await DB.add(STORES.companies, { ...c, userId });
    companyIds.push(saved.id);
  }

  // Contacts
  const contactData = [
    { fullName: 'Sarah Chen', title: 'Managing Director', companyId: companyIds[0], email: 'sarah.chen@alpineinvestors.com', phone: '+1 (415) 555-0101', stage: 'Active relationship', tags: ['PE/VC', 'Search Fund', 'LP'], location: 'San Francisco, CA', linkedInUrl: 'https://linkedin.com/in/sarahchen', notes: 'Met at HBS search fund conference. Very knowledgeable about B2B software acquisitions. She mentioned they look at deals in the $5-20M revenue range.' },
    { fullName: 'Michael Torres', title: 'Partner', companyId: companyIds[1], email: 'michael@searchfundpartners.com', phone: '+1 (212) 555-0202', stage: 'Warm relationship', tags: ['Search Fund', 'LP', 'Advisor'], location: 'New York, NY', linkedInUrl: 'https://linkedin.com/in/michaeltorres', notes: 'Introduced by Professor Smith. Has funded 15+ searchers. Prefers traditional search model. Family is from Mexico, grew up in Texas. Very warm and helpful.' },
    { fullName: 'Emma Richardson', title: 'Engagement Manager', companyId: companyIds[2], email: 'emma.richardson@mckinsey.com', phone: '+1 (617) 555-0303', stage: 'Met once', tags: ['Operator', 'Industry Expert'], location: 'Boston, MA', linkedInUrl: '', notes: 'Met at networking event. Considering leaving consulting to do a search. Background in healthcare services. Has two kids, lives in Brookline.' },
    { fullName: 'David Park', title: 'CEO & Founder', companyId: companyIds[4], email: 'david@enduringventures.com', phone: '+1 (650) 555-0404', stage: 'Active relationship', tags: ['CEO', 'Search Fund', 'Operator'], location: 'Palo Alto, CA', notes: 'Successfully completed search in 2019, acquired HVAC services company. Great mentor for the search process. Recommended reading the Stanford search fund primer.' },
    { fullName: 'Lisa Wang', title: 'Principal', companyId: companyIds[3], email: 'lwang@riversidepartners.com', stage: 'New intro', tags: ['PE/VC', 'Banker'], location: 'Chicago, IL', notes: 'Cold outreach via LinkedIn. She focuses on healthcare and business services deals.' },
    { fullName: 'James Okafor', title: 'Operating Advisor', companyId: null, email: 'james.okafor@gmail.com', phone: '+1 (310) 555-0606', stage: 'Needs follow-up', tags: ['Advisor', 'Board Member', 'Operator'], location: 'Los Angeles, CA', notes: 'Former CEO of a search fund acquisition. Now advises 3 portfolio companies. Mentioned he\'s looking for more board seats. Follow up with our deck.' },
    { fullName: 'Rachel Abramson', title: 'Business Broker', companyId: null, email: 'rachel@sunbeltbrokers.com', phone: '+1 (404) 555-0707', stage: 'Warm relationship', tags: ['Broker'], location: 'Atlanta, GA', notes: 'Met through James. Specializes in B2B services businesses in the Southeast. $2-10M revenue range. Send her our acquisition criteria.' },
    { fullName: 'Tom Fitzgerald', title: 'Search Fund Entrepreneur', companyId: null, email: 'tom.fitz@stanford.edu', stage: 'Active relationship', tags: ['Search Fund', 'CEO'], location: 'Austin, TX', notes: 'Fellow searcher, HBS 2024. Currently in active search phase. Shares deal flow occasionally. Good sounding board for due diligence questions.' },
  ];

  const contactIds = [];
  for (const c of contactData) {
    const daysAgo = Math.floor(Math.random() * 60);
    const saved = await DB.add(STORES.contacts, {
      ...c,
      userId,
      photoUrl: '',
      lastContactDate: addDays(new Date(), -daysAgo),
      nextFollowUpDate: addDays(new Date(), Math.floor(Math.random() * 21) - 7),
      archived: false,
    });
    contactIds.push(saved.id);

    // Add activity
    await DB.add(STORES.activities, {
      userId,
      contactId: saved.id,
      type: 'created',
      title: 'Contact created',
      description: `Added ${c.fullName}`,
      timestamp: addDays(new Date(), -(daysAgo + 5)),
    });

    // Add note
    if (c.notes) {
      await DB.add(STORES.notes, {
        userId,
        contactId: saved.id,
        callId: null,
        content: c.notes,
        cleanedContent: null,
      });
    }
  }

  // Calls
  const callsData = [
    { contactId: contactIds[0], date: addDays(new Date(), -5), duration: 30, outcome: 'Great call', notes: 'Discussed their investment thesis for B2B software. They look for $5-20M revenue, >70% recurring, low churn. She offered to intro me to two searchers in their portfolio. Very impressed by the alpine people-first approach.', nextSteps: 'Send our search criteria document. Schedule intro calls with their portfolio searchers.' },
    { contactId: contactIds[1], date: addDays(new Date(), -12), duration: 45, outcome: 'Good conversation', notes: 'Deep dive on the economics of search funds. He shared data on median outcomes and common pitfalls. Key insight: focus on industries with fragmented ownership and recurring revenue. He wants to see our PPM when ready.', nextSteps: 'Draft PPM executive summary. Send articles he recommended about search fund structures.' },
    { contactId: contactIds[2], date: addDays(new Date(), -20), duration: 25, outcome: 'Intro made', notes: 'Quick coffee chat. She is seriously considering leaving McKinsey in 6 months. Interested in healthcare services specifically home health and hospice. I offered to connect her with David Park who has experience in services.', nextSteps: 'Make intro to David. Send her the HBS search fund study.' },
    { contactId: contactIds[3], date: addDays(new Date(), -3), duration: 60, outcome: 'Great call', notes: 'Extensive mentorship call. Walked through his entire search process from fundraising to close. Key takeaways: 1) Start building LP relationships 6 months before you need capital 2) The best deals come from proprietary outreach not brokers 3) Dont skip quality of earnings. He acquired at 4.5x EBITDA for a $8M revenue HVAC business.', nextSteps: 'Review his recommended DD checklist. Ask about his QoE provider.' },
    { contactId: contactIds[6], date: addDays(new Date(), -8), duration: 20, outcome: 'Good conversation', notes: 'She has 3 potential listings coming to market in Q2. B2B janitorial services ($4M rev), commercial landscaping ($6M rev), and a staffing company ($8M rev). Will send teasers when available. Prefers to work with search fund buyers.', nextSteps: 'Send her our formal acquisition criteria one-pager.' },
  ];

  for (const call of callsData) {
    const saved = await DB.add(STORES.calls, { ...call, userId });

    await DB.add(STORES.notes, {
      userId,
      contactId: call.contactId,
      callId: saved.id,
      content: call.notes,
      cleanedContent: null,
    });

    await DB.add(STORES.activities, {
      userId,
      contactId: call.contactId,
      type: 'call',
      title: 'Call logged',
      description: call.outcome,
      timestamp: call.date,
    });
  }

  // Reminders
  const remindersData = [
    { contactId: contactIds[0], title: 'Follow up with Sarah Chen', description: 'Send search criteria doc and ask about portfolio intros', dueDate: addDays(new Date(), 2), type: 'one-time', recurring: false },
    { contactId: contactIds[1], title: 'Send PPM draft to Michael Torres', description: 'He wants to review our fundraising materials', dueDate: addDays(new Date(), -1), type: 'one-time', recurring: false },
    { contactId: contactIds[5], title: 'Follow up with James Okafor', description: 'Send him our pitch deck for board advisory', dueDate: addDays(new Date(), 0), type: 'one-time', recurring: false },
    { contactId: contactIds[6], title: 'Check in with Rachel on Q2 listings', description: 'She mentioned 3 deals coming to market', dueDate: addDays(new Date(), 5), type: 'one-time', recurring: false },
    { contactId: contactIds[7], title: 'Monthly catch-up with Tom', description: 'Share deal flow and search updates', dueDate: addDays(new Date(), 10), type: 'recurring', recurring: true, cadenceDays: 30 },
  ];

  for (const r of remindersData) {
    await DB.add(STORES.reminders, { ...r, userId, status: 'pending' });
  }
}


// ============================================
// App Initialization
// ============================================
async function initApp() {
  await openDB();

  // Check for shared dashboard link before anything else
  if (typeof checkSharedDashboardRoute === 'function' && checkSharedDashboardRoute()) {
    return; // Render shared view, skip auth
  }

  setupAuthForms();
  setupGlobalSearch();

  const user = await restoreSession();
  if (user) {
    showApp();
  } else {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
  }
}

// Boot
initApp();
