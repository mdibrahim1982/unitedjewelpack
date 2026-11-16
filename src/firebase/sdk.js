// Loads the Firebase SDK lazily (only when a Firebase backend is configured),
// so a build without Firebase keys never downloads it.
import { FIREBASE_CONFIG } from "../backend.js";

let cached = null;

export function loadFirebase() {
  if (!cached) {
    cached = (async () => {
      const [appMod, authMod, fsMod] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/firestore"),
      ]);
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
      return { app, auth: authMod.getAuth(app), db: fsMod.getFirestore(app), authMod, fsMod };
    })();
  }
  return cached;
}
