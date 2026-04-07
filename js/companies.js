/* ============================================
   Nexus CRM — Companies Management
   ============================================ */

async function renderCompanies() {
  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `<div class="p-4 lg:p-8 max-w-7xl mx-auto">${renderLoadingSkeleton(5)}</div>`;

  const [companies, contacts] = await Promise.all([
    DB.getForUser(STORES.companies, currentUser.id),
    DB.getForUser(STORES.contacts, currentUser.id),
  ]);

  const activeContacts = contacts.filter(c => !c.archived);

  // Count contacts per company
  const contactCounts = {};
  activeContacts.forEach(c => {
    if (c.companyId) contactCounts[c.companyId] = (contactCounts[c.companyId] || 0) + 1;
  });

  companies.sort((a, b) => a.name.localeCompare(b.name));

  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      ${renderPageHeader('Companies', `${companies.length} companies`, `
        <button onclick="openNewCompanyModal()" class="btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          New Company
        </button>
      `)}

      ${companies.length === 0 ? renderEmptyState(
        '<svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>',
        'No companies yet',
        'Companies will appear here as you add contacts',
        '<button onclick="openNewCompanyModal()" class="btn-primary">Add Company</button>'
      ) : `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          ${companies.map(c => `
            <div class="card card-interactive" onclick="viewCompany('${c.id}')">
              <div class="flex items-start gap-3">
                ${renderCompanyLogo(c, 'lg')}
                <div class="min-w-0 flex-1">
                  <h3 class="font-medium truncate">${escapeHtml(c.name)}</h3>
                  ${c.industry ? `<p class="text-xs text-surface-500">${escapeHtml(c.industry)}</p>` : ''}
                  ${c.description ? `<p class="text-sm text-surface-600 dark:text-surface-400 mt-1 line-clamp-2">${escapeHtml(truncate(c.description, 100))}</p>` : ''}
                  <div class="flex items-center gap-3 mt-2 text-xs text-surface-500">
                    <span>${contactCounts[c.id] || 0} contacts</span>
                    ${c.size ? `<span>· ${escapeHtml(c.size)} employees</span>` : ''}
                    ${c.website ? `<span>· <a href="${escapeHtml(c.website)}" target="_blank" class="text-brand-600 hover:underline" onclick="event.stopPropagation()">Website</a></span>` : ''}
                  </div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

async function viewCompany(companyId) {
  const [company, contacts] = await Promise.all([
    DB.get(STORES.companies, companyId),
    DB.getForUser(STORES.contacts, currentUser.id),
  ]);

  if (!company) {
    showToast('Company not found', 'error');
    navigate('companies');
    return;
  }

  const companyContacts = contacts.filter(c => c.companyId === companyId && !c.archived);
  const companies = await DB.getForUser(STORES.companies, currentUser.id);
  const companyMap = {};
  companies.forEach(c => companyMap[c.id] = c);

  const pageContent = document.getElementById('page-content');
  pageContent.innerHTML = `
    <div class="p-4 lg:p-8 max-w-5xl mx-auto animate-fade-in">
      <button onclick="navigate('companies')" class="btn-ghost mb-4 -ml-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        Back to companies
      </button>

      <div class="card mb-6">
        <div class="flex items-start gap-4">
          ${renderCompanyLogo(company, 'xl')}
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-semibold">${escapeHtml(company.name)}</h1>
            ${company.industry ? `<p class="text-surface-500 mt-1">${escapeHtml(company.industry)}</p>` : ''}
            ${company.description ? `<p class="text-sm text-surface-600 dark:text-surface-400 mt-2">${escapeHtml(company.description)}</p>` : ''}
            <div class="flex items-center gap-4 mt-3 text-sm text-surface-500">
              ${company.size ? `<span>${escapeHtml(company.size)} employees</span>` : ''}
              ${company.website ? `<a href="${escapeHtml(company.website)}" target="_blank" class="text-brand-600 hover:underline">${escapeHtml(company.website)}</a>` : ''}
            </div>
          </div>
          <button onclick="openEditCompanyModal('${company.id}')" class="btn-secondary btn-sm">Edit</button>
        </div>
      </div>

      <h2 class="text-base font-semibold mb-4">Contacts at ${escapeHtml(company.name)} (${companyContacts.length})</h2>
      ${companyContacts.length === 0 ? '<p class="text-sm text-surface-500 py-4">No contacts from this company</p>' : `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${companyContacts.map(c => renderContactCard(c, company)).join('')}
        </div>
      `}
    </div>
  `;
}

async function openNewCompanyModal() {
  openModal(`
    <div class="p-6">
      <h2 class="text-lg font-semibold mb-6">New Company</h2>
      <form id="new-company-form" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Company Name *</label>
            <input type="text" id="company-name" required class="input-field" placeholder="Acme Corp" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Company Type</label>
            <select id="company-type" class="input-field">
              <option value="">— Select type —</option>
              <option value="Acquisition Target">Acquisition Target</option>
              <option value="Portfolio Company">Portfolio Company</option>
              <option value="Prospect">Prospect</option>
              <option value="Competitor">Competitor</option>
              <option value="Partner / Advisor">Partner / Advisor</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Industry</label>
            <input type="text" id="company-industry" class="input-field" placeholder="Technology" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Size (employees)</label>
            <input type="text" id="company-size" class="input-field" placeholder="50-100" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Website</label>
          <div class="flex gap-2">
            <input type="url" id="company-website" class="input-field flex-1" placeholder="https://example.com" />
            <button type="button" onclick="autoFillCompanyFromWebsite('company')" class="btn-secondary btn-sm whitespace-nowrap" title="Auto-fill from website">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              Auto-fill
            </button>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Logo URL</label>
          <input type="url" id="company-logo" class="input-field" placeholder="https://..." />
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Description</label>
          <textarea id="company-description" class="input-field" rows="3" placeholder="Brief company description…"></textarea>
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
          <button type="submit" class="btn-primary">Save Company</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('new-company-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await DB.add(STORES.companies, {
      userId: currentUser.id,
      name: document.getElementById('company-name').value.trim(),
      companyType: document.getElementById('company-type').value,
      industry: document.getElementById('company-industry').value.trim(),
      size: document.getElementById('company-size').value.trim(),
      website: document.getElementById('company-website').value.trim(),
      logoUrl: document.getElementById('company-logo').value.trim(),
      description: document.getElementById('company-description').value.trim(),
    });
    closeModal();
    showToast('Company created', 'success');
    navigate('companies');
  });
}

async function openEditCompanyModal(companyId) {
  const company = await DB.get(STORES.companies, companyId);

  openModal(`
    <div class="p-6">
      <h2 class="text-lg font-semibold mb-6">Edit Company</h2>
      <form id="edit-company-form" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Company Name *</label>
            <input type="text" id="edit-company-name" required class="input-field" value="${escapeHtml(company.name)}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Company Type</label>
            <select id="edit-company-type" class="input-field">
              <option value="">— Select type —</option>
              <option value="Acquisition Target" ${company.companyType === 'Acquisition Target' ? 'selected' : ''}>Acquisition Target</option>
              <option value="Portfolio Company" ${company.companyType === 'Portfolio Company' ? 'selected' : ''}>Portfolio Company</option>
              <option value="Prospect" ${company.companyType === 'Prospect' ? 'selected' : ''}>Prospect</option>
              <option value="Competitor" ${company.companyType === 'Competitor' ? 'selected' : ''}>Competitor</option>
              <option value="Partner / Advisor" ${company.companyType === 'Partner / Advisor' ? 'selected' : ''}>Partner / Advisor</option>
              <option value="Other" ${company.companyType === 'Other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Industry</label>
            <input type="text" id="edit-company-industry" class="input-field" value="${escapeHtml(company.industry || '')}" />
          </div>
          <div>
            <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Size</label>
            <input type="text" id="edit-company-size" class="input-field" value="${escapeHtml(company.size || '')}" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Website</label>
          <div class="flex gap-2">
            <input type="url" id="edit-company-website" class="input-field flex-1" value="${escapeHtml(company.website || '')}" />
            <button type="button" onclick="autoFillCompanyFromWebsite('edit-company')" class="btn-secondary btn-sm whitespace-nowrap" title="Auto-fill from website">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
              Auto-fill
            </button>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Logo URL</label>
          <input type="url" id="edit-company-logo" class="input-field" value="${escapeHtml(company.logoUrl || '')}" />
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Description</label>
          <textarea id="edit-company-description" class="input-field" rows="3">${escapeHtml(company.description || '')}</textarea>
        </div>
        <div class="flex justify-between items-center pt-2">
          <button type="button" onclick="deleteCompany('${company.id}')" class="btn-ghost text-red-500 text-sm">Delete Company</button>
          <div class="flex gap-3">
            <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">Save Changes</button>
          </div>
        </div>
      </form>
    </div>
  `);

  document.getElementById('edit-company-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    company.name = document.getElementById('edit-company-name').value.trim();
    company.companyType = document.getElementById('edit-company-type').value;
    company.industry = document.getElementById('edit-company-industry').value.trim();
    company.size = document.getElementById('edit-company-size').value.trim();
    company.website = document.getElementById('edit-company-website').value.trim();
    company.logoUrl = document.getElementById('edit-company-logo').value.trim();
    company.description = document.getElementById('edit-company-description').value.trim();
    await DB.put(STORES.companies, company);
    closeModal();
    showToast('Company updated', 'success');
    viewCompany(company.id);
  });
}

async function deleteCompany(companyId) {
  confirmDialog('Delete Company', 'This will remove the company. Contacts will not be deleted.', async () => {
    // Unlink contacts
    const contacts = await DB.getAllByIndex(STORES.contacts, 'companyId', companyId);
    for (const c of contacts) {
      c.companyId = null;
      await DB.put(STORES.contacts, c);
    }
    await DB.delete(STORES.companies, companyId);
    showToast('Company deleted', 'success');
    navigate('companies');
  });
}

async function autoFillCompanyFromWebsite(prefix) {
  const websiteInput = document.getElementById(prefix + '-website') || document.getElementById('company-website');
  const url = websiteInput?.value.trim();
  if (!url) { showToast('Enter a website URL first', 'warning'); return; }

  const settings = await DB.get(STORES.settings, `settings_${currentUser.id}`);
  if (!settings?.openaiApiKey && !settings?.claudeApiKey) { showToast('Add an OpenAI or Claude API key in Settings to use auto-fill', 'warning'); return; }

  showToast('Fetching company info…', 'info');
  try {
    const info = await fetchCompanyInfoFromUrl(url);
    const nameId = prefix === 'company' ? 'company-name' : 'edit-company-name';
    const industryId = prefix === 'company' ? 'company-industry' : 'edit-company-industry';
    const sizeId = prefix === 'company' ? 'company-size' : 'edit-company-size';
    const descId = prefix === 'company' ? 'company-description' : 'edit-company-description';

    if (info.name) { const el = document.getElementById(nameId); if (el && !el.value.trim()) el.value = info.name; }
    if (info.industry) { const el = document.getElementById(industryId); if (el && !el.value.trim()) el.value = info.industry; }
    if (info.employeeCount) { const el = document.getElementById(sizeId); if (el && !el.value.trim()) el.value = String(info.employeeCount); }
    if (info.description) { const el = document.getElementById(descId); if (el && !el.value.trim()) el.value = info.description; }
    showToast('Company info auto-filled from website', 'success');
  } catch (err) {
    showToast('Could not auto-fill: ' + err.message, 'error');
  }
}
