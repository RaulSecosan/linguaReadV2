import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBWipwzIbOsIcx_v-DX9u6BNVE6LxCrzog",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "lingua-59cff.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "lingua-59cff",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "lingua-59cff.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "243343836258",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:243343836258:web:08033d0735e5cd67e27d3b",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-P18FR3C0DV",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firestoreDb = getFirestore(firebaseApp);

export const analytics = isSupported()
  .then((supported) => (supported ? getAnalytics(firebaseApp) : null))
  .catch(() => null);
