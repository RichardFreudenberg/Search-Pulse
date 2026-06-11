/* ============================================================
   Pulse — Broker Excel Import
   ============================================================
   Upload an .xlsx/.csv broker list → auto-map columns →
   de-duplicate (within file + against existing data) →
   create broker records + linked Contacts (bucket: Brokers)
   + Companies. Uses the already-loaded SheetJS (XLSX) lib.
   ============================================================ */

let _brokerImport = { rows: null, headers: null, mapping: null, existing: null, fileName: '' };

const _BROKER_IMPORT_FIELDS = [
  { key: 'name',        label: 'Name',           hints: ['broker name', 'contact name', 'full name', 'name', 'broker', 'contact', 'ansprechpartner'] },
  { key: 'firstName',   label: 'First name',     hints: ['first name', 'firstname', 'first', 'vorname', 'given'] },
  { key: 'lastName',    label: 'Last name',      hints: ['last name', 'lastname', 'last', 'nachname', 'surname', 'family name'] },
  { key: 'firm',        label: 'Firm / Company', hints: ['firm', 'company', 'brokerage', 'firma', 'unternehmen', 'organisation', 'organization', 'makler', 'büro'] },
  { key: 'email',       label: 'Email',          hints: ['email', 'e-mail', 'e mail', 'mail address', 'mail'] },
  { key: 'phone',       label: 'Phone',          hints: ['phone', 'telephone', 'mobile', 'tel', 'telefon', 'handy', 'number'] },
  { key: 'title',       label: 'Title / Position', hints: ['position', 'title', 'rolle', 'funktion', 'job'] },
  { key: 'linkedInUrl', label: 'Website / LinkedIn', hints: ['linkedin', 'website', 'url', 'homepage', 'webseite', 'web'] },
  { key: 'location',    label: 'Location',       hints: ['location', 'city', 'region', 'ort', 'stadt', 'standort', 'address', 'adresse'] },
  { key: 'specialties', label: 'Specialties',    hints: ['specialt', 'industry', 'industries', 'sector', 'focus', 'branche', 'fokus', 'schwerpunkt', 'type', 'typ'] },
  { key: 'notes',       label: 'Notes',          hints: ['note', 'comment', 'remark', 'bemerkung', 'kommentar', 'info'] },
];

function openBrokerImport() {
  openModal(`
    <h3 class="text-base font-semibold mb-1">Import brokers from Excel</h3>
    <p class="text-sm text-surface-500 mb-4">Upload an <b>.xlsx</b>, <b>.xls</b>, or <b>.csv</b> file (first row = column headers). Pulse auto-maps the columns, removes duplicates, and creates broker records plus linked <b>contacts</b> &amp; <b>companies</b>.</p>
    <label class="block border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 transition-colors">
      <svg class="w-8 h-8 mx-auto text-surface-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
      <span class="text-sm font-medium text-brand-600">Choose a file</span>
      <span class="block text-xs text-surface-400 mt-1">.xlsx · .xls · .csv</span>
      <input type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange="brokerImportHandleFile(this)"/>
    </label>
    <div class="flex justify-end mt-4"><button onclick="closeModal()" class="btn-secondary">Cancel</button></div>
  `, { wide: true });
}

function brokerImportHandleFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined') { showToast('Spreadsheet library not loaded — refresh and retry', 'error'); return; }
  _brokerImport.fileName = file.name;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!rows.length) { showToast('No data rows found in the first sheet', 'error'); return; }
      _brokerImport.rows = rows;
      _brokerImport.headers = Object.keys(rows[0]);
      _brokerImport.mapping = _brokerAutoMap(_brokerImport.headers);
      const [brokers, contacts, companies] = await Promise.all([
        DB.getForUser(STORES.brokers, currentUser.id),
        DB.getForUser(STORES.contacts, currentUser.id),
        DB.getForUser(STORES.companies, currentUser.id),
      ]);
      _brokerImport.existing = { brokers, contacts, companies };
      _brokerImportRenderPreview();
    } catch (err) {
      console.error('[BrokerImport] read failed:', err);
      showToast('Could not read file: ' + (err.message || 'unknown'), 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function _brokerAutoMap(headers) {
  const map = {};
  const claimed = new Set();
  const find = (hints, exclude) => headers.find(h => {
    if (claimed.has(h)) return false;
    const lc = String(h).toLowerCase().trim();
    if (exclude && exclude.some(x => lc.includes(x))) return false;
    return hints.some(hint => lc.includes(hint));
  });
  const claim = (k, h) => { map[k] = h || ''; if (h) claimed.add(h); };

  // First/Last name → person (handle separate-column lists like First Name / Last Name).
  claim('firstName',   find(['first name', 'firstname', 'vorname', 'given name']));
  claim('lastName',    find(['last name', 'lastname', 'nachname', 'surname', 'family name']));
  // Website / LinkedIn into its own field BEFORE firm, so "Company LinkedIn/URL" doesn't become the firm.
  claim('linkedInUrl', find(['linkedin', 'website', 'webseite', 'homepage', 'url', ' web']));
  // Firm: include "entity"; EXCLUDE url/linkedin headers so the URL column isn't taken as the firm.
  claim('firm', find(['firma', 'entity', 'company', 'firm', 'brokerage', 'makler', 'kanzlei', 'unternehmen', 'gesellschaft', 'organisation', 'organization', 'büro'], ['linkedin', 'url', 'website']));
  // Person name (single column): explicit person headers; bare "name" excluding firm/entity words.
  claim('name', find(['contact person', 'ansprechpartner', 'contact name', 'contactname', 'berater', 'inhaber', 'geschäftsführer'], ['firm', 'firma', 'company', 'entity']) ||
                find(['name'], ['firm', 'firma', 'company', 'entity', 'file', 'user', 'sign', 'first', 'last']));
  claim('title',       find(['position', 'title', 'rolle', 'funktion', 'job']));
  claim('email',       find(['email', 'e-mail', 'e mail', 'mail'], ['2nd', 'second', 'alt', 'cc']));
  claim('phone',       find(['phone', 'telephone', 'mobile', 'tel', 'telefon', 'handy', 'number']));
  claim('location',    find(['location', 'city', 'region', 'ort', 'stadt', 'standort', 'address', 'adresse']));
  claim('specialties', find(['specialt', 'industry', 'industries', 'sector', 'focus', 'branche', 'fokus', 'schwerpunkt', 'type', 'typ']));
  claim('notes',       find(['note', 'comment', 'remark', 'bemerkung', 'kommentar', 'info']));

  _BROKER_IMPORT_FIELDS.forEach(f => { if (!(f.key in map)) map[f.key] = ''; });
  return map;
}

function _brokerGet(row, mapping, key) {
  const col = mapping[key];
  return col ? String(row[col] == null ? '' : row[col]).trim() : '';
}

// Does this string look like a company rather than a person's name?
function _looksLikeCompany(s) {
  if (!s) return false;
  return /(\b(gmbh|ag|kg|ohg|mbh|ug|inc|llc|ltd|lp|plc|corp|company|co|partners?|advisors?|advisory|capital|group|holdings?|ventures?|associates?|consulting|consultants?|beratung|unternehmensberatung|kanzlei|beteiligung\w*|brokers?|brokerage|mergers?|m&a)\b)|&|\+/i.test(s);
}

function _brokerRowToRecord(row, mapping) {
  let name = _brokerGet(row, mapping, 'name') ||
    [_brokerGet(row, mapping, 'firstName'), _brokerGet(row, mapping, 'lastName')].filter(Boolean).join(' ').trim();
  let firm = _brokerGet(row, mapping, 'firm');
  // The list mixes firms and individuals. If the "name" is actually a company
  // (and we have no separate firm), treat it as the firm — not a person.
  if (name && !firm && _looksLikeCompany(name)) { firm = name; name = ''; }
  // If the person name is identical to the firm, it's a firm-only entry.
  if (name && firm && name.toLowerCase() === firm.toLowerCase()) name = '';
  const email = _brokerGet(row, mapping, 'email').toLowerCase();
  let linkedInUrl = _brokerGet(row, mapping, 'linkedInUrl');
  // A real homepage URL stays as website; a linkedin.com URL stays as linkedIn.
  const isLinkedIn = /linkedin\.com/i.test(linkedInUrl);
  return {
    name, firm, email,
    phone:       _brokerGet(row, mapping, 'phone'),
    title:       _brokerGet(row, mapping, 'title'),
    location:    _brokerGet(row, mapping, 'location'),
    specialties: _brokerGet(row, mapping, 'specialties'),
    notes:       _brokerGet(row, mapping, 'notes'),
    linkedInUrl: isLinkedIn ? linkedInUrl : '',
    website:     (!isLinkedIn && linkedInUrl) ? linkedInUrl : _brokerWebsiteFromEmail(email),
  };
}

// Real website from a non-generic email domain (e.g. x@lueders-warneboldt.de → https://www.lueders-warneboldt.de)
const _BROKER_GENERIC_EMAIL = new Set(['gmail.com','googlemail.com','gmx.de','gmx.net','web.de','t-online.de','outlook.com','hotmail.com','hotmail.de','yahoo.com','yahoo.de','icloud.com','me.com','aol.com']);
function _brokerWebsiteFromEmail(email) {
  email = (email || '').trim().toLowerCase();
  if (!email.includes('@')) return '';
  const dom = email.split('@')[1].trim();
  if (!dom || !dom.includes('.') || _BROKER_GENERIC_EMAIL.has(dom)) return '';
  return 'https://www.' + dom;
}

// Dedup keys — person entries keyed by email/name+firm; firm-only by firm name.
function _brokerRecKey(rec) {
  if (rec.name) return 'p:' + (rec.email || (rec.name.toLowerCase() + '|' + rec.firm.toLowerCase()));
  return 'f:' + rec.firm.toLowerCase();
}
function _brokerExistingKey(b) {
  if (b.isFirm) return 'f:' + (b.name || b.firm || '').toLowerCase();
  const nm = (b.name || '').toLowerCase(), fm = (b.firm || '').toLowerCase();
  if (nm && nm !== fm) return 'p:' + ((b.email || '').toLowerCase() || (nm + '|' + fm));
  return 'f:' + (fm || nm);
}

function _brokerImportComputeCounts() {
  const { rows, mapping, existing } = _brokerImport;
  const exBrokerKeys    = new Set(existing.brokers.map(_brokerExistingKey));
  const exContactEmails = new Set(existing.contacts.map(c => (c.email || '').toLowerCase()).filter(Boolean));
  const exContactNames  = new Set(existing.contacts.map(c => (c.fullName || '').toLowerCase()).filter(Boolean));
  const exCompanyNames  = new Set(existing.companies.map(c => (c.name || '').toLowerCase()).filter(Boolean));

  const seenBroker = new Set();
  const newCompanySet = new Set();
  const newContactSet = new Set();
  let newBrokers = 0, dupBrokers = 0, newContacts = 0, newCompanies = 0, invalid = 0;

  rows.forEach(r => {
    const rec = _brokerRowToRecord(r, mapping);
    if (!rec.name && !rec.firm) { invalid++; return; }

    // Firm → company (always, even for firm-only rows)
    if (rec.firm) {
      const fl = rec.firm.toLowerCase();
      if (!exCompanyNames.has(fl) && !newCompanySet.has(fl)) { newCompanies++; newCompanySet.add(fl); }
    }

    // Broker tracker entry (person or firm), de-duplicated
    const bkey = _brokerRecKey(rec);
    if (seenBroker.has(bkey) || exBrokerKeys.has(bkey)) { dupBrokers++; }
    else {
      seenBroker.add(bkey);
      newBrokers++;
      // Individual → contact
      if (rec.name) {
        const ckey = rec.email || rec.name.toLowerCase();
        const cDup = (rec.email && exContactEmails.has(rec.email)) || exContactNames.has(rec.name.toLowerCase());
        if (!cDup && !newContactSet.has(ckey)) { newContacts++; newContactSet.add(ckey); }
      }
    }
  });
  return { total: rows.length, newBrokers, dupBrokers, newContacts, newCompanies, invalid };
}

function _brokerImportStatCard(n, label, color) {
  return `<div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-center">
    <div class="text-2xl font-bold text-${color}-600">${n}</div>
    <div class="text-[11px] text-surface-500 mt-0.5">${label}</div></div>`;
}

function _brokerImportRenderPreview() {
  const { headers, mapping, rows } = _brokerImport;
  const counts = _brokerImportComputeCounts();
  const hasName = !!(mapping.name || mapping.firstName || mapping.lastName || mapping.firm);

  const fieldRow = f => `
    <div class="flex items-center gap-2">
      <label class="text-xs font-medium w-28 flex-shrink-0 text-surface-600 dark:text-surface-300">${f.label}${f.key === 'name' ? ' <span class="text-red-500">*</span>' : ''}</label>
      <select onchange="_brokerImport.mapping['${f.key}']=this.value; _brokerImportRenderPreview()" class="input-field text-sm flex-1 py-1.5">
        <option value="">— not mapped —</option>
        ${headers.map(h => `<option value="${escapeHtml(h)}" ${mapping[f.key] === h ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
      </select>
    </div>`;

  openModal(`
    <h3 class="text-base font-semibold mb-1">Map columns &amp; review</h3>
    <p class="text-sm text-surface-500 mb-4">${escapeHtml(_brokerImport.fileName)} · ${rows.length} rows. Adjust the column mapping if anything looks off.</p>

    <div class="grid sm:grid-cols-2 gap-2.5 mb-4">
      ${_BROKER_IMPORT_FIELDS.map(fieldRow).join('')}
    </div>

    <p class="text-xs font-medium text-surface-500 mb-1">Preview of your file (first 3 rows) — use this to map the columns correctly:</p>
    <div class="overflow-x-auto border border-surface-200 dark:border-surface-700 rounded-lg mb-5">
      <table class="text-xs w-full">
        <thead><tr>${headers.map(h => `<th class="px-2 py-1.5 text-left bg-surface-50 dark:bg-surface-800 font-semibold whitespace-nowrap">${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.slice(0, 3).map(r => `<tr>${headers.map(h => `<td class="px-2 py-1 border-t border-surface-100 dark:border-surface-800 whitespace-nowrap max-w-[180px] truncate" title="${escapeHtml(String(r[h] == null ? '' : r[h]))}">${escapeHtml(String(r[h] == null ? '' : r[h]))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      ${_brokerImportStatCard(counts.newBrokers, 'Broker entries', 'brand')}
      ${_brokerImportStatCard(counts.newContacts, 'Contacts (people)', 'emerald')}
      ${_brokerImportStatCard(counts.newCompanies, 'Companies (firms)', 'violet')}
      ${_brokerImportStatCard(counts.dupBrokers, 'Duplicates skipped', 'amber')}
    </div>
    <p class="text-[11px] text-surface-400 mb-3">Rows that look like a firm become <b>companies</b>; rows with a person's name become <b>contacts</b> (Brokers bucket) linked to their firm. Both feed the Broker Tracker.</p>
    ${counts.invalid ? `<p class="text-xs text-amber-600 mb-3">${counts.invalid} empty row(s) will be skipped.</p>` : ''}
    ${!hasName ? `<p class="text-xs text-red-500 mb-3">Map a <b>Name</b> (or First/Last) and/or <b>Firm</b> column to continue.</p>` : ''}

    <div class="flex justify-between items-center mt-4">
      <button onclick="openBrokerImport()" class="btn-ghost text-surface-500 text-sm">← Choose another file</button>
      <div class="flex gap-2">
        <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        <button onclick="brokerImportRun()" class="btn-primary" ${(!hasName || counts.newBrokers === 0) ? 'disabled' : ''}>Import ${counts.newBrokers} broker${counts.newBrokers !== 1 ? 's' : ''}</button>
      </div>
    </div>
  `, { wide: true });
}

async function brokerImportRun() {
  const { rows, mapping, existing } = _brokerImport;
  if (!rows || !existing) return;
  closeModal();
  showToast('Importing brokers…', 'info');

  try {
    const companyByName = {};
    existing.companies.forEach(c => { if (c.name) companyByName[c.name.toLowerCase()] = c.id; });
    const contactByEmail = {}, contactByName = {};
    existing.contacts.forEach(c => {
      if (c.email) contactByEmail[c.email.toLowerCase()] = c;
      if (c.fullName) contactByName[c.fullName.toLowerCase()] = c;
    });
    const exBrokerKeys = new Set(existing.brokers.map(_brokerExistingKey));

    // Firm-level placeholder brokers (no person yet) we can upgrade into the named contact.
    const firmBrokerByCompany = {};
    existing.brokers.forEach(b => {
      if ((b.isFirm || !b.contactId) && b.companyId && !firmBrokerByCompany[b.companyId]) {
        firmBrokerByCompany[b.companyId] = { id: b.id, used: false };
      }
    });

    // Parse + de-duplicate rows (within file + against existing brokers)
    const seen = new Set();
    const toCreate = [];
    const firmInfo = {}; // firmLower -> { name, website, linkedInUrl, location, specialties }
    rows.forEach(r => {
      const rec = _brokerRowToRecord(r, mapping);
      if (!rec.name && !rec.firm) return;
      if (rec.firm) {
        const fl = rec.firm.toLowerCase();
        const fi = firmInfo[fl] || (firmInfo[fl] = { name: rec.firm });
        if (!fi.website && rec.website) fi.website = rec.website;
        if (!fi.linkedInUrl && rec.linkedInUrl) fi.linkedInUrl = rec.linkedInUrl;
        if (!fi.location && rec.location) fi.location = rec.location;
        if (!fi.specialties && rec.specialties) fi.specialties = rec.specialties;
      }
      const k = _brokerRecKey(rec);
      if (seen.has(k) || exBrokerKeys.has(k)) return;
      seen.add(k);
      toCreate.push(rec);
    });

    const now = new Date().toISOString();
    let createdBrokers = 0, createdContacts = 0, createdCompanies = 0, upgradedBrokers = 0;

    // 1) Companies for EVERY firm referenced (with website/LinkedIn/industry/location)
    for (const fl in firmInfo) {
      if (!companyByName[fl]) {
        const fi = firmInfo[fl];
        const co = await DB.add(STORES.companies, {
          userId: currentUser.id, name: fi.name, industry: fi.specialties || '',
          location: fi.location || '', website: fi.website || '', linkedInUrl: fi.linkedInUrl || '',
          source: 'broker-import', createdAt: now,
        });
        companyByName[fl] = co.id;
        createdCompanies++;
      }
    }

    // 2) Individuals → contacts; each entry → a broker tracker record, linked
    for (const rec of toCreate) {
      const companyId = rec.firm ? (companyByName[rec.firm.toLowerCase()] || null) : null;

      if (rec.name) {
        // Real person → contact (Brokers bucket) + broker record
        let contact = (rec.email && contactByEmail[rec.email]) || contactByName[rec.name.toLowerCase()];
        if (!contact) {
          contact = await DB.add(STORES.contacts, {
            userId: currentUser.id, fullName: rec.name, title: rec.title || '',
            email: rec.email || '', phone: rec.phone || '', linkedInUrl: rec.linkedInUrl || '',
            location: rec.location || '', companyId: companyId || null, bucket: 'brokers',
            relationshipType: 'Broker / Intermediary', stage: (typeof STAGES !== 'undefined' && STAGES[0]) || '',
            tags: [], notes: rec.notes || '', source: 'broker-import',
            lastContactDate: null, nextFollowUpDate: null, archived: false,
          });
          if (rec.email) contactByEmail[rec.email] = contact;
          contactByName[rec.name.toLowerCase()] = contact;
          createdContacts++;
        }
        // If a firm-level placeholder broker already exists for this company,
        // upgrade it into this named person instead of creating a duplicate.
        const slot = companyId && firmBrokerByCompany[companyId];
        if (slot && !slot.used) {
          await DB.put(STORES.brokers, {
            id: slot.id, userId: currentUser.id,
            name: rec.name, firm: rec.firm || '', email: rec.email || '', phone: rec.phone || '',
            location: rec.location || '', contactId: contact.id, companyId,
            isFirm: false, source: 'broker-import', updatedAt: now,
          });
          slot.used = true;
          upgradedBrokers++;
        } else {
          await DB.add(STORES.brokers, {
            id: generateId(), userId: currentUser.id,
            name: rec.name, firm: rec.firm || '', email: rec.email || '', phone: rec.phone || '',
            location: rec.location || '', specialties: rec.specialties || '', notes: rec.notes || '',
            website: rec.website || '', linkedInUrl: rec.linkedInUrl || '',
            dealsIntroduced: 0, relationshipRating: 0,
            contactId: contact.id, companyId: companyId || null,
            source: 'broker-import', createdAt: now, updatedAt: now,
          });
          createdBrokers++;
        }
      } else if (rec.firm) {
        // Firm-only entry → broker record for the firm (no contact), linked to company
        await DB.add(STORES.brokers, {
          id: generateId(), userId: currentUser.id,
          name: rec.firm, firm: '', email: '', phone: rec.phone || '',
          location: rec.location || '', specialties: rec.specialties || '', notes: rec.notes || '',
          website: rec.website || '', linkedInUrl: rec.linkedInUrl || '',
          dealsIntroduced: 0, relationshipRating: 0,
          contactId: null, companyId: companyId || null, isFirm: true,
          source: 'broker-import', createdAt: now, updatedAt: now,
        });
        createdBrokers++;
      }
    }

    if (typeof _brokersRefresh === 'function') await _brokersRefresh();
    showToast(`Imported: ${createdContacts} contacts · ${createdCompanies} companies · ${createdBrokers + upgradedBrokers} broker entries${upgradedBrokers ? ` (${upgradedBrokers} firms linked to a person)` : ''}`, 'success');
    _brokerImport = { rows: null, headers: null, mapping: null, existing: null, fileName: '' };
  } catch (err) {
    console.error('[BrokerImport] failed:', err);
    showToast('Import failed: ' + (err.message || 'error'), 'error');
  }
}
