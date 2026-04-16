// IRIS PWA — Firebase configuration
// TODO: compilare con i valori reali del progetto nexo-hub-15f2d.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "nexo-hub-15f2d.firebaseapp.com",
  projectId: "nexo-hub-15f2d",
  storageBucket: "nexo-hub-15f2d.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

export function initFirebase() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  return { app, auth, db };
}

export { signInWithEmailAndPassword, signOut, onAuthStateChanged };
