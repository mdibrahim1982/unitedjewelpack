// Autofill support: works out which shops are already "known" (from past
// orders and the last customer who used this device) so a staff member typing
// an order doesn't have to retype a shop's location and mobile every time.
import { normaliseMobile } from "./customerDetails.js";

const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// orders: newest-first order records ({ shopName, location, mobile, ... }).
// extra: any additional { shopName, location, mobile } to include (e.g. the
// last customer on this device). Returns unique shops, most recent first.
// A shop is the same shop when its mobile matches (or, with no mobile, its
// name does).
export function collectKnownCustomers(orders = [], extra = []) {
  const seen = new Set();
  const out = [];
  for (const c of [...extra, ...orders]) {
    if (!c || !norm(c.shopName)) continue;
    const mobile = normaliseMobile(c.mobile);
    const key = mobile || `name:${norm(c.shopName)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      shopName: String(c.shopName).trim().replace(/\s+/g, " "),
      location: String(c.location ?? "").trim().replace(/\s+/g, " "),
      mobile,
    });
  }
  return out;
}

// Exact (case-insensitive) shop-name match, or null.
export function matchByShopName(known, name) {
  const n = norm(name);
  if (!n) return null;
  return known.find((c) => norm(c.shopName) === n) || null;
}

// Match on a typed mobile number (any common format), or null.
export function matchByMobile(known, rawMobile) {
  const m = normaliseMobile(rawMobile);
  if (m.length !== 10) return null;
  return known.find((c) => c.mobile === m) || null;
}

// Fills ONLY the fields that are still empty, so anything the user already
// typed is never overwritten. Returns the (possibly updated) fields.
export function autofillFields(fields, customer) {
  if (!customer) return fields;
  return {
    shopName: fields.shopName?.trim() ? fields.shopName : customer.shopName,
    location: fields.location?.trim() ? fields.location : customer.location,
    mobile: fields.mobile?.trim() ? fields.mobile : customer.mobile,
  };
}
