import { createContext, useContext, useEffect, useState } from "react";
import { validateDetails } from "./customerDetails";
import { SESSION_KEYS, currentBlocker } from "./activeSession";

// ===================== customer identity =====================
// A customer is "logged in" simply by having given Shop Name, Location and
// Mobile — there is no password. The details are remembered in BOTH
// localStorage and a cookie (so they survive a cleared cache one way or the
// other) and are attached to every order the customer places.
//
// Admins and sales reps don't use this: they type the customer's details
// into the cart for each order instead.

const KEY = SESSION_KEYS.customer;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year

function readCookie() {
  try {
    const hit = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${KEY}=`));
    return hit ? JSON.parse(decodeURIComponent(hit.slice(KEY.length + 1))) : null;
  } catch {
    return null;
  }
}

function readSaved() {
  let saved = null;
  try {
    const raw = localStorage.getItem(KEY);
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  saved = saved || readCookie();
  // Only trust a complete, valid record.
  return saved && validateDetails(saved).ok ? validateDetails(saved).values : null;
}

function writeSaved(details) {
  try {
    localStorage.setItem(KEY, JSON.stringify(details));
  } catch {
    /* storage unavailable — the cookie below still keeps it */
  }
  try {
    document.cookie = `${KEY}=${encodeURIComponent(
      JSON.stringify(details)
    )}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function clearSaved() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    document.cookie = `${KEY}=; max-age=0; path=/; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

const CustomerContext = createContext(null);

export function CustomerProvider({ children }) {
  const [customer, setCustomer] = useState(readSaved);

  // Stay in step with another tab logging in/out.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === KEY) setCustomer(readSaved());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // `details` must already be validated by the caller (validateDetails).
  function login(details) {
    // Someone else (admin / sales rep) is still signed in → refuse.
    const blocker = currentBlocker("customer");
    if (blocker) return { ok: false, errors: {}, blocked: blocker };
    const checked = validateDetails(details);
    if (!checked.ok) return checked;
    writeSaved(checked.values);
    setCustomer(checked.values);
    return checked;
  }

  function logout() {
    clearSaved();
    setCustomer(null);
  }

  return (
    <CustomerContext.Provider
      value={{ customer, isCustomer: !!customer, login, logout }}
    >
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error("useCustomer must be used inside a CustomerProvider");
  return ctx;
}
