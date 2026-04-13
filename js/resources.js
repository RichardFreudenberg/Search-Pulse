/* ============================================
   Nexus CRM — Resources
   ============================================ */

const RESOURCE_CATEGORIES = [
  { id: 'all', label: 'All Resources' },
  { id: 'research', label: 'Research & Studies' },
  { id: 'communities', label: 'Communities' },
  { id: 'podcasts', label: 'Podcasts & Media' },
  { id: 'tools', label: 'Tools & Platforms' },
  { id: 'education', label: 'Education' },
  { id: 'investors', label: 'Investors & LPs' },
];

let currentResourceCategory = 'all';

const CURATED_RESOURCES = [
  // Research & Studies
  {
    category: 'research',
    name: 'Stanford GSB Search Fund Study',
    description: 'The definitive biannual study on search fund performance, outcomes, and returns — the gold standard dataset for the industry.',
    url: 'https://www.gsb.stanford.edu/faculty-research/centers-initiatives/ces/research/search-funds',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=stanford.edu',
    tags: ['Data', 'Performance', 'Returns'],
    featured: true,
  },
  {
    category: 'research',
    name: 'IESE Search Fund Report',
    description: 'Comprehensive analysis of the European and international search fund landscape, including deal structures and investor returns.',
    url: 'https://www.iese.edu/faculty-research/search-funds/',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=iese.edu',
    tags: ['Europe', 'International', 'Data'],
    featured: true,
  },
  {
    category: 'research',
    name: 'HBS Search Fund Primer',
    description: 'Harvard Business School\'s introductory guide to the search fund model — essential reading for aspiring searchers.',
    url: 'https://www.hbs.edu/faculty/Pages/item.aspx?num=48440',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=hbs.edu',
    tags: ['Primer', 'Guide', 'HBS'],
  },
  {
    category: 'research',
    name: 'Search Fund Journal',
    description: 'Academic and practitioner perspectives on search fund economics, deal sourcing, and operational best practices.',
    url: 'https://www.searchfundjournal.com',
    logo: '',
    tags: ['Academic', 'Deal Sourcing'],
  },

  // Communities
  {
    category: 'communities',
    name: 'Searchfunder.com',
    description: 'The largest online community for search fund entrepreneurs, investors, and advisors. Active forums, deal sharing, and mentorship.',
    url: 'https://www.searchfunder.com',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=searchfunder.com',
    tags: ['Forum', 'Networking', 'Deals'],
    featured: true,
  },
  {
    category: 'communities',
    name: 'ETA Network (Stanford)',
    description: 'Stanford GSB\'s Entrepreneurship Through Acquisition network — events, resources, and alumni connections.',
    url: 'https://www.gsb.stanford.edu/experience/clubs-organizations/entrepreneurship-through-acquisition',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=stanford.edu',
    tags: ['Stanford', 'Alumni', 'Events'],
  },
  {
    category: 'communities',
    name: 'Search Fund Accelerator',
    description: 'Programs and cohorts that help searchers through the fundraising, search, and acquisition process with mentorship.',
    url: 'https://www.searchfundaccelerator.com',
    logo: '',
    tags: ['Accelerator', 'Mentorship'],
  },

  // Podcasts & Media
  {
    category: 'podcasts',
    name: 'Think Like an Owner',
    description: 'In-depth interviews with search fund operators, small business acquirers, and investors. Hosted by Alex Demaree.',
    url: 'https://thinklikeanowner.com',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=thinklikeanowner.com',
    tags: ['Podcast', 'Interviews', 'Operators'],
    featured: true,
  },
  {
    category: 'podcasts',
    name: 'Acquiring Minds',
    description: 'Stories from people who have bought small businesses — from search through close to operations.',
    url: 'https://acquiringminds.co',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=acquiringminds.co',
    tags: ['Podcast', 'Stories', 'Acquisitions'],
  },
  {
    category: 'podcasts',
    name: 'The SMB Podcast',
    description: 'Focused on small and medium business acquisitions, operations, and growth strategies for entrepreneurs.',
    url: 'https://www.smbpodcast.com',
    logo: '',
    tags: ['Podcast', 'SMB', 'Growth'],
  },
  {
    category: 'podcasts',
    name: 'How I Built This (NPR)',
    description: 'Stories behind some of the world\'s best-known companies — great inspiration for acquisition entrepreneurs.',
    url: 'https://www.npr.org/series/490248027/how-i-built-this',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=npr.org',
    tags: ['Podcast', 'Entrepreneurship', 'Inspiration'],
  },

  // Tools & Platforms
  {
    category: 'tools',
    name: 'BizBuySell',
    description: 'The internet\'s largest business-for-sale marketplace. Browse thousands of businesses available for acquisition.',
    url: 'https://www.bizbuysell.com',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=bizbuysell.com',
    tags: ['Marketplace', 'Deal Flow', 'Listings'],
    featured: true,
  },
  {
    category: 'tools',
    name: 'Axial',
    description: 'Premium deal sourcing platform connecting lower middle market buyers, sellers, and advisors.',
    url: 'https://www.axial.net',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=axial.net',
    tags: ['Deal Flow', 'M&A', 'Platform'],
  },
  {
    category: 'tools',
    name: 'PitchBook',
    description: 'Comprehensive private market data — PE, VC, and M&A deal tracking, valuations, and industry analysis.',
    url: 'https://pitchbook.com',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=pitchbook.com',
    tags: ['Data', 'Valuations', 'PE'],
  },
  {
    category: 'tools',
    name: 'Caplinked',
    description: 'Virtual data rooms for M&A due diligence. Secure document sharing for deal processes.',
    url: 'https://www.caplinked.com',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=caplinked.com',
    tags: ['Data Room', 'Due Diligence'],
  },

  // Education
  {
    category: 'education',
    name: 'Stanford ETA Course',
    description: 'Stanford GSB\'s Entrepreneurship Through Acquisition course materials and case studies.',
    url: 'https://www.gsb.stanford.edu/faculty-research/centers-initiatives/ces/research/search-funds',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=stanford.edu',
    tags: ['Course', 'Cases', 'Stanford'],
  },
  {
    category: 'education',
    name: 'IESE Search Fund Programs',
    description: 'IESE Business School search fund courses and executive education — Europe\'s leading ETA program.',
    url: 'https://www.iese.edu/faculty-research/search-funds/',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=iese.edu',
    tags: ['Europe', 'Executive Ed', 'IESE'],
  },
  {
    category: 'education',
    name: 'HBS Online: Entrepreneurship',
    description: 'Harvard Business School Online entrepreneurship programs including acquisition-focused modules.',
    url: 'https://online.hbs.edu/subjects/entrepreneurship/',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=hbs.edu',
    tags: ['Online', 'HBS', 'Entrepreneurship'],
  },

  // Investors & LPs
  {
    category: 'investors',
    name: 'Alpine Investors',
    description: 'PeopleFirst PE firm and one of the largest search fund investors. Software and services focus.',
    url: 'https://alpineinvestors.com',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=alpineinvestors.com',
    tags: ['PE', 'Software', 'Services'],
    featured: true,
  },
  {
    category: 'investors',
    name: 'Pacific Lake Partners',
    description: 'One of the most active search fund investors with a deep track record of backing searchers.',
    url: 'https://www.pacificlake.com',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=pacificlake.com',
    tags: ['LP', 'Search Fund'],
  },
  {
    category: 'investors',
    name: 'Relay Investments',
    description: 'Search fund accelerator and investor platform — helps searchers from fundraising through acquisition.',
    url: 'https://www.relayinvestments.com',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=relayinvestments.com',
    tags: ['Accelerator', 'LP'],
  },
  {
    category: 'investors',
    name: 'Search Fund Partners',
    description: 'Dedicated search fund LP providing capital and mentorship to search fund entrepreneurs.',
    url: 'https://searchfundpartners.com',
    logo: 'https://www.google.com/s2/favicons?sz=64&domain=searchfundpartners.com',
    tags: ['LP', 'Mentorship'],
  },
];

