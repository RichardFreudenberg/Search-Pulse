/* ============================================
   Nexus CRM — IndexedDB Database Layer
   ============================================ */

const DB_NAME = 'pulse_crm';
// Version history:
//   4 — original Pulse release (pre-git Nexus CRM era used 'nexus_crm' database name)
//   5 — added shareInvites, shareDashboards, sourcingCampaigns stores
//   8 — robustness pass: onblocked/versionchange handlers, legacy DB migration
//   9 — dealFolders store for local folder-per-deal access (File System Access API)
//  10 — dealCalls store for Granola meeting intelligence (transcripts, AI notes, action items)
//  11 — auditLog for Granola events; granolaImports for duplicate-import tracking
//  12 — meetingSessions store for native browser meeting recorder
//  13 — brokers store for broker/intermediary tracker
// RULE: only bump this when adding new object stores. Never delete or rename stores.
const DB_VERSION = 13;

// Legacy database names used before the app was renamed from Nexus CRM → Pulse.
// Add new names here if the app is ever renamed again.
const LEGACY_DB_NAMES = ['nexus_crm', 'nexus', 'crm', 'search_fund_crm', 'pulse'];

const STORES = {
  users: 'users',
  contacts: 'contacts',
  companies: 'companies',
  calls: 'calls',
  notes: 'notes',
  reminders: 'reminders',
  tags: 'tags',
  sources: 'sources',
  activities: 'activities',
  enrichmentJobs: 'enrichmentJobs',
  notifications: 'notifications',
  settings: 'settings',
  deals: 'deals',
  dealDocuments: 'dealDocuments',
  dealDiligence: 'dealDiligence',
  dealTasks: 'dealTasks',
  dealNotes: 'dealNotes',
  dealHistory: 'dealHistory',
  ndaTemplates: 'ndaTemplates',
  ddProjects: 'ddProjects',
  shareInvites: 'shareInvites',
  shareDashboards: 'shareDashboards',
  sourcingCampaigns: 'sourcingCampaigns',
  dealFolders:    'dealFolders',
  dealCalls:      'dealCalls',
  auditLog:        'auditLog',
  granolaImports:  'granolaImports',
  meetingSessions: 'meetingSessions',
  brokers:         'brokers',
};

let db = null;

// -------------------------------------------------------
// Legacy database migration + account recovery
// -------------------------------------------------------

// Read all data from an already-open IDBDatabase into a plain object.
function _readAllFromDB(idbInstance) {
  return new Promise((resolve) => {
    const storeNames = Array.from(idbInstance.objectStoreNames);
    if (storeNames.length === 0) return resolve({});

    const data = {};
    const tx = idbInstance.transaction(storeNames, 'readonly');
    let pending = storeNames.length;

    storeNames.forEach(name => {
      const req = tx.objectStore(name).getAll();
      req.onsuccess = () => {
        data[name] = req.result || [];
        if (--pending === 0) resolve(data);
      };
      req.onerror = () => {
        data[name] = [];
        if (--pending === 0) resolve(data);
      };
    });
  });
}

// Open a database by name (no version = open as-is, no upgrade).
function _openAny(name) {
  return new Promise((resolve) => {
    const req = indexedDB.open(name);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => resolve(null);
    req.onupgradeneeded = (e) => {
      // Abort the upgrade so we don't accidentally modify the DB.
      e.target.transaction.abort();
      resolve(null);
    };
  });
}

// Return list of all IndexedDB databases accessible at this origin.
async function _listAllDBNames() {
  const names = new Set(LEGACY_DB_NAMES);
  names.add(DB_NAME);
  // Modern browsers expose indexedDB.databases()
  if (typeof indexedDB.databases === 'function') {
    try {
      const list = await indexedDB.databases();
      list.forEach(d => { if (d.name) names.add(d.name); });
    } catch (_) {}
  }
  return Array.from(names);
}

