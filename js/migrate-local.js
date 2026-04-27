/* ============================================
   Pulse — Local → Cloud Migration
   ============================================
   Reads the old IndexedDB (pulse_crm) and uploads
   all data to Firestore for the current Firebase user.
   Runs once automatically after first login on any
   device that still has local data.
   ============================================ */

const _MIGRATE_DB      = 'pulse_crm';
const _MIGRATE_DONE_PFX = 'pulse_migration_done_';

// ── Open the legacy IndexedDB (read-only, no upgrade) ─────────────────────────

function _openLegacyDB() {
  return new Promise(resolve => {
    const req = indexedDB.open(_MIGRATE_DB);
    req.onsuccess        = e  => resolve(e.target.result);
    req.onerror          = () => resolve(null);
    req.onupgradeneeded  = e  => { e.target.transaction.abort(); resolve(null); };
    req.onblocked        = () => resolve(null);
    setTimeout(() => resolve(null), 5000); // safety timeout
  });
}

function _readStore(idb, storeName) {
  return new Promise(resolve => {
    if (!idb.objectStoreNames.contains(storeName)) return resolve([]);
    try {
      const tx  = idb.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => resolve([]);
    } catch { resolve([]); }
  });
}

// ── Check whether migration is needed ─────────────────────────────────────────

async function checkLegacyDataExists() {
  const uid   = firebase.auth().currentUser?.uid;
  const email = firebase.auth().currentUser?.email;
  if (!uid || !email) return false;
  if (localStorage.getItem(_MIGRATE_DONE_PFX + uid)) return false;

  const idb = await _openLegacyDB();
  if (!idb) return false;
  const users = await _readStore(idb, 'users');
  idb.close();
  return users.some(u => u.email === email);
}

// ── Run the migration ─────────────────────────────────────────────────────────

async function migrateLegacyDataToFirestore(onProgress) {
  const uid   = firebase.auth().currentUser?.uid;
  const email = firebase.auth().currentUser?.email;
  if (!uid || !email) throw new Error('Not logged in');

  const idb = await _openLegacyDB();
  if (!idb) throw new Error('Could not open local database');

  // Match old local user by email
  const legacyUsers = await _readStore(idb, 'users');
  const legacyUser  = legacyUsers.find(u => u.email === email);
  if (!legacyUser) { idb.close(); throw new Error('No matching account found in local data'); }
  const oldId = legacyUser.id;

  // Stores to migrate (skip users — Firebase Auth handles those)
  const storesToMigrate = Object.values(STORES).filter(s => s !== 'users');

  // Count totals for the progress bar
  let total = 0;
  const allRecords = {};
  for (const store of storesToMigrate) {
    const records = await _readStore(idb, store);
    const mine = records.filter(r =>
      r.userId === oldId || r.id === `settings_${oldId}`
    );
    allRecords[store] = mine;
    total += mine.length;
  }
  idb.close();

  if (onProgress) onProgress(0, total, 'Starting…');

  let done = 0;
  for (const store of storesToMigrate) {
    for (const record of allRecords[store]) {
      try {
        // Remap old userId → new Firebase uid
        const r = { ...record };
        if (r.userId === oldId) r.userId = uid;
        if (r.id === `settings_${oldId}`) r.id = `settings_${uid}`;

        await firebase.firestore()
          .collection('users').doc(uid).collection(store)
          .doc(String(r.id)).set(r, { merge: true });

        done++;
        if (onProgress) onProgress(done, total, store);
      } catch (err) {
        console.warn(`[Migration] ${store}/${record.id}:`, err.message);
      }
    }
  }

  localStorage.setItem(_MIGRATE_DONE_PFX + uid, '1');
  return done;
}

// ── Banner UI ─────────────────────────────────────────────────────────────────

async function showMigrationPromptIfNeeded() {
  try {
    if (!(await checkLegacyDataExists())) return;
    _showMigrationBanner();
  } catch (err) {
    console.warn('[Pulse] Migration check:', err.message);
  }
}

function _showMigrationBanner() {
  document.getElementById('pulse-migration-banner')?.remove();

  const el = document.createElement('div');
  el.id = 'pulse-migration-banner';
  el.innerHTML = `
    <div style="
      position:fixed;top:20px;left:50%;transform:translateX(-50%);
      z-index:9999;max-width:500px;width:calc(100% - 32px);
      background:#1e3a8a;color:#fff;border-radius:14px;
      padding:18px 20px;box-shadow:0 8px 40px rgba(0,0,0,.35);
      display:flex;flex-direction:column;gap:12px;
    ">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <svg style="width:22px;height:22px;flex-shrink:0;margin-top:1px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
        <div>
          <p style="font-weight:700;font-size:14px;margin:0 0 3px;">Local data found — upload to cloud?</p>
          <p style="font-size:12px;opacity:.8;margin:0;line-height:1.5;">
            Your contacts, deals, and notes are saved on this device.
            Upload them to your account so they're available everywhere.
          </p>
        </div>
      </div>

      <div id="pulse-mig-progress" style="display:none;">
        <div style="background:rgba(255,255,255,.2);border-radius:6px;height:7px;overflow:hidden;">
          <div id="pulse-mig-bar" style="background:#fff;height:100%;width:0%;transition:width .25s;border-radius:6px;"></div>
        </div>
        <p id="pulse-mig-status" style="font-size:11px;opacity:.75;margin:5px 0 0;">Preparing…</p>
      </div>

      <div id="pulse-mig-btns" style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="document.getElementById('pulse-migration-banner').remove()"
          style="background:rgba(255,255,255,.15);border:none;color:#fff;padding:7px 16px;border-radius:8px;font-size:13px;cursor:pointer;">
          Later
        </button>
        <button onclick="_runMigration()"
          style="background:#fff;border:none;color:#1e3a8a;padding:7px 18px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
          Upload my data →
        </button>
      </div>
    </div>`;
  document.body.appendChild(el);
}

async function _runMigration() {
  const btns     = document.getElementById('pulse-mig-btns');
  const progress = document.getElementById('pulse-mig-progress');
  const bar      = document.getElementById('pulse-mig-bar');
  const status   = document.getElementById('pulse-mig-status');

  if (btns)     btns.style.display     = 'none';
  if (progress) progress.style.display = 'block';

  try {
    const count = await migrateLegacyDataToFirestore((done, total, store) => {
      const pct = total > 0 ? Math.round(done / total * 100) : 100;
      if (bar)    bar.style.width  = pct + '%';
      if (status) status.textContent = `Uploading ${store}… (${done} / ${total})`;
    });

    const banner = document.getElementById('pulse-migration-banner');
    if (banner) {
      banner.querySelector('div').style.background = '#15803d';
      banner.querySelector('div').innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;">
          <svg style="width:22px;height:22px;flex-shrink:0;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          <div>
            <p style="font-weight:700;font-size:14px;margin:0;">Migration complete!</p>
            <p style="font-size:12px;opacity:.85;margin:3px 0 0;">${count} records uploaded to your account. Refreshing in 2 seconds…</p>
          </div>
        </div>`;
      setTimeout(() => window.location.reload(), 2000);
    }
  } catch (err) {
    const banner = document.getElementById('pulse-migration-banner');
    if (banner) {
      banner.querySelector('div').style.background = '#991b1b';
      banner.querySelector('div').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <p style="font-size:13px;margin:0;">Migration failed: ${err.message}</p>
          <button onclick="document.getElementById('pulse-migration-banner').remove()"
            style="background:rgba(255,255,255,.2);border:none;color:#fff;padding:5px 12px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;">
            Dismiss
          </button>
        </div>`;
    }
  }
}
