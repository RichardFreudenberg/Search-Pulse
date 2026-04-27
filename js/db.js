/* ============================================
   Pulse — Cloud Database (Firebase Firestore)
   ============================================
   Drop-in replacement for the old IndexedDB layer.
   All other files use the same DB.* API unchanged.

   Data structure: /users/{uid}/{collection}/{docId}
   Every user's data lives in their own subcollection
   so security rules are simple and no composite
   indexes are needed.
   ============================================ */

const STORES = {
  users:             'users',
  contacts:          'contacts',
  companies:         'companies',
  calls:             'calls',
  notes:             'notes',
  reminders:         'reminders',
  tags:              'tags',
  sources:           'sources',
  activities:        'activities',
  enrichmentJobs:    'enrichmentJobs',
  notifications:     'notifications',
  settings:          'settings',
  deals:             'deals',
  dealDocuments:     'dealDocuments',
  dealDiligence:     'dealDiligence',
  dealTasks:         'dealTasks',
  dealNotes:         'dealNotes',
  dealHistory:       'dealHistory',
  ndaTemplates:      'ndaTemplates',
  ddProjects:        'ddProjects',
  shareInvites:      'shareInvites',
  shareDashboards:   'shareDashboards',
  sourcingCampaigns: 'sourcingCampaigns',
  dealFolders:       'dealFolders',
  dealCalls:         'dealCalls',
  auditLog:          'auditLog',
  granolaImports:    'granolaImports',
  meetingSessions:   'meetingSessions',
  brokers:           'brokers',
};

// Returns the Firestore subcollection for the current user
function _col(store) {
  const uid = firebase.auth().currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  return firebase.firestore().collection('users').doc(uid).collection(store);
}

// Shared doc mapper
function _docToObj(doc) {
  if (!doc.exists) return null;
  return { ...doc.data(), id: doc.id };
}

const DB = {
  async get(store, id) {
    if (id == null) return null;
    try {
      const doc = await _col(store).doc(String(id)).get();
      return _docToObj(doc);
    } catch (err) {
      console.warn(`DB.get(${store}, ${id}):`, err.message);
      return null;
    }
  },

  async getAll(store) {
    try {
      const snap = await _col(store).get();
      return snap.docs.map(_docToObj);
    } catch (err) {
      console.warn(`DB.getAll(${store}):`, err.message);
      return [];
    }
  },

  // Get all records where field (indexName) === value
  async getAllByIndex(store, indexName, value) {
    try {
      const snap = await _col(store).where(indexName, '==', value).get();
      return snap.docs.map(_docToObj);
    } catch (err) {
      console.warn(`DB.getAllByIndex(${store}, ${indexName}=${value}):`, err.message);
      return [];
    }
  },

  // All data in this architecture already belongs to the user,
  // so getForUser just returns getAll.
  async getForUser(store, _userId) {
    return DB.getAll(store);
  },

  async add(store, item) {
    try {
      const id = String(item.id || generateId());
      const now = new Date().toISOString();
      const data = {
        ...item,
        id,
        createdAt: item.createdAt || now,
        updatedAt: now,
      };
      await _col(store).doc(id).set(data);
      return data;
    } catch (err) {
      console.error(`DB.add(${store}):`, err.message);
      throw err;
    }
  },

  async put(store, item) {
    try {
      const id = String(item.id);
      const data = { ...item, id, updatedAt: new Date().toISOString() };
      await _col(store).doc(id).set(data, { merge: true });
      return data;
    } catch (err) {
      console.error(`DB.put(${store}):`, err.message);
      throw err;
    }
  },

  async delete(store, id) {
    try {
      await _col(store).doc(String(id)).delete();
    } catch (err) {
      console.error(`DB.delete(${store}, ${id}):`, err.message);
      throw err;
    }
  },

  async count(store) {
    try {
      const snap = await _col(store).get();
      return snap.size;
    } catch {
      return 0;
    }
  },

  async clear(store) {
    try {
      const snap = await _col(store).get();
      if (snap.empty) return;
      const batch = firebase.firestore().batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    } catch (err) {
      console.error(`DB.clear(${store}):`, err.message);
      throw err;
    }
  },
};

// ID generator — kept identical to old implementation
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Legacy stubs — kept so nothing breaks if called elsewhere
async function openDB() { return true; }
async function migrateLegacyDB() {}
async function scanAllDBsForAccounts() { return []; }
async function importLegacyData() {}