// Scan every known/discoverable database, return array of
// { dbName, users: [{id, name, email}] } for any that have a users store with records.
async function scanAllDBsForAccounts() {
  const names = await _listAllDBNames();
  const results = [];

  for (const name of names) {
    if (name === DB_NAME) continue; // skip current DB — handled normally
    const idb = await _openAny(name);
    if (!idb) continue;

    if (!idb.objectStoreNames.contains('users')) {
      idb.close();
      continue;
    }

    const data = await _readAllFromDB(idb);
    idb.close();

    const users = (data.users || []).map(u => ({ id: u.id, name: u.name, email: u.email }));
    if (users.length > 0) {
      results.push({ dbName: name, data, users });
    }
  }

  return results;
}

// Import all records from a legacy dataset into pulse_crm.
// Existing records (by id) are NOT overwritten. User records with a
// conflicting email are merged: the legacy user id is mapped to the
// existing account so all their contacts/calls/etc. come across.
async function importLegacyData(legacyData) {
  await openDB(); // ensure pulse_crm is open + up-to-date

  // Build a map of existing users in pulse_crm by email
  const existingUsers = await DB.getAll(STORES.users);
  const emailToNewId = {};
  existingUsers.forEach(u => { emailToNewId[u.email] = u.id; });

  // Figure out if any legacy user emails clash with existing ones.
  // If so, build a remapping: legacyId → existingId
  const idRemap = {};
  for (const legacyUser of (legacyData.users || [])) {
    const existingId = emailToNewId[legacyUser.email];
    if (existingId && existingId !== legacyUser.id) {
      idRemap[legacyUser.id] = existingId;
    }
  }

  const knownStores = Array.from((await openDB()).objectStoreNames);

  for (const storeName of Object.keys(legacyData)) {
    if (!knownStores.includes(storeName)) continue;
    const records = legacyData[storeName] || [];

    for (let record of records) {
      // Remap userId and id fields if needed
      const remappedRecord = Object.assign({}, record);
      if (remappedRecord.userId && idRemap[remappedRecord.userId]) {
        remappedRecord.userId = idRemap[remappedRecord.userId];
      }

      // For the users store: skip records whose email already exists
      if (storeName === 'users') {
        if (emailToNewId[remappedRecord.email]) continue;
      }

      // If the id itself was remapped (i.e. this IS the legacy user record), skip —
      // we already have this user under the existing id.
      if (idRemap[remappedRecord.id]) continue;

      // Only insert if not already present
      const existing = await DB.get(storeName, remappedRecord.id);
      if (!existing) {
        try { await DB.add(storeName, remappedRecord); } catch (_) {}
      }
    }
  }
}

// On app startup: migrate any data from legacy databases into pulse_crm.
// Shows a toast when data is found so the user knows their account was recovered.
async function migrateLegacyDB() {
  const found = await scanAllDBsForAccounts();
  let totalUsers = 0;
  for (const { dbName, data, users } of found) {
    try {
      await importLegacyData(data);
      totalUsers += users.length;
      indexedDB.deleteDatabase(dbName);
    } catch (_) {}
  }
  if (totalUsers > 0) {
    // Show toast once DOM is ready (auth forms may not be set up yet)
    setTimeout(() => {
      if (typeof showToast === 'function') {
        showToast('Account recovered — sign in with your original password', 'success');
      }
    }, 500);
  }
}

