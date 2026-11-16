// Firebase Authentication (Email/Password for staff, Anonymous for customers).
// Staff sessions last for the browser TAB only (like the old sessionStorage
// login), so a shared device doesn't stay signed in after the tab is closed.
import { loadFirebase } from "./sdk.js";

export async function createFirebaseAuth() {
  const { auth, authMod } = await loadFirebase();
  const { onAuthStateChanged, signInWithEmailAndPassword, signInAnonymously, signOut, setPersistence, browserSessionPersistence } = authMod;
  await setPersistence(auth, browserSessionPersistence);
  const shape = (u) => (u ? { uid: u.uid, email: u.email || null, isAnonymous: !!u.isAnonymous } : null);

  return {
    onAuthStateChanged: (cb) => onAuthStateChanged(auth, (u) => cb(shape(u))),
    currentUser: () => shape(auth.currentUser),
    async signInStaff(email, password) {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      return shape(cred.user);
    },
    async signInAnonymous() {
      const cred = await signInAnonymously(auth);
      return shape(cred.user);
    },
    signOut: () => signOut(auth),
  };
}
