// TEST ONLY — an in-memory Firebase (store + auth) so the automated tests can
// drive the whole Firebase code path without a network or an emulator.
// Never used by a real build (VITE_BACKEND=memory is not a production setting).
import { createMemoryStore } from "./memoryStore.js";

export function createMemoryBackend({ local, session } = {}) {
  const ls = local ?? (typeof localStorage !== "undefined" ? localStorage : null);
  const ss = session ?? (typeof sessionStorage !== "undefined" ? sessionStorage : null);
  const store = createMemoryStore({ persistKey: "ujp_memory_firestore", storage: ls });

  const listeners = new Set();
  const accounts = () => {
    try { return JSON.parse(ls?.getItem("ujp_memory_accounts") || "[]"); } catch { return []; }
  };
  const readUser = () => {
    try { return JSON.parse(ss?.getItem("ujp_memory_user") || "null"); } catch { return null; }
  };
  const writeUser = (u) => {
    if (ss) (u ? ss.setItem("ujp_memory_user", JSON.stringify(u)) : ss.removeItem("ujp_memory_user"));
    for (const l of [...listeners]) l(u);
  };
  const fail = (code) => Object.assign(new Error(code), { code });

  const authApi = {
    onAuthStateChanged(cb) {
      listeners.add(cb);
      Promise.resolve().then(() => listeners.has(cb) && cb(readUser()));
      return () => listeners.delete(cb);
    },
    currentUser: readUser,
    async signInStaff(email, password) {
      const a = accounts().find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
      if (!a || a.password !== password) throw fail("auth/invalid-credential");
      const user = { uid: a.uid, email: a.email, isAnonymous: false };
      writeUser(user);
      return user;
    },
    async signInAnonymous() {
      const user = { uid: `anon-${Math.random().toString(36).slice(2, 10)}`, email: null, isAnonymous: true };
      writeUser(user);
      return user;
    },
    async signOut() {
      writeUser(null);
    },
  };
  return { store, authApi };
}
