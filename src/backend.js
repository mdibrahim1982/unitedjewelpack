// ===================== which backend is in use =====================
// Chosen at BUILD time from environment variables (see .env.example):
//
//   "local"    no Firebase configured → everything works exactly as before,
//              stored in this browser (localStorage). Default for `npm run dev`
//              until a .env file exists.
//   "firebase" Firebase Authentication + Cloud Firestore.
//   "memory"   TEST ONLY: an in-memory stand-in for Firebase, used by the
//              automated tests. Never enabled in a real build.
//
// The Firebase "web config" values are identifiers, not secrets — access is
// controlled by Firestore Security Rules and Authentication, not by hiding
// them. They are still kept out of git (in .env files) and injected at build.

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

export const BACKEND =
  env.VITE_BACKEND === "memory"
    ? "memory"
    : FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId
    ? "firebase"
    : "local";

// true whenever data/auth live on a server (Firebase) instead of this browser
export const USE_REMOTE = BACKEND !== "local";
