/* ============================================================
   Pulse — Relationship Model & Premium Hub Helpers
   ============================================================
   Single source of truth for relationship BUCKETS, relationship
   STRENGTH, and the premium card/badge renderers used by the
   Relationships hub (contacts.js) and contact detail page.

   100% additive — derives a bucket from the legacy `relationshipType`
   field when a contact has no explicit `bucket`, so existing data
   shows up correctly without any write/migration.
   ============================================================ */

// ── Buckets ──────────────────────────────────────────────────
const RELATIONSHIP_BUCKETS = [
  { key: 'investors',   label: 'Investors',             short: 'Investor',    color: 'emerald', order: 1 },
  { key: 'prospective', label: 'Prospective Investors', short: 'Prospective', color: 'teal',    order: 2 },
  { key: 'pevc',        label: 'PE / VC',               short: 'PE/VC',       color: 'fuchsia', order: 3 },
  { key: 'mentors',     label: 'Mentors',               short: 'Mentor',      color: 'violet',  order: 4 },
  { key: 'advisors',    label: 'Advisors',              short: 'Advisor',     color: 'indigo',  order: 4 },
  { key: 'brokers',     label: 'Brokers',               short: 'Broker',      color: 'amber',   order: 5 },
  { key: 'targets',     label: 'Targets',               short: 'Target',      color: 'rose',    order: 6 },
  { key: 'searchers',   label: 'Searchers',             short: 'Searcher',    color: 'cyan',    order: 7 },
  { key: 'unassigned',  label: 'Unassigned',            short: 'Unassigned',  color: 'gray',    order: 99 },
];

const _BUCKET_BY_KEY = Object.fromEntries(RELATIONSHIP_BUCKETS.map(b => [b.key, b]));

// Buckets shown as primary filter pills (Unassigned only appears if non-empty)
const RELATIONSHIP_BUCKET_KEYS = RELATIONSHIP_BUCKETS.map(b => b.key);

// Legacy `relationshipType` → bucket key (non-destructive mapping)
const _LEGACY_TYPE_TO_BUCKET = {
  'LP / Investor':            'investors',
  'Seller / Business Owner':  'targets',
  'Broker / Intermediary':    'brokers',
  'Advisor / Mentor':         'advisors',
  'Fellow Searcher':          'searchers',
};

/** Resolve a contact's bucket: explicit field, else derived from legacy type. */
function getContactBucket(contact) {
  if (!contact) return 'unassigned';
  if (contact.bucket && _BUCKET_BY_KEY[contact.bucket]) return contact.bucket;
  const t = contact.relationshipType || '';
  if (_LEGACY_TYPE_TO_BUCKET[t]) return _LEGACY_TYPE_TO_BUCKET[t];
  const lc = t.toLowerCase();
  if (lc.includes('investor') || /\blp\b/.test(lc)) return 'investors';
  if (lc.includes('broker'))                        return 'brokers';
  if (lc.includes('seller') || lc.includes('owner') || lc.includes('target')) return 'targets';
  if (lc.includes('mentor'))                        return 'mentors';
  if (lc.includes('advisor'))                       return 'advisors';
  if (lc.includes('search'))                        return 'searchers';
  if (/\b(pe|vc)\b/.test(lc) || lc.includes('venture') || lc.includes('private equity')) return 'pevc';
  return 'unassigned';
}

function getBucketMeta(key) { return _BUCKET_BY_KEY[key] || _BUCKET_BY_KEY.unassigned; }

/** Count contacts per bucket. Returns { bucketKey: count }. */
function bucketCounts(contacts) {
  const counts = {};
  RELATIONSHIP_BUCKET_KEYS.forEach(k => { counts[k] = 0; });
  (contacts || []).forEach(c => { counts[getContactBucket(c)] = (counts[getContactBucket(c)] || 0) + 1; });
  return counts;
}

function _bucketBadgeClass(color) {
  return `bg-${color}-100 text-${color}-700 dark:bg-${color}-900/30 dark:text-${color}-300`;
}

