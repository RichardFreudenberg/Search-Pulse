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
  { key: 'location',    label: 'Location',       hints: ['location', 'city', 'region', 'ort', 'stadt', 'standort', 'address', 'adresse'] },
  { key: 'specialties', label: 'Specialties',    hints: ['specialt', 'industry', 'industries', 'sector', 'focus', 'branche', 'fokus', 'schwerpunkt'] },
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
  _BROKER_IMPORT_FIELDS.forEach(f => {
    const found = headers.find(h => {
      const lc = String(h).toLowerCase().trim();
      return f.hints.some(hint => lc.includes(hint));
    });
    map[f.key] = found || '';
  });
  return map;
}

function _brokerGet(row, mapping, key) {
  const col = mapping[key];
  return col ? String(row[col] == null ? '' : row[col]).trim() : '';
}

function _brokerRowToRecord(row, mapping) {
  const name = _brokerGet(row, mapping, 'name') ||
    [_brokerGet(row, mapping, 'firstName'), _brokerGet(row, mapping, 'lastName')].filter(Boolean).join(' ').trim();
  return {
    name,
    firm:        _brokerGet(row, mapping, 'firm'),
    email:       _brokerGet(row, mapping, 'email').toLowerCase(),
    phone:       _brokerGet(row, mapping, 'phone'),
    location:    _brokerGet(row, mapping, 'location'),
    specialties: _brokerGet(row, mapping, 'specialties'),
    notes:       _brokerGet(row, mapping, 'notes'),
  };
}

