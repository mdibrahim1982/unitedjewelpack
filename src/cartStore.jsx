import { createContext, useContext, useEffect, useState } from "react";
import { PCS_PER_UNIT } from "./pricingStore";

// ===================== cart store =====================
// A simple shopping-cart context, persisted to localStorage so items
// survive page reloads and folder navigation ("maintain session").
//
// Each cart item looks like:
//   { key, folderSlug, folderName, photoId, img, caption, qty, unitPrice,
//     pcsPerUnit }
//
// `unitPrice` is the photo's own ₹-per-piece price captured when it was added
// to the cart (items saved before per-photo pricing simply have none, and
// fall back to the default rate at display time).
//
// `pcsPerUnit` is how many pieces one unit of qty represents for this
// item (PCS_PER_UNIT normally, 1 for a low-stock item sold by the raw
// piece), captured at add time — see pricingStore.jsx.
//
// `qty` is kept >= 0.5, in half-unit steps (0.5, 1, 1.5, 2 ...).

const STORAGE_KEY = "ujp_cart";

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore (e.g. storage full/disabled) */
  }
}

function itemKey(folderSlug, photoId) {
  return `${folderSlug}:${photoId}`;
}

function clampQty(qty) {
  const n = Math.round(Number(qty) * 2) / 2; // allow halves: 0.5, 1, 1.5, 2 ...
  return Number.isFinite(n) && n > 0 ? n : 1;
}

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);

  useEffect(() => {
    saveCart(items);
  }, [items]);

  // Sync across tabs (e.g. cart updated in another tab).
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY) setItems(loadCart());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // `stockPc` is the item's available inventory, in pieces (null = no
  // limit set, so anything can be added). `pcsPerUnit` is how many pieces
  // one unit of qty represents for THIS add — PCS_PER_UNIT normally, or 1
  // for a low-stock item being sold by the raw piece.
  //
  // Topping up an item that's already in the cart can happen under a
  // DIFFERENT pcsPerUnit than the first time (e.g. 1 pack was added while
  // stock was high, then stock dropped under the low-stock threshold and
  // 10 more raw pieces were added) — qty values in different units can't
  // just be added together (1 + 10 ≠ "11" of anything real). So both the
  // existing and new amounts are first converted to total pieces, then
  // re-expressed in THIS add's unit for storage, keeping one unit per
  // line at all times.
  //
  // Validated with the exact formula: total pieces must be strictly LESS
  // THAN In Stock (pc) — reaching or exceeding the current stock value is
  // blocked. Returns { ok: true } on success, or
  // { ok: false, available, inCart } — both expressed in THIS add's qty
  // unit — otherwise.
  function addToCart(
    folderSlug,
    folderName,
    photo,
    qty = 1,
    unitPrice = null,
    stockPc = null,
    pcsPerUnit = PCS_PER_UNIT,
    // Pieces actually taken out of physical stock by THIS add. A customer's
    // add debits stock (so this equals the pieces added); a sales rep's
    // add debits nothing (0) — their order only reserves stock once an
    // admin approves it. Tracked per line so removing/clearing credits back
    // exactly what was taken, never more.
    debitedPieces = 0
  ) {
    const safeQty = pcsPerUnit === 1
      ? Math.max(0, Math.round(Number(qty)) || 0)
      : clampQty(qty);
    const key = itemKey(folderSlug, photo.id);
    const existing = items.find((it) => it.key === key);
    const existingPieces = existing
      ? existing.qty * (existing.pcsPerUnit ?? PCS_PER_UNIT)
      : 0;
    const newPieces = safeQty * pcsPerUnit;
    const totalPieces = existingPieces + newPieces;
    // Re-express the combined total in THIS add's unit.
    const newTotal =
      pcsPerUnit === 1
        ? Math.round(totalPieces)
        : clampQty(totalPieces / pcsPerUnit);
    const currentQtyInThisUnit = existingPieces / pcsPerUnit;

    if (stockPc !== null && totalPieces > stockPc + 1e-9) {
      return {
        ok: false,
        available: Math.round((stockPc / pcsPerUnit) * 100) / 100,
        inCart: Math.round(currentQtyInThisUnit * 100) / 100,
      };
    }

    setItems((prev) => {
      const idx = prev.findIndex((it) => it.key === key);
      if (idx !== -1) {
        return prev.map((it) =>
          it.key === key
            ? {
                ...it,
                qty: newTotal,
                unitPrice,
                pcsPerUnit,
                // Lines saved before this field existed were always fully
                // debited, so fall back to their full piece count.
                debitedPieces:
                  (it.debitedPieces ?? it.qty * (it.pcsPerUnit ?? PCS_PER_UNIT)) +
                  debitedPieces,
              }
            : it
        );
      }
      return [
        ...prev,
        {
          key,
          folderSlug,
          folderName,
          photoId: photo.id,
          img: photo.img,
          caption: photo.caption,
          qty: safeQty,
          unitPrice,
          pcsPerUnit,
          debitedPieces,
        },
      ];
    });
    return { ok: true };
  }

  function updateQty(key, qty) {
    const safeQty = clampQty(qty);
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, qty: safeQty } : it))
    );
  }

  function removeFromCart(key) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  function clearCart() {
    setItems([]);
  }

  // When a user logs out, their unplaced items must not be inherited by the
  // next person to sign in (possibly a different shop). Lines saved by an
  // OLD version of the app already took stock out of inventory, though, and
  // would lose it if wiped silently — so in that rare case the cart is kept.
  function clearCartOnLogout() {
    const tookStock = items.some((it) => (it.debitedPieces ?? Infinity) > 0);
    if (!tookStock) setItems([]);
  }

  const totalItems = items.length;
  const totalQty = items.reduce((sum, it) => sum + it.qty, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        updateQty,
        removeFromCart,
        clearCart,
        clearCartOnLogout,
        totalItems,
        totalQty,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used inside a CartProvider");
  }
  return ctx;
}
