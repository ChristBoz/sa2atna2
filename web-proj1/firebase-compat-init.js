// Firebase compat initialization for admin pages
// Ensures the global firebase SDK is ready before admin scripts run
(function initFirebaseCompat() {
  if (typeof firebase === "undefined" || !firebase.initializeApp) {
    console.error("Firebase compat SDK not loaded");
    return;
  }

  const firebaseConfig = {
    apiKey: "AIzaSyAfWmO5Ye-ILmVcWbwN4cVOuP3_e-8ckD8",
    authDomain: "web-events-67.firebaseapp.com",
    projectId: "web-events-67",
    storageBucket: "web-events-67.firebasestorage.app",
    messagingSenderId: "928459541676",
    appId: "1:928459541676:web:8ef215e3749f80ca7fa309",
    measurementId: "G-T5Z7QJ76XX",
  };

  if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
})();