// Shared upgrade logic used both by the normal openDB path and writeToNewDB above.
function _runUpgrade(e) {
  const database = e.target.result;

  function ensureStore(name, indexes = [], uniqueIndexes = []) {
    if (database.objectStoreNames.contains(name)) return;
    const store = database.createObjectStore(name, { keyPath: 'id' });
    indexes.forEach(idx => store.createIndex(idx, idx, { unique: false }));
    uniqueIndexes.forEach(idx => store.createIndex(idx, idx, { unique: true }));
  }

  ensureStore(STORES.users,              [], ['email']);
  ensureStore(STORES.contacts,           ['userId', 'companyId', 'stage', 'archived', 'lastContactDate', 'nextFollowUpDate']);
  ensureStore(STORES.companies,          ['userId', 'name']);
  ensureStore(STORES.calls,              ['userId', 'contactId', 'date']);
  ensureStore(STORES.notes,              ['userId', 'contactId', 'callId']);
  ensureStore(STORES.reminders,          ['userId', 'contactId', 'dueDate', 'status']);
  ensureStore(STORES.tags,               ['userId']);
  ensureStore(STORES.sources,            ['contactId', 'companyId']);
  ensureStore(STORES.activities,         ['userId', 'contactId', 'timestamp']);
  ensureStore(STORES.enrichmentJobs,     ['contactId', 'status']);
  ensureStore(STORES.notifications,      ['userId', 'read']);
  ensureStore(STORES.settings,           []);
  ensureStore(STORES.deals,              ['userId', 'stage', 'status', 'priority', 'createdAt']);
  ensureStore(STORES.dealDocuments,      ['dealId', 'userId', 'category']);
  ensureStore(STORES.dealDiligence,      ['dealId', 'userId', 'type', 'createdAt']);
  ensureStore(STORES.dealTasks,          ['dealId', 'userId', 'status', 'dueDate']);
  ensureStore(STORES.dealNotes,          ['dealId', 'userId', 'createdAt']);
  ensureStore(STORES.dealHistory,        ['dealId', 'userId', 'timestamp', 'action']);
  ensureStore(STORES.ndaTemplates,       ['userId', 'createdAt']);
  ensureStore(STORES.ddProjects,         ['userId', 'dealId', 'status', 'createdAt']);
  ensureStore(STORES.shareInvites,       ['userId', 'createdAt']);
  ensureStore(STORES.shareDashboards,    ['userId']);
  ensureStore(STORES.sourcingCampaigns,  ['userId', 'status', 'sector', 'createdAt']);
  ensureStore(STORES.dealFolders,        ['dealId', 'userId']);
  ensureStore(STORES.dealCalls,          ['dealId', 'userId', 'source', 'date', 'createdAt']);
  ensureStore(STORES.auditLog,           ['userId', 'action', 'timestamp']);
  ensureStore(STORES.granolaImports,     ['userId', 'granolaId', 'callId', 'dealId', 'importedAt']);
  ensureStore(STORES.meetingSessions,    ['userId', 'date', 'status', 'dealId']);
  ensureStore(STORES.brokers,            ['userId', 'createdAt', 'lastContactDate']);
}

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      if (db.version === DB_VERSION) return resolve(db);
      db.close();
      db = null;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    let settled = false;
    const settle = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(val);
    };

    // Safety-net: if the DB never opens within 12 s (e.g. blocked by another tab),
    // reject so initApp() can still call setupAuthForms() and show the login screen.
    const timer = setTimeout(() => {
      settle(reject, new Error('DB_OPEN_TIMEOUT'));
    }, 12000);

    request.onupgradeneeded = (e) => {
      try {
        _runUpgrade(e);
      } catch (err) {
        console.error('[Pulse] DB upgrade error:', err);
        // Don't abort — let the transaction finish what it can.
      }
    };

    request.onblocked = () => {
      // Another tab has the DB open at an older version.
      // We can't force-close it, so surface a message to the user.
      console.warn('[Pulse] DB upgrade blocked — please close other tabs and reload.');
      // Resolve with null after a short delay so initApp() can still proceed.
      // The null is checked in openDB callers gracefully.
      setTimeout(() => settle(reject, new Error('DB_BLOCKED')), 3000);
    };

    request.onsuccess = (e) => {
      db = e.target.result;

      // If this tab's connection becomes stale (another tab opened a newer version),
      // close gracefully so the other tab's upgrade can proceed.
      db.onversionchange = () => {
        db.close();
        db = null;
      };

      settle(resolve, db);
    };

    request.onerror = (e) => {
      settle(reject, e.target.error);
    };
  });
}

// Generic CRUD operations
const DB = {
  async add(storeName, data) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      data.id = data.id || generateId();
      data.createdAt = data.createdAt || new Date().toISOString();
      data.updatedAt = new Date().toISOString();
      const request = store.add(data);
      request.onsuccess = () => resolve(data);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async put(storeName, data) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      data.updatedAt = new Date().toISOString();
      const request = store.put(data);
      request.onsuccess = () => resolve(data);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async get(storeName, id) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async getAll(storeName) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async getAllByIndex(storeName, indexName, value) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async delete(storeName, id) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async count(storeName) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async clear(storeName) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  },

  // Get all records for current user
  async getForUser(storeName, userId) {
    return this.getAllByIndex(storeName, 'userId', userId);
  },
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
