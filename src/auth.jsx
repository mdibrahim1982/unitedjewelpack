import { createContext, useContext, useEffect, useState } from "react";
import { SESSION_KEYS, currentBlocker } from "./activeSession";

// ===================== admin credentials =====================
// Hardcoded for this front-end-only demo. There is no backend, so this
// does not provide real security — anyone who reads the deployed
// JavaScript can see these values. Replace this with a real
// authentication service (e.g. Firebase Auth, Auth0, your own API)
// before handling anything sensitive.
const ADMIN_EMAIL = "unitedjewelpack@gmail.com";
const ADMIN_PASSWORD = "Ujp123$";

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

  // Returns true (signed in), false (wrong credentials) or "blocked" when
  // someone else is still signed in — they must log out first.
  function login(email, password) {
    if (currentBlocker("admin")) return "blocked";
    const ok =
      email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
      password === ADMIN_PASSWORD;
    if (ok) setIsAdmin(true);
    return ok;
  }

  function logout() {
    setIsAdmin(false);
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
