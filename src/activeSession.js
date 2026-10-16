// ===================== one signed-in user at a time =====================
// Only ONE person may be signed in on a device at once — a customer, a sales
// rep or an admin. Anyone else must wait until the current user logs out.
//
// This file holds the rule in pure functions (easy to test) plus a tiny
// reader that takes a snapshot of what is currently saved in the browser.

export const SESSION_KEYS = {
  admin: "ujp_admin_session", // sessionStorage, value "true"
  salesRep: "ujp_salesrep_session", // sessionStorage, value = rep's name
  customer: "ujp_customer", // localStorage / cookie, value = JSON details
};

export const ROLE_LABEL = {
  admin: "Admin",
  salesRep: "Sales Rep",
  customer: "Customer",
};

const ORDER = ["admin", "salesRep", "customer"];

// snapshot: { admin: boolean, salesRep: string|null, customer: {shopName}|null }
// Returns the session that blocks `requestedRole` from signing in — or null
// when the way is clear. Signing in again as the SAME role isn't blocked.
export function blockingSession(requestedRole, snapshot) {
  for (const role of ORDER) {
    if (role === requestedRole) continue;
    if (role === "admin" && snapshot.admin) {
      return { role, name: ROLE_LABEL.admin };
    }
    if (role === "salesRep" && snapshot.salesRep) {
      return { role, name: snapshot.salesRep };
    }
    if (role === "customer" && snapshot.customer) {
      return { role, name: snapshot.customer.shopName || ROLE_LABEL.customer };
    }
  }
  return null;
}

function readCustomer() {
  try {
    const raw = localStorage.getItem(SESSION_KEYS.customer);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through to the cookie */
  }
  try {
    const hit = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${SESSION_KEYS.customer}=`));
    if (hit) return JSON.parse(decodeURIComponent(hit.slice(SESSION_KEYS.customer.length + 1)));
  } catch {
    /* ignore */
  }
  return null;
}

// What is saved in this browser right now (browser-only).
export function snapshotSessions() {
  let admin = false;
  let salesRep = null;
  try {
    admin = sessionStorage.getItem(SESSION_KEYS.admin) === "true";
    salesRep = sessionStorage.getItem(SESSION_KEYS.salesRep) || null;
  } catch {
    /* storage unavailable */
  }
  return { admin, salesRep, customer: readCustomer() };
}

// Convenience used by the login functions as a last line of defence.
export function currentBlocker(requestedRole) {
  return blockingSession(requestedRole, snapshotSessions());
}