async function renderResources() {
  const pageContent = document.getElementById('page-content');

  const filtered = currentResourceCategory === 'all'
    ? CURATED_RESOURCES
    : CURATED_RESOURCES.filter(r => r.category === currentResourceCategory);

  const featured = CURATED_RESOURCES.filter(r => r.featured);

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      ${renderPageHeader('Resources', 'Curated tools, research, and communities for search fund professionals')}

      <!-- Category Tabs -->
      <div class="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-1 px-1">
        ${RESOURCE_CATEGORIES.map(cat => `
          <button onclick="switchResourceCategory('${cat.id}')" id="resource-tab-${cat.id}"
            class="px-4 py-2 rounded text-sm font-medium whitespace-nowrap transition-all ${currentResourceCategory === cat.id
              ? 'bg-brand-600 text-white shadow-sm'
              : 'bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-brand-300 dark:hover:border-brand-700'}">
            ${cat.label}
          </button>
        `).join('')}
      </div>

      <!-- Featured Section (only on "All") -->
      ${currentResourceCategory === 'all' ? `
        <div class="mb-8">
          <h2 class="text-base font-semibold mb-4">Featured Resources</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${featured.map(r => renderResourceCard(r, true)).join('')}
          </div>
        </div>
      ` : ''}

      <!-- All Resources Grid -->
      <div>
        <h2 class="text-base font-semibold mb-4">${currentResourceCategory === 'all' ? 'All Resources' : RESOURCE_CATEGORIES.find(c => c.id === currentResourceCategory)?.label || 'Resources'}</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${filtered.map(r => renderResourceCard(r, false)).join('')}
        </div>
        ${filtered.length === 0 ? `
          <div class="text-center py-12">
            <p class="text-sm text-surface-500">No resources in this category yet.</p>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderResourceCard(resource, isFeatured) {
  const catLabel = RESOURCE_CATEGORIES.find(c => c.id === resource.category)?.label || '';

  return `
    <a href="${escapeHtml(resource.url)}" target="_blank" rel="noopener" class="card card-interactive block ${isFeatured ? 'border-brand-200 dark:border-brand-800' : ''}">
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0 w-12 h-12 rounded bg-surface-100 dark:bg-surface-800 flex items-center justify-center overflow-hidden border border-surface-200 dark:border-surface-700">
          ${resource.logo
            ? `<img src="${escapeHtml(resource.logo)}" alt="" class="w-8 h-8 object-contain" onerror="this.parentElement.innerHTML='<span class=\\'text-lg font-bold text-surface-400\\'>${resource.name.charAt(0)}</span>'" />`
            : `<span class="text-lg font-bold text-surface-400">${resource.name.charAt(0)}</span>`}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="text-sm font-semibold truncate">${escapeHtml(resource.name)}</h3>
            ${isFeatured ? '<span class="text-xs bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-1.5 py-0.5 rounded-full font-medium">Featured</span>' : ''}
          </div>
          <p class="text-xs text-surface-500 mb-2 line-clamp-2">${escapeHtml(resource.description)}</p>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs text-surface-400">${catLabel}</span>
            ${(resource.tags || []).slice(0, 3).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
        <svg class="w-4 h-4 text-surface-300 dark:text-surface-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
      </div>
    </a>
  `;
}

function switchResourceCategory(catId) {
  currentResourceCategory = catId;

  RESOURCE_CATEGORIES.forEach(cat => {
    const tab = document.getElementById(`resource-tab-${cat.id}`);
    if (tab) {
      if (cat.id === catId) {
        tab.className = 'px-4 py-2 rounded text-sm font-medium whitespace-nowrap transition-all bg-brand-600 text-white shadow-sm';
      } else {
        tab.className = 'px-4 py-2 rounded text-sm font-medium whitespace-nowrap transition-all bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-brand-300 dark:hover:border-brand-700';
      }
    }
  });

  renderResources();
}
