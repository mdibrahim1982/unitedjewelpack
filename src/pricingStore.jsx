import { createContext, useContext } from "react";
import { useOrders } from "./ordersStore";

// ===================== pricing store =====================
// Pricing lives entirely on each individual photo (`photo.price`, set from
// the Admin Dashboard's "Edit Price" and persisted by photoStore.jsx),
// quoted per piece (pc). There is no site-wide default rate — a photo
// that hasn't been priced yet is simply treated as ₹0/pc until an admin
// sets one.
//
// Quantities are entered in units of PCS_PER_UNIT pieces, so every line
// total is:  rate (₹/pc) × qty × PCS_PER_UNIT.

// Pieces per unit of quantity — change here to re-tune every subtotal.
export const PCS_PER_UNIT = 150;

// Below this many pieces in stock, an item switches from being sold in
// GR "packs" (qty × 150 pieces) to being sold by the raw piece: qty then
// IS the piece count directly (0 up to just under the current stock),
// with no × PCS_PER_UNIT multiplier anywhere — pricing, stock checks, or
// display.
export const LOW_STOCK_THRESHOLD = 75;

export function isLowStock(stockPc) {
  return (stockPc ?? 0) < LOW_STOCK_THRESHOLD;
}

// The multiplier to use when converting a photo's qty into pieces, based
// on its current stock: 1 for low-stock items (qty already in pieces),
// PCS_PER_UNIT otherwise.
export function pcsPerUnitFor(stockPc) {
  return isLowStock(stockPc) ? 1 : PCS_PER_UNIT;
}

// Unit label shown next to a photo's qty stepper / cart line.
export function qtyUnitFor(stockPc) {
  return isLowStock(stockPc) ? "PCS" : "GR";
}

// Normalise whatever is stored on a photo into a usable number, or null
// when the photo has no unit price of its own.
export function parsePrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Normalise an inventory count (pieces on hand) into a whole number, or
// null when no stock limit has been set for that photo yet.
export function parseStock(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

// Convert a pieces count into the same "pack" units used for cart qty
// (pieces ÷ PCS_PER_UNIT), rounded to 2 decimals for display/comparison.
export function pcToGr(pc) {
  return Math.round((pc / PCS_PER_UNIT) * 100) / 100;
}

export function formatRupees(amount) {
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// Money for display, always a number (falls back to ₹0).
export function formatMoney(amount) {
  return formatRupees(amount || 0);
}

const PricingContext = createContext(null);

export function PricingProvider({ children }) {
  const { reservedPcOf } = useOrders();
  // Unit price (₹ per pc) for one photo: its own price, or 0 if unset.
  function unitPriceOf(photo) {
    return parsePrice(photo?.price) ?? 0;
  }

  // Does this photo carry its own price yet?
  function hasOwnPrice(photo) {
    return parsePrice(photo?.price) !== null;
  }

  // Inventory on hand for one photo, in pieces. Always a real number —
  // an item the admin hasn't touched yet is treated as 0 in stock (not
  // "unlimited"), matching what's shown on screen everywhere else.
  // PHYSICAL stock: what is actually on the shelf. Only a confirmed
  // dispatch, an admin's manual Inventory edit, or a customer's own
  // add-to-cart debit ever changes this.
  function physicalPcOf(photo) {
    return parseStock(photo?.stock) ?? 0;
  }

  // Pieces promised to approved, not-yet-dispatched sales-rep orders.
  function reservedOfPhoto(photo) {
    if (!photo || photo.folderId === undefined) return 0;
    return reservedPcOf(photo.folderId, photo.id);
  }

  // AVAILABLE stock = physical − reserved. Every storefront display and
  // quantity cap reads this one, so reservations take effect everywhere
  // without each screen having to know about orders.
  function stockPcOf(photo) {
    return Math.max(0, physicalPcOf(photo) - reservedOfPhoto(photo));
  }

  // Same, expressed in the same "pack" units used for cart qty.
  function stockGrOf(photo) {
    return pcToGr(stockPcOf(photo));
  }

  // Line total = rate × qty × multiplier (defaults to the standard
  // PCS_PER_UNIT "pack" conversion; pass 1 for items sold by the raw
  // piece, e.g. low-stock items where qty already IS the piece count).
  function priceFor(qty, unitPrice, multiplier = PCS_PER_UNIT) {
    const unit = parsePrice(unitPrice) ?? 0;
    return Math.round(unit * qty * multiplier * 100) / 100;
  }

  function priceForPhoto(photo, qty, multiplier = PCS_PER_UNIT) {
    return priceFor(qty, unitPriceOf(photo), multiplier);
  }

  return (
    <PricingContext.Provider
      value={{
        unitPriceOf,
        hasOwnPrice,
        stockPcOf,
        physicalPcOf,
        reservedOfPhoto,
        stockGrOf,
        priceFor,
        priceForPhoto,
        PCS_PER_UNIT,
      }}
    >
      {children}
    </PricingContext.Provider>
  );
}

export function usePricing() {
  const ctx = useContext(PricingContext);
  if (!ctx) {
    throw new Error("usePricing must be used inside a PricingProvider");
  }
  return ctx;
}