/** Pill badge for a bucket (label only — clean & premium). */
function renderBucketBadge(bucketKey) {
  const b = getBucketMeta(bucketKey);
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${_bucketBadgeClass(b.color)}">
    <span class="w-1.5 h-1.5 rounded-full bg-${b.color}-500"></span>${b.short}</span>`;
}

/**
 * Inline bucket <select> for one-click (re)classification. Works for ALL
 * buckets — saves immediately via _quickSetContactBucket(). `from` tells the
 * handler which view to re-render ('hub' or 'detail').
 */
function renderBucketSelect(contactId, currentKey, from) {
  const cur = currentKey && currentKey !== 'unassigned' ? currentKey : '';
  const opts = RELATIONSHIP_BUCKETS.filter(b => b.key !== 'unassigned')
    .map(b => `<option value="${b.key}" ${cur === b.key ? 'selected' : ''}>${b.label}</option>`).join('');
  const placeholder = cur ? '' : '<option value="">+ Classify…</option>';
  return `<select onclick="event.stopPropagation()" onchange="event.stopPropagation(); _quickSetContactBucket('${contactId}', this.value, '${from || 'hub'}')"
    class="text-[11px] font-semibold rounded-full border ${cur ? 'border-transparent ' + _bucketBadgeClass(getBucketMeta(cur).color) : 'border-dashed border-surface-300 dark:border-surface-600 text-surface-500'} px-2 py-0.5 focus:ring-1 focus:ring-brand-500 cursor-pointer">
    ${placeholder}${opts}
  </select>`;
}

// ── Relationship strength (cold / warm / active / developing / dormant) ──
const RELATIONSHIP_STRENGTHS = {
  active:     { label: 'Active',     color: 'emerald', order: 1 },
  developing: { label: 'Developing', color: 'sky',     order: 2 },
  warm:       { label: 'Warm',       color: 'amber',   order: 3 },
  cold:       { label: 'Cold',       color: 'slate',   order: 4 },
  dormant:    { label: 'Dormant',    color: 'rose',    order: 5 },
};

function _relDaysSince(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Infinity;
  return (Date.now() - d.getTime()) / 86400000;
}

function _relIsOverdue(dateStr) {
  if (!dateStr) return false;
  if (typeof isOverdue === 'function') return isOverdue(dateStr);
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

/**
 * Derive relationship strength from last interaction recency + overdue follow-up.
 * Uses lastContactDate (or createdAt as a floor) so it works on existing data.
 */
function getRelationshipStrength(contact) {
  if (!contact) return 'cold';
  const ref = contact.lastContactDate || contact.lastInteraction || contact.createdAt || null;
  const days = _relDaysSince(ref);
  let key;
  if      (days <= 14)  key = 'active';
  else if (days <= 45)  key = 'developing';
  else if (days <= 90)  key = 'warm';
  else if (days <= 180) key = 'cold';
  else                  key = 'dormant';
  // A badly overdue follow-up cools an otherwise-recent relationship one notch.
  if (_relIsOverdue(contact.nextFollowUpDate) && (key === 'active' || key === 'developing')) key = 'warm';
  return key;
}

function getStrengthMeta(key) { return RELATIONSHIP_STRENGTHS[key] || RELATIONSHIP_STRENGTHS.cold; }

/** Small strength chip with a colored dot. */
function renderStrengthChip(contact) {
  const k = getRelationshipStrength(contact);
  const m = getStrengthMeta(k);
  return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-${m.color}-50 text-${m.color}-700 dark:bg-${m.color}-900/20 dark:text-${m.color}-300">
    <span class="w-1.5 h-1.5 rounded-full bg-${m.color}-500"></span>${m.label}</span>`;
}

// ── Priority ─────────────────────────────────────────────────
function isHighPriority(contact) {
  return contact && (contact.priority === 'high' || contact.priority === 'High');
}

