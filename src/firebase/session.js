// Who is signed in, according to Firebase Authentication + Firestore.
//
// Roles are NOT decided by the browser: after a staff member signs in with
// email/password, their role comes from Firestore —
//   admins/{uid}      → admin
//   salesReps/{uid}   → sales rep (and "active" must not be false)
// A Firebase account with neither document is signed straight back out. The
// same documents are what the Security Rules check, so the UI can't grant
// anything the server wouldn't.
//
// Customers don't sign in with a password; they get an anonymous Firebase
// identity the first time they place an order, so their order can be created
// (and nothing else) under the rules.
import { getBackend } from "./backendFactory.js";
import { authErrorCode } from "./authErrors.js";

let state = { ready: false, user: null, role: null, name: null, uid: null, error: null };
const listeners = new Set();
let started = null;

const publish = (next) => {
  state = { ...state, ...next };
  for (const l of [...listeners]) l(state);
};

export const getSession = () => state;

export function subscribeSession(cb) {
  listeners.add(cb);
  cb(state);
  startSession();
  return () => listeners.delete(cb);
}

export async function resolveRole(store, uid) {
  const admin = await store.get(`admins/${uid}`);
  if (admin) return { role: "admin", name: admin.name || "Admin" };
  const rep = await store.get(`salesReps/${uid}`);
  if (rep && rep.active !== false) return { role: "salesRep", name: rep.name || rep.email || "Sales Rep" };
  return { role: null, name: null };
}

export function startSession() {
  if (started) return started;
  started = (async () => {
    const { store, authApi } = await getBackend();
    authApi.onAuthStateChanged(async (user) => {
      if (!user) return publish({ ready: true, user: null, role: null, name: null, uid: null });
      if (user.isAnonymous) return publish({ ready: true, user, role: null, name: null, uid: user.uid, error: null });
      try {
        const r = await resolveRole(store, user.uid);
        if (!r.role) {
          await authApi.signOut(); // a Firebase account that isn't an admin or a rep
          return publish({ ready: true, user: null, role: null, name: null, uid: null, error: "not_authorised" });
        }
        publish({ ready: true, user, role: r.role, name: r.name, uid: user.uid, error: null });
      } catch {
        publish({ ready: true, user, role: null, name: null, uid: user.uid, error: "network" });
      }
    });
  })().catch(() => publish({ ready: true, error: "unavailable" }));
  return started;
}

// → { ok:true, role, name, uid } | { ok:false, code }
export async function loginStaff(email, password) {
  try {
    const { store, authApi } = await getBackend();
    const user = await authApi.signInStaff(email, password);
    const r = await resolveRole(store, user.uid);
    if (!r.role) {
      await authApi.signOut();
      return { ok: false, code: "not_authorised" };
    }
    return { ok: true, role: r.role, name: r.name, uid: user.uid };
  } catch (e) {
    return { ok: false, code: authErrorCode(e) };
  }
}

export async function logoutStaff() {
  const { authApi } = await getBackend();
  await authApi.signOut();
}

// The signed-in user's id; customers get an anonymous one on demand.
export async function ensureUid() {
  const { authApi } = await getBackend();
  const current = authApi.currentUser();
  if (current) return current.uid;
  return (await authApi.signInAnonymous()).uid;
}

export function _resetForTests() {
  state = { ready: false, user: null, role: null, name: null, uid: null, error: null };
  listeners.clear();
  started = null;
}
