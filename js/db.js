/* ============================================
   Nexus CRM — IndexedDB Database Layer
   ============================================ */

const DB_NAME = 'pulse_crm';
const DB_VERSION = 4;

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
};

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      // Check version matches
      if (db.version === DB_VERSION) return resolve(db);
      db.close();
      db = null;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;

      // Users
      if (!database.objectStoreNames.contains(STORES.users)) {
        const store = database.createObjectStore(STORES.users, { keyPath: 'id' });
        store.createIndex('email', 'email', { unique: true });
      }

      // Contacts
      if (!database.objectStoreNames.contains(STORES.contacts)) {
        const store = database.createObjectStore(STORES.contacts, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('companyId', 'companyId', { unique: false });
        store.createIndex('stage', 'stage', { unique: false });
        store.createIndex('archived', 'archived', { unique: false });
        store.createIndex('lastContactDate', 'lastContactDate', { unique: false });
        store.createIndex('nextFollowUpDate', 'nextFollowUpDate', { unique: false });
      }

      // Companies
      if (!database.objectStoreNames.contains(STORES.companies)) {
        const store = database.createObjectStore(STORES.companies, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }

      // Calls
      if (!database.objectStoreNames.contains(STORES.calls)) {
        const store = database.createObjectStore(STORES.calls, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('contactId', 'contactId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }

      // Notes
      if (!database.objectStoreNames.contains(STORES.notes)) {
        const store = database.createObjectStore(STORES.notes, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('contactId', 'contactId', { unique: false });
        store.createIndex('callId', 'callId', { unique: false });
      }

      // Reminders
      if (!database.objectStoreNames.contains(STORES.reminders)) {
        const store = database.createObjectStore(STORES.reminders, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('contactId', 'contactId', { unique: false });
        store.createIndex('dueDate', 'dueDate', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }

      // Tags
      if (!database.objectStoreNames.contains(STORES.tags)) {
        const store = database.createObjectStore(STORES.tags, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
      }

      // Sources (enrichment provenance)
      if (!database.objectStoreNames.contains(STORES.sources)) {
        const store = database.createObjectStore(STORES.sources, { keyPath: 'id' });
        store.createIndex('contactId', 'contactId', { unique: false });
        store.createIndex('companyId', 'companyId', { unique: false });
      }

      // Activities (timeline)
      if (!database.objectStoreNames.contains(STORES.activities)) {
        const store = database.createObjectStore(STORES.activities, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('contactId', 'contactId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Enrichment jobs
      if (!database.objectStoreNames.contains(STORES.enrichmentJobs)) {
        const store = database.createObjectStore(STORES.enrichmentJobs, { keyPath: 'id' });
        store.createIndex('contactId', 'contactId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }

      // Notifications
      if (!database.objectStoreNames.contains(STORES.notifications)) {
        const store = database.createObjectStore(STORES.notifications, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('read', 'read', { unique: false });
      }

      // Settings
      if (!database.objectStoreNames.contains(STORES.settings)) {
        database.createObjectStore(STORES.settings, { keyPath: 'id' });
      }

      // Deals
      if (!database.objectStoreNames.contains(STORES.deals)) {
        const store = database.createObjectStore(STORES.deals, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('stage', 'stage', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('priority', 'priority', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Deal Documents
      if (!database.objectStoreNames.contains(STORES.dealDocuments)) {
        const store = database.createObjectStore(STORES.dealDocuments, { keyPath: 'id' });
        store.createIndex('dealId', 'dealId', { unique: false });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('category', 'category', { unique: false });
      }

      // Deal Diligence (AI runs)
      if (!database.objectStoreNames.contains(STORES.dealDiligence)) {
        const store = database.createObjectStore(STORES.dealDiligence, { keyPath: 'id' });
        store.createIndex('dealId', 'dealId', { unique: false });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Deal Tasks
      if (!database.objectStoreNames.contains(STORES.dealTasks)) {
        const store = database.createObjectStore(STORES.dealTasks, { keyPath: 'id' });
        store.createIndex('dealId', 'dealId', { unique: false });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('dueDate', 'dueDate', { unique: false });
      }

      // Deal Notes
      if (!database.objectStoreNames.contains(STORES.dealNotes)) {
        const store = database.createObjectStore(STORES.dealNotes, { keyPath: 'id' });
        store.createIndex('dealId', 'dealId', { unique: false });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Deal History (immutable audit trail)
      if (!database.objectStoreNames.contains(STORES.dealHistory)) {
        const store = database.createObjectStore(STORES.dealHistory, { keyPath: 'id' });
        store.createIndex('dealId', 'dealId', { unique: false });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('action', 'action', { unique: false });
      }

      // NDA Templates (for AI NDA checker)
      if (!database.objectStoreNames.contains(STORES.ndaTemplates)) {
        const store = database.createObjectStore(STORES.ndaTemplates, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Due Diligence Projects
      if (!database.objectStoreNames.contains(STORES.ddProjects)) {
        const store = database.createObjectStore(STORES.ddProjects, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('dealId', 'dealId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => {
      reject(e.target.error);
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