// ── Premium relationship card (used by the hub) ──────────────
function renderRelationshipCard(contact, company) {
  const bucket   = getContactBucket(contact);
  const overdue  = _relIsOverdue(contact.nextFollowUpDate);
  const fuText   = contact.nextFollowUpDate ? (typeof formatFutureRelative === 'function' ? formatFutureRelative(contact.nextFollowUpDate) : contact.nextFollowUpDate) : null;
  const lastText = contact.lastContactDate ? (typeof formatRelative === 'function' ? formatRelative(contact.lastContactDate) : '') : null;
  const subRole  = contact.relationshipType || '';
  const aiSnippet = (contact.aiSummary || '').trim();

  return `
    <div class="card card-interactive group relative overflow-hidden" onclick="viewContact('${contact.id}')">
      <div class="absolute top-0 left-0 h-full w-1 bg-${getBucketMeta(bucket).color}-500"></div>
      <div class="flex items-start gap-3 pl-1.5">
        ${typeof renderAvatar === 'function' ? renderAvatar(contact.fullName, contact.photoUrl, 'lg', contact.linkedInUrl) : ''}
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h3 class="font-semibold truncate flex items-center gap-1.5">
                ${escapeHtml(contact.fullName)}
                ${isHighPriority(contact) ? '<svg class="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.36 4.18a1 1 0 00.95.69h4.4c.97 0 1.37 1.24.59 1.81l-3.56 2.59a1 1 0 00-.36 1.12l1.36 4.18c.3.92-.76 1.69-1.54 1.12l-3.56-2.59a1 1 0 00-1.18 0l-3.56 2.59c-.78.57-1.84-.2-1.54-1.12l1.36-4.18a1 1 0 00-.36-1.12L2.4 9.61c-.78-.57-.38-1.81.59-1.81h4.4a1 1 0 00.95-.69l1.36-4.18z"/></svg>' : ''}
              </h3>
              <p class="text-sm text-surface-500 truncate">${escapeHtml(contact.title || (subRole || '—'))}</p>
            </div>
            ${bucket === 'unassigned' ? renderBucketSelect(contact.id, '', 'hub') : renderBucketBadge(bucket)}
          </div>

          ${company ? `
            <div class="flex items-center gap-1.5 mt-2 text-xs text-surface-600 dark:text-surface-300" onclick="event.stopPropagation(); viewCompany('${company.id}')">
              ${typeof renderCompanyLogo === 'function' ? renderCompanyLogo(company, 'sm') : ''}
              <span class="truncate font-medium hover:text-brand-600">${escapeHtml(company.name)}</span>
            </div>` : ''}

          <div class="flex items-center flex-wrap gap-2 mt-2.5">
            ${renderStrengthChip(contact)}
            ${fuText ? `<span class="inline-flex items-center gap-1 text-[11px] font-medium ${overdue ? 'text-red-600 dark:text-red-400' : 'text-surface-500'}">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              ${overdue ? 'Overdue · ' : ''}${fuText}</span>` : ''}
            ${lastText ? `<span class="text-[11px] text-surface-400">Last: ${lastText}</span>` : ''}
          </div>

          ${aiSnippet ? `
            <p class="mt-2.5 text-xs text-surface-500 dark:text-surface-400 line-clamp-2 leading-relaxed">
              <span class="inline-flex items-center gap-1 text-brand-500 font-medium mr-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>AI</span>${escapeHtml(aiSnippet)}
            </p>` : ''}

          ${(contact.tags || []).length ? `
            <div class="flex gap-1 flex-wrap mt-2.5">
              ${contact.tags.slice(0, 3).map(t => `<span class="chip">${escapeHtml(t)}</span>`).join('')}
              ${contact.tags.length > 3 ? `<span class="chip">+${contact.tags.length - 3}</span>` : ''}
            </div>` : ''}
        </div>
      </div>
    </div>
  `;
}

