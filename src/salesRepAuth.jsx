import { createContext, useContext, useEffect, useState } from "react";
import { SESSION_KEYS, currentBlocker } from "./activeSession";
import { USE_REMOTE } from "./backend";
import { subscribeSession, loginStaff, logoutStaff } from "./firebase/session";

// ===================== sales rep sign-in =====================
// Same two modes as auth.jsx. In Firebase mode the rep signs in with
// Email/Password and must have a  salesReps/{uid}  document (name, email,
// active). Setting `active: false` there switches a rep off immediately.
//
// A "sales rep" is a separate role from Admin: their orders carry their name
// and uid, but they have no access to the Admin Dashboard or to changing stock.

const SESSION_KEY = SESSION_KEYS.salesRep;

const SalesRepAuthContext = createContext(null);

export function SalesRepAuthProvider({ children }) {
  const [salesRepName, setSalesRepName] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) || null;
    } catch {
      return null;
    }
  });
  const [salesRepUid, setSalesRepUid] = useState(null);

  useEffect(() => {
    try {
      if (salesRepName) {
        sessionStorage.setItem(SESSION_KEY, salesRepName);
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      /* ignore (e.g. storage disabled) */
    }
  }, [salesRepName]);

  useEffect(() => {
    if (!USE_REMOTE) return undefined;
    return subscribeSession((s) => {
      if (!s.ready) return;
      if (s.role === "salesRep") {
        setSalesRepName(s.name);
        setSalesRepUid(s.uid);
      } else {
        setSalesRepName(null);
        setSalesRepUid(null);
      }
    });
  }, []);

  // Resolves to true, or a code: "bad_credentials" | false (wrong login),
  // "not_authorised", "wrong_role", "blocked", "too_many", "network",
  // "disabled", "unavailable".
  async function login(email, password) {
    if (currentBlocker("salesRep")) return "blocked";

    if (USE_REMOTE) {
      const r = await loginStaff(email, password);
      if (!r.ok) return r.code;
      if (r.role !== "salesRep") {
        await logoutStaff();
        return "wrong_role";
      }
      setSalesRepName(r.name);
      setSalesRepUid(r.uid);
      return true;
    }

    // Local mode only (dropped from a Firebase build — see auth.jsx).
    if (!import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_BACKEND !== "memory") {
      const { SALES_REPS } = await import("./localCredentials");
      const match = SALES_REPS.find(
        (rep) =>
          rep.email.toLowerCase() === email.trim().toLowerCase() &&
          rep.password === password
      );
      if (match) setSalesRepName(match.name);
      return !!match;
    }
    return false;
  }

  function logout() {
    setSalesRepName(null);
    setSalesRepUid(null);
    if (USE_REMOTE) logoutStaff().catch(() => {});
  }

  return (
    <SalesRepAuthContext.Provider
      value={{ isSalesRep: !!salesRepName, salesRepName, salesRepUid, login, logout }}
    >
      {children}
    </SalesRepAuthContext.Provider>
  );
}

export function useSalesRepAuth() {
  const ctx = useContext(SalesRepAuthContext);
  if (!ctx) {
    throw new Error(
      "useSalesRepAuth must be used inside a SalesRepAuthProvider"
    );
  }
  return ctx;
}
