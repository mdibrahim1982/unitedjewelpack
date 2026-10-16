import { createContext, useContext, useEffect, useState } from "react";
import { SESSION_KEYS, currentBlocker } from "./activeSession";

// ===================== sales rep credentials =====================
// Hardcoded for this front-end-only demo, same pattern as auth.jsx. There
// is no backend, so this does not provide real security — anyone who
// reads the deployed JavaScript can see these values. Replace this with a
// real authentication service before handling anything sensitive.
//
// A "sales rep" is a separate role from Admin: they can sign in so their
// name is attached to the orders they place on WhatsApp, but they don't
// get access to the Admin Dashboard.
const SALES_REPS = [
  { email: "rep1@unitedjewelpack.com", password: "Rep123$", name: "Sales Rep 1" },
  { email: "rep2@unitedjewelpack.com", password: "Rep123$", name: "Sales Rep 2" },
];

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

  // Returns true / false, or "blocked" when someone else is still signed in.
  function login(email, password) {
    if (currentBlocker("salesRep")) return "blocked";
    const match = SALES_REPS.find(
      (rep) =>
        rep.email.toLowerCase() === email.trim().toLowerCase() &&
        rep.password === password
    );
    if (match) setSalesRepName(match.name);
    return !!match;
  }

  function logout() {
    setSalesRepName(null);
  }

  return (
    <SalesRepAuthContext.Provider
      value={{ isSalesRep: !!salesRepName, salesRepName, login, logout }}
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
