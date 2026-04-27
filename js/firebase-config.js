/* ============================================
   Pulse — Firebase Initialization
   ============================================ */

const firebaseConfig = {
  apiKey:            "AIzaSyAj5_2HXlTafFaEWCsurU1ndhZQ0TV075Y",
  authDomain:        "search-pulse.firebaseapp.com",
  projectId:         "search-pulse",
  storageBucket:     "search-pulse.firebasestorage.app",
  messagingSenderId: "291429713331",
  appId:             "1:291429713331:web:edd0eb3df06b774eed37c6"
};

firebase.initializeApp(firebaseConfig);

// Enable Firestore offline persistence (data available even if connection drops)
firebase.firestore().enablePersistence({ synchronizeTabs: true })
  .catch(err => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open — persistence only works in one tab at a time
      console.warn('[Pulse] Firestore persistence disabled (multiple tabs)');
    } else if (err.code === 'unimplemented') {
      console.warn('[Pulse] Firestore persistence not supported in this browser');
    }
  });