/** Premium table row variant (bucket + strength columns). */
function renderRelationshipRow(contact, company) {
  const bucket  = getContactBucket(contact);
  const overdue = _relIsOverdue(contact.nextFollowUpDate);
  const fuText  = contact.nextFollowUpDate ? (typeof formatFutureRelative === 'function' ? formatFutureRelative(contact.nextFollowUpDate) : '') : '—';
  const lastText = contact.lastContactDate ? (typeof formatRelative === 'function' ? formatRelative(contact.lastContactDate) : '') : '—';
  return `
    <tr class="clickable" onclick="viewContact('${contact.id}')">
      <td>
        <div class="flex items-center gap-3">
          ${typeof renderAvatar === 'function' ? renderAvatar(contact.fullName, contact.photoUrl, 'md', contact.linkedInUrl) : ''}
          <div class="min-w-0">
            <div class="font-medium truncate flex items-center gap-1.5">${escapeHtml(contact.fullName)}${isHighPriority(contact) ? '<span class="text-amber-500">★</span>' : ''}</div>
            <div class="text-xs text-surface-500 truncate">${escapeHtml(contact.title || contact.relationshipType || '')}</div>
          </div>
        </div>
      </td>
      <td><div class="flex items-center gap-2">${company ? (typeof renderCompanyLogo === 'function' ? renderCompanyLogo(company, 'sm') : '') : ''}<span class="truncate">${company ? escapeHtml(company.name) : '—'}</span></div></td>
      <td>${renderBucketBadge(bucket)}</td>
      <td>${renderStrengthChip(contact)}</td>
      <td class="text-surface-500">${lastText}</td>
      <td class="${overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''}">${overdue ? 'Overdue · ' : ''}${fuText}</td>
    </tr>
  `;
}

// ── Reconnect: who needs a touch ─────────────────────────────
/**
 * Contacts that need reconnecting, ranked by urgency:
 *   1) Overdue follow-ups (most overdue first)
 *   2) Previously-engaged relationships that have gone cold/dormant
 * Only includes stale contacts you've actually engaged before
 * (have a lastContactDate) so it stays meaningful at scale.
 */
function getReconnectContacts(contacts) {
  const scored = [];
  (contacts || []).forEach(c => {
    const overdue = c.nextFollowUpDate && _relIsOverdue(c.nextFollowUpDate);
    const s = getRelationshipStrength(c);
    const stale = !!c.lastContactDate && (s === 'dormant' || s === 'cold');
    if (!overdue && !stale) return;
    const overdueDays = overdue ? _relDaysSince(c.nextFollowUpDate) : 0;
    const sinceLast   = _relDaysSince(c.lastContactDate || c.createdAt);
    const score = (overdue ? 1e6 : 0) + overdueDays * 100 + (isFinite(sinceLast) ? Math.min(sinceLast, 3650) : 0);
    scored.push({ c, score, overdue });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map(x => x.c);
}

/** Compact row for the Reconnect panel. */
function renderReconnectRow(contact, company) {
  const overdue = _relIsOverdue(contact.nextFollowUpDate);
  const reason = overdue
    ? `<span class="text-red-600 dark:text-red-400 font-medium">Follow-up overdue${contact.nextFollowUpDate ? ' · ' + (typeof formatFutureRelative === 'function' ? formatFutureRelative(contact.nextFollowUpDate) : '') : ''}</span>`
    : `<span class="text-surface-500">Last contact ${contact.lastContactDate && typeof formatRelative === 'function' ? formatRelative(contact.lastContactDate) : 'a while ago'}</span>`;
  return `
    <div class="flex items-center gap-3 py-2.5 px-1 hover:bg-surface-50 dark:hover:bg-surface-800/50 rounded-lg cursor-pointer transition-colors" onclick="viewContact('${contact.id}')">
      ${typeof renderAvatar === 'function' ? renderAvatar(contact.fullName, contact.photoUrl, 'sm', contact.linkedInUrl) : ''}
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="font-medium text-sm truncate">${escapeHtml(contact.fullName)}</span>
          ${renderBucketBadge(getContactBucket(contact))}
        </div>
        <div class="text-xs truncate">${company ? escapeHtml(company.name) + ' · ' : ''}${reason}</div>
      </div>
      <button onclick="event.stopPropagation(); openNewCallModal('${contact.id}')" class="btn-ghost btn-xs flex-shrink-0" title="Log a call / reconnect">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>
      </button>
    </div>`;
}
