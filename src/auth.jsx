import { createContext, useContext, useEffect, useState } from "react";
import { SESSION_KEYS, currentBlocker } from "./activeSession";
import { USE_REMOTE } from "./backend";
import { subscribeSession, loginStaff, logoutStaff } from "./firebase/session";

// ===================== admin sign-in =====================
// Two modes, chosen at build time (src/backend.js):
//
//  • Firebase  — Email/Password via Firebase Authentication. The user must
//    also have an  admins/{uid}  document in Firestore; that document (not
//    this file, not the browser) is what makes them an admin, and it is what
//    the Firestore Security Rules check.
//  • Local     — the original hardcoded demo login (src/localCredentials.js),
//    kept so the app still runs without Firebase.
//
// `sessionStorage` still holds a "who is signed in" hint. It is only a UI
// convenience (instant first paint, and the one-user-at-a-time check): in
// Firebase mode the server-confirmed session overrides it as soon as it loads,
// and it can't grant any data access.

const SESSION_KEY = SESSION_KEYS.admin;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isAdmin) {
        sessionStorage.setItem(SESSION_KEY, "true");
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      /* ignore (e.g. storage disabled) */
    }
  }, [isAdmin]);

  // Firebase mode: follow what the server says (also signs us out if the
  // session expired or the admin document was removed).
  useEffect(() => {
    if (!USE_REMOTE) return undefined;
    return subscribeSession((s) => {
      if (s.ready) setIsAdmin(s.role === "admin");
    });
  }, []);

  // Resolves to:  true  (signed in)
  //   "bad_credentials" / false  wrong email or password
  //   "not_authorised"  valid Firebase account but not an admin
  //   "wrong_role"      a sales rep used the admin form
  //   "blocked"         someone else is still signed in on this device
  //   "too_many" | "network" | "disabled" | "unavailable"  Firebase problems
  async function login(email, password) {
    if (currentBlocker("admin")) return "blocked";

    if (USE_REMOTE) {
      const r = await loginStaff(email, password);
      if (!r.ok) return r.code;
      if (r.role !== "admin") {
        await logoutStaff();
        return "wrong_role";
      }
      setIsAdmin(true);
      return true;
    }

    // Local mode only. The inline check lets the bundler drop this branch —
    // and the credentials module with it — from a Firebase build.
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_BACKEND !== "memory") {
      const { ADMIN } = await import("./localCredentials");
      const ok =
        email.trim().toLowerCase() === ADMIN.email.toLowerCase() &&
        password === ADMIN.password;
      if (ok) setIsAdmin(true);
      return ok;
    }
    return false;
  }

  function logout() {
    setIsAdmin(false);
    if (USE_REMOTE) logoutStaff().catch(() => {});
  }

  return (
    <AuthContext.Provider value={{ isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
}
