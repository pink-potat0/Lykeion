// Firebase Configuration — paste values from Firebase Console → Project settings → Your apps.
// Do not commit real keys to a public repo; use a private fork or env injection for production.
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyA5a1GI7b26FNB0DYNsYmISe5eV4UkMxeo",
  authDomain: "lyceum-3e96c.firebaseapp.com",
  projectId: "lyceum-3e96c",
  storageBucket: "lyceum-3e96c.firebasestorage.app",
  messagingSenderId: "733684640464",
  appId: "1:733684640464:web:d87d71ee8dad109ba68cd5",
  measurementId: "G-4J442VDM0P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
// Initialize Firebase Authentication
const auth = firebase.auth();

// Initialize Firestore
const db = firebase.firestore();

