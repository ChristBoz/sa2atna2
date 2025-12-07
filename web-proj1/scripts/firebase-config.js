// Firebase configuration and initialization
// Using CDN imports (no npm needed)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
// Optional: Only if you want analytics
// import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAfWmO5Ye-ILmVcWbwN4cVOuP3_e-8ckD8",
  authDomain: "web-events-67.firebaseapp.com",
  projectId: "web-events-67",
  storageBucket: "web-events-67.firebasestorage.app",
  messagingSenderId: "928459541676",
  appId: "1:928459541676:web:8ef215e3749f80ca7fa309",
  measurementId: "G-T5Z7QJ76XX",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Optional: Initialize Analytics (if you want to track usage)
// const analytics = getAnalytics(app);
