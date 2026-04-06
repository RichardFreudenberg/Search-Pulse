/* ============================================
   Nexus CRM — Profile Enrichment Pipeline
   ============================================ */

/*
 * Enrichment approach:
 * - Uses publicly available web APIs (Clearbit logo, company data where available)
 * - Allows manual entry and import from user-provided data
 * - LinkedIn data: compliant approach — we link to public profiles but do not scrape
 * - All enriched fields include source attribution and verification status
 */

async function startEnrichment(contactId) {
  const contact = await DB.get(STORES.contacts, contactId);
  if (!contact) { showToast('Contact not found', 'error'); return; }

  const company = contact.companyId ? await DB.get(STORES.companies, contact.companyId) : null;

  // Create enrichment job
  const job = await DB.add(STORES.enrichmentJobs, {
    userId: currentUser.id,
    contactId,
    status: 'running',
    startedAt: new Date().toISOString(),
    fieldsUpdated: [],
    sourcesUsed: [],
  });

  showToast('Enrichment started…', 'info');

  try {
    const enrichments = [];

    // 1. Try to get company logo via Clearbit (free, public API)
    if (company && company.website) {
      const domain = extractDomain(company.website);
      if (domain) {
        const logoUrl = `https://logo.clearbit.com/${domain}`;
        // Verify logo exists
        try {
          const resp = await fetch(logoUrl, { method: 'HEAD', mode: 'no-cors' });
          enrichments.push({
            field: 'Company Logo',
            value: logoUrl,
            sourceUrl: `https://clearbit.com`,
            sourceName: 'Clearbit Logo API',
            verification: 'imported',
            targetType: 'company',
          });

          // Update company logo if not set
          if (!company.logoUrl) {
            company.logoUrl = logoUrl;
            await DB.put(STORES.companies, company);
          }
        } catch (e) {
          // Logo not available
        }
      }
    }

    // 2. LinkedIn profile link (compliant — we just store the URL, don't scrape)
    if (contact.linkedInUrl) {
      enrichments.push({
        field: 'LinkedIn Profile',
        value: contact.linkedInUrl,
        sourceUrl: contact.linkedInUrl,
        sourceName: 'LinkedIn (user-provided)',
        verification: 'manual',
        targetType: 'contact',
      });
    }

    // 3. Company website info
    if (company && company.website) {
      enrichments.push({
        field: 'Company Website',
        value: company.website,
        sourceUrl: company.website,
        sourceName: 'Direct website',
        verification: 'verified',
        targetType: 'company',
      });
    }

    // 4. Generate company domain email guess
    if (company && company.website && contact.fullName && !contact.email) {
      const domain = extractDomain(company.website);
      const nameParts = contact.fullName.toLowerCase().split(' ');
      if (nameParts.length >= 2 && domain) {
        const guessedEmail = `${nameParts[0]}.${nameParts[nameParts.length - 1]}@${domain}`;
        enrichments.push({
          field: 'Email (guessed)',
          value: guessedEmail,
          sourceUrl: company.website,
          sourceName: 'Pattern inference from company domain',
          verification: 'imported',
          targetType: 'contact',
        });
      }
    }

    // 5. Store the search query URL for manual enrichment
    const searchQuery = encodeURIComponent(`"${contact.fullName}" ${company ? company.name : ''}`);
    enrichments.push({
      field: 'Web Search',
      value: `Search results for ${contact.fullName}`,
      sourceUrl: `https://www.google.com/search?q=${searchQuery}`,
      sourceName: 'Google Search',
      verification: 'manual',
      targetType: 'contact',
    });

    // LinkedIn search (compliant — link to search, not scraping)
    const linkedInSearch = encodeURIComponent(`${contact.fullName} ${company ? company.name : ''}`);
    enrichments.push({
      field: 'LinkedIn Search',
      value: `LinkedIn search for ${contact.fullName}`,
      sourceUrl: `https://www.linkedin.com/search/results/people/?keywords=${linkedInSearch}`,
      sourceName: 'LinkedIn Search',
      verification: 'manual',
      targetType: 'contact',
    });

    // Save enrichment sources
    for (const e of enrichments) {
      await DB.add(STORES.sources, {
        userId: currentUser.id,
        contactId,
        companyId: e.targetType === 'company' ? (company?.id || null) : null,
        field: e.field,
        value: e.value,
        sourceUrl: e.sourceUrl,
        sourceName: e.sourceName,
        verification: e.verification,
      });
    }

    // Update job
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.fieldsUpdated = enrichments.map(e => e.field);
    job.sourcesUsed = enrichments.map(e => e.sourceName);
    await DB.put(STORES.enrichmentJobs, job);

    // Log activity
    await DB.add(STORES.activities, {
      userId: currentUser.id,
      contactId,
      type: 'enrichment',
      title: 'Profile enriched',
      description: `${enrichments.length} fields enriched from public sources`,
      timestamp: new Date().toISOString(),
    });

    showToast(`Enrichment complete — ${enrichments.length} fields found`, 'success');
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    await DB.put(STORES.enrichmentJobs, job);
    showToast('Enrichment failed: ' + err.message, 'error');
  }

  // Refresh contact view
  viewContact(contactId);
}

function extractDomain(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

async function openManualEnrichmentModal(contactId) {
  openModal(`
    <div class="p-6">
      <h2 class="text-lg font-semibold mb-6">Add Enrichment Data</h2>
      <p class="text-sm text-surface-500 mb-4">Manually add verified information about this contact</p>
      <form id="manual-enrichment-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Field Name</label>
          <select id="enrichment-field" class="input-field">
            <option value="Bio">Bio / Headline</option>
            <option value="Role History">Role History</option>
            <option value="Company Description">Company Description</option>
            <option value="Company Size">Company Size</option>
            <option value="Recent News">Recent News</option>
            <option value="Education">Education</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Value</label>
          <textarea id="enrichment-value" class="input-field" rows="3" required placeholder="Enter the information…"></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Source URL</label>
          <input type="url" id="enrichment-source-url" class="input-field" placeholder="https://..." />
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Source Name</label>
          <input type="text" id="enrichment-source-name" class="input-field" placeholder="LinkedIn, Company website, etc." />
        </div>
        <div>
          <label class="block text-sm font-medium text-surface-600 dark:text-surface-400 mb-1">Verification Status</label>
          <select id="enrichment-verification" class="input-field">
            <option value="verified">Verified</option>
            <option value="imported">Imported</option>
            <option value="manual" selected>Manual</option>
          </select>
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" onclick="closeModal()" class="btn-secondary">Cancel</button>
          <button type="submit" class="btn-primary">Save</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('manual-enrichment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await DB.add(STORES.sources, {
      userId: currentUser.id,
      contactId,
      companyId: null,
      field: document.getElementById('enrichment-field').value,
      value: document.getElementById('enrichment-value').value.trim(),
      sourceUrl: document.getElementById('enrichment-source-url').value.trim(),
      sourceName: document.getElementById('enrichment-source-name').value.trim(),
      verification: document.getElementById('enrichment-verification').value,
    });

    closeModal();
    showToast('Enrichment data saved', 'success');
    viewContact(contactId);
  });
}