function _brokerImportComputeCounts() {
  const { rows, mapping, existing } = _brokerImport;
  const exBrokerEmails   = new Set(existing.brokers.map(b => (b.email || '').toLowerCase()).filter(Boolean));
  const exBrokerNameFirm = new Set(existing.brokers.map(b => (b.name || '').toLowerCase() + '|' + (b.firm || '').toLowerCase()));
  const exContactEmails  = new Set(existing.contacts.map(c => (c.email || '').toLowerCase()).filter(Boolean));
  const exContactNames   = new Set(existing.contacts.map(c => (c.fullName || '').toLowerCase()).filter(Boolean));
  const exCompanyNames   = new Set(existing.companies.map(c => (c.name || '').toLowerCase()).filter(Boolean));

  const seen = new Set();
  const newCompanySet = new Set();
  let newBrokers = 0, dupBrokers = 0, newContacts = 0, newCompanies = 0, invalid = 0;

  rows.forEach(r => {
    const rec = _brokerRowToRecord(r, mapping);
    if (!rec.name) { invalid++; return; }
    const dkey = rec.email || (rec.name.toLowerCase() + '|' + rec.firm.toLowerCase());
    if (seen.has(dkey)) { dupBrokers++; return; }
    seen.add(dkey);
    const isDup = (rec.email && exBrokerEmails.has(rec.email)) ||
                  exBrokerNameFirm.has(rec.name.toLowerCase() + '|' + rec.firm.toLowerCase());
    if (isDup) { dupBrokers++; return; }
    newBrokers++;
    const cDup = (rec.email && exContactEmails.has(rec.email)) || exContactNames.has(rec.name.toLowerCase());
    if (!cDup) newContacts++;
    if (rec.firm) {
      const fl = rec.firm.toLowerCase();
      if (!exCompanyNames.has(fl) && !newCompanySet.has(fl)) { newCompanies++; newCompanySet.add(fl); }
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
  const hasName = !!(mapping.name || mapping.firstName || mapping.lastName);

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

    <div class="grid sm:grid-cols-2 gap-2.5 mb-5">
      ${_BROKER_IMPORT_FIELDS.map(fieldRow).join('')}
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      ${_brokerImportStatCard(counts.newBrokers, 'New brokers', 'brand')}
      ${_brokerImportStatCard(counts.newContacts, 'New contacts', 'emerald')}
      ${_brokerImportStatCard(counts.newCompanies, 'New companies', 'violet')}
      ${_brokerImportStatCard(counts.dupBrokers, 'Duplicates skipped', 'amber')}
    </div>
    ${counts.invalid ? `<p class="text-xs text-amber-600 mb-3">${counts.invalid} row(s) have no name and will be skipped.</p>` : ''}
    ${!hasName ? `<p class="text-xs text-red-500 mb-3">Map a <b>Name</b> column (or First + Last name) to continue.</p>` : ''}

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
    const brokerEmails   = new Set(existing.brokers.map(b => (b.email || '').toLowerCase()).filter(Boolean));
    const brokerNameFirm = new Set(existing.brokers.map(b => (b.name || '').toLowerCase() + '|' + (b.firm || '').toLowerCase()));

    // De-duplicate rows (within file + against existing brokers)
    const seen = new Set();
    const toCreate = [];
    rows.forEach(r => {
      const rec = _brokerRowToRecord(r, mapping);
      if (!rec.name) return;
      const dkey = rec.email || (rec.name.toLowerCase() + '|' + rec.firm.toLowerCase());
      if (seen.has(dkey)) return;
      seen.add(dkey);
      const isDup = (rec.email && brokerEmails.has(rec.email)) ||
                    brokerNameFirm.has(rec.name.toLowerCase() + '|' + rec.firm.toLowerCase());
      if (isDup) return;
      toCreate.push(rec);
    });

    const now = new Date().toISOString();
    let createdBrokers = 0, createdContacts = 0, createdCompanies = 0;

    // 1) Companies (unique firms first, so contacts/brokers can link to them)
    for (const rec of toCreate) {
      if (!rec.firm) continue;
      const fl = rec.firm.toLowerCase();
      if (!companyByName[fl]) {
        const co = await DB.add(STORES.companies, {
          userId: currentUser.id, name: rec.firm, industry: rec.specialties || '',
          location: rec.location || '', source: 'broker-import', createdAt: now,
        });
        companyByName[fl] = co.id;
        createdCompanies++;
      }
    }

    // 2) Contacts (bucket: Brokers) + broker records, linked together
    for (const rec of toCreate) {
      const companyId = rec.firm ? (companyByName[rec.firm.toLowerCase()] || null) : null;

      let contact = (rec.email && contactByEmail[rec.email]) || contactByName[rec.name.toLowerCase()];
      if (!contact) {
        contact = await DB.add(STORES.contacts, {
          userId: currentUser.id, fullName: rec.name, email: rec.email || '', phone: rec.phone || '',
          location: rec.location || '', companyId: companyId || null, bucket: 'brokers',
          relationshipType: 'Broker / Intermediary', stage: (typeof STAGES !== 'undefined' && STAGES[0]) || '',
          tags: [], notes: rec.notes || '', source: 'broker-import',
          lastContactDate: null, nextFollowUpDate: null, archived: false,
        });
        if (rec.email) contactByEmail[rec.email] = contact;
        contactByName[rec.name.toLowerCase()] = contact;
        createdContacts++;
      }

      await DB.add(STORES.brokers, {
        id: generateId(), userId: currentUser.id,
        name: rec.name, firm: rec.firm || '', email: rec.email || '', phone: rec.phone || '',
        location: rec.location || '', specialties: rec.specialties || '', notes: rec.notes || '',
        dealsIntroduced: 0, relationshipRating: 0,
        contactId: contact.id, companyId: companyId || null,
        source: 'broker-import', createdAt: now, updatedAt: now,
      });
      createdBrokers++;
    }

    if (typeof _brokersRefresh === 'function') await _brokersRefresh();
    showToast(`Imported ${createdBrokers} brokers · ${createdContacts} new contacts · ${createdCompanies} new companies`, 'success');
    _brokerImport = { rows: null, headers: null, mapping: null, existing: null, fileName: '' };
  } catch (err) {
    console.error('[BrokerImport] failed:', err);
    showToast('Import failed: ' + (err.message || 'error'), 'error');
  }
}
